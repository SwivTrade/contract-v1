import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
export interface Oracle {
    price: BN;
    authority: PublicKey;
    timestamp: BN;
}
export interface InitializeOracleParams {
    marketSymbol: string;
    initialPrice: number;
}
export interface UpdateOracleParams {
    marketSymbol: string;
    newPrice: number;
}
