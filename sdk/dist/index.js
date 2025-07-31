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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerpetualSwapSDK = exports.NETWORK_CONFIGS = exports.Network = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const index_1 = require("./idl/index");
const utils_1 = require("./utils");
const mock_oracle_json_1 = __importDefault(require("./idl/mock_oracle.json"));
/**
 * Network configuration for different environments
 */
var Network;
(function (Network) {
    Network["SONIC_TESTNET"] = "sonic-testnet";
    Network["SOLANA_DEVNET"] = "solana-devnet";
    Network["LOCALNET"] = "localnet";
})(Network || (exports.Network = Network = {}));
/**
 * Predefined network configurations
 */
exports.NETWORK_CONFIGS = {
    [Network.SONIC_TESTNET]: {
        name: Network.SONIC_TESTNET,
        rpcUrl: 'https://api.testnet.sonic.game/',
        contractsProgramId: '6UnAEvz8tLBLXM2uDmbYWYKZ6UuAgdxJHTss8HC9h3wf',
        mockOracleProgramId: '7ufLxFvoeg7MukzjBEcs6MqpgEV9Yo6gGBXkPei14WpU'
    },
    [Network.SOLANA_DEVNET]: {
        name: Network.SOLANA_DEVNET,
        rpcUrl: 'https://api.devnet.solana.com',
        contractsProgramId: '6UnAEvz8tLBLXM2uDmbYWYKZ6UuAgdxJHTss8HC9h3wf',
        mockOracleProgramId: '7ufLxFvoeg7MukzjBEcs6MqpgEV9Yo6gGBXkPei14WpU'
    },
    [Network.LOCALNET]: {
        name: Network.LOCALNET,
        rpcUrl: 'http://localhost:8899',
        contractsProgramId: '6UnAEvz8tLBLXM2uDmbYWYKZ6UuAgdxJHTss8HC9h3wf',
        mockOracleProgramId: '7ufLxFvoeg7MukzjBEcs6MqpgEV9Yo6gGBXkPei14WpU'
    }
};
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
     * @param network - Network to use (defaults to SONIC_TESTNET)
     */
    constructor(connection, wallet, adminKeypair, network = Network.SONIC_TESTNET) {
        this.connection = connection;
        this.networkConfig = exports.NETWORK_CONFIGS[network];
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
        // Initialize programs with the correct program IDs for the selected network
        this.program = new anchor_1.Program(index_1.IDL, this.provider);
        this.oracleProgram = new anchor_1.Program(mock_oracle_json_1.default, this.provider);
    }
    /**
     * Get the current network configuration
     */
    getNetworkConfig() {
        return this.networkConfig;
    }
    /**
     * Get the current network name
     */
    getNetwork() {
        return this.networkConfig.name;
    }
    /**
     * Get the contracts program ID for the current network
     */
    getContractsProgramId() {
        return new web3_js_1.PublicKey(this.networkConfig.contractsProgramId);
    }
    /**
     * Get the mock oracle program ID for the current network
     */
    getMockOracleProgramId() {
        return new web3_js_1.PublicKey(this.networkConfig.mockOracleProgramId);
    }
    /**
     * Create a new SDK instance for a different network
     */
    static createForNetwork(network, wallet, adminKeypair) {
        const config = exports.NETWORK_CONFIGS[network];
        const connection = new web3_js_1.Connection(config.rpcUrl, 'confirmed');
        return new PerpetualSwapSDK(connection, wallet, adminKeypair, network);
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
     * Get the oracle program instance
     */
    getOracleProgram() {
        return this.oracleProgram;
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
            .initializeMarket(params.marketSymbol, new anchor_1.BN(params.initialFundingRate), new anchor_1.BN(params.fundingInterval), new anchor_1.BN(params.maintenanceMarginRatio), new anchor_1.BN(params.initialMarginRatio), new anchor_1.BN(params.maxLeverage), new anchor_1.BN(params.liquidationFeeRatio), marketBump)
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
    // ===== ORACLE OPERATIONS =====
    /**
     * Initialize a mock oracle (admin only)
     */
    async initializeOracle(params) {
        if (!this.isAdmin) {
            throw new Error("This operation requires admin privileges");
        }
        const [oraclePda, oracleBump] = await this.findOraclePda(params.marketSymbol);
        await this.oracleProgram.methods
            .initialize(params.marketSymbol, new anchor_1.BN(params.initialPrice))
            .accountsStrict({
            oracle: oraclePda,
            authority: this.provider.wallet.publicKey,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc();
        return oraclePda;
    }
    /**
     * Update oracle price (admin only)
     */
    async updateOraclePrice(params) {
        if (!this.isAdmin) {
            throw new Error("This operation requires admin privileges");
        }
        const [oraclePda] = await this.findOraclePda(params.marketSymbol);
        await this.oracleProgram.methods
            .updatePrice(new anchor_1.BN(params.newPrice))
            .accountsStrict({
            oracle: oraclePda,
            authority: this.provider.wallet.publicKey,
        })
            .rpc();
    }
    /**
     * Get oracle data
     */
    async getOracle(marketSymbol) {
        const [oraclePda] = await this.findOraclePda(marketSymbol);
        return await this.oracleProgram.account.oracle.fetch(oraclePda);
    }
    /**
     * Find the PDA for an oracle
     */
    async findOraclePda(marketSymbol) {
        return await web3_js_1.PublicKey.findProgramAddress([Buffer.from("oracle"), Buffer.from(marketSymbol)], this.oracleProgram.programId);
    }
    // ===== USER OPERATIONS (TRANSACTION BUILDING) =====
    /**
     * Build a transaction to create a margin account
     */
    async buildCreateMarginAccountTransaction(params, userPublicKey) {
        const [marginAccountPda, marginAccountBump] = (0, utils_1.findMarginAccountPda)(this.program.programId, userPublicKey);
        const instruction = await this.program.methods
            .createMarginAccount(params.marginType, marginAccountBump)
            .accountsStrict({
            owner: userPublicKey,
            marginAccount: marginAccountPda,
            // Remove market parameter - margin account is now global
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
        // Get the margin account data to check for positions
        const marginAccount = await this.getMarginAccount(userPublicKey);
        // If there are no positions, we can proceed without position PDAs
        if (marginAccount.positions.length === 0) {
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
                .instruction();
            const transaction = new web3_js_1.Transaction();
            transaction.add(instruction);
            return transaction;
        }
        // If there are positions, get all position PDAs and include them
        const positionAccounts = await Promise.all(marginAccount.positions.map(async (positionKey) => {
            const position = await this.getPosition(positionKey);
            return {
                pubkey: positionKey,
                isWritable: true,
                isSigner: false
            };
        }));
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
            .remainingAccounts(positionAccounts)
            .instruction();
        const transaction = new web3_js_1.Transaction();
        transaction.add(instruction);
        return transaction;
    }
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
    async getMarginAccount(userPublicKey
    // Remove marketPda parameter - margin account is now global
    ) {
        const [marginAccountPda] = await this.findMarginAccountPda(userPublicKey);
        return await this.program.account.marginAccount.fetch(marginAccountPda);
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
    async findMarginAccountPda(owner
    // Remove marketPda parameter - margin account is now global
    ) {
        return (0, utils_1.findMarginAccountPda)(this.program.programId, owner);
    }
    /**
     * Find the PDA for a position
     */
    async findPositionPda(market, trader, uid) {
        return web3_js_1.PublicKey.findProgramAddress([
            Buffer.from("position"),
            market.toBuffer(),
            trader.toBuffer(),
            new anchor_1.BN(uid).toArrayLike(Buffer, "le", 8),
        ], this.program.programId);
    }
    /**
     * Get all markets from the program
     */
    async getAllMarkets() {
        const markets = await this.program.account.market.all();
        return markets.map(market => market.account);
    }
    /**
     * Find the PDA for an order
     */
    async findOrderPda(market, trader, uid) {
        return web3_js_1.PublicKey.findProgramAddress([
            Buffer.from("order"),
            market.toBuffer(),
            trader.toBuffer(),
            new anchor_1.BN(uid).toArrayLike(Buffer, 'le', 8)
        ], this.program.programId);
    }
    /**
     * Generate a unique ID for orders and positions
     * Uses timestamp and random number to ensure uniqueness
     */
    generateUid() {
        return Date.now() + Math.floor(Math.random() * 1000);
    }
    async buildPlaceMarketOrderTransaction(params, signer) {
        const uid = this.generateUid();
        const [positionPda, positionBump] = await this.findPositionPda(params.market, signer, uid);
        const tx = await this.program.methods
            .placeMarketOrder(params.side === 'long' ? { long: {} } : { short: {} }, params.size, params.leverage, positionBump, new anchor_1.BN(uid))
            .accountsStrict({
            market: params.market,
            position: positionPda,
            marginAccount: params.marginAccount,
            trader: signer,
            priceUpdate: params.oracleAccount,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .transaction();
        return tx;
    }
    async buildPauseMarketTransaction(params, authority) {
        const tx = await this.program.methods
            .pauseMarket()
            .accountsStrict({
            market: params.market,
            authority,
        })
            .transaction();
        return tx;
    }
    async buildResumeMarketTransaction(params, authority) {
        const tx = await this.program.methods
            .resumeMarket()
            .accountsStrict({
            market: params.market,
            authority,
        })
            .transaction();
        return tx;
    }
    async buildUpdateMarketParamsTransaction(params, authority) {
        const tx = await this.program.methods
            .updateMarketParams(params.maintenanceMarginRatio ? new anchor_1.BN(params.maintenanceMarginRatio) : null, params.initialMarginRatio ? new anchor_1.BN(params.initialMarginRatio) : null, params.fundingInterval ? new anchor_1.BN(params.fundingInterval) : null, params.maxLeverage ? new anchor_1.BN(params.maxLeverage) : null)
            .accountsStrict({
            market: params.market,
            authority,
        })
            .transaction();
        return tx;
    }
    async buildCloseMarketOrderTransaction(params, signer) {
        const tx = await this.program.methods
            .closeMarketOrder()
            .accountsStrict({
            market: params.market,
            position: params.position,
            marginAccount: params.marginAccount,
            trader: signer,
            priceUpdate: params.oracleAccount,
        })
            .transaction();
        return tx;
    }
    buildLiquidateMarketOrderTransaction(params, signer) {
        return this.program.methods
            .liquidateMarketOrder()
            .accountsStrict({
            market: params.market,
            position: params.position,
            marginAccount: params.marginAccount,
            liquidator: signer,
            priceUpdate: params.oracleAccount,
        })
            .transaction();
    }
}
exports.PerpetualSwapSDK = PerpetualSwapSDK;
// Export types
__exportStar(require("./types/market"), exports);
__exportStar(require("./types/margin-account"), exports);
__exportStar(require("./types/position"), exports);
// Export utility functions
__exportStar(require("./utils"), exports);
// Export oracle types
__exportStar(require("./types/oracle"), exports);
