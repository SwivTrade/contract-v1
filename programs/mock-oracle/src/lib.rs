use anchor_lang::prelude::*;

declare_id!("G2EDsqC3igU7f1PgvZgTSLdAMTn9qmwEq7y8Z92hFTCH");

#[program]
pub mod mock_oracle {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, _market_symbol: String, price: u64) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        oracle.price = price;
        oracle.authority = ctx.accounts.authority.key();
        oracle.timestamp = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        require!(oracle.authority == ctx.accounts.authority.key(), ErrorCode::Unauthorized);
        oracle.price = new_price;
        oracle.timestamp = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(market_symbol: String)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8 + 32 + 8,
        seeds = [b"oracle", market_symbol.as_bytes()],
        bump
    )]
    pub oracle: Account<'info, Oracle>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut)]
    pub oracle: Account<'info, Oracle>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Oracle {
    pub price: u64,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
} 