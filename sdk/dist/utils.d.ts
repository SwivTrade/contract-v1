import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
/**
 * Find the PDA for a market
 * @param programId The program ID
 * @param marketSymbol The market symbol (e.g., "SOL-PERP")
 * @returns A tuple containing the market PDA and the bump seed
 */
export declare function findMarketPda(programId: PublicKey, marketSymbol: string): [PublicKey, number];
/**
 * Find the PDA for a margin account
 * @param programId The program ID
 * @param owner The owner's public key
 * @returns A tuple containing the margin account PDA and the bump seed
 */
export declare function findMarginAccountPda(programId: PublicKey, owner: PublicKey): [PublicKey, number];
/**
 * Find the PDA for a position
 * @param programId The program ID
 * @param market The market's public key
 * @param owner The owner's public key
 * @param uid The unique identifier for the position
 * @returns A tuple containing the position PDA and the bump seed
 */
export declare function findPositionPda(programId: PublicKey, market: PublicKey, owner: PublicKey, uid: number): [PublicKey, number];
/**
 * Convert a number to a BN (Big Number)
 * @param value The number to convert
 * @returns A BN instance
 */
export declare function toBN(value: number): BN;
/**
 * Convert a BN to a number (if it's within safe integer range)
 * @param value The BN to convert
 * @returns A number
 */
export declare function fromBN(value: BN): number;
/**
 * Format a BN as a string with a specified number of decimal places
 * @param value The BN to format
 * @param decimals The number of decimal places
 * @returns A formatted string
 */
export declare function formatBN(value: BN, decimals: number): string;
/**
 * Find the PDA for a market vault
 */
export declare function findMarketVaultPda(programId: PublicKey, marketPda: PublicKey): [PublicKey, number];
