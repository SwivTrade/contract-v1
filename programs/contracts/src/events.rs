use anchor_lang::prelude::*;
use crate::{Side, OrderType, MarginType};

// Market Events
#[event]
pub struct MarketInitializedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub market_symbol: String,
    pub funding_rate: i64,
    pub funding_interval: i64,
    pub maintenance_margin_ratio: u64,
    pub initial_margin_ratio: u64,
    pub max_leverage: u64,
    pub liquidation_fee_ratio: u64,
}

#[event]
pub struct MarketParamsUpdatedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub maintenance_margin_ratio: u64,
    pub initial_margin_ratio: u64,
    pub funding_interval: i64,
    pub max_leverage: u64,
}

#[event]
pub struct MarketPausedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct MarketResumedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
}

// Funding Events
#[event]
pub struct FundingRateUpdatedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub old_funding_rate: i64,
    pub new_funding_rate: i64,
}

#[event]
pub struct FundingUpdatedEvent {
    pub market: Pubkey,
    pub funding_rate: i64,
    pub intervals: i64,
    pub timestamp: i64,
}

// Position Events
#[event]
pub struct PositionOpenedEvent {
    pub market: Pubkey,
    pub position: Pubkey,
    pub trader: Pubkey,
    pub side: Side,
    pub size: u64,
    pub collateral: u64,
    pub entry_price: u64,
    pub leverage: u64,
    pub liquidation_price: u64,
    pub margin_type: MarginType,
}

#[event]
pub struct PositionClosedEvent {
    pub market: Pubkey,
    pub position: Pubkey,
    pub trader: Pubkey,
    pub side: Side,
    pub size: u64,
    pub collateral: u64,
    pub entry_price: u64,
    pub exit_price: u64,
    pub realized_pnl: i64,
    pub margin_type: MarginType,
}

#[event]
pub struct PositionLiquidatedEvent {
    pub market: Pubkey,
    pub position: Pubkey,
    pub trader: Pubkey,
    pub side: Side,
    pub size: u64,
    pub collateral: u64,
    pub entry_price: u64,
    pub exit_price: u64,
    pub liquidator: Pubkey,
    pub liquidation_fee: u64,
    pub liquidator_fee: u64,
    pub insurance_fund_fee: u64,
}

#[event]
pub struct MarginAdjustedEvent {
    pub market: Pubkey,
    pub position: Pubkey,
    pub trader: Pubkey,
    pub margin_change: i64,
    pub new_collateral: u64,
}

// Order Events
#[event]
pub struct OrderPlacedEvent {
    pub market: Pubkey,
    pub position: Pubkey,
    pub trader: Pubkey,
    pub side: Side,
    pub order_type: OrderType,
    pub price: u64,
    pub size: u64,
    pub leverage: u64,
    pub timestamp: i64,
}

#[event]
pub struct OrderFilledEvent {
    pub market: Pubkey,
    pub position: Pubkey,
    pub trader: Pubkey,
    pub side: Side,
    pub price: u64,
    pub size: u64,
    pub filled_size: u64,
    pub timestamp: i64,
}

#[event]
pub struct OrderCancelledEvent {
    pub market: Pubkey,
    pub order: Pubkey,
    pub trader: Pubkey,
}

// Collateral Events
#[event]
pub struct CollateralDeposited {
    pub owner: Pubkey,
    pub margin_account: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct CollateralWithdrawn {
    pub owner: Pubkey,
    pub margin_account: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct MarginAccountCreated {
    pub owner: Pubkey,
    pub margin_account: Pubkey,
    pub margin_type: MarginType,
    pub timestamp: i64,
}