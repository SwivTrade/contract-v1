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
            
            // Calculate new quote reserve using constant product formula
            // For closing positions, we need to ensure the price impact is correctly reflected
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
            
            // Calculate new quote reserve using constant product formula
            // For opening positions, we need to ensure the price impact is correctly reflected
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
        // This price will be used for PnL calculation and collateral updates
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

    // Update reserves based on trade size and side
    pub fn update_reserves(&mut self, size: u64, is_long: bool) -> Result<()> {
        msg!("Reserve Update Details:");
        msg!("Initial Base Reserve: {}", self.virtual_base_reserve);
        msg!("Initial Quote Reserve: {}", self.virtual_quote_reserve);
        msg!("Trade Size: {}", size);
        msg!("Is Long: {}", is_long);
        
        // Calculate k = base_reserve * quote_reserve
        let k = self.virtual_base_reserve
            .checked_mul(self.virtual_quote_reserve)
            .ok_or_else(|| {
                msg!("Math overflow in k calculation");
                ErrorCode::MathOverflow
            })?;
        msg!("Constant Product k: {}", k);
        
        // Update reserves based on trade side
        if is_long {
            // For longs: decrease base reserve, increase quote reserve
            self.virtual_base_reserve = self.virtual_base_reserve
                .checked_sub(size)
                .ok_or_else(|| {
                    msg!("Math overflow in base reserve subtraction");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Base Reserve (Long): {}", self.virtual_base_reserve);
            
            // Calculate new quote reserve using constant product formula
            // k = base * quote, so quote = k / base
            self.virtual_quote_reserve = k
                .checked_div(self.virtual_base_reserve)
                .ok_or_else(|| {
                    msg!("Math overflow in quote reserve division");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Quote Reserve (Long): {}", self.virtual_quote_reserve);
        } else {
            // For shorts: increase base reserve, decrease quote reserve
            self.virtual_base_reserve = self.virtual_base_reserve
                .checked_add(size)
                .ok_or_else(|| {
                    msg!("Math overflow in base reserve addition");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Base Reserve (Short): {}", self.virtual_base_reserve);
            
            // Calculate new quote reserve using constant product formula
            // k = base * quote, so quote = k / base
            self.virtual_quote_reserve = k
                .checked_div(self.virtual_base_reserve)
                .ok_or_else(|| {
                    msg!("Math overflow in quote reserve division");
                    ErrorCode::MathOverflow
                })?;
            msg!("New Quote Reserve (Short): {}", self.virtual_quote_reserve);
        }
        
        // Verify k remains constant
        let new_k = self.virtual_base_reserve
            .checked_mul(self.virtual_quote_reserve)
            .ok_or_else(|| {
                msg!("Math overflow in new k calculation");
                ErrorCode::MathOverflow
            })?;
        msg!("New Constant Product k: {}", new_k);
        
        // Allow for small rounding differences (within 0.01%)
        let tolerance = k / 10_000;
        assert!(
            new_k >= k.checked_sub(tolerance).unwrap_or(0) && 
            new_k <= k.checked_add(tolerance).unwrap_or(u64::MAX),
            "Constant product k should remain unchanged within tolerance"
        );
        
        // Update price based on new reserves
        self.last_price = self.calculate_price()?;
        msg!("New price: {}", self.last_price);
        
        Ok(())
    }

    // Calculate PnL for a position
    pub fn calculate_pnl(&self, entry_price: u64, current_price: u64, size: u64, is_long: bool) -> Result<i64> {
        msg!("PnL Calculation Details:");
        msg!("Entry Price: {}", entry_price);
        msg!("Current Price: {}", current_price);
        msg!("Position Size: {}", size);
        msg!("Is Long: {}", is_long);
        
        // Calculate raw PnL based on position side
        let raw_pnl = if is_long {
            // For long positions:
            // PnL = size * (current_price - entry_price) / entry_price
            // This gives us the profit/loss in quote currency
            let price_diff = current_price
                .checked_sub(entry_price)
                .ok_or_else(|| {
                    msg!("Math overflow in price difference calculation");
                    ErrorCode::MathOverflow
                })?;
            msg!("Price Difference (Long): {}", price_diff);
            
            size
                .checked_mul(price_diff as u64)
                .ok_or_else(|| {
                    msg!("Math overflow in PnL multiplication");
                    ErrorCode::MathOverflow
                })?
                .checked_div(entry_price)
                .ok_or_else(|| {
                    msg!("Math overflow in PnL division");
                    ErrorCode::MathOverflow
                })? as i64
        } else {
            // For short positions:
            // PnL = size * (entry_price - current_price) / entry_price
            // This gives us the profit/loss in quote currency
            let price_diff = entry_price
                .checked_sub(current_price)
                .ok_or_else(|| {
                    msg!("Math overflow in price difference calculation");
                    ErrorCode::MathOverflow
                })?;
            msg!("Price Difference (Short): {}", price_diff);
            
            size
                .checked_mul(price_diff as u64)
                .ok_or_else(|| {
                    msg!("Math overflow in PnL multiplication");
                    ErrorCode::MathOverflow
                })?
                .checked_div(entry_price)
                .ok_or_else(|| {
                    msg!("Math overflow in PnL division");
                    ErrorCode::MathOverflow
                })? as i64
        };
        
        msg!("Raw PnL: {}", raw_pnl);
        
        // Scale down by 1e6 to match price precision
        let scaled_pnl = raw_pnl
            .checked_div(1_000_000)
            .ok_or_else(|| {
                msg!("Math overflow in PnL scaling");
                ErrorCode::MathOverflow
            })?;
        msg!("Final Scaled PnL: {}", scaled_pnl);
        
        Ok(scaled_pnl)
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
