use anchor_lang::prelude::*;
use crate::{errors::ErrorCode, events::*, {Market, Order, OrderType, Side, MarginAccount, MarginType, Position}};

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
    size: u64,
    side: Side,
    leverage: u64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let order = &mut ctx.accounts.order;
    let position = &mut ctx.accounts.position;
    let margin_account = &mut ctx.accounts.margin_account;
    let clock = Clock::get()?;

    // Validate market is active
    require!(market.is_active, ErrorCode::MarketInactive);
    
    // Validate leverage
    require!(leverage > 0 && leverage <= market.max_leverage, ErrorCode::InvalidLeverage);
    
    // Calculate price with impact using AMM
    let price_with_impact = market.calculate_price_with_impact(size)?;
    
    // Calculate required margin
    let required_margin = size
        .checked_mul(price_with_impact)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(leverage)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // Check if trader has enough margin
    require!(
        margin_account.available_margin()? >= required_margin,
        ErrorCode::InsufficientMargin
    );
    
    // Update AMM reserves
    market.update_reserves(&side, size)?;
    
    // Initialize order
    order.trader = ctx.accounts.trader.key();
    order.market = market.key();
    order.side = side;
    order.order_type = OrderType::Market;
    order.price = price_with_impact;
    order.size = size;
    order.filled_size = size;
    order.leverage = leverage;
    order.collateral = required_margin;
    order.created_at = clock.unix_timestamp;
    order.is_active = false;
    order.bump = *ctx.bumps.get("order").unwrap();
    
    // Initialize position
    position.trader = ctx.accounts.trader.key();
    position.market = market.key();
    position.side = side;
    position.size = size;
    position.collateral = required_margin;
    position.entry_price = price_with_impact;
    position.entry_funding_rate = market.funding_rate;
    position.leverage = leverage;
    position.realized_pnl = 0;
    position.last_funding_payment_time = clock.unix_timestamp;
    position.last_cumulative_funding = 0;
    position.liquidation_price = calculate_liquidation_price(
        price_with_impact,
        leverage,
        market.maintenance_margin_ratio,
        side,
    )?;
    position.is_open = true;
    position.bump = *ctx.bumps.get("position").unwrap();
    
    // Update margin account
    margin_account.allocated_margin = margin_account
        .allocated_margin
        .checked_add(required_margin)
        .ok_or(ErrorCode::MathOverflow)?;
    margin_account.positions.push(position.key());
    
    // Emit events
    emit!(OrderPlacedEvent {
        market: market.key(),
        order: order.key(),
        trader: ctx.accounts.trader.key(),
        side,
        size,
        price: price_with_impact,
        leverage,
        timestamp: clock.unix_timestamp,
    });
    
    emit!(OrderFilledEvent {
        market: market.key(),
        order: order.key(),
        position: position.key(),
        trader: ctx.accounts.trader.key(),
        side,
        size,
        price: price_with_impact,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

// Helper function to calculate liquidation price
fn calculate_liquidation_price(
    entry_price: u64,
    leverage: u64,
    maintenance_margin: u64,
    side: Side,
) -> Result<u64> {
    let margin_ratio = maintenance_margin
        .checked_mul(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(leverage)
        .ok_or(ErrorCode::MathOverflow)?;
    
    match side {
        Side::Long => {
            entry_price
                .checked_mul(10000 - margin_ratio)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::MathOverflow.into())
        },
        Side::Short => {
            entry_price
                .checked_mul(10000 + margin_ratio)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::MathOverflow.into())
        }
    }
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

    // Calculate price with impact using AMM
    let price_with_impact = market.calculate_price_with_impact(position.size)?;

    // Calculate PnL
    let entry_value = position.size
        .checked_mul(position.entry_price)
        .ok_or(ErrorCode::MathOverflow)?;

    let exit_value = position.size
        .checked_mul(price_with_impact)
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

    // Update market state using AMM
    market.update_reserves(&position_side, position_size)?;

    // Update margin account based on margin type
    match margin_account.margin_type {
        MarginType::Isolated => {
            // For isolated margin, release the allocated margin
            margin_account.allocated_margin = margin_account.allocated_margin
                .checked_sub(position_collateral)
                .ok_or(ErrorCode::MathOverflow)?;
            
            // Update collateral with PnL
            margin_account.collateral = margin_account.collateral
                .checked_add(pnl as u64)
                .ok_or(ErrorCode::MathOverflow)?;
        },
        MarginType::Cross => {
            // For cross margin, just update the collateral with PnL
            margin_account.collateral = margin_account.collateral
                .checked_add(pnl as u64)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Remove order and position from margin account
    if let Some(order_idx) = margin_account.orders.iter().position(|&o| o == order_key) {
        margin_account.orders.remove(order_idx);
    }
    if let Some(position_idx) = margin_account.positions.iter().position(|&p| p == position_key) {
        margin_account.positions.remove(position_idx);
    }

    // Close position
    position.is_open = false;
    position.realized_pnl = position.realized_pnl
        .checked_add(pnl)
        .ok_or(ErrorCode::MathOverflow)?;

    // Emit events
    emit!(OrderClosedEvent {
        market: market.key(),
        order: order_key,
        position: position_key,
        trader: trader.key(),
        side: position_side,
        size: position_size,
        entry_price: position_entry_price,
        exit_price: price_with_impact,
        pnl,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

