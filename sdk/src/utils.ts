import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

/**
 * Find the PDA for a market
 * @param programId The program ID
 * @param marketSymbol The market symbol (e.g., "SOL-PERP")
 * @returns A tuple containing the market PDA and the bump seed
 */
export function findMarketPda(
  programId: PublicKey,
  marketSymbol: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(marketSymbol)],
    programId
  );
}

/**
 * Find the PDA for a margin account
 * @param programId The program ID
 * @param owner The owner's public key
 * @param market The market's public key
 * @returns A tuple containing the margin account PDA and the bump seed
 */
export function findMarginAccountPda(
  programId: PublicKey,
  owner: PublicKey,
  market: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("margin_account"),
      owner.toBuffer(),
      market.toBuffer()
    ],
    programId
  );
}

/**
 * Find the PDA for a position
 * @param programId The program ID
 * @param market The market's public key
 * @param owner The owner's public key
 * @returns A tuple containing the position PDA and the bump seed
 */
export function findPositionPda(
  programId: PublicKey,
  market: PublicKey,
  owner: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      market.toBuffer(),
      owner.toBuffer()
    ],
    programId
  );
}

/**
 * Convert a number to a BN (Big Number)
 * @param value The number to convert
 * @returns A BN instance
 */
export function toBN(value: number): BN {
  return new BN(value);
}

/**
 * Convert a BN to a number (if it's within safe integer range)
 * @param value The BN to convert
 * @returns A number
 */
export function fromBN(value: BN): number {
  return value.toNumber();
}

/**
 * Format a BN as a string with a specified number of decimal places
 * @param value The BN to format
 * @param decimals The number of decimal places
 * @returns A formatted string
 */
export function formatBN(value: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const integerPart = value.div(divisor);
  const fractionalPart = value.mod(divisor);
  
  return `${integerPart.toString()}.${fractionalPart.toString().padStart(decimals, '0')}`;
}

/**
 * Find the PDA for a market vault
 */
export function findMarketVaultPda(
  programId: PublicKey,
  marketPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault"),
      marketPda.toBuffer(),
    ],
    programId
  );
} 