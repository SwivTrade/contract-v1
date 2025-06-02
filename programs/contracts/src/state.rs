use crate::errors::ErrorCode;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy)]
pub enum OrderType {
    Limit,
    Market,
    StopLoss,
    TakeProfit,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy, Debug)]
pub enum Side {
    Long,
    Short,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy, Debug)]
pub enum MarginType {
    Isolated,
    Cross,
}

impl Default for MarginType {
    fn default() -> Self {
        MarginType::Isolated
    }
}

#[account]
pub struct Market {
    pub authority: Pubkey,             // Admin authority
    pub market_symbol: String,         // Market identifier (e.g., "SOL-PERP")
    pub base_asset_reserve: u64,       // Total base asset (SOL) in the market
    pub quote_asset_reserve: u64,      // Total quote asset (USD) in the market
    pub funding_rate: i64,             // Current funding rate (can be positive or negative)
    pub last_funding_time: i64,        // Last time funding was paid/collected
    pub funding_interval: i64,         // Interval between funding payments (e.g., 1 hour)
    pub maintenance_margin_ratio: u64, // Minimum margin ratio before liquidation
    pub initial_margin_ratio: u64,     // Minimum margin ratio to open a position
    pub fee_pool: u64,                 // Accumulated trading fees
    pub insurance_fund: u64,           // Insurance fund for socialized losses
    pub max_leverage: u64,             // Maximum allowed leverage
    pub oracle: Pubkey,                // Pyth oracle account for price feed
    pub vault: Pubkey,                 // Token account that holds all user collateral
    pub is_active: bool,               // Whether the market is active
    pub bump: u8,                      // PDA bump
    // AMM fields
    pub virtual_base_reserve: u64, // Virtual base asset reserve for price impact reduction
    pub virtual_quote_reserve: u64, // Virtual quote asset reserve for price impact reduction
    pub price_impact_factor: u64,  // Controls price impact (e.g., 100 = 1%)
    pub last_price: u64,           // Last traded price
    pub last_update_time: i64,
}

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
        32 + // vault: Pubkey
        1 + // is_active: bool
        1 + // bump: u8
        8 + // virtual_base_reserve: u64
        8 + // virtual_quote_reserve: u64
        8 + // price_impact_factor: u64
        8 + // last_price: u64
        8; // last_update_time: i64

          // Calculate current price based on virtual reserves
    pub fn calculate_price(&self) -> Result<u64> {
        if self.virtual_base_reserve == 0 || self.virtual_quote_reserve == 0 {
            return Err(ErrorCode::InvalidAMMState.into());
        }
        
        self.virtual_quote_reserve
            .checked_mul(1_000_000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.virtual_base_reserve)
            .ok_or(ErrorCode::MathOverflow.into())
    }

      // Calculate price with impact for a given trade size
      pub fn calculate_price_with_impact(&self, size: u64, is_closing: bool) -> Result<u64> {
        let base_price = self.calculate_price()?;
        msg!("Base price: {}", base_price);
        
        // Calculate price impact as a percentage of base price
        // First calculate the impact ratio (size / virtual_base_reserve)
        let impact_ratio = size
            .checked_mul(10_000)  // Scale up for precision
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.virtual_base_reserve)
            .ok_or(ErrorCode::MathOverflow)?;
        msg!("Impact ratio: {}", impact_ratio);
            
        // Then apply the impact factor and base price
        let impact = base_price
            .checked_mul(impact_ratio)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(self.price_impact_factor)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10_000)  // Scale back down
            .ok_or(ErrorCode::MathOverflow)?;
        msg!("Price impact: {}", impact);
        
        // For closing positions, we want a better price (lower for longs, higher for shorts)
        // For opening positions, we want a worse price (higher for longs, lower for shorts)
        let final_price = if is_closing {
            // When closing, we want a better price
            base_price.checked_sub(impact)
        } else {
            // When opening, we want a worse price
            base_price.checked_add(impact)
        }.ok_or(ErrorCode::MathOverflow)?;
        msg!("Final price with impact: {}", final_price);
        
        Ok(final_price)
    }

      // Update virtual reserves based on trade
      pub fn update_reserves(&mut self, side: &Side, size: u64) -> Result<()> {
        let price = self.calculate_price()?;
        
        match side {
            Side::Long => {
                // For long trades, decrease base reserve and increase quote reserve
                self.virtual_base_reserve = self.virtual_base_reserve
                    .checked_sub(size)
                    .ok_or(ErrorCode::MathOverflow)?;
                
                let quote_amount = size
                    .checked_mul(price)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(1_000_000)
                    .ok_or(ErrorCode::MathOverflow)?;
                
                self.virtual_quote_reserve = self.virtual_quote_reserve
                    .checked_add(quote_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            },
            Side::Short => {
                // For short trades, increase base reserve and decrease quote reserve
                self.virtual_base_reserve = self.virtual_base_reserve
                    .checked_add(size)
                    .ok_or(ErrorCode::MathOverflow)?;
                
                let quote_amount = size
                    .checked_mul(price)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(1_000_000)
                    .ok_or(ErrorCode::MathOverflow)?;
                
                self.virtual_quote_reserve = self.virtual_quote_reserve
                    .checked_sub(quote_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }
        
        self.last_price = price;
        self.last_update_time = Clock::get()?.unix_timestamp;
        
        Ok(())
    }
}



#[account]
pub struct Position {
    pub trader: Pubkey,                 // Owner of the position
    pub market: Pubkey,                 // Market this position belongs to
    pub side: Side,                     // Long or Short
    pub size: u64,                      // Size of the position in base asset
    pub collateral: u64,                // Collateral provided by the trader
    pub entry_price: u64,               // Price at position opening
    pub entry_funding_rate: i64,        // Funding rate at position opening
    pub leverage: u64,                  // Position leverage
    pub realized_pnl: i64,              // Realized profit and loss
    pub last_funding_payment_time: i64, // Last time funding was paid/collected
    pub last_cumulative_funding: i64,   // Cumulative funding at last update
    pub liquidation_price: u64,         // Price at which position gets liquidated
    pub is_open: bool,                  // Whether the position is open
    pub bump: u8,                       // PDA bump
}

impl Position {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct Order {
    pub trader: Pubkey,        // Owner of the order
    pub market: Pubkey,        // Market this order belongs to
    pub side: Side,            // Buy or Sell
    pub order_type: OrderType, // Limit, Market, etc.
    pub price: u64,            // Order price
    pub size: u64,             // Order size
    pub filled_size: u64,      // Amount already filled
    pub leverage: u64,         // Requested leverage
    pub collateral: u64,       // Collateral locked for this order
    pub created_at: i64,       // Timestamp when order was created
    pub is_active: bool,       // Whether the order is active
    pub bump: u8,              // PDA bump
}

impl Order {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
#[derive(Default)]
pub struct MarginAccount {
    pub owner: Pubkey,
    pub perp_market: Pubkey,
    pub margin_type: MarginType, // New field to specify margin type
    pub collateral: u64,
    pub allocated_margin: u64, // For isolated margin tracking
    pub orders: Vec<Pubkey>,
    pub positions: Vec<Pubkey>,
    pub bump: u8,
}

impl MarginAccount {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 4 + (32 * 20) + 4 + (32 * 10) + 1;

    pub fn available_margin(&self) -> Result<u64> {
        match self.margin_type {
            MarginType::Isolated => {
                // For isolated margin, available margin is total collateral minus allocated margin
                self.collateral
                    .checked_sub(self.allocated_margin)
                    .ok_or(ErrorCode::MathOverflow.into())
            }
            MarginType::Cross => {
                // For cross margin, all collateral is available
                Ok(self.collateral)
            }
        }
    }
}
