use anchor_lang::prelude::*;
use crate::{errors::ErrorCode, events::*, Market};

#[derive(Accounts)]
#[instruction(
    market_symbol: String,
    initial_funding_rate: i64,
    funding_interval: i64,
    maintenance_margin_ratio: u64,
    initial_margin_ratio: u64,
    max_leverage: u64,
    bump: u8
)]
pub struct InitializeMarket<'info> {
    #[account(
        init,
        payer = authority,
        space = 256, // Use constant for exact size
        seeds = [b"market", market_symbol.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This is the Pyth price account, stored in market.oracle
    pub oracle_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

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
    // Validate inputs
    require!(!market_symbol.is_empty(), ErrorCode::InvalidMarketSymbol);
    require!(funding_interval > 0, ErrorCode::InvalidFundingInterval);
    require!(
        maintenance_margin_ratio > 0 && maintenance_margin_ratio < 10000,
        ErrorCode::InvalidMarginRatio
    );
    require!(
        initial_margin_ratio >= maintenance_margin_ratio && initial_margin_ratio < 10000,
        ErrorCode::InvalidMarginRatio
    );
    require!(max_leverage > 0, ErrorCode::InvalidLeverage);

    let market = &mut ctx.accounts.market;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Initialize market
    market.authority = authority.key();
    market.market_symbol = market_symbol.clone();
    market.base_asset_reserve = 0;
    market.quote_asset_reserve = 0;
    market.funding_rate = initial_funding_rate;
    market.last_funding_time = clock.unix_timestamp;
    market.funding_interval = funding_interval;
    market.maintenance_margin_ratio = maintenance_margin_ratio;
    market.initial_margin_ratio = initial_margin_ratio;
    market.fee_pool = 0;
    market.insurance_fund = 0;
    market.max_leverage = max_leverage;
    market.oracle = ctx.accounts.oracle_account.key();
    market.is_active = true;
    market.bump = bump;

    // Emit event
    emit!(MarketInitializedEvent {
        market: market.key(),
        authority: authority.key(),
        market_symbol,
        funding_rate: initial_funding_rate,
        funding_interval,
        maintenance_margin_ratio,
        initial_margin_ratio,
        max_leverage,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateMarketParams<'info> {
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

pub fn update_market_params(
    ctx: Context<UpdateMarketParams>,
    maintenance_margin_ratio: Option<u64>,
    initial_margin_ratio: Option<u64>,
    funding_interval: Option<i64>,
    max_leverage: Option<u64>,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    // Update parameters if provided
    if let Some(ratio) = maintenance_margin_ratio {
        require!(ratio > 0 && ratio < 10000, ErrorCode::InvalidParameter);
        market.maintenance_margin_ratio = ratio;
    }

    if let Some(ratio) = initial_margin_ratio {
        require!(ratio > 0 && ratio < 10000, ErrorCode::InvalidParameter);
        require!(
            ratio >= market.maintenance_margin_ratio,
            ErrorCode::InvalidParameter
        );
        market.initial_margin_ratio = ratio;
    }

    if let Some(interval) = funding_interval {
        require!(interval > 0, ErrorCode::InvalidParameter);
        market.funding_interval = interval;
    }

    if let Some(leverage) = max_leverage {
        require!(leverage > 0, ErrorCode::InvalidParameter);
        market.max_leverage = leverage;
    }

    // Emit event
    emit!(MarketParamsUpdatedEvent {
        market: market.key(),
        authority: ctx.accounts.authority.key(),
        maintenance_margin_ratio: market.maintenance_margin_ratio,
        initial_margin_ratio: market.initial_margin_ratio,
        funding_interval: market.funding_interval,
        max_leverage: market.max_leverage,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct PauseMarket<'info> {
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

pub fn pause_market(ctx: Context<PauseMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(market.is_active, ErrorCode::MarketAlreadyPaused);
    market.is_active = false;

    emit!(MarketPausedEvent {
        market: market.key(),
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ResumeMarket<'info> {
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

pub fn resume_market(ctx: Context<ResumeMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(!market.is_active, ErrorCode::MarketAlreadyActive);
    market.is_active = true;

    emit!(MarketResumedEvent {
        market: market.key(),
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

// Define Market::SPACE constant in state/mod.rs for accurate allocation
impl Market {
    pub const SPACE: usize = 8 + // discriminator
        32 + // authority: Pubkey
        4 + 64 + // market_symbol: String (4 bytes len + max 64 chars)
        8 + // base_asset_reserve: u64
        8 + // quote_asset_reserve: u64
        8 + // funding_rate: i64
        8 + // last_funding_time: i64
        8 + // funding_interval: i64
        8 + // maintenance_margin_ratio: u64
        8 + // initial_margin_ratio: u64
        8 + // fee_pool: u64
        8 + // insurance_fund: u64
        8 + // max_leverage: u64
        32 + // oracle: Pubkey
        1 + // is_active: bool
        1; // bump: u8
}