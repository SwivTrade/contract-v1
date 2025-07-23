#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;


declare_id!("6UnAEvz8tLBLXM2uDmbYWYKZ6UuAgdxJHTss8HC9h3wf");

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
        liquidation_fee_ratio: u64,
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
            liquidation_fee_ratio,
            bump,
        )
    }

    pub fn pause_market(ctx: Context<PauseMarket>) -> Result<()> {
        instructions::market::pause_market(ctx)
    }

    pub fn resume_market(ctx: Context<ResumeMarket>) -> Result<()> {
        instructions::market::resume_market(ctx)
    }

    pub fn update_market_params(
        ctx: Context<UpdateMarketParams>,
        maintenance_margin_ratio: Option<u64>,
        initial_margin_ratio: Option<u64>,
        funding_interval: Option<i64>,
        max_leverage: Option<u64>,
    ) -> Result<()> {
        instructions::market::update_market_params(
            ctx,
            maintenance_margin_ratio,
            initial_margin_ratio,
            funding_interval,
            max_leverage,
        )
    }

    pub fn create_margin_account(ctx: Context<CreateMarginAccount>, margin_type: MarginType, bump: u8) -> Result<()> {
        instructions::collateral::create_margin_account(ctx, margin_type, bump)
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        instructions::collateral::deposit_collateral(ctx, amount)
    }

    pub fn withdraw_collateral<'info>(ctx: Context<'_, '_, 'info, 'info, WithdrawCollateral<'info>>,amount: u64) -> Result<()> {
        instructions::collateral::withdraw_collateral(ctx, amount)
    }

    // pub fn update_funding_rate(ctx: Context<UpdateFundingRate>, new_funding_rate: i64) -> Result<()> {
    //     instructions::funding::update_funding_rate(ctx, new_funding_rate)
    // }

    // pub fn update_funding_payments(ctx: Context<UpdateFundingPayments>) -> Result<()> {
    //     instructions::funding::update_funding_payments(ctx)
    // }

    pub fn place_market_order(
        ctx: Context<PlaceMarketOrder>,
        side: Side,
        size: u64,
        leverage: u64,
        position_bump: u8,
        uid: u64,
    ) -> Result<()> {
        instructions::order::place_market_order(ctx, side, size, leverage, position_bump, uid)
    }

    pub fn close_market_order(ctx: Context<CloseMarketOrder>) -> Result<()> {
        instructions::order::close_market_order(ctx)
    }

    pub fn liquidate_market_order(ctx: Context<LiquidateMarketOrder>) -> Result<()> {
        instructions::order::liquidate_market_order(ctx)
    }
}