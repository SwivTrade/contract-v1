use crate::{
    errors::ErrorCode,
    events::*,
    {MarginAccount, MarginType, Market, Order, OrderType, Position, Side},
};
use anchor_lang::prelude::*;

// Constants
const PRICE_SCALE: u64 = 1_000_000; // 1.0 in price units

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

    // Calculate price with impact using initial reserves
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
            msg!("Required margin for order: {}", required_margin);
            require!(
                available_margin >= required_margin,
                ErrorCode::InsufficientMargin
            );

            margin_account.allocated_margin = margin_account
                .allocated_margin
                .checked_add(required_margin)
                .ok_or(ErrorCode::MathOverflow)?;
            msg!("New allocated margin after order: {}", margin_account.allocated_margin);
        }
        MarginType::Cross => {
            msg!("Cross margin account:");
            msg!("Total collateral: {}", margin_account.collateral);
            msg!("Required margin for order: {}", required_margin);
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

    // Update reserves only after all validations and account updates are complete
    market.update_reserves(size, matches!(side, Side::Long))?;

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

    // Calculate exit price with impact
    let exit_price = market.calculate_price_with_impact(
        position.size,
        true // Closing position
    )?;
    msg!("Exit price: {}", exit_price);

    // Calculate PnL
    let pnl = match position.side {
        Side::Long => {
            // For long positions:
            // - Profit when exit_price > entry_price
            // - Loss when exit_price < entry_price
            let price_diff = exit_price as i64 - position.entry_price as i64;
            msg!("Long position PnL calculation:");
            msg!("Exit price: {}", exit_price);
            msg!("Entry price: {}", position.entry_price);
            msg!("Price difference: {}", price_diff);
            msg!("Position size: {}", position.size);

            if price_diff > 0 {
                // Profit case
                msg!("Long position profit calculation:");
                price_diff.checked_div(PRICE_SCALE as i64)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_mul(position.size as i64)
                    .ok_or_else(|| {
                        msg!("ERROR: Math overflow in profit calculation");
                        ErrorCode::MathOverflow
                    })?
            } else {
                // Loss case
                msg!("Long position loss calculation:");
                let loss = (-price_diff).checked_div(PRICE_SCALE as i64)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_mul(position.size as i64)
                    .ok_or_else(|| {
                        msg!("ERROR: Math overflow in loss calculation");
                        ErrorCode::MathOverflow
                    })?;
                -loss // Return negative value for loss
            }
        },
        Side::Short => {
            // For short positions:
            // - Profit when entry_price > exit_price
            // - Loss when entry_price < exit_price
            let price_diff = position.entry_price as i64 - exit_price as i64;
            msg!("Short position PnL calculation:");
            msg!("Entry price: {}", position.entry_price);
            msg!("Exit price: {}", exit_price);
            msg!("Price difference: {}", price_diff);
            msg!("Position size: {}", position.size);

            if price_diff > 0 {
                // Profit case
                msg!("Short position profit calculation:");
                price_diff.checked_div(PRICE_SCALE as i64)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_mul(position.size as i64)
                    .ok_or_else(|| {
                        msg!("ERROR: Math overflow in profit calculation");
                        ErrorCode::MathOverflow
                    })?
            } else {
                // Loss case
                msg!("Short position loss calculation:");
                let loss = (-price_diff).checked_div(PRICE_SCALE as i64)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_mul(position.size as i64)
                    .ok_or_else(|| {
                        msg!("ERROR: Math overflow in loss calculation");
                        ErrorCode::MathOverflow
                    })?;
                -loss // Return negative value for loss
            }
        }
    };
    msg!("Final PnL: {}", pnl);

    // Update margin account
    msg!("\nMargin Account Update (Isolated):");
    msg!("Previous allocated margin: {}", margin_account.allocated_margin);
    msg!("Position collateral to deallocate: {}", position.collateral);
    
    // First return the position's collateral
    margin_account.collateral = margin_account.collateral
        .checked_add(position.collateral)
        .ok_or_else(|| {
            msg!("ERROR: Math overflow in collateral return");
            ErrorCode::MathOverflow
        })?;
    msg!("Returned position collateral: {}", position.collateral);
    
    // Deallocate margin
    margin_account.allocated_margin = margin_account.allocated_margin
        .checked_sub(position.collateral)
        .ok_or_else(|| {
            msg!("ERROR: Math overflow in margin deallocation");
            ErrorCode::MathOverflow
        })?;
    msg!("New allocated margin: {}", margin_account.allocated_margin);
    
    // Update collateral with PnL
    msg!("Previous collateral: {}", margin_account.collateral);
    
    // No need to scale PnL again since we already scaled it in the calculation
    let scaled_pnl = pnl;
    msg!("Scaled PnL: {}", scaled_pnl);
    
    // Update collateral with PnL
    if scaled_pnl > 0 {
        // Profit: add to collateral
        margin_account.collateral = margin_account.collateral
            .checked_add(scaled_pnl as u64)
            .ok_or_else(|| {
                msg!("ERROR: Math overflow in collateral addition");
                ErrorCode::MathOverflow
            })?;
        msg!("Added profit to collateral: {}", scaled_pnl);
    } else if scaled_pnl < 0 {
        // Loss: subtract from collateral
        let loss = (-scaled_pnl) as u64;
        if loss > margin_account.collateral {
            msg!("ERROR: Loss {} exceeds available collateral {}", loss, margin_account.collateral);
            return Err(ErrorCode::InsufficientCollateral.into());
        }
        margin_account.collateral = margin_account.collateral
            .checked_sub(loss)
            .ok_or_else(|| {
                msg!("ERROR: Math overflow in collateral subtraction");
                ErrorCode::MathOverflow
            })?;
        msg!("Subtracted loss from collateral: {}", loss);
    }
    msg!("New collateral: {}", margin_account.collateral);

    // Update market state with new reserves
    market.last_price = exit_price;
    market.last_update_time = current_timestamp;

    // Update reserves using the Market's update_reserves method
    // For closing, we need to use the opposite side
    let opposite_side = match position.side {
        Side::Long => Side::Short,
        Side::Short => Side::Long,
    };
    market.update_reserves(position.size, matches!(opposite_side, Side::Long))?;

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
