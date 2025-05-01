import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface Market {
  authority: PublicKey;
  marketSymbol: string;
  initialFundingRate: BN;
  fundingInterval: BN;
  maintenanceMarginRatio: BN;
  initialMarginRatio: BN;
  maxLeverage: BN;
  oracleAccount: PublicKey;
  bump: number;
  isActive: boolean;
  vault: PublicKey;
}

export interface InitializeMarketParams {
  marketSymbol: string;
  initialFundingRate: number;
  fundingInterval: number;
  maintenanceMarginRatio: number;
  initialMarginRatio: number;
  maxLeverage: number;
  oracleAccount: PublicKey;
  mint: PublicKey;
} 