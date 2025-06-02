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

    // Calculate price with impact
    let price_with_impact = market.calculate_price_with_impact(
        size,
        false // Opening position
    )?;
    msg!("Price with impact: {}", price_with_impact);

    // Adjust price based on order side
    let adjusted_price = match side {
        Side::Long => price_with_impact,  // Long orders pay higher price
        Side::Short => {
            // For short orders, we need to subtract the impact from the base price
            let base_price = market.calculate_price()?;
            let impact = price_with_impact.checked_sub(base_price).ok_or(ErrorCode::MathOverflow)?;
            base_price.checked_sub(impact).ok_or(ErrorCode::MathOverflow)?
        }
    };
    msg!("Adjusted price for {}: {}", if matches!(side, Side::Long) { "long" } else { "short" }, adjusted_price);

    // Calculate position value
    let position_value = size
        .checked_mul(adjusted_price)
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
            // For isolated margin, check if there's enough available margin
            let available_margin = margin_account.available_margin()?;
            msg!("Isolated margin account:");
            msg!("Total collateral: {}", margin_account.collateral);
            msg!("Allocated margin: {}", margin_account.allocated_margin);
            msg!("Available margin: {}", available_margin);
            require!(
                available_margin >= required_margin,
                ErrorCode::InsufficientMargin
            );

            // Allocate margin to this position
            margin_account.allocated_margin = margin_account
                .allocated_margin
                .checked_add(required_margin)
                .ok_or(ErrorCode::MathOverflow)?;
            msg!("New allocated margin: {}", margin_account.allocated_margin);
        }
        MarginType::Cross => {
            // For cross margin, check if total margin is sufficient
            msg!("Cross margin account:");
            msg!("Total collateral: {}", margin_account.collateral);
            require!(
                margin_account.collateral >= required_margin,
                ErrorCode::InsufficientMargin
            );
        }
    }

    // Update market state
    market.update_reserves(&side, size)?;

    // Initialize order
    order.trader = trader.key();
    order.market = market.key();
    order.side = side;
    order.order_type = OrderType::Market;
    order.price = adjusted_price;
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
    position.entry_price = adjusted_price;
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
        price: adjusted_price,
        size,
        leverage,
        timestamp: current_timestamp,
    });

    emit!(OrderFilledEvent {
        market: market.key(),
        order: order.key(),
        trader: trader.key(),
        side,
        price: adjusted_price,
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

    // Calculate price with impact for closing
    let base_price = market.calculate_price()?;
    msg!("Base price: {}", base_price);

    // Calculate price impact with simpler arithmetic
    let impact_ratio = market.price_impact_factor.checked_div(100).ok_or(ErrorCode::MathOverflow)?;
    msg!("Impact ratio: {}", impact_ratio);

    // Scale down size first to avoid overflow
    let scaled_size = position.size.checked_div(1_000_000).ok_or(ErrorCode::MathOverflow)?;
    let price_impact = scaled_size
        .checked_mul(impact_ratio)
        .ok_or(ErrorCode::MathOverflow)?;
    msg!("Price impact: {}", price_impact);

    // Calculate final price with impact
    let price_with_impact = base_price.checked_add(price_impact).ok_or(ErrorCode::MathOverflow)?;
    msg!("Final price with impact: {}", price_with_impact);

    // Adjust price based on position side (opposite of opening order)
    let adjusted_price = match position.side {
        Side::Long => {
            // For closing long positions, we get a lower price
            base_price.checked_sub(price_impact).ok_or(ErrorCode::MathOverflow)?
        },
        Side::Short => price_with_impact,  // For closing short positions, we get a higher price
    };
    msg!("Adjusted price for closing {}: {}", if matches!(position.side, Side::Long) { "long" } else { "short" }, adjusted_price);

    // Calculate PnL with simpler arithmetic
    let entry_value = scaled_size
        .checked_mul(position.entry_price)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let exit_value = scaled_size
        .checked_mul(adjusted_price)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate PnL based on position side
    let pnl = match position.side {
        Side::Long => {
            // For longs: PnL = exit_value - entry_value
            exit_value.checked_sub(entry_value)
        },
        Side::Short => {
            // For shorts: PnL = entry_value - exit_value
            entry_value.checked_sub(exit_value)
        }
    }.ok_or(ErrorCode::MathOverflow)? as i64;

    msg!("PnL calculation:");
    msg!("Scaled size: {}", scaled_size);
    msg!("Entry price: {}", position.entry_price);
    msg!("Exit price: {}", adjusted_price);
    msg!("Entry value: {}", entry_value);
    msg!("Exit value: {}", exit_value);
    msg!("PnL: {}", pnl);

    // Store values before accounts are closed
    let position_side = position.side;
    let position_size = position.size;
    let position_collateral = position.collateral;
    let position_entry_price = position.entry_price;
    let position_key = position.key();
    let order_key = order.key();

    // Update market state
    market.update_reserves(&position_side, position_size)?;

    // Update margin account based on margin type
    match margin_account.margin_type {
        MarginType::Isolated => {
            margin_account.allocated_margin = margin_account
                .allocated_margin
                .checked_sub(position_collateral)
                .ok_or(ErrorCode::MathOverflow)?;

            if pnl > 0 {
                margin_account.collateral = margin_account
                    .collateral
                    .checked_add(pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                let abs_pnl = pnl.checked_abs().ok_or(ErrorCode::MathOverflow)?;
                margin_account.collateral = margin_account
                    .collateral
                    .checked_sub(abs_pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }
        MarginType::Cross => {
            if pnl > 0 {
                margin_account.collateral = margin_account
                    .collateral
                    .checked_add(pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                let abs_pnl = pnl.checked_abs().ok_or(ErrorCode::MathOverflow)?;
                margin_account.collateral = margin_account
                    .collateral
                    .checked_sub(abs_pnl as u64)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }
    }

    // Remove order and position from margin account's lists
    if let Some(pos) = margin_account
        .positions
        .iter()
        .position(|&p| p == position_key)
    {
        margin_account.positions.remove(pos);
    }
    if let Some(ord) = margin_account.orders.iter().position(|&o| o == order_key) {
        margin_account.orders.remove(ord);
    }

     // Close position
     position.is_open = false;
     position.realized_pnl = position.realized_pnl
         .checked_add(pnl)
         .ok_or(ErrorCode::MathOverflow)?;
 

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
        exit_price: adjusted_price,
        realized_pnl: pnl,
        margin_type: margin_account.margin_type,
    });

    Ok(())
}
