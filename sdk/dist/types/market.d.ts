import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
export interface Market {
    authority: PublicKey;
    marketSymbol: string;
    baseAssetReserve: BN;
    quoteAssetReserve: BN;
    fundingRate: BN;
    lastFundingTime: BN;
    fundingInterval: BN;
    maintenanceMarginRatio: BN;
    initialMarginRatio: BN;
    feePool: BN;
    insuranceFund: BN;
    maxLeverage: BN;
    oracle: PublicKey;
    vault: PublicKey;
    isActive: boolean;
    bump: number;
}
export interface InitializeMarketParams {
    marketSymbol: string;
    initialFundingRate: number;
    fundingInterval: number;
    maintenanceMarginRatio: number;
    initialMarginRatio: number;
    maxLeverage: number;
    liquidationFeeRatio: number;
    oracleAccount: PublicKey;
    mint: PublicKey;
}
