use anchor_lang::prelude::*;
use mock_oracle::Oracle;
use crate::{errors::ErrorCode, events::*, {Market, Order, OrderType, Side, MarginAccount, MarginType, Position}};

#[derive(Accounts)]
#[instruction(side: Side, size: u64, leverage: u64, order_bump: u8, position_bump: u8, uid: u64)]
pub struct PlaceMarketOrder<'info> {
    #[account(mut, constraint = market.is_active @ ErrorCode::MarketInactive)]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = trader,
        space = Order::SPACE,
        seeds = [b"order", market.key().as_ref(), trader.key().as_ref(), &uid.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,
    #[account(
        init,
        payer = trader,
        space = Position::SPACE,
        seeds = [b"position", market.key().as_ref(), trader.key().as_ref(), &uid.to_le_bytes()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        //constraint = margin_account.owner == trader.key() @ ErrorCode::Unauthorized,
        constraint = margin_account.perp_market == market.key() @ ErrorCode::InvalidParameter,
    )]
    pub margin_account: Account<'info, MarginAccount>,
    #[account(mut)]
    pub trader: Signer<'info>,
    /// CHECK: Oracle account - validated in instruction
    pub price_update: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn place_market_order(
    ctx: Context<PlaceMarketOrder>,
    side: Side,
    size: u64,
    leverage: u64,
    order_bump: u8,
    position_bump: u8,
    _uid: u64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let order = &mut ctx.accounts.order;
    let position = &mut ctx.accounts.position;
    let margin_account = &mut ctx.accounts.margin_account;
    let trader = &ctx.accounts.trader;

    // Get current timestamp safely
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;

    // Validate inputs
    require!(market.is_active, ErrorCode::MarketInactive);
    require!(leverage <= market.max_leverage, ErrorCode::LeverageTooHigh);
    require!(size > 0, ErrorCode::InvalidOrderSize);

    // Get current price from oracle
    let oracle_data = ctx.accounts.price_update.try_borrow_data()?;
    let oracle = Oracle::try_deserialize(&mut oracle_data.as_ref())?;
    let current_price = oracle.price;

    // Calculate required collateral
    // Scale price by 1e6 to match token decimals
    let scaled_price = current_price
        .checked_mul(1_000_000)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate position value with proper decimal handling
    let position_value = size
        .checked_mul(scaled_price)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(1_000_000)  // Divide by 1e6 to get back to token decimals
        .ok_or(ErrorCode::MathOverflow)?;

    let required_collateral = position_value
        .checked_div(leverage)
        .ok_or(ErrorCode::MathOverflow)?;

    // Ensure minimum margin requirements are met
    let min_required_margin = position_value
        .checked_mul(market.initial_margin_ratio)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(required_collateral >= min_required_margin, ErrorCode::InsufficientMargin);

    // Check if there's enough available margin based on margin type
    match margin_account.margin_type {
        MarginType::Isolated => {
            // For isolated margin, check if there's enough available margin
            let available_margin = margin_account.available_margin()?;
            require!(available_margin >= required_collateral, ErrorCode::InsufficientMargin);
            
            // Allocate margin to this position
            margin_account.allocated_margin = margin_account.allocated_margin
                .checked_add(required_collateral)
                .ok_or(ErrorCode::MathOverflow)?;
        },
        MarginType::Cross => {
            // For cross margin, check if total margin is sufficient
            require!(margin_account.collateral >= required_collateral, ErrorCode::InsufficientMargin);
        }
    }

    // Initialize order
    order.trader = trader.key();
    order.market = market.key();
    order.side = side;
    order.order_type = OrderType::Market;
    order.price = current_price;
    order.size = size;
    order.filled_size = size; // Market orders fill immediately
    order.leverage = leverage;
    order.collateral = required_collateral;
    order.created_at = current_timestamp;
    order.is_active = false; // Market orders complete immediately
    order.bump = order_bump;

    // Initialize position
    position.trader = trader.key();
    position.market = market.key();
    position.side = side;
    position.size = size;
    position.collateral = required_collateral;
    position.entry_price = current_price;
    position.entry_funding_rate = market.funding_rate;
    position.leverage = leverage;
    position.realized_pnl = 0;
    position.last_funding_payment_time = current_timestamp;
    position.last_cumulative_funding = 0;
    position.liquidation_price = 0; // Will be calculated in a separate instruction
    position.is_open = true;
    position.bump = position_bump;

    // Update market state
    match side {
        Side::Long => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_add(size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        Side::Short => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_sub(size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Add order and position to margin account
    margin_account.orders.push(order.key());
    margin_account.positions.push(position.key());

    // Emit events
    emit!(OrderPlacedEvent {
        market: market.key(),
        order: order.key(),
        trader: trader.key(),
        side,
        order_type: OrderType::Market,
        price: current_price,
        size,
        leverage,
        timestamp: current_timestamp,
    });

    emit!(OrderFilledEvent {
        market: market.key(),
        order: order.key(),
        trader: trader.key(),
        side,
        price: current_price,
        size,
        filled_size: size,
        timestamp: current_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CloseMarketOrder<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = trader,
        has_one = market,
        close = trader  // This closes the order account and sends rent to trader
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        has_one = trader,
        has_one = market,
        constraint = position.is_open @ ErrorCode::PositionClosed,
        close = trader  // This closes the position account and sends rent to trader
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        //constraint = margin_account.owner == trader.key() @ ErrorCode::Unauthorized,
        constraint = margin_account.perp_market == market.key() @ ErrorCode::InvalidParameter,
    )]
    pub margin_account: Account<'info, MarginAccount>,
    #[account(mut)]
    pub trader: Signer<'info>,
    /// CHECK: Oracle account - validated in instruction
    pub price_update: UncheckedAccount<'info>,
}

pub fn close_market_order(ctx: Context<CloseMarketOrder>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let order = &mut ctx.accounts.order;
    let position = &mut ctx.accounts.position;
    let margin_account = &mut ctx.accounts.margin_account;
    let trader = &ctx.accounts.trader;

    // Get current price from oracle
    let oracle_data = ctx.accounts.price_update.try_borrow_data()?;
    let oracle = Oracle::try_deserialize(&mut oracle_data.as_ref())?;
    let current_price = oracle.price;

    // Calculate PnL
    let entry_value = position.size
        .checked_mul(position.entry_price)
        .ok_or(ErrorCode::MathOverflow)?;

    let exit_value = position.size
        .checked_mul(current_price)
        .ok_or(ErrorCode::MathOverflow)?;

    let entry_value_i64 = entry_value as i64;
    let exit_value_i64 = exit_value as i64;

    let pnl = match position.side {
        Side::Long => exit_value_i64.checked_sub(entry_value_i64),
        Side::Short => entry_value_i64.checked_sub(exit_value_i64),
    }.ok_or(ErrorCode::MathOverflow)?;

    // Store values before accounts are closed
    let position_side = position.side;
    let position_size = position.size;
    let position_collateral = position.collateral;
    let position_entry_price = position.entry_price;
    let position_key = position.key();
    let order_key = order.key();

    // Update market state
    match position_side {
        Side::Long => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_sub(position_size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        Side::Short => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_add(position_size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Update margin account based on margin type
    match margin_account.margin_type {
        MarginType::Isolated => {
            margin_account.allocated_margin = margin_account.allocated_margin
                .checked_sub(position_collateral)
                .ok_or(ErrorCode::MathOverflow)?;
            
            if pnl > 0 {
                margin_account.collateral = margin_account.collateral
                    .checked_add(pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                margin_account.collateral = margin_account.collateral
                    .checked_sub((-pnl) as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        },
        MarginType::Cross => {
            if pnl > 0 {
                margin_account.collateral = margin_account.collateral
                    .checked_add(pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                margin_account.collateral = margin_account.collateral
                    .checked_sub((-pnl) as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }
    }

    // Remove order and position from margin account's lists
    if let Some(pos) = margin_account.positions.iter().position(|&p| p == position_key) {
        margin_account.positions.remove(pos);
    }
    if let Some(ord) = margin_account.orders.iter().position(|&o| o == order_key) {
        margin_account.orders.remove(ord);
    }

    // Emit events
    emit!(OrderCancelledEvent {
        market: market.key(),
        order: order_key,
        trader: trader.key(),
    });

    emit!(PositionClosedEvent {
        market: market.key(),
        position: position_key,
        trader: trader.key(),
        side: position_side,
        size: position_size,
        collateral: position_collateral,
        entry_price: position_entry_price,
        exit_price: current_price,
        realized_pnl: pnl,
        margin_type: margin_account.margin_type,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct LiquidateMarketOrder<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = market,
        close = liquidator  // This closes the order account and sends rent to liquidator
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        has_one = market,
        constraint = position.is_open @ ErrorCode::PositionClosed,
        close = liquidator  // This closes the position account and sends rent to liquidator
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = margin_account.owner == position.trader @ ErrorCode::Unauthorized,
        constraint = margin_account.perp_market == market.key() @ ErrorCode::InvalidParameter,
    )]
    pub margin_account: Account<'info, MarginAccount>,
    #[account(mut)]
    pub liquidator: Signer<'info>,
    /// CHECK: Oracle account - validated in instruction
    pub price_update: UncheckedAccount<'info>,
}

pub fn liquidate_market_order(ctx: Context<LiquidateMarketOrder>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let order = &mut ctx.accounts.order;
    let position = &mut ctx.accounts.position;
    let margin_account = &mut ctx.accounts.margin_account;
    let _liquidator = &ctx.accounts.liquidator;

    // Get current price from oracle
    let oracle_data = ctx.accounts.price_update.try_borrow_data()?;
    let oracle = Oracle::try_deserialize(&mut oracle_data.as_ref())?;
    let current_price = oracle.price;
    msg!("Current oracle price: {}", current_price);

    // Calculate position value and equity
    msg!("Position size: {}", position.size);
    let position_value = position.size
        .checked_mul(current_price)
        .ok_or_else(|| {
            msg!("Overflow in position_value calculation: {} * {}", position.size, current_price);
            ErrorCode::MathOverflow
        })?;
    msg!("Position value: {}", position_value);

    let entry_value = position.size
        .checked_mul(position.entry_price)
        .ok_or_else(|| {
            msg!("Overflow in entry_value calculation: {} * {}", position.size, position.entry_price);
            ErrorCode::MathOverflow
        })?;
    msg!("Entry value: {}", entry_value);

    let position_value_i64 = position_value as i64;
    let entry_value_i64 = entry_value as i64;
    msg!("Position value (i64): {}", position_value_i64);
    msg!("Entry value (i64): {}", entry_value_i64);

    let unrealized_pnl = match position.side {
        Side::Long => position_value_i64.checked_sub(entry_value_i64),
        Side::Short => entry_value_i64.checked_sub(position_value_i64),
    }.ok_or_else(|| {
        msg!("Overflow in unrealized_pnl calculation for {:?} position", position.side);
        ErrorCode::MathOverflow
    })?;
    msg!("Unrealized PnL: {}", unrealized_pnl);

    let equity = if unrealized_pnl > 0 {
        position.collateral.checked_add(unrealized_pnl as u64)
    } else {
        // For negative PnL, we need to ensure we don't underflow
        if (-unrealized_pnl) as u64 > position.collateral {
            // If loss is greater than collateral, equity is 0
            Some(0)
        } else {
            position.collateral.checked_sub((-unrealized_pnl) as u64)
        }
    }.ok_or_else(|| {
        msg!("Overflow in equity calculation: collateral {} +/- PnL {}", position.collateral, unrealized_pnl);
        ErrorCode::MathOverflow
    })?;
    msg!("Position equity: {}", equity);

    // Check if position is liquidatable
    let maintenance_margin = position_value
        .checked_mul(market.maintenance_margin_ratio)
        .ok_or_else(|| {
            msg!("Overflow in maintenance_margin calculation: {} * {}", position_value, market.maintenance_margin_ratio);
            ErrorCode::MathOverflow
        })?
        .checked_div(10000)
        .ok_or_else(|| {
            msg!("Overflow in maintenance_margin division: {} / 10000", position_value * market.maintenance_margin_ratio);
            ErrorCode::MathOverflow
        })?;
    msg!("Maintenance margin: {}", maintenance_margin);

    require!(equity < maintenance_margin, ErrorCode::PositionNotLiquidatable);

    // Calculate liquidation fees
    let liquidation_fee = position_value
        .checked_mul(market.liquidation_fee_ratio)
        .ok_or_else(|| {
            msg!("Overflow in liquidation fee calculation: {} * {}", position_value, market.liquidation_fee_ratio);
            ErrorCode::MathOverflow
        })?;
    msg!("Liquidation fee: {}", liquidation_fee);

    let liquidator_fee = liquidation_fee
        .checked_div(2)
        .ok_or_else(|| {
            msg!("Overflow in liquidator fee calculation: {} / 2", liquidation_fee);
            ErrorCode::MathOverflow
        })?;
    msg!("Liquidator fee: {}", liquidator_fee);

    let insurance_fund_fee = liquidation_fee
        .checked_sub(liquidator_fee)
        .ok_or_else(|| {
            msg!("Overflow in insurance fund fee calculation: {} - {}", liquidation_fee, liquidator_fee);
            ErrorCode::MathOverflow
        })?;
    msg!("Insurance fund fee: {}", insurance_fund_fee);

    // Update insurance fund
    market.insurance_fund = market.insurance_fund
        .checked_add(insurance_fund_fee)
        .ok_or_else(|| {
            msg!("Overflow in insurance_fund update: {} + {}", market.insurance_fund, insurance_fund_fee);
            ErrorCode::MathOverflow
        })?;
    msg!("Updated insurance fund: {}", market.insurance_fund);

    // Store values before accounts are closed
    let position_side = position.side;
    let position_size = position.size;
    let position_collateral = position.collateral;
    let _position_entry_price = position.entry_price;
    let position_key = position.key();
    let order_key = order.key();

    // Update market state
    match position_side {
        Side::Long => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_sub(position_size)
                .ok_or_else(|| {
                    msg!("Overflow in base_asset_reserve subtraction: {} - {}", market.base_asset_reserve, position_size);
                    ErrorCode::MathOverflow
                })?;
        }
        Side::Short => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_add(position_size)
                .ok_or_else(|| {
                    msg!("Overflow in base_asset_reserve addition: {} + {}", market.base_asset_reserve, position_size);
                    ErrorCode::MathOverflow
                })?;
        }
    }
    msg!("Updated base asset reserve: {}", market.base_asset_reserve);

    // Update margin account state
    // For liquidated positions, we set collateral to 0 since the position is underwater
    margin_account.collateral = 0;
    margin_account.allocated_margin = margin_account.allocated_margin
        .checked_sub(position_collateral)
        .ok_or_else(|| {
            msg!("Overflow in allocated_margin subtraction: {} - {}", margin_account.allocated_margin, position_collateral);
            ErrorCode::MathOverflow
        })?;
    msg!("Updated margin account collateral: {}", margin_account.collateral);
    msg!("Updated margin account allocated margin: {}", margin_account.allocated_margin);

    // Remove position and order from margin account
    margin_account.positions.retain(|&x| x != position_key);
    margin_account.orders.retain(|&x| x != order_key);
    msg!("Removed position and order from margin account");

    // Close position and order accounts
    position.is_open = false;
    order.is_active = false;
    msg!("Closed position and order accounts");

    // TODO: Transfer liquidator_fee to liquidator

    // Emit events
    emit!(OrderCancelledEvent {
        order: order_key,
        trader: position.trader,
        market: market.key(),
    });


    Ok(())
}

