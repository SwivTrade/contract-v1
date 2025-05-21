import { Program, AnchorProvider, web3, Wallet } from '@coral-xyz/anchor';
import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
import type { Contracts } from "./idl/index";
import { Market, InitializeMarketParams } from './types/market';
import { MarginAccount, CreateMarginAccountParams, DepositCollateralParams, WithdrawCollateralParams } from './types/margin-account';
import { Position, OpenPositionParams, ClosePositionParams } from './types/position';
import { MockOracle } from "./idl/mock_oracle";
import { Oracle, InitializeOracleParams, UpdateOracleParams } from './types/oracle';
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
    /**
     * Initialize the SDK
     *
     * @param connection - Solana connection
     * @param wallet - Optional wallet for admin operations
     * @param adminKeypair - Optional admin keypair for admin operations
     */
    constructor(connection: web3.Connection, wallet?: Wallet, adminKeypair?: Keypair);
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
     * Build a transaction to open a position
     */
    buildOpenPositionTransaction(params: OpenPositionParams, userPublicKey: PublicKey): Promise<Transaction>;
    /**
     * Build a transaction to close a position
     */
    buildClosePositionTransaction(params: ClosePositionParams, userPublicKey: PublicKey): Promise<Transaction>;
    /**
     * Get market details
     */
    getMarket(marketAddress: PublicKey): Promise<Market>;
    /**
     * Get margin account details
     */
    getMarginAccount(userPublicKey: PublicKey, marketPda: PublicKey): Promise<MarginAccount>;
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
    findMarginAccountPda(owner: PublicKey, marketPda: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Find the PDA for a position
     */
    findPositionPda(marketPda: PublicKey, owner: PublicKey, nonce: number): Promise<[PublicKey, number]>;
    /**
     * Get all markets from the program
     */
    getAllMarkets(): Promise<Market[]>;
}
export * from './types/market';
export * from './types/margin-account';
export * from './types/position';
export * from './utils';
export * from './types/oracle';
