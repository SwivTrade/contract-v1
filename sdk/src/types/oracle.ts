import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';



export interface Oracle {
  price: BN;
  authority: PublicKey;
  timestamp: BN;
}

export interface InitializeOracleParams {
  marketSymbol: string;
  initialPrice: number; // Price in human-readable format (e.g., 1000 for $1000)
}

export interface UpdateOracleParams {
  marketSymbol: string;
  newPrice: number; // Price in human-readable format
}

