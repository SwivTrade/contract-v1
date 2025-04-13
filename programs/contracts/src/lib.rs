#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;

use instructions::*;

declare_id!("s2zmrr2SqcwCdeAGRiPFftDSV9CRhXqAbRcMgmh4goC");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy)]
pub enum Side {
    Long,
    Short,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy)]
pub enum OrderType {
    Limit,
    Market,
    StopLoss,
    TakeProfit,
}

#[account]
pub struct Market {
    pub authority: Pubkey,
    pub market_symbol: String,
    pub base_asset_reserve: u64,
    pub quote_asset_reserve: u64,
    pub funding_rate: i64,
    pub last_funding_time: i64,
    pub funding_interval: i64,
    pub maintenance_margin_ratio: u64,
    pub initial_margin_ratio: u64,
    pub fee_pool: u64,
    pub insurance_fund: u64,
    pub max_leverage: u64,
    pub oracle: Pubkey,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
pub struct Position {
    pub trader: Pubkey,
    pub market: Pubkey,
    pub side: Side,
    pub size: u64,
    pub collateral: u64,
    pub entry_price: u64,
    pub entry_funding_rate: i64,
    pub leverage: u64,
    pub realized_pnl: i64,
    pub last_funding_payment_time: i64,
    pub last_cumulative_funding: i64,
    pub liquidation_price: u64,
    pub is_open: bool,
    pub bump: u8,
}

impl Position {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct Order {
    pub trader: Pubkey,
    pub market: Pubkey,
    pub side: Side,
    pub order_type: OrderType,
    pub price: u64,
    pub size: u64,
    pub filled_size: u64,
    pub leverage: u64,
    pub collateral: u64,
    pub created_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl Order {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
#[derive(Default)]
pub struct MarginAccount {
    pub owner: Pubkey,
    pub perp_market: Pubkey,
    pub collateral: u64,
    pub orders: Vec<Pubkey>,
    pub positions: Vec<Pubkey>,
    pub bump: u8,
}

impl MarginAccount {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 4 + (32 * 20) + 4 + (32 * 10) + 1;

    pub fn available_margin(&self) -> Result<u64> {
        Ok(self.collateral) // Simplified; needs position data for accuracy
    }
}

#[program]
pub mod contracts {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_symbol: String,
        initial_funding_rate: i64,
        funding_interval: i64,
        maintenance_margin_ratio: u64,
        initial_margin_ratio: u64,
        max_leverage: u64,
        bump: u8,
    ) -> Result<()> {
        instructions::market::initialize_market(
            ctx,
            market_symbol,
            initial_funding_rate,
            funding_interval,
            maintenance_margin_ratio,
            initial_margin_ratio,
            max_leverage,
            bump,
        )
    }

    pub fn create_margin_account(ctx: Context<CreateMarginAccount>, bump: u8) -> Result<()> {
        instructions::collateral::create_margin_account(ctx, bump)
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        instructions::collateral::deposit_collateral(ctx, amount)
    }

    pub fn withdraw_collateral<'info>(ctx: Context<'_, '_, 'info, 'info, WithdrawCollateral<'info>>,amount: u64) -> Result<()> {
        instructions::collateral::withdraw_collateral(ctx, amount)
    }

    pub fn update_funding_rate(ctx: Context<UpdateFundingRate>, new_funding_rate: i64) -> Result<()> {
        instructions::funding::update_funding_rate(ctx, new_funding_rate)
    }

    pub fn update_funding_payments(ctx: Context<UpdateFundingPayments>) -> Result<()> {
        instructions::funding::update_funding_payments(ctx)
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        side: Side,
        size: u64,
        leverage: u64,
        bump: u8,
    ) -> Result<()> {
        instructions::position::open_position(ctx, side, size, leverage, bump)
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        instructions::position::close_position(ctx)
    }

    pub fn place_limit_order(
        ctx: Context<PlaceLimitOrder>,
        side: Side,
        price: u64,
        size: u64,
        leverage: u64,
        bump: u8,
    ) -> Result<()> {
        instructions::order::place_limit_order(ctx, side, price, size, leverage, bump)
    }

    pub fn place_market_order(
        ctx: Context<PlaceMarketOrder>,
        side: Side,
        size: u64,
        leverage: u64,
        bump: u8,
    ) -> Result<()> {
        instructions::order::place_market_order(ctx, side, size, leverage, bump)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::order::cancel_order(ctx)
    }

    pub fn adjust_position_margin(ctx: Context<AdjustPositionMargin>, margin_change: i64) -> Result<()> {
        instructions::position::adjust_position_margin(ctx, margin_change)
    }

    pub fn liquidate_position(ctx: Context<LiquidatePosition>) -> Result<()> {
        instructions::position::liquidate_position(ctx)
    }
}