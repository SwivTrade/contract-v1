import { Program, AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import { PublicKey, Transaction, Keypair, Connection } from '@solana/web3.js';
import type { Contracts } from "./idl/index";
import { Market, InitializeMarketParams } from './types/market';
import { MarginAccount, CreateMarginAccountParams, DepositCollateralParams, WithdrawCollateralParams } from './types/margin-account';
import { Position, Side } from './types/position';
import { MockOracle } from "./idl/mock_oracle";
import { Oracle, InitializeOracleParams, UpdateOracleParams } from './types/oracle';
/**
 * Network configuration for different environments
 */
export declare enum Network {
    SONIC_TESTNET = "sonic-testnet",
    SOLANA_DEVNET = "solana-devnet",
    LOCALNET = "localnet"
}
/**
 * Network configuration interface
 */
export interface NetworkConfig {
    name: Network;
    rpcUrl: string;
    contractsProgramId: string;
    mockOracleProgramId: string;
}
/**
 * Predefined network configurations
 */
export declare const NETWORK_CONFIGS: Record<Network, NetworkConfig>;
/**
 * PerpetualSwapSDK - Main SDK class for interacting with the PerpetualSwap protocol
 *
 * This SDK is designed to be used in two modes:
 * 1. Admin mode: Initialized with an admin keypair for admin operations
 * 2. User mode: Initialized with a connection only, for building transactions for users to sign
 */
export declare class PerpetualSwapSDK {
    private program;
    private oracleProgram;
    private provider;
    private isAdmin;
    private adminKeypair?;
    private connection;
    private networkConfig;
    /**
     * Initialize the SDK
     *
     * @param connection - Solana connection
     * @param wallet - Optional wallet for admin operations
     * @param adminKeypair - Optional admin keypair for admin operations
     * @param network - Network to use (defaults to SONIC_TESTNET)
     */
    constructor(connection: Connection, wallet?: Wallet, adminKeypair?: Keypair, network?: Network);
    /**
     * Get the current network configuration
     */
    getNetworkConfig(): NetworkConfig;
    /**
     * Get the current network name
     */
    getNetwork(): Network;
    /**
     * Get the contracts program ID for the current network
     */
    getContractsProgramId(): PublicKey;
    /**
     * Get the mock oracle program ID for the current network
     */
    getMockOracleProgramId(): PublicKey;
    /**
     * Create a new SDK instance for a different network
     */
    static createForNetwork(network: Network, wallet?: Wallet, adminKeypair?: Keypair): PerpetualSwapSDK;
    /**
     * Check if the SDK is in admin mode
     */
    isAdminMode(): boolean;
    /**
     * Get the program instance
     */
    getProgram(): Program<Contracts>;
    /**
     * Get the oracle program instance
     */
    getOracleProgram(): Program<MockOracle>;
    /**
     * Get the provider instance
     */
    getProvider(): AnchorProvider;
    /**
     * Initialize a new market (admin only)
     */
    initializeMarket(params: InitializeMarketParams): Promise<Market>;
    /**
     * Initialize a mock oracle (admin only)
     */
    initializeOracle(params: InitializeOracleParams): Promise<PublicKey>;
    /**
     * Update oracle price (admin only)
     */
    updateOraclePrice(params: UpdateOracleParams): Promise<void>;
    /**
     * Get oracle data
     */
    getOracle(marketSymbol: string): Promise<Oracle>;
    /**
     * Find the PDA for an oracle
     */
    findOraclePda(marketSymbol: string): Promise<[PublicKey, number]>;
    /**
     * Build a transaction to create a margin account
     */
    buildCreateMarginAccountTransaction(params: CreateMarginAccountParams, userPublicKey: PublicKey): Promise<Transaction>;
    /**
     * Build a transaction to deposit collateral
     */
    buildDepositCollateralTransaction(params: DepositCollateralParams, userPublicKey: PublicKey): Promise<Transaction>;
    /**
     * Build a transaction to withdraw collateral
     */
    buildWithdrawCollateralTransaction(params: WithdrawCollateralParams, userPublicKey: PublicKey): Promise<Transaction>;
    /**
     * Get market details
     */
    getMarket(marketAddress: PublicKey): Promise<Market>;
    /**
     * Get margin account details
     */
    getMarginAccount(userPublicKey: PublicKey): Promise<MarginAccount>;
    /**
     * Get position details
     */
    getPosition(positionPda: PublicKey): Promise<Position>;
    /**
     * Find the PDA for a market
     */
    findMarketPda(marketSymbol: string): Promise<[PublicKey, number]>;
    /**
     * Find the PDA for a market vault
     */
    findMarketVaultPda(marketPda: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Find the PDA for a margin account
     */
    findMarginAccountPda(owner: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Find the PDA for a position
     */
    findPositionPda(market: PublicKey, trader: PublicKey, uid: number): Promise<[PublicKey, number]>;
    /**
     * Get all markets from the program
     */
    getAllMarkets(): Promise<Market[]>;
    /**
     * Find the PDA for an order
     */
    findOrderPda(market: PublicKey, trader: PublicKey, uid: number): Promise<[PublicKey, number]>;
    /**
     * Generate a unique ID for orders and positions
     * Uses timestamp and random number to ensure uniqueness
     */
    private generateUid;
    buildPlaceMarketOrderTransaction(params: {
        market: PublicKey;
        marginAccount: PublicKey;
        side: Side;
        size: BN;
        leverage: BN;
        oracleAccount: PublicKey;
    }, signer: PublicKey): Promise<Transaction>;
    buildPauseMarketTransaction(params: {
        market: PublicKey;
    }, authority: PublicKey): Promise<Transaction>;
    buildResumeMarketTransaction(params: {
        market: PublicKey;
    }, authority: PublicKey): Promise<Transaction>;
    buildUpdateMarketParamsTransaction(params: {
        market: PublicKey;
        maintenanceMarginRatio?: number;
        initialMarginRatio?: number;
        fundingInterval?: number;
        maxLeverage?: number;
    }, authority: PublicKey): Promise<Transaction>;
    buildCloseMarketOrderTransaction(params: {
        market: PublicKey;
        position: PublicKey;
        marginAccount: PublicKey;
        oracleAccount: PublicKey;
    }, signer: PublicKey): Promise<Transaction>;
    buildLiquidateMarketOrderTransaction(params: {
        market: PublicKey;
        position: PublicKey;
        marginAccount: PublicKey;
        oracleAccount: PublicKey;
    }, signer: PublicKey): Promise<Transaction>;
}
export * from './types/market';
export * from './types/margin-account';
export * from './types/position';
export * from './utils';
export * from './types/oracle';
