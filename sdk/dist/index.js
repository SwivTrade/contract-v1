"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerpetualSwapSDK = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const index_1 = require("./idl/index");
const utils_1 = require("./utils");
/**
 * PerpetualSwapSDK - Main SDK class for interacting with the PerpetualSwap protocol
 *
 * This SDK is designed to be used in two modes:
 * 1. Admin mode: Initialized with an admin keypair for admin operations
 * 2. User mode: Initialized with a connection only, for building transactions for users to sign
 */
class PerpetualSwapSDK {
    /**
     * Initialize the SDK
     *
     * @param connection - Solana connection
     * @param wallet - Optional wallet for admin operations
     * @param adminKeypair - Optional admin keypair for admin operations
     */
    constructor(connection, wallet, adminKeypair) {
        // If wallet is provided, we're in admin mode
        if (wallet) {
            this.provider = new anchor_1.AnchorProvider(connection, wallet, {
                commitment: 'confirmed',
            });
            this.isAdmin = true;
            this.adminKeypair = adminKeypair;
        }
        else {
            // If no wallet, we're in user mode (transaction building only)
            this.provider = new anchor_1.AnchorProvider(connection, new anchor_1.Wallet(web3_js_1.Keypair.generate()), {
                commitment: 'confirmed',
            });
            this.isAdmin = false;
        }
        this.program = new anchor_1.Program(index_1.IDL, this.provider);
    }
    /**
     * Check if the SDK is in admin mode
     */
    isAdminMode() {
        return this.isAdmin;
    }
    /**
     * Get the program instance
     */
    getProgram() {
        return this.program;
    }
    /**
     * Get the provider instance
     */
    getProvider() {
        return this.provider;
    }
    // ===== ADMIN OPERATIONS =====
    /**
     * Initialize a new market (admin only)
     */
    async initializeMarket(params) {
        if (!this.isAdmin) {
            throw new Error("This operation requires admin privileges");
        }
        const [marketPda, marketBump] = (0, utils_1.findMarketPda)(this.program.programId, params.marketSymbol);
        const [marketVaultPda, marketVaultBump] = (0, utils_1.findMarketVaultPda)(this.program.programId, marketPda);
        await this.program.methods
            .initializeMarket(params.marketSymbol, new anchor_1.BN(params.initialFundingRate), new anchor_1.BN(params.fundingInterval), new anchor_1.BN(params.maintenanceMarginRatio), new anchor_1.BN(params.initialMarginRatio), new anchor_1.BN(params.maxLeverage), marketBump)
            .accountsStrict({
            market: marketPda,
            authority: this.provider.wallet.publicKey,
            oracleAccount: params.oracleAccount,
            mint: params.mint,
            vault: marketVaultPda,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc();
        // Fetch and return the market object
        return await this.getMarket(marketPda);
    }
    // ===== USER OPERATIONS (TRANSACTION BUILDING) =====
    /**
     * Build a transaction to create a margin account
     */
    async buildCreateMarginAccountTransaction(params, userPublicKey) {
        const [marginAccountPda, marginAccountBump] = (0, utils_1.findMarginAccountPda)(this.program.programId, userPublicKey, params.market);
        const instruction = await this.program.methods
            .createMarginAccount(params.marginType, marginAccountBump)
            .accountsStrict({
            owner: userPublicKey,
            marginAccount: marginAccountPda,
            market: params.market,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .instruction();
        const transaction = new web3_js_1.Transaction();
        transaction.add(instruction);
        return transaction;
    }
    /**
     * Build a transaction to deposit collateral
     */
    async buildDepositCollateralTransaction(params, userPublicKey) {
        const instruction = await this.program.methods
            .depositCollateral(new anchor_1.BN(params.amount))
            .accountsStrict({
            owner: userPublicKey,
            marginAccount: params.marginAccount,
            market: params.market,
            userTokenAccount: params.userTokenAccount,
            marketVault: params.vault,
            mint: params.mint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .instruction();
        const transaction = new web3_js_1.Transaction();
        transaction.add(instruction);
        return transaction;
    }
    /**
     * Build a transaction to withdraw collateral
     */
    async buildWithdrawCollateralTransaction(params, userPublicKey) {
        // Get the position PDA for the user
        const [positionPda] = (0, utils_1.findPositionPda)(this.program.programId, params.market, userPublicKey);
        const instruction = await this.program.methods
            .withdrawCollateral(new anchor_1.BN(params.amount))
            .accountsStrict({
            owner: userPublicKey,
            marginAccount: params.marginAccount,
            market: params.market,
            userTokenAccount: params.userTokenAccount,
            marketVault: params.vault,
            mint: params.mint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .remainingAccounts([{ pubkey: positionPda, isWritable: true, isSigner: false }])
            .instruction();
        const transaction = new web3_js_1.Transaction();
        transaction.add(instruction);
        return transaction;
    }
    /**
     * Build a transaction to open a position
     */
    async buildOpenPositionTransaction(params, userPublicKey) {
        const [positionPda, positionBump] = (0, utils_1.findPositionPda)(this.program.programId, params.market, userPublicKey);
        // Get the market to find the oracle account
        const market = await this.program.account.market.fetch(params.market);
        const oracleAccount = market.oracle;
        const instruction = await this.program.methods
            .openPosition(params.side, new anchor_1.BN(params.size), new anchor_1.BN(params.leverage), positionBump)
            .accountsStrict({
            market: params.market,
            position: positionPda,
            marginAccount: params.marginAccount,
            trader: userPublicKey,
            priceUpdate: oracleAccount,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .instruction();
        const transaction = new web3_js_1.Transaction();
        transaction.add(instruction);
        return transaction;
    }
    /**
     * Build a transaction to close a position
     */
    // async buildClosePositionTransaction(
    //   params: ClosePositionParams,
    //   userPublicKey: PublicKey
    // ): Promise<Transaction> {
    //   // Get the market to find the oracle account
    //   const market = await this.program.account.market.fetch(params.market);
    //   const oracleAccount = market.oracle;
    //   const instruction = await this.program.methods
    //     .closePosition(new BN(params.size))
    //     .accountsStrict({
    //       authority: this.provider.publicKey,
    //       marginAccount: params.marginAccount,
    //       market: params.market,
    //       position: params.position,
    //       priceUpdate: oracleAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .rpc();
    //   const transaction = new Transaction();
    //   transaction.add(tx);
    //   return transaction;
    // }
    // ===== READ OPERATIONS =====
    /**
     * Get market details
     */
    async getMarket(marketAddress) {
        return await this.program.account.market.fetch(marketAddress);
    }
    /**
     * Get margin account details
     */
    async getMarginAccount(marginAccountAddress) {
        return await this.program.account.marginAccount.fetch(marginAccountAddress);
    }
    /**
     * Get position details
     */
    async getPosition(positionPda) {
        return await this.program.account.position.fetch(positionPda);
    }
    // ===== UTILITY METHODS =====
    /**
     * Find the PDA for a market
     */
    async findMarketPda(marketSymbol) {
        return (0, utils_1.findMarketPda)(this.program.programId, marketSymbol);
    }
    /**
     * Find the PDA for a market vault
     */
    async findMarketVaultPda(marketPda) {
        return (0, utils_1.findMarketVaultPda)(this.program.programId, marketPda);
    }
    /**
     * Find the PDA for a margin account
     */
    async findMarginAccountPda(owner, marketPda) {
        return (0, utils_1.findMarginAccountPda)(this.program.programId, owner, marketPda);
    }
    /**
     * Find the PDA for a position
     */
    async findPositionPda(marketPda, owner) {
        return (0, utils_1.findPositionPda)(this.program.programId, marketPda, owner);
    }
}
exports.PerpetualSwapSDK = PerpetualSwapSDK;
// Export types
__exportStar(require("./types/market"), exports);
__exportStar(require("./types/margin-account"), exports);
__exportStar(require("./types/position"), exports);
// Export utility functions
__exportStar(require("./utils"), exports);
