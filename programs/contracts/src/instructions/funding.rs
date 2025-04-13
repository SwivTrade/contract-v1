use anchor_lang::prelude::*;
use crate::{errors::ErrorCode, events::*, Market};

#[derive(Accounts)]
pub struct UpdateFundingRate<'info> {
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

pub fn update_funding_rate(ctx: Context<UpdateFundingRate>, new_funding_rate: i64) -> Result<()> {
    let market = &mut ctx.accounts.market;

    let old_funding_rate = market.funding_rate;
    market.funding_rate = new_funding_rate;

    emit!(FundingRateUpdatedEvent {
        market: market.key(),
        authority: ctx.accounts.authority.key(),
        old_funding_rate,
        new_funding_rate,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFundingPayments<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

pub fn update_funding_payments(ctx: Context<UpdateFundingPayments>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // Check if funding interval has passed
    let next_funding_time = market.last_funding_time
        .checked_add(market.funding_interval)
        .ok_or(ErrorCode::MathOverflow)?;
    if current_time < next_funding_time {
        return Ok(());
    }

    // Calculate elapsed intervals
    let elapsed_time = current_time
        .checked_sub(market.last_funding_time)
        .ok_or(ErrorCode::MathOverflow)?;
    let intervals = elapsed_time
        .checked_div(market.funding_interval)
        .ok_or(ErrorCode::MathOverflow)?;

    if intervals == 0 {
        return Ok(());
    }

    // Update last funding time
    market.last_funding_time = market.last_funding_time
        .checked_add(intervals.checked_mul(market.funding_interval).ok_or(ErrorCode::MathOverflow)?)
        .ok_or(ErrorCode::MathOverflow)?;

    // TODO: In production, iterate over positions to:
    // 1. Calculate funding payments based on position size and funding_rate
    // 2. Update position.last_cumulative_funding and realized_pnl
    // 3. Transfer funds between long/short traders or to/from insurance fund
    let _funding_increment = market.funding_rate
        .checked_mul(intervals)
        .ok_or(ErrorCode::MathOverflow)?;

    emit!(FundingUpdatedEvent {
        market: market.key(),
        funding_rate: market.funding_rate,
        intervals,
        timestamp: current_time,
    });

    Ok(())
}