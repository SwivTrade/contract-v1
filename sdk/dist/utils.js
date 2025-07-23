"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMarketPda = findMarketPda;
exports.findMarginAccountPda = findMarginAccountPda;
exports.findPositionPda = findPositionPda;
exports.toBN = toBN;
exports.fromBN = fromBN;
exports.formatBN = formatBN;
exports.findMarketVaultPda = findMarketVaultPda;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
/**
 * Find the PDA for a market
 * @param programId The program ID
 * @param marketSymbol The market symbol (e.g., "SOL-PERP")
 * @returns A tuple containing the market PDA and the bump seed
 */
function findMarketPda(programId, marketSymbol) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("market"), Buffer.from(marketSymbol)], programId);
}
/**
 * Find the PDA for a margin account
 * @param programId The program ID
 * @param owner The owner's public key
 * @returns A tuple containing the margin account PDA and the bump seed
 */
function findMarginAccountPda(programId, owner) {
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("margin_account"),
        owner.toBuffer() // Remove market.toBuffer() - margin account is now global
    ], programId);
}
/**
 * Find the PDA for a position
 * @param programId The program ID
 * @param market The market's public key
 * @param owner The owner's public key
 * @param uid The unique identifier for the position
 * @returns A tuple containing the position PDA and the bump seed
 */
function findPositionPda(programId, market, owner, uid) {
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("position"),
        market.toBuffer(),
        owner.toBuffer(),
        new anchor_1.BN(uid).toArrayLike(Buffer, 'le', 8)
    ], programId);
}
/**
 * Convert a number to a BN (Big Number)
 * @param value The number to convert
 * @returns A BN instance
 */
function toBN(value) {
    return new anchor_1.BN(value);
}
/**
 * Convert a BN to a number (if it's within safe integer range)
 * @param value The BN to convert
 * @returns A number
 */
function fromBN(value) {
    return value.toNumber();
}
/**
 * Format a BN as a string with a specified number of decimal places
 * @param value The BN to format
 * @param decimals The number of decimal places
 * @returns A formatted string
 */
function formatBN(value, decimals) {
    const divisor = new anchor_1.BN(10).pow(new anchor_1.BN(decimals));
    const integerPart = value.div(divisor);
    const fractionalPart = value.mod(divisor);
    return `${integerPart.toString()}.${fractionalPart.toString().padStart(decimals, '0')}`;
}
/**
 * Find the PDA for a market vault
 */
function findMarketVaultPda(programId, marketPda) {
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("vault"),
        marketPda.toBuffer(),
    ], programId);
}
