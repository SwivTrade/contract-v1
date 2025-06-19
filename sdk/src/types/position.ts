import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { OrderType, Side } from './order';

export type { Side };

export interface Position {
  trader: PublicKey;
  market: PublicKey;
  orderType: OrderType;
  side: Side;
  size: BN;
  filledSize: BN;
  price: BN;
  collateral: BN;
  entryPrice: BN;
  entryFundingRate: BN;
  leverage: BN;
  realizedPnl: BN;
  lastFundingPaymentTime: BN;
  lastCumulativeFunding: BN;
  isOpen: boolean;
  createdAt: BN;
  bump: number;
}

export interface OpenPositionParams {
  market: PublicKey;
  marginAccount: PublicKey;
  side: Side;
  size: BN;
  leverage: BN;
  oracleAccount: PublicKey;
  nonce: number;
}

export interface ClosePositionParams {
  market: PublicKey;
  position: PublicKey;
  marginAccount: PublicKey;
  oracleAccount: PublicKey;
} 