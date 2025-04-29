use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};
use crate::{errors::ErrorCode, events::*, {Market, Position, Side, MarginAccount, MarginType}};

#[derive(Accounts)]
#[instruction(side: Side, size: u64, leverage: u64, bump: u8)]
pub struct OpenPosition<'info> {
    #[account(mut, constraint = market.is_active @ ErrorCode::MarketInactive)]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = trader,
        space = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"position", market.key().as_ref(), trader.key().as_ref()],
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
    /// CHECK: This is the Pyth price account, validated in get_price_from_oracle
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

pub fn open_position(
    ctx: Context<OpenPosition>,
    side: Side,
    size: u64,
    leverage: u64,
    bump: u8,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    let margin_account = &mut ctx.accounts.margin_account;
    let trader = &ctx.accounts.trader;

    // Validate inputs
    require!(market.is_active, ErrorCode::MarketInactive);
    require!(leverage <= market.max_leverage, ErrorCode::LeverageTooHigh);
    require!(size > 0, ErrorCode::InvalidOrderSize);

    // Get current price from oracle
    let current_price = get_price_from_oracle(&ctx.accounts.price_update)?;

    // Calculate required collateral
    let position_value = size
        .checked_mul(current_price)
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

    // Initialize position
    let clock = Clock::get()?;
    position.trader = trader.key();
    position.market = market.key();
    position.side = side;
    position.size = size;
    position.collateral = required_collateral;
    position.entry_price = current_price;
    position.entry_funding_rate = market.funding_rate;
    position.leverage = leverage;
    position.realized_pnl = 0;
    position.last_funding_payment_time = clock.unix_timestamp;
    position.last_cumulative_funding = 0; // Should track cumulative funding index in production
    position.is_open = true;
    position.bump = bump;

    // Calculate liquidation price
    let liquidation_price = calculate_liquidation_price(position, market.maintenance_margin_ratio)?;
    position.liquidation_price = liquidation_price;

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

    // Add position to margin account
    margin_account.positions.push(position.key());

    // Emit event
    emit!(PositionOpenedEvent {
        market: market.key(),
        position: position.key(),
        trader: trader.key(),
        side,
        size,
        collateral: required_collateral,
        entry_price: current_price,
        leverage,
        liquidation_price,
        margin_type: margin_account.margin_type,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = trader,
        has_one = market,
        constraint = position.is_open @ ErrorCode::PositionClosed
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
    /// CHECK: This is the Pyth price account, validated in get_price_from_oracle
    pub price_update: Account<'info, PriceUpdateV2>,
}

pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    let margin_account = &mut ctx.accounts.margin_account;
    let trader = &ctx.accounts.trader;

    // Get current price from oracle
    let current_price = get_price_from_oracle(&ctx.accounts.price_update)?;

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

    // Update position
    position.is_open = false;
    position.realized_pnl = position.realized_pnl
        .checked_add(pnl)
        .ok_or(ErrorCode::MathOverflow)?;

    // Update market state
    match position.side {
        Side::Long => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_sub(position.size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        Side::Short => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_add(position.size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Calculate return amount (collateral + positive PnL, or reduced by negative PnL)
    let return_amount = if pnl > 0 {
        position.collateral.checked_add(pnl as u64)
    } else {
        position.collateral.checked_sub((-pnl) as u64)
    }.ok_or(ErrorCode::MathOverflow)?;

    // Update margin account based on margin type
    match margin_account.margin_type {
        MarginType::Isolated => {
            // For isolated margin, release the allocated margin
            margin_account.allocated_margin = margin_account.allocated_margin
                .checked_sub(position.collateral)
                .ok_or(ErrorCode::MathOverflow)?;
            
            // Update collateral with PnL
            margin_account.collateral = margin_account.collateral
                .checked_add(return_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        },
        MarginType::Cross => {
            // For cross margin, just update the collateral with PnL
            margin_account.collateral = margin_account.collateral
                .checked_add(return_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Remove position from margin account's positions list
    if let Some(pos) = margin_account.positions.iter().position(|&p| p == position.key()) {
        margin_account.positions.remove(pos);
    }

    // Emit event
    emit!(PositionClosedEvent {
        market: market.key(),
        position: position.key(),
        trader: trader.key(),
        side: position.side,
        size: position.size,
        collateral: position.collateral,
        entry_price: position.entry_price,
        exit_price: current_price,
        realized_pnl: pnl,
        margin_type: margin_account.margin_type,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AdjustPositionMargin<'info> {
    #[account()]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = trader,
        has_one = market,
        constraint = position.is_open @ ErrorCode::PositionClosed
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub trader: Signer<'info>,
    /// CHECK: This is the Pyth price account, validated in get_price_from_oracle
    pub price_update: Account<'info, PriceUpdateV2>,
}

pub fn adjust_position_margin(
    ctx: Context<AdjustPositionMargin>,
    margin_change: i64, // Positive to add, negative to remove
) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    // Calculate current position value
    let current_price = get_price_from_oracle(&ctx.accounts.price_update)?;
    let position_value = position.size
        .checked_mul(current_price)
        .ok_or(ErrorCode::MathOverflow)?;

    // Adjust collateral based on margin_change
    if margin_change < 0 {
        let margin_to_remove = (-margin_change) as u64;
        let new_collateral = position.collateral
            .checked_sub(margin_to_remove)
            .ok_or(ErrorCode::InsufficientMargin)?;

        let min_required_margin = position_value
            .checked_mul(market.initial_margin_ratio)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(new_collateral >= min_required_margin, ErrorCode::InsufficientMargin);
        position.collateral = new_collateral;

        // TODO: Transfer margin_to_remove back to trader
    } else {
        position.collateral = position.collateral
            .checked_add(margin_change as u64)
            .ok_or(ErrorCode::MathOverflow)?;

        // TODO: Transfer margin_change from trader
    }

    // Recalculate liquidation price
    let liquidation_price = calculate_liquidation_price(position, market.maintenance_margin_ratio)?;
    position.liquidation_price = liquidation_price;

    // Emit event
    emit!(MarginAdjustedEvent {
        market: market.key(),
        position: position.key(),
        trader: ctx.accounts.trader.key(),
        margin_change,
        new_collateral: position.collateral,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = market,
        constraint = position.is_open @ ErrorCode::PositionClosed
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
    /// CHECK: This is the Pyth price account, validated in get_price_from_oracle
    pub price_update: Account<'info, PriceUpdateV2>,
}

pub fn liquidate_position(ctx: Context<LiquidatePosition>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    let margin_account = &mut ctx.accounts.margin_account;
    let liquidator = &ctx.accounts.liquidator;

    // Get current price from oracle
    let current_price = get_price_from_oracle(&ctx.accounts.price_update)?;

    // Calculate position value and equity
    let position_value = position.size
        .checked_mul(current_price)
        .ok_or(ErrorCode::MathOverflow)?;

    let entry_value = position.size
        .checked_mul(position.entry_price)
        .ok_or(ErrorCode::MathOverflow)?;

    let position_value_i64 = position_value as i64;
    let entry_value_i64 = entry_value as i64;

    let unrealized_pnl = match position.side {
        Side::Long => position_value_i64.checked_sub(entry_value_i64),
        Side::Short => entry_value_i64.checked_sub(position_value_i64),
    }.ok_or(ErrorCode::MathOverflow)?;

    let equity = if unrealized_pnl > 0 {
        position.collateral.checked_add(unrealized_pnl as u64)
    } else {
        position.collateral.checked_sub((-unrealized_pnl) as u64)
    }.ok_or(ErrorCode::MathOverflow)?;

    // Check if position is liquidatable
    let maintenance_margin = position_value
        .checked_mul(market.maintenance_margin_ratio)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(equity < maintenance_margin, ErrorCode::PositionNotLiquidatable);

    // Calculate liquidation fee (2.5% of position value)
    let liquidation_fee = position_value
        .checked_mul(250)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?;

    let liquidator_fee = liquidation_fee
        .checked_div(2)
        .ok_or(ErrorCode::MathOverflow)?;

    let insurance_fund_fee = liquidation_fee
        .checked_sub(liquidator_fee)
        .ok_or(ErrorCode::MathOverflow)?;

    // Update insurance fund
    market.insurance_fund = market.insurance_fund
        .checked_add(insurance_fund_fee)
        .ok_or(ErrorCode::MathOverflow)?;

    // TODO: Transfer liquidator_fee to liquidator

    // Close position
    position.is_open = false;
    position.realized_pnl = position.realized_pnl
        .checked_add(unrealized_pnl)
        .ok_or(ErrorCode::MathOverflow)?;

    // Update market state
    match position.side {
        Side::Long => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_sub(position.size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        Side::Short => {
            market.base_asset_reserve = market.base_asset_reserve
                .checked_add(position.size)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Update margin account based on margin type
    match margin_account.margin_type {
        MarginType::Isolated => {
            // For isolated margin, release the allocated margin
            margin_account.allocated_margin = margin_account.allocated_margin
                .checked_sub(position.collateral)
                .ok_or(ErrorCode::MathOverflow)?;
            
            // Update collateral with unrealized PnL
            margin_account.collateral = margin_account.collateral
                .checked_add(unrealized_pnl as u64)
                .ok_or(ErrorCode::MathOverflow)?;
        },
        MarginType::Cross => {
            // For cross margin, just update the collateral with unrealized PnL
            margin_account.collateral = margin_account.collateral
                .checked_add(unrealized_pnl as u64)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Remove position from margin account's positions list
    if let Some(pos) = margin_account.positions.iter().position(|&p| p == position.key()) {
        margin_account.positions.remove(pos);
    }

    // Emit event
    emit!(PositionLiquidatedEvent {
        market: market.key(),
        position: position.key(),
        trader: position.trader,
        liquidator: liquidator.key(),
        size: position.size,
        collateral: position.collateral,
        liquidation_price: current_price,
        liquidation_fee,
        margin_type: margin_account.margin_type,
    });

    Ok(())
}

// Helper function to calculate liquidation price
fn calculate_liquidation_price(position: &Position, maintenance_margin_ratio: u64) -> Result<u64> {
    let collateral_per_unit = position.collateral
        .checked_mul(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(position.size)
        .ok_or(ErrorCode::MathOverflow)?;

    let buffer = collateral_per_unit
        .checked_mul(10000 - maintenance_margin_ratio)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?;

    let liquidation_price = match position.side {
        Side::Long => position.entry_price.checked_sub(buffer),
        Side::Short => position.entry_price.checked_add(buffer),
    }.ok_or(ErrorCode::MathOverflow)?;

    Ok(liquidation_price)
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
