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
        self.virtual_quote_reserve
            .checked_mul(1_000_000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.virtual_base_reserve)
            .ok_or(ErrorCode::MathOverflow.into())
    }

    // Calculate price with impact for a given trade size
    pub fn calculate_price_with_impact(&self, size: u64, is_closing: bool) -> Result<u64> {
        msg!("Price Impact Calculation Details:");
        msg!("Initial Base Reserve: {}", self.virtual_base_reserve);
        msg!("Initial Quote Reserve: {}", self.virtual_quote_reserve);
        msg!("Trade Size: {}", size);
        msg!("Is Closing: {}", is_closing);
        
        // Calculate k = base_reserve * quote_reserve
        let k = self.virtual_base_reserve
            .checked_mul(self.virtual_quote_reserve)
            .ok_or_else(|| {
                msg!("Math overflow in k calculation");
                ErrorCode::MathOverflow
            })?;
        msg!("Constant Product k: {}", k);
        
        // Calculate new reserves based on trade size
        let (new_base, new_quote) = if is_closing {
            // When closing, we're doing the opposite of the position's side
            // For longs closing: increase base reserve, decrease quote reserve
            // For shorts closing: decrease base reserve, increase quote reserve
            let new_base = self.virtual_base_reserve
                .checked_add(size)
                .ok_or_else(|| {
                    msg!("Math overflow in base reserve addition");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Base Reserve (Closing): {}", new_base);
            
            let new_quote = k
                .checked_div(new_base)
                .ok_or_else(|| {
                    msg!("Math overflow in quote reserve division");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Quote Reserve (Closing): {}", new_quote);
            
            (new_base, new_quote)
        } else {
            // When opening, we're doing the position's side
            // For longs opening: decrease base reserve, increase quote reserve
            // For shorts opening: increase base reserve, decrease quote reserve
            let new_base = self.virtual_base_reserve
                .checked_sub(size)
                .ok_or_else(|| {
                    msg!("Math overflow in base reserve subtraction");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Base Reserve (Opening): {}", new_base);
            
            let new_quote = k
                .checked_div(new_base)
                .ok_or_else(|| {
                    msg!("Math overflow in quote reserve division");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Quote Reserve (Opening): {}", new_quote);
            
            (new_base, new_quote)
        };
        
        // Calculate price with impact using new reserves
        let price = new_quote
            .checked_mul(1_000_000)
            .ok_or_else(|| {
                msg!("Math overflow in price multiplication");
                ErrorCode::MathOverflow
            })?
            .checked_div(new_base)
            .ok_or_else(|| {
                msg!("Math overflow in price division");
                ErrorCode::MathOverflow
            })?;
        msg!("Final Price with Impact: {}", price);
        
        Ok(price)
    }

    // Update virtual reserves based on trade using constant product formula (x * y = k)
    pub fn update_reserves(&mut self, side: &Side, size: u64) -> Result<()> {
        // Validate trade size
        if size > self.virtual_base_reserve.checked_div(10).unwrap_or(0) {
            return Err(ErrorCode::TradeSizeTooLarge.into());
        }

        // Calculate k before any updates
        let k = self.virtual_base_reserve
            .checked_mul(self.virtual_quote_reserve)
            .ok_or_else(|| {
                msg!("Math overflow in k calculation");
                ErrorCode::MathOverflow
            })?;

        msg!("Initial k: {}", k);
        msg!("Initial Base Reserve: {}", self.virtual_base_reserve);
        msg!("Initial Quote Reserve: {}", self.virtual_quote_reserve);

        // Update reserves based on trade side
        match side {
            Side::Long => {
                // For longs: decrease base reserve, increase quote reserve
                self.virtual_base_reserve = self.virtual_base_reserve
                    .checked_sub(size)
                    .ok_or_else(|| {
                        msg!("Math overflow in base reserve subtraction");
                        ErrorCode::MathOverflow
                    })?;

                // Calculate new quote reserve using constant product formula
                self.virtual_quote_reserve = k
                    .checked_div(self.virtual_base_reserve)
                    .ok_or_else(|| {
                        msg!("Math overflow in quote reserve calculation");
                        ErrorCode::MathOverflow
                    })?;
            }
            Side::Short => {
                // For shorts: increase base reserve, decrease quote reserve
                self.virtual_base_reserve = self.virtual_base_reserve
                    .checked_add(size)
                    .ok_or_else(|| {
                        msg!("Math overflow in base reserve addition");
                        ErrorCode::MathOverflow
                    })?;

                // Calculate new quote reserve using constant product formula
                self.virtual_quote_reserve = k
                    .checked_div(self.virtual_base_reserve)
                    .ok_or_else(|| {
                        msg!("Math overflow in quote reserve calculation");
                        ErrorCode::MathOverflow
                    })?;
            }
        }

        // Verify k remains constant after updates
        let new_k = self.virtual_base_reserve
            .checked_mul(self.virtual_quote_reserve)
            .ok_or_else(|| {
                msg!("Math overflow in new k calculation");
                ErrorCode::MathOverflow
            })?;

        // Allow for small rounding differences (0.1% tolerance)
        let k_diff = if new_k > k {
            new_k.checked_sub(k).unwrap_or(0)
        } else {
            k.checked_sub(new_k).unwrap_or(0)
        };
        let tolerance = k.checked_div(1000).unwrap_or(0); // 0.1% tolerance

        require!(
            k_diff <= tolerance,
            ErrorCode::InvalidAMMState
        );

        msg!("Final Base Reserve before price calc: {}", self.virtual_base_reserve);
        msg!("Final Quote Reserve before price calc: {}", self.virtual_quote_reserve);
        
        // Calculate new price directly instead of using calculate_price
        let new_price = self.virtual_quote_reserve
            .checked_mul(1_000_000)
            .ok_or_else(|| {
                msg!("Math overflow in price multiplication");
                ErrorCode::MathOverflow
            })?
            .checked_div(self.virtual_base_reserve)
            .ok_or_else(|| {
                msg!("Math overflow in price division");
                ErrorCode::MathOverflow
            })?;
        
        // Update price and timestamp
        self.last_price = new_price;
        self.last_update_time = Clock::get()?.unix_timestamp;
        
        msg!("Reserve update completed successfully");
        msg!("Final Base Reserve: {}", self.virtual_base_reserve);
        msg!("Final Quote Reserve: {}", self.virtual_quote_reserve);
        msg!("Final k: {}", new_k);
        msg!("Final Price: {}", new_price);
        
        Ok(())
    }

    // Calculate PnL for a position
    // PnL = (exit_price - entry_price) * position_size for longs
    // PnL = (entry_price - exit_price) * position_size for shorts
    pub fn calculate_pnl(&self, entry_price: u64, position_size: u64, is_long: bool) -> Result<i64> {
        // Get current price with impact for closing the position
        let current_price = self.calculate_price_with_impact(position_size, true)?;
        
        msg!("PnL Calculation Details:");
        msg!("Entry Price: {}", entry_price);
        msg!("Current Price with Impact: {}", current_price);
        msg!("Position Size: {}", position_size);
        msg!("Is Long: {}", is_long);
        
        // Calculate raw PnL using checked arithmetic
        let raw_pnl = if is_long {
            // For longs: PnL = (current_price - entry_price) * size
            if current_price >= entry_price {
                // Profit case
                current_price
                    .checked_sub(entry_price)
                    .ok_or_else(|| {
                        msg!("Math overflow in price difference calculation (profit)");
                        ErrorCode::MathOverflow
                    })?
                    .checked_mul(position_size)
                    .ok_or_else(|| {
                        msg!("Math overflow in raw PnL multiplication (profit)");
                        ErrorCode::MathOverflow
                    })?
            } else {
                // Loss case - handle as negative
                entry_price
                    .checked_sub(current_price)
                    .ok_or_else(|| {
                        msg!("Math overflow in price difference calculation (loss)");
                        ErrorCode::MathOverflow
                    })?
                    .checked_mul(position_size)
                    .ok_or_else(|| {
                        msg!("Math overflow in raw PnL multiplication (loss)");
                        ErrorCode::MathOverflow
                    })?
                    .checked_neg()
                    .ok_or_else(|| {
                        msg!("Math overflow in raw PnL negation");
                        ErrorCode::MathOverflow
                    })?
            }
        } else {
            // For shorts: PnL = (entry_price - current_price) * size
            if entry_price >= current_price {
                // Profit case
                entry_price
                    .checked_sub(current_price)
                    .ok_or_else(|| {
                        msg!("Math overflow in price difference calculation (profit)");
                        ErrorCode::MathOverflow
                    })?
                    .checked_mul(position_size)
                    .ok_or_else(|| {
                        msg!("Math overflow in raw PnL multiplication (profit)");
                        ErrorCode::MathOverflow
                    })?
            } else {
                // Loss case - handle as negative
                current_price
                    .checked_sub(entry_price)
                    .ok_or_else(|| {
                        msg!("Math overflow in price difference calculation (loss)");
                        ErrorCode::MathOverflow
                    })?
                    .checked_mul(position_size)
                    .ok_or_else(|| {
                        msg!("Math overflow in raw PnL multiplication (loss)");
                        ErrorCode::MathOverflow
                    })?
                    .checked_neg()
                    .ok_or_else(|| {
                        msg!("Math overflow in raw PnL negation");
                        ErrorCode::MathOverflow
                    })?
            }
        };
        msg!("Raw PnL: {}", raw_pnl);

        // Scale down by 1e6 to match price precision
        let pnl = if raw_pnl > i64::MAX as u64 {
            msg!("Raw PnL exceeds i64::MAX, capping at i64::MAX");
            i64::MAX
        } else {
            let scaled_pnl = (raw_pnl as i64)
                .checked_div(1_000_000)
                .ok_or_else(|| {
                    msg!("Math overflow in PnL division");
                    ErrorCode::MathOverflow
                })?;
            msg!("Final PnL: {}", scaled_pnl);
            scaled_pnl
        };
        
        Ok(pnl)
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
