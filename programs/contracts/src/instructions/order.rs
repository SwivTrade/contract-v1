use anchor_lang::prelude::*;
use mock_oracle::Oracle;
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

