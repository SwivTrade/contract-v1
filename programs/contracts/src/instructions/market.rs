use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::{errors::ErrorCode, events::*, Market};

#[derive(Accounts)]
#[instruction(
    market_symbol: String,
    initial_funding_rate: i64,
    funding_interval: i64,
    maintenance_margin_ratio: u64,
    initial_margin_ratio: u64,
    max_leverage: u64,
    liquidation_fee_ratio: u64,
    bump: u8
)]
pub struct InitializeMarket<'info> {
    #[account(
        init,
        payer = authority,
        space = Market::SPACE,
        seeds = [b"market", market_symbol.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This is the Pyth price account, stored in market.oracle
    pub oracle_account: AccountInfo<'info>,
    /// The token mint for the market's collateral
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = market,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>
}

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
    require!(liquidation_fee_ratio > 0 && liquidation_fee_ratio < 10000, ErrorCode::InvalidParameter);

    let market = &mut ctx.accounts.market;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Initialize market
    market.authority = authority.key();
    market.market_symbol = market_symbol.clone();
    market.base_asset_reserve = 1_000_000_000; // Start with 1 billion base units
    market.quote_asset_reserve = 0;
    market.funding_rate = initial_funding_rate;
    market.last_funding_time = clock.unix_timestamp;
    market.funding_interval = funding_interval;
    market.maintenance_margin_ratio = maintenance_margin_ratio;
    market.initial_margin_ratio = initial_margin_ratio;
    market.liquidation_fee_ratio = liquidation_fee_ratio;
    market.fee_pool = 0;
    market.insurance_fund = 0;
    market.max_leverage = max_leverage;
    market.oracle = ctx.accounts.oracle_account.key();
    market.vault = ctx.accounts.vault.key();
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
        liquidation_fee_ratio,
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

