import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface MarginAccount {
  owner: PublicKey;
  perpMarket: PublicKey;
  collateral: BN;
  positions: PublicKey[];
  orders: PublicKey[];
  bump: number;
  marginType: { isolated: {} } | { cross: {} };
}

export interface CreateMarginAccountParams {
  marginType: { isolated: {} } | { cross: {} };
  market: PublicKey;
}

export interface DepositCollateralParams {
  marginAccount: PublicKey;
  market: PublicKey;
  userTokenAccount: PublicKey;
  vault: PublicKey;
  mint: PublicKey;
  amount: BN;
}

export interface WithdrawCollateralParams {
  marginAccount: PublicKey;
  market: PublicKey;
  userTokenAccount: PublicKey;
  vault: PublicKey;
  mint: PublicKey;
  amount: BN;
} 