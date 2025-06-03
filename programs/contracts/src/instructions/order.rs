use crate::{
    errors::ErrorCode,
    events::*,
    {MarginAccount, MarginType, Market, Order, OrderType, Position, Side},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(side: Side, size: u64, leverage: u64, order_bump: u8, position_bump: u8, order_nonce: u8, position_nonce: u8)]
pub struct PlaceMarketOrder<'info> {
    #[account(mut, constraint = market.is_active @ ErrorCode::MarketInactive)]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = trader,
        space = Order::SPACE,
        seeds = [b"order", market.key().as_ref(), trader.key().as_ref(), &[order_nonce]],
        bump
    )]
    pub order: Account<'info, Order>,
    #[account(
        init,
        payer = trader,
        space = Position::SPACE,
        seeds = [b"position", market.key().as_ref(), trader.key().as_ref(), &[position_nonce]],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = margin_account.owner == trader.key() @ ErrorCode::Unauthorized,
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
    _order_nonce: u8,
    _position_nonce: u8,
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

    msg!("Order parameters:");
    msg!("Size: {}", size);
    msg!("Leverage: {}", leverage);
    msg!("Initial margin ratio: {}", market.initial_margin_ratio);

    // Get initial price and reserves
    let initial_price = market.calculate_price()?;
    let initial_base_reserve = market.virtual_base_reserve;
    let initial_quote_reserve = market.virtual_quote_reserve;
    msg!("Initial price: {}", initial_price);
    msg!("Initial base reserve: {}", initial_base_reserve);
    msg!("Initial quote reserve: {}", initial_quote_reserve);

    // Update reserves using the Market's update_reserves method
    msg!("Initial Base Reserve: {}", market.virtual_base_reserve);
    msg!("Initial Quote Reserve: {}", market.virtual_quote_reserve);
    msg!("Trade Size: {}", size);
    msg!("Is Closing: {}", false);

    // Update reserves using the Market's update_reserves method
    market.update_reserves(&side, size)?;

    // Calculate price with impact
    let price_with_impact = market.calculate_price_with_impact(
        size,
        false // Opening position
    )?;
    msg!("Price with impact: {}", price_with_impact);

    // Calculate position value
    let position_value = size
        .checked_mul(price_with_impact)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(1_000_000)  // Scale back to token decimals
        .ok_or(ErrorCode::MathOverflow)?;
    msg!("Position value: {}", position_value);

    // Calculate required margin based on initial margin ratio and leverage
    let required_margin = position_value
        .checked_mul(market.initial_margin_ratio)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(leverage)
        .ok_or(ErrorCode::MathOverflow)?;
    msg!("Required margin: {}", required_margin);

    // Check if there's enough available margin based on margin type
    match margin_account.margin_type {
        MarginType::Isolated => {
            let available_margin = margin_account.available_margin()?;
            msg!("Isolated margin account:");
            msg!("Total collateral: {}", margin_account.collateral);
            msg!("Allocated margin: {}", margin_account.allocated_margin);
            msg!("Available margin: {}", available_margin);
            require!(
                available_margin >= required_margin,
                ErrorCode::InsufficientMargin
            );

            margin_account.allocated_margin = margin_account
                .allocated_margin
                .checked_add(required_margin)
                .ok_or(ErrorCode::MathOverflow)?;
            msg!("New allocated margin: {}", margin_account.allocated_margin);
        }
        MarginType::Cross => {
            msg!("Cross margin account:");
            msg!("Total collateral: {}", margin_account.collateral);
            require!(
                margin_account.collateral >= required_margin,
                ErrorCode::InsufficientMargin
            );
        }
    }

    // Update market state with new reserves
    market.last_price = price_with_impact;
    market.last_update_time = current_timestamp;

    // Initialize order
    order.trader = trader.key();
    order.market = market.key();
    order.side = side;
    order.order_type = OrderType::Market;
    order.price = price_with_impact;
    order.size = size;
    order.filled_size = size; // Market orders fill immediately
    order.leverage = leverage;
    order.collateral = required_margin;
    order.created_at = current_timestamp;
    order.is_active = false; // Market orders complete immediately
    order.bump = order_bump;

    // Initialize position
    position.trader = trader.key();
    position.market = market.key();
    position.side = side;
    position.size = size;
    position.collateral = required_margin;
    position.entry_price = price_with_impact;
    position.entry_funding_rate = market.funding_rate;
    position.leverage = leverage;
    position.realized_pnl = 0;
    position.last_funding_payment_time = current_timestamp;
    position.last_cumulative_funding = 0;
    position.liquidation_price = 0; // Will be calculated in a separate instruction
    position.is_open = true;
    position.bump = position_bump;

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
        price: price_with_impact,
        size,
        leverage,
        timestamp: current_timestamp,
    });

    emit!(OrderFilledEvent {
        market: market.key(),
        order: order.key(),
        trader: trader.key(),
        side,
        price: price_with_impact,
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
        constraint = margin_account.owner == trader.key() @ ErrorCode::Unauthorized,
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

    // Get current timestamp
    let current_timestamp = Clock::get()?.unix_timestamp;

    // Get initial price and reserves
    let initial_price = market.calculate_price()?;
    let initial_base_reserve = market.virtual_base_reserve;
    let initial_quote_reserve = market.virtual_quote_reserve;
    msg!("Initial price: {}", initial_price);
    msg!("Initial base reserve: {}", initial_base_reserve);
    msg!("Initial quote reserve: {}", initial_quote_reserve);

    // Update reserves using the Market's update_reserves method
    // For closing, we need to use the opposite side
    let opposite_side = match position.side {
        Side::Long => Side::Short,
        Side::Short => Side::Long,
    };
    market.update_reserves(&opposite_side, position.size)?;

    // Calculate exit price with impact
    let exit_price = market.calculate_price_with_impact(
        position.size,
        true // Closing position
    )?;
    msg!("Exit price: {}", exit_price);

    // Calculate PnL using oracle price
    msg!("Starting PnL calculation...");
    msg!("Position side: {:?}", position.side);
    msg!("Entry price: {}", position.entry_price);
    msg!("Exit price: {}", exit_price);
    
    // Convert to i64 for price difference calculation to handle negative values
    let entry_price_i64 = position.entry_price as i64;
    let exit_price_i64 = exit_price as i64;
    
    let price_diff = match position.side {
        Side::Long => {
            msg!("Long position - calculating price difference (exit - entry)");
            exit_price_i64.checked_sub(entry_price_i64)
        },
        Side::Short => {
            msg!("Short position - calculating price difference (entry - exit)");
            entry_price_i64.checked_sub(exit_price_i64)
        },
    }.ok_or_else(|| {
        msg!("Overflow in price difference calculation");
        ErrorCode::MathOverflow
    })?;
    msg!("Price difference calculated: {}", price_diff);

    // Convert price_diff back to u64 for further calculations
    let price_diff_abs = price_diff.checked_abs().ok_or_else(|| {
        msg!("Overflow in price_diff.checked_abs()");
        ErrorCode::MathOverflow
    })? as u64;

    // Calculate price change percentage (in basis points)
    msg!("Calculating price change percentage...");
    let price_change_bps = price_diff_abs
        .checked_mul(10_000)
        .ok_or_else(|| {
            msg!("Overflow in price_diff_abs * 10_000");
            ErrorCode::MathOverflow
        })?
        .checked_div(position.entry_price)
        .ok_or_else(|| {
            msg!("Overflow in price_diff_abs * 10_000 / entry_price");
            ErrorCode::MathOverflow
        })?;
    msg!("Price change percentage (bps): {}", price_change_bps);

    // Calculate position value at entry
    msg!("Calculating position value at entry...");
    let entry_value = position.size
        .checked_mul(position.entry_price)
        .ok_or_else(|| {
            msg!("Overflow in size * entry_price");
            ErrorCode::MathOverflow
        })?
        .checked_div(1_000_000)
        .ok_or_else(|| {
            msg!("Overflow in (size * entry_price) / 1_000_000");
            ErrorCode::MathOverflow
        })?;
    msg!("Position value at entry: {}", entry_value);

    // Calculate PnL based on percentage change
    msg!("Calculating final PnL...");
    let pnl = entry_value
        .checked_mul(price_change_bps)
        .ok_or_else(|| {
            msg!("Overflow in entry_value * price_change_bps");
            ErrorCode::MathOverflow
        })?
        .checked_div(10_000)
        .ok_or_else(|| {
            msg!("Overflow in (entry_value * price_change_bps) / 10_000");
            ErrorCode::MathOverflow
        })? as i64;

    // Apply the correct sign to PnL based on position side and price movement
    let pnl = if (position.side == Side::Long && price_diff < 0) || 
               (position.side == Side::Short && price_diff > 0) {
        -pnl
    } else {
        pnl
    };
    msg!("Final PnL calculated: {}", pnl);

    msg!("PnL calculation complete");
    msg!("Summary:");
    msg!("- Position size: {}", position.size);
    msg!("- Entry price: {}", position.entry_price);
    msg!("- Exit price: {}", exit_price);
    msg!("- Price difference: {}", price_diff);
    msg!("- Price change %: {}", price_change_bps);
    msg!("- Entry value: {}", entry_value);
    msg!("- Final PnL: {}", pnl);

    // Update margin account
    match margin_account.margin_type {
        MarginType::Isolated => {
            // For isolated margin, deallocate margin and update collateral
            margin_account.allocated_margin = margin_account
                .allocated_margin
                .checked_sub(position.collateral)
                .ok_or(ErrorCode::MathOverflow)?;
            
            // Add PnL to collateral
            if pnl > 0 {
                margin_account.collateral = margin_account
                    .collateral
                    .checked_add(pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                margin_account.collateral = margin_account
                    .collateral
                    .checked_sub((-pnl) as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }
        MarginType::Cross => {
            // For cross margin, just update collateral with PnL
            if pnl > 0 {
                margin_account.collateral = margin_account
                    .collateral
                    .checked_add(pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                margin_account.collateral = margin_account
                    .collateral
                    .checked_sub((-pnl) as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }
    }

    // Update market state with new reserves
    market.last_price = exit_price;
    market.last_update_time = current_timestamp;

    // Update position
    position.is_open = false;
    position.realized_pnl = pnl;

    // Remove position and order from margin account
    margin_account.positions.retain(|&x| x != position.key());
    margin_account.orders.retain(|&x| x != order.key());

    // Emit events
    emit!(PositionClosedEvent {
        market: market.key(),
        position: position.key(),
        trader: trader.key(),
        side: position.side,
        size: position.size,
        collateral: position.collateral,
        entry_price: position.entry_price,
        exit_price,
        realized_pnl: pnl,
        margin_type: margin_account.margin_type,
    });

    Ok(())
}
