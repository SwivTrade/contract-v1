use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow occurred")]
    MathOverflow,
    #[msg("Operation not authorized")]
    Unauthorized,
    #[msg("Market is currently inactive")]
    MarketInactive,
    #[msg("Position is already closed")]
    PositionClosed,
    #[msg("Provided oracle account is invalid")]
    InvalidOracleAccount,
    #[msg("Oracle price is too old")]
    StaleOraclePrice,
    #[msg("Price confidence interval exceeds acceptable threshold")]
    PriceConfidenceTooLow,
    #[msg("Position does not meet liquidation criteria")]
    PositionNotLiquidatable,
    #[msg("Order size is invalid")]
    InvalidOrderSize,
    #[msg("Order price is invalid")]
    InvalidOrderPrice,
    #[msg("Leverage exceeds maximum allowed")]
    LeverageTooHigh,
    #[msg("Insufficient margin provided")]
    InsufficientMargin,
    #[msg("Invalid parameter supplied")]
    InvalidParameter,
    #[msg("Market is already paused")]
    MarketAlreadyPaused,
    #[msg("Market is already active")]
    MarketAlreadyActive,
    #[msg("Order is not active")]
    OrderNotActive,
    #[msg("Invalid market symbol")]
    InvalidMarketSymbol,
    #[msg("Invalid funding rate")]
    InvalidFundingRate,
    #[msg("Invalid funding interval")]
    InvalidFundingInterval,
    #[msg("Invalid margin ratio")]
    InvalidMarginRatio,
    #[msg("Invalid leverage value")]
    InvalidLeverage,
    #[msg("Insufficient liquidity in market")]
    InsufficientLiquidity,
    #[msg("Position size is below minimum")]
    PositionSizeTooSmall,
    #[msg("Position size exceeds maximum")]
    PositionSizeTooLarge,
    #[msg("Insufficient collateral for this operation")]
    InsufficientCollateral,
    #[msg("Leverage is outside allowed range")]
    InvalidLeverageRange,
    #[msg("Order not found")]
    OrderNotFound,
    #[msg("Position has been liquidated")]
    PositionLiquidated,
    #[msg("Margin call required before further operations")]
    MarginCallRequired,
    #[msg("Withdrawal would put account below maintenance margin")]
    WithdrawalBelowMaintenanceMargin,
    #[msg("Deposit amount is too small")]
    DepositTooSmall,
    #[msg("Withdrawal amount is too small")]
    WithdrawalTooSmall,
    #[msg("Invalid position provided")]
    InvalidPosition,
    #[msg("Withdrawal exceeds available margin")]
    WithdrawalExceedsAvailableMargin,
    #[msg("Invalid vault provided")]
    InvalidVault,
    #[msg("Invalid AMM state - virtual reserves cannot be zero")]
    InvalidAMMState,
}