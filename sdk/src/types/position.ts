import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface Position {
  trader: PublicKey;
  market: PublicKey;
  side: 'long' | 'short';
  size: BN;
  entryPrice: BN;
  leverage: BN;
  isOpen: boolean;
  bump: number;
} 