import { Program, AnchorProvider, web3, BN, Wallet } from '@coral-xyz/anchor';
import { PublicKey, Transaction, TransactionInstruction, Keypair, SystemProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { Contracts } from "./idl/index"
import { IDL } from "./idl/index"

import { Market, InitializeMarketParams } from './types/market';
import { MarginAccount, CreateMarginAccountParams, DepositCollateralParams, WithdrawCollateralParams } from './types/margin-account';
import { Position, OpenPositionParams, ClosePositionParams } from './types/position';
import { 
  findMarketPda,
  findMarginAccountPda,
  findPositionPda,
  findMarketVaultPda
} from './utils';

/**
 * PerpetualSwapSDK - Main SDK class for interacting with the PerpetualSwap protocol
 * 
 * This SDK is designed to be used in two modes:
 * 1. Admin mode: Initialized with an admin keypair for admin operations
 * 2. User mode: Initialized with a connection only, for building transactions for users to sign
 */
export class PerpetualSwapSDK {
  private program: Program<Contracts>;
  private provider: AnchorProvider;
  private isAdmin: boolean;
  private adminKeypair?: Keypair;

  /**
   * Initialize the SDK
   * 
   * @param connection - Solana connection
   * @param wallet - Optional wallet for admin operations
   * @param adminKeypair - Optional admin keypair for admin operations
   */
  constructor(
    connection: web3.Connection,
    wallet?: Wallet,
    adminKeypair?: Keypair
  ) {
    // If wallet is provided, we're in admin mode
    if (wallet) {
      this.provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
      });
      this.isAdmin = true;
      this.adminKeypair = adminKeypair;
    } else {
      // If no wallet, we're in user mode (transaction building only)
      this.provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), {
        commitment: 'confirmed',
      });
      this.isAdmin = false;
    }
    
    this.program = new Program<Contracts>(
      IDL as Contracts,
      this.provider
    );
  }

  /**
   * Check if the SDK is in admin mode
   */
  public isAdminMode(): boolean {
    return this.isAdmin;
  }

  /**
   * Get the program instance
   */
  public getProgram(): Program<Contracts> {
    return this.program;
  }

  /**
   * Get the provider instance
   */
  public getProvider(): AnchorProvider {
    return this.provider;
  }

  // ===== ADMIN OPERATIONS =====

  /**
   * Initialize a new market (admin only)
   */
  async initializeMarket(params: InitializeMarketParams): Promise<Market> {
    if (!this.isAdmin) {
      throw new Error("This operation requires admin privileges");
    }
    
    const [marketPda, marketBump] = findMarketPda(this.program.programId, params.marketSymbol);
    const [marketVaultPda, marketVaultBump] = findMarketVaultPda(this.program.programId, marketPda);

    await this.program.methods
      .initializeMarket(
        params.marketSymbol,
        new BN(params.initialFundingRate),
        new BN(params.fundingInterval),
        new BN(params.maintenanceMarginRatio),
        new BN(params.initialMarginRatio),
        new BN(params.maxLeverage),
        marketBump
      )
      .accountsStrict({
        market: marketPda,
        authority: this.provider.wallet.publicKey,
        oracleAccount: params.oracleAccount,
        mint: params.mint,
        vault: marketVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fetch and return the market object
    return await this.getMarket(marketPda);
  }

  // ===== USER OPERATIONS (TRANSACTION BUILDING) =====

  /**
   * Build a transaction to create a margin account
   */
  async buildCreateMarginAccountTransaction(
    params: CreateMarginAccountParams,
    userPublicKey: PublicKey
  ): Promise<Transaction> {
    const [marginAccountPda, marginAccountBump] = findMarginAccountPda(
      this.program.programId,
      userPublicKey,
      params.market
    );

    const instruction = await this.program.methods
      .createMarginAccount(params.marginType, marginAccountBump)
      .accountsStrict({
        owner: userPublicKey,
        marginAccount: marginAccountPda,
        market: params.market,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const transaction = new Transaction();
    transaction.add(instruction);
    
    return transaction;
  }

  /**
   * Build a transaction to deposit collateral
   */
  async buildDepositCollateralTransaction(
    params: DepositCollateralParams,
    userPublicKey: PublicKey
  ): Promise<Transaction> {
    const instruction = await this.program.methods
      .depositCollateral(new BN(params.amount))
      .accountsStrict({
        owner: userPublicKey,
        marginAccount: params.marginAccount,
        market: params.market,
        userTokenAccount: params.userTokenAccount,
        marketVault: params.vault,
        mint: params.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const transaction = new Transaction();
    transaction.add(instruction);
    
    return transaction;
  }

  /**
   * Build a transaction to withdraw collateral
   */
  async buildWithdrawCollateralTransaction(
    params: WithdrawCollateralParams,
    userPublicKey: PublicKey
  ): Promise<Transaction> {
    // Get the position PDA for the user
    const [positionPda] = findPositionPda(
      this.program.programId,
      params.market,
      userPublicKey
    );

    const instruction = await this.program.methods
      .withdrawCollateral(new BN(params.amount))
      .accountsStrict({
        owner: userPublicKey,
        marginAccount: params.marginAccount,
        market: params.market,
        userTokenAccount: params.userTokenAccount,
        marketVault: params.vault,
        mint: params.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: positionPda, isWritable: true, isSigner: false }])
      .instruction();

    const transaction = new Transaction();
    transaction.add(instruction);
    
    return transaction;
  }

  /**
   * Build a transaction to open a position
   */
  async buildOpenPositionTransaction(
    params: OpenPositionParams,
    userPublicKey: PublicKey
  ): Promise<Transaction> {
    const [positionPda, positionBump] = findPositionPda(
      this.program.programId,
      params.market,
      userPublicKey
    );

    // Get the market to find the oracle account
    const market = await this.program.account.market.fetch(params.market);
    const oracleAccount = market.oracle;

    const instruction = await this.program.methods
      .openPosition(
        params.side,
        new BN(params.size),
        new BN(params.leverage),
        positionBump
      )
      .accountsStrict({
        market: params.market,
        position: positionPda,
        marginAccount: params.marginAccount,
        trader: userPublicKey,
        priceUpdate: oracleAccount,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const transaction = new Transaction();
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
  async getMarket(marketAddress: PublicKey): Promise<Market> {
    return await this.program.account.market.fetch(marketAddress) as unknown as Market;
  }

  /**
   * Get margin account details
   */
  async getMarginAccount(marginAccountAddress: PublicKey): Promise<MarginAccount> {
    return await this.program.account.marginAccount.fetch(marginAccountAddress) as unknown as MarginAccount;
  }

  /**
   * Get position details
   */
  async getPosition(positionPda: PublicKey): Promise<Position> {
    return await this.program.account.position.fetch(positionPda) as unknown as Position;
  }

  // ===== UTILITY METHODS =====

  /**
   * Find the PDA for a market
   */
  async findMarketPda(marketSymbol: string): Promise<[PublicKey, number]> {
    return findMarketPda(this.program.programId, marketSymbol);
  }

  /**
   * Find the PDA for a market vault
   */
  async findMarketVaultPda(marketPda: PublicKey): Promise<[PublicKey, number]> {
    return findMarketVaultPda(this.program.programId, marketPda);
  }

  /**
   * Find the PDA for a margin account
   */
  async findMarginAccountPda(
    owner: PublicKey,
    marketPda: PublicKey
  ): Promise<[PublicKey, number]> {
    return findMarginAccountPda(this.program.programId, owner, marketPda);
  }

  /**
   * Find the PDA for a position
   */
  async findPositionPda(
    marketPda: PublicKey,
    owner: PublicKey
  ): Promise<[PublicKey, number]> {
    return findPositionPda(this.program.programId, marketPda, owner);
  }
}

// Export types
export * from './types/market';
export * from './types/margin-account';
export * from './types/position';

// Export utility functions
export * from './utils'; 