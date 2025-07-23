use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::{Market, MarginAccount, Position, MarginType, errors::ErrorCode, events::*};

/// Deposit collateral into a margin account
pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    require!(amount >= 1000, ErrorCode::DepositTooSmall);
    require!(ctx.accounts.market.is_active, ErrorCode::MarketInactive);

    // Transfer tokens from user to market vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.market_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Update margin account collateral
    let margin_account = &mut ctx.accounts.margin_account;
    margin_account.collateral = margin_account.collateral
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    emit!(CollateralDeposited {
        owner: ctx.accounts.owner.key(),
        margin_account: ctx.accounts.margin_account.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Withdraw collateral from a margin account
pub fn withdraw_collateral<'info>(
    ctx: Context<'_, '_, 'info, 'info, WithdrawCollateral<'info>>,
    amount: u64,
) -> Result<()> {
    require!(amount >= 1000, ErrorCode::WithdrawalTooSmall);
    require!(ctx.accounts.market.is_active, ErrorCode::MarketInactive);

    let margin_account = &mut ctx.accounts.margin_account;
    require!(margin_account.collateral >= amount, ErrorCode::InsufficientCollateral);

    let market = &ctx.accounts.market;
    
    // Get positions from remaining accounts
    let positions = ctx.remaining_accounts
        .iter()
        .map(|account| Account::<Position>::try_from(account))
        .collect::<Result<Vec<_>>>()?;

    // Validate that all positions in margin_account.positions are provided
    for position_key in &margin_account.positions {
        if !positions.iter().any(|p| p.key() == *position_key) {
            return Err(ErrorCode::InvalidPosition.into());
        }
    }

    // Calculate required margin based on margin type
    let required_margin = match margin_account.margin_type {
        MarginType::Isolated => {
            // For isolated margin, we need to ensure we don't withdraw allocated margin
            let allocated_margin = margin_account.allocated_margin;
            let available_margin = margin_account.available_margin()?;
            
            // Ensure we're not withdrawing more than available margin
            require!(amount <= available_margin, ErrorCode::WithdrawalExceedsAvailableMargin);
            
            // Return allocated margin as required margin
            allocated_margin
        },
        MarginType::Cross => {
            // For cross margin, calculate required margin based on all positions
            calculate_required_margin(margin_account, &positions, market)?
        }
    };

    // Check if withdrawal would leave enough margin
    let remaining_collateral = margin_account.collateral
        .checked_sub(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(remaining_collateral >= required_margin, ErrorCode::WithdrawalBelowMaintenanceMargin);

    // Update margin account collateral
    margin_account.collateral = remaining_collateral;

    // Transfer tokens from market vault to user
    let market_symbol = market.market_symbol.clone();
    let market_bump = market.bump;
    
    let seeds = &[
        b"market".as_ref(),
        market_symbol.as_bytes(),
        &[market_bump],
    ];
    let signer = &[&seeds[..]];
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.market_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        },
        signer,
    );
    token::transfer(transfer_ctx, amount)?;

    emit!(CollateralWithdrawn {
        owner: ctx.accounts.owner.key(),
        margin_account: ctx.accounts.margin_account.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Create a margin account for a user
pub fn create_margin_account(ctx: Context<CreateMarginAccount>, margin_type: MarginType, bump: u8) -> Result<()> {
    let margin_account = &mut ctx.accounts.margin_account;
    margin_account.owner = ctx.accounts.owner.key();
    margin_account.margin_type = margin_type;
    margin_account.collateral = 0;
    margin_account.allocated_margin = 0;
    margin_account.positions = Vec::new();
    margin_account.bump = bump;

    emit!(MarginAccountCreated {
        owner: ctx.accounts.owner.key(),
        margin_account: margin_account.key(),
        margin_type,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Helper function to calculate required margin
fn calculate_required_margin(
    margin_account: &MarginAccount,
    positions: &[Account<'_, Position>],
    market: &Market,
) -> Result<u64> {
    let mut required_margin: u64 = 0;
    for position_key in &margin_account.positions {
        if let Some(position) = positions.iter().find(|p| p.key() == *position_key) {
            let position_value = position.size
                .checked_mul(position.entry_price)
                .ok_or(ErrorCode::MathOverflow)?;
            let position_margin = position_value
                .checked_mul(market.initial_margin_ratio)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(position.leverage)
                .ok_or(ErrorCode::MathOverflow)?;
            required_margin = required_margin
                .checked_add(position_margin)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }
    Ok(required_margin)
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = margin_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub margin_account: Account<'info, MarginAccount>,
    #[account(constraint = market.is_active @ ErrorCode::MarketInactive)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        constraint = user_token_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = market_vault.key() == market.vault @ ErrorCode::InvalidVault,
    )]
    pub market_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = margin_account.owner == owner.key() @ ErrorCode::Unauthorized, 
    )]
    pub margin_account: Account<'info, MarginAccount>,
    #[account(constraint = market.is_active @ ErrorCode::MarketInactive)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        constraint = user_token_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = market_vault.key() == market.vault @ ErrorCode::InvalidVault,
    )]
    pub market_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    // Positions are passed via remaining_accounts
}

#[derive(Accounts)]
#[instruction(margin_type: MarginType, bump: u8)]
pub struct CreateMarginAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = MarginAccount::SPACE,
        seeds = [b"margin_account", owner.key().as_ref()],
        bump,
    )]
    pub margin_account: Account<'info, MarginAccount>,

    pub system_program: Program<'info, System>,
}