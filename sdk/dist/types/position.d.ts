import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
export interface Position {
    trader: PublicKey;
    market: PublicKey;
    side: Side;
    size: BN;
    collateral: BN;
    entryPrice: BN;
    entryFundingRate: BN;
    leverage: BN;
    realizedPnl: BN;
    lastFundingPaymentTime: BN;
    lastCumulativeFunding: BN;
    liquidationPrice: BN;
    isOpen: boolean;
    bump: number;
}
export type Side = {
    long: {};
} | {
    short: {};
};
export interface OpenPositionParams {
    market: PublicKey;
    marginAccount: PublicKey;
    side: Side;
    size: BN;
    leverage: BN;
    oracleAccount: PublicKey;
}
export interface ClosePositionParams {
    market: PublicKey;
    position: PublicKey;
    marginAccount: PublicKey;
    oracleAccount: PublicKey;
}
