use anchor_lang::prelude::*;
use crate::errors::ErrorCode;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy)]
pub enum OrderType {
    Market,
    Limit,
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
    pub authority: Pubkey,                // Admin authority
    pub market_symbol: String,            // Market identifier (e.g., "SOL-PERP")
    pub base_asset_reserve: u64,          // Total base asset (SOL) in the market
    pub quote_asset_reserve: u64,         // Total quote asset (USD) in the market
    pub funding_rate: i64,                // Current funding rate (can be positive or negative)
    pub last_funding_time: i64,           // Last time funding was paid/collected
    pub funding_interval: i64,            // Interval between funding payments (e.g., 1 hour)
    pub maintenance_margin_ratio: u64,    // Minimum margin ratio before liquidation
    pub initial_margin_ratio: u64,        // Minimum margin ratio to open a position
    pub liquidation_fee_ratio: u64,       // Fee ratio for liquidations (in basis points)
    pub fee_pool: u64,                    // Accumulated trading fees
    pub insurance_fund: u64,              // Insurance fund for socialized losses
    pub max_leverage: u64,                // Maximum allowed leverage
    pub oracle: Pubkey,                   // Pyth oracle account for price feed
    pub vault: Pubkey,                    // Token account that holds all user collateral
    pub is_active: bool,                  // Whether the market is active
    pub bump: u8,                         // PDA bump
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
        8 + // liquidation_fee_ratio: u64
        8 + // fee_pool: u64
        8 + // insurance_fund: u64
        8 + // max_leverage: u64
        32 + // oracle: Pubkey
        32 + // vault: Pubkey
        1 + // is_active: bool
        1; // bump: u8
}

#[account]
pub struct Position {
    pub trader: Pubkey,                   // Owner of the position
    pub market: Pubkey,                   // Market this position belongs to
    pub order_type: OrderType,            // Market or Limit
    pub side: Side,                       // Long or Short
    pub size: u64,                        // Size of the position in base asset
    pub filled_size: u64,                 // Amount already filled (for limit orders)
    pub price: u64,                       // Current price (entry price for market orders)
    pub collateral: u64,                  // Collateral provided by the trader
    pub entry_price: u64,                 // Price at position opening
    pub entry_funding_rate: i64,          // Funding rate at position opening
    pub leverage: u64,                    // Position leverage
    pub realized_pnl: i64,                // Realized profit and loss
    pub last_funding_payment_time: i64,   // Last time funding was paid/collected
    pub last_cumulative_funding: i64,     // Cumulative funding at last update
    pub is_open: bool,                    // Whether the position is open
    pub created_at: i64,                  // Timestamp when position was created
    pub bump: u8,                         // PDA bump
}

impl Position {
    pub const SPACE: usize = 8 + // discriminator
        32 + // trader: Pubkey
        32 + // market: Pubkey
        1 + // order_type: OrderType
        1 + // side: Side
        8 + // size: u64
        8 + // filled_size: u64
        8 + // price: u64
        8 + // collateral: u64
        8 + // entry_price: u64
        8 + // entry_funding_rate: i64
        8 + // leverage: u64
        8 + // realized_pnl: i64
        8 + // last_funding_payment_time: i64
        8 + // last_cumulative_funding: i64
        1 + // is_open: bool
        8 + // created_at: i64
        1; // bump: u8
}

#[account]
pub struct Order {
    pub trader: Pubkey,                   // Owner of the order
    pub market: Pubkey,                   // Market this order belongs to
    pub side: Side,                       // Buy or Sell
    pub order_type: OrderType,            // Limit, Market, etc.
    pub price: u64,                       // Order price
    pub size: u64,                        // Order size
    pub filled_size: u64,                 // Amount already filled
    pub leverage: u64,                    // Requested leverage
    pub collateral: u64,                  // Collateral locked for this order
    pub created_at: i64,                  // Timestamp when order was created
    pub is_active: bool,                  // Whether the order is active
    pub bump: u8,                         // PDA bump
}

impl Order {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
#[derive(Default)]
pub struct MarginAccount {
    pub owner: Pubkey,
    pub margin_type: MarginType,  // New field to specify margin type
    pub collateral_mint: Pubkey,  // Token mint this margin account is tied to (e.g., USDC)
    pub collateral: u64,
    pub allocated_margin: u64,    // For isolated margin tracking
    pub positions: Vec<Pubkey>,   // Only track positions now
    pub bump: u8,
}

impl MarginAccount {
    pub const SPACE: usize = 8 + // discriminator
        32 + // owner: Pubkey
        1 + // margin_type: MarginType
        32 + // collateral_mint: Pubkey
        8 + // collateral: u64
        8 + // allocated_margin: u64
        4 + (32 * 10) + // positions: Vec<Pubkey> (max 10 positions)
        1; // bump: u8

    pub fn available_margin(&self) -> Result<u64> {
        match self.margin_type {
            MarginType::Isolated => {
                // For isolated margin, available margin is total collateral minus allocated margin
                self.collateral.checked_sub(self.allocated_margin)
                    .ok_or(ErrorCode::MathOverflow.into())
            },
            MarginType::Cross => {
                // For cross margin, all collateral is available
                Ok(self.collateral)
            }
        }
    }
}