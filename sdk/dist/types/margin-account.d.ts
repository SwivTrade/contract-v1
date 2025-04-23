import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
export interface MarginAccount {
    owner: PublicKey;
    market: PublicKey;
    collateralAmount: BN;
    positions: Position[];
    bump: number;
}
export interface Position {
    market: PublicKey;
    size: BN;
    entryPrice: BN;
    leverage: BN;
    isLong: boolean;
    liquidationPrice: BN;
    unrealizedPnL: BN;
    realizedPnL: BN;
}
export interface CreateMarginAccountParams {
    market: PublicKey;
    bump: number;
    vault: PublicKey;
    mint: PublicKey;
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
