use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};
use crate::{errors::ErrorCode, events::*, {Market, Order, OrderType, Side}};

#[derive(Accounts)]
#[instruction(side: Side, price: u64, size: u64, leverage: u64, bump: u8)]
pub struct PlaceLimitOrder<'info> {
    #[account(mut, constraint = market.is_active @ ErrorCode::MarketInactive)]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = trader,
        space = Order::SPACE, // Use constant for exact size
        seeds = [b"order", market.key().as_ref(), trader.key().as_ref(), &Clock::get().unwrap().unix_timestamp.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub trader: Signer<'info>,
    /// CHECK: This is the Pyth price account, validated in get_price_from_oracle
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

pub fn place_limit_order(
    mut ctx: Context<PlaceLimitOrder>,
    side: Side,
    price: u64,
    size: u64,
    leverage: u64,
    bump: u8,
) -> Result<()> {
    // Scope to drop mutable borrows before match_limit_order
    {
        let market = &mut ctx.accounts.market;
        let order = &mut ctx.accounts.order;
        let trader = &ctx.accounts.trader;

        // Validate inputs
        require!(market.is_active, ErrorCode::MarketInactive);
        require!(leverage <= market.max_leverage, ErrorCode::LeverageTooHigh);
        require!(size > 0, ErrorCode::InvalidOrderSize);
        require!(price > 0, ErrorCode::InvalidOrderPrice);

        // Calculate required collateral
        let required_collateral = size
            .checked_mul(price)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(leverage)
            .ok_or(ErrorCode::MathOverflow)?;

        // TODO: Transfer collateral from trader (requires token program integration)

        // Initialize order
        order.trader = trader.key();
        order.market = market.key();
        order.side = side;
        order.order_type = OrderType::Limit;
        order.price = price;
        order.size = size;
        order.filled_size = 0;
        order.leverage = leverage;
        order.collateral = required_collateral;
        order.created_at = Clock::get()?.unix_timestamp;
        order.is_active = true;
        order.bump = bump;
    } // Mutable borrows of market and order are dropped here

    // Try to match the order immediately
    match_limit_order(&mut ctx)?;

    // Emit event using ctx.accounts directly
    emit!(OrderPlacedEvent {
        market: ctx.accounts.market.key(),
        order: ctx.accounts.order.key(),
        trader: ctx.accounts.trader.key(),
        side,
        order_type: OrderType::Limit,
        price,
        size,
        leverage,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(side: Side, size: u64, leverage: u64, bump: u8)]
pub struct PlaceMarketOrder<'info> {
    #[account(mut, constraint = market.is_active @ ErrorCode::MarketInactive)]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = trader,
        space = Order::SPACE, // Use constant for exact size
        seeds = [b"order", market.key().as_ref(), trader.key().as_ref(), &Clock::get().unwrap().unix_timestamp.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub trader: Signer<'info>,
    /// CHECK: This is the Pyth price account, validated in get_price_from_oracle
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

pub fn place_market_order(
    ctx: Context<PlaceMarketOrder>,
    side: Side,
    size: u64,
    leverage: u64,
    bump: u8,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let order = &mut ctx.accounts.order;
    let trader = &ctx.accounts.trader;

    // Validate inputs
    require!(market.is_active, ErrorCode::MarketInactive);
    require!(leverage <= market.max_leverage, ErrorCode::LeverageTooHigh);
    require!(size > 0, ErrorCode::InvalidOrderSize);

    // Get current price from oracle
    let current_price = get_price_from_oracle(&ctx.accounts.price_update)?;
    // let current_price = 100_000_000;

    // Calculate required collateral
    let required_collateral = size
        .checked_mul(current_price)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(leverage)
        .ok_or(ErrorCode::MathOverflow)?;

    // TODO: Transfer collateral from trader

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
    order.created_at = Clock::get()?.unix_timestamp;
    order.is_active = false; // Market orders complete immediately
    order.bump = bump;

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
    });

    emit!(OrderFilledEvent {
        market: market.key(),
        order: order.key(),
        trader: trader.key(),
        side,
        price: current_price,
        size,
        filled_size: size,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account()]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = trader,
        has_one = market,
        constraint = order.is_active @ ErrorCode::OrderNotActive
    )]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub trader: Signer<'info>,
}

pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
    let order = &mut ctx.accounts.order;

    order.is_active = false;

    // TODO: Return collateral to trader

    emit!(OrderCancelledEvent {
        market: ctx.accounts.market.key(),
        order: order.key(),
        trader: ctx.accounts.trader.key(),
    });

    Ok(())
}

// Helper function to match a limit order
fn match_limit_order(ctx: &mut Context<PlaceLimitOrder>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let order = &mut ctx.accounts.order;

    // Simplified matching logic
    let current_price = get_price_from_oracle(&ctx.accounts.price_update)?;
    // let current_price = 100_000_000;
    let can_fill = match order.side {
        Side::Long => current_price <= order.price,
        Side::Short => current_price >= order.price,
    };

    if can_fill {
        order.filled_size = order.size;
        order.is_active = false;

        // Update market state
        match order.side {
            Side::Long => {
                market.base_asset_reserve = market.base_asset_reserve
                    .checked_add(order.size)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
            Side::Short => {
                market.base_asset_reserve = market.base_asset_reserve
                    .checked_sub(order.size)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }

        // TODO: Create position account for trader

        emit!(OrderFilledEvent {
            market: market.key(),
            order: order.key(),
            trader: order.trader,
            side: order.side,
            price: current_price,
            size: order.size,
            filled_size: order.filled_size,
        });
    }

    Ok(())
}


// Helper function to get price from Pyth oracle
fn get_price_from_oracle(price_update: &Account<PriceUpdateV2>) -> Result<u64> {
    let feed_id = get_feed_id_from_hex("0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d")
        .map_err(|_| error!(ErrorCode::InvalidOracleAccount))?;

    let current_clock = Clock::get()?; // Do not extract `unix_timestamp` yet

    // Pass the entire `current_clock` reference instead of `current_clock.unix_timestamp`
    let price_data = price_update
        .get_price_no_older_than(&current_clock, 60, &feed_id)
        .map_err(|_| ErrorCode::StaleOraclePrice)?;

    let conf_interval = price_data.conf as f64 / price_data.price as f64;
    require!(conf_interval <= 0.01, ErrorCode::PriceConfidenceTooLow);

    let price_u64 = (price_data.price as f64 * 1_000_000f64) as u64;
    Ok(price_u64)
}

