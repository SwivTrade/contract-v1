// use anchor_lang::prelude::*;

// #[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy)]
// pub enum OrderType {
//     Limit,
//     Market,
//     StopLoss,
//     TakeProfit,
// }

// #[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Copy)]
// pub enum Side {
//     Long,
//     Short,
// }

// #[account]
// pub struct Market {
//     pub authority: Pubkey,                // Admin authority
//     pub market_symbol: String,            // Market identifier (e.g., "SOL-PERP")
//     pub base_asset_reserve: u64,          // Total base asset (SOL) in the market
//     pub quote_asset_reserve: u64,         // Total quote asset (USD) in the market
//     pub funding_rate: i64,                // Current funding rate (can be positive or negative)
//     pub last_funding_time: i64,           // Last time funding was paid/collected
//     pub funding_interval: i64,            // Interval between funding payments (e.g., 1 hour)
//     pub maintenance_margin_ratio: u64,    // Minimum margin ratio before liquidation
//     pub initial_margin_ratio: u64,        // Minimum margin ratio to open a position
//     pub fee_pool: u64,                    // Accumulated trading fees
//     pub insurance_fund: u64,              // Insurance fund for socialized losses
//     pub max_leverage: u64,                // Maximum allowed leverage
//     pub oracle: Pubkey,                   // Pyth oracle account for price feed
//     pub is_active: bool,                  // Whether the market is active
//     pub bump: u8,                         // PDA bump
// }

// #[account]
// pub struct Position {
//     pub trader: Pubkey,                   // Owner of the position
//     pub market: Pubkey,                   // Market this position belongs to
//     pub side: crate::Side,                       // Long or Short
//     pub size: u64,                        // Size of the position in base asset
//     pub collateral: u64,                  // Collateral provided by the trader
//     pub entry_price: u64,                 // Price at position opening
//     pub entry_funding_rate: i64,          // Funding rate at position opening
//     pub leverage: u64,                    // Position leverage
//     pub realized_pnl: i64,                // Realized profit and loss
//     pub last_funding_payment_time: i64,   // Last time funding was paid/collected
//     pub last_cumulative_funding: i64,     // Cumulative funding at last update
//     pub liquidation_price: u64,           // Price at which position gets liquidated
//     pub is_open: bool,                    // Whether the position is open
//     pub bump: u8,                         // PDA bump
// }

// #[account]
// pub struct Order {
//     pub trader: Pubkey,                   // Owner of the order
//     pub market: Pubkey,                   // Market this order belongs to
//     pub side: crate::Side,                      // Buy or Sell
//     pub order_type: OrderType,            // Limit, Market, etc.
//     pub price: u64,                       // Order price
//     pub size: u64,                        // Order size
//     pub filled_size: u64,                 // Amount already filled
//     pub leverage: u64,                    // Requested leverage
//     pub collateral: u64,                  // Collateral locked for this order
//     pub created_at: i64,                  // Timestamp when order was created
//     pub is_active: bool,                  // Whether the order is active
//     pub bump: u8,                         // PDA bump
// }