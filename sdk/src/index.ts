import { Program, AnchorProvider, web3, BN, Wallet } from '@coral-xyz/anchor';
import { PublicKey, Transaction, TransactionInstruction, Keypair, SystemProgram, Connection } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { Contracts } from "./idl/index"
import { IDL } from "./idl/index"

import { Market, InitializeMarketParams } from './types/market';
import { MarginAccount, CreateMarginAccountParams, DepositCollateralParams, WithdrawCollateralParams } from './types/margin-account';
import { Position, OpenPositionParams, ClosePositionParams, Side } from './types/position';
import { 
  findMarketPda,
  findMarginAccountPda,
  findPositionPda,
  findMarketVaultPda
} from './utils';

import { MockOracle } from "./idl/mock_oracle";
import mockOracleIdl from './idl/mock_oracle.json';
import { Oracle, InitializeOracleParams, UpdateOracleParams } from './types/oracle';

/**
 * PerpetualSwapSDK - Main SDK class for interacting with the PerpetualSwap protocol
 * 
 * This SDK is designed to be used in two modes:
 * 1. Admin mode: Initialized with an admin keypair for admin operations
 * 2. User mode: Initialized with a connection only, for building transactions for users to sign
 */
export class PerpetualSwapSDK {
  private program: Program<Contracts>;
  private oracleProgram: Program<MockOracle>;
  private provider: AnchorProvider;
  private isAdmin: boolean;
  private adminKeypair?: Keypair;
  private connection: Connection;

  /**
   * Initialize the SDK
   * 
   * @param connection - Solana connection
   * @param wallet - Optional wallet for admin operations
   * @param adminKeypair - Optional admin keypair for admin operations
   */
  constructor(
    connection: Connection,
    wallet?: Wallet,
    adminKeypair?: Keypair
  ) {
    this.connection = connection;
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

    this.oracleProgram = new Program<MockOracle>(
      mockOracleIdl as MockOracle,
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
   * Get the oracle program instance
   */
  public getOracleProgram(): Program<MockOracle> {
    return this.oracleProgram;
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

  // ===== ORACLE OPERATIONS =====

  /**
   * Initialize a mock oracle (admin only)
   */
  async initializeOracle(params: InitializeOracleParams): Promise<PublicKey> {
    if (!this.isAdmin) {
      throw new Error("This operation requires admin privileges");
    }

    const [oraclePda, oracleBump] = await this.findOraclePda(params.marketSymbol);

    await this.oracleProgram.methods
      .initialize(params.marketSymbol, new BN(params.initialPrice))
      .accountsStrict({
        oracle: oraclePda,
        authority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return oraclePda;
  }

  /**
   * Update oracle price (admin only)
   */
  async updateOraclePrice(params: UpdateOracleParams): Promise<void> {
    if (!this.isAdmin) {
      throw new Error("This operation requires admin privileges");
    }

    const [oraclePda] = await this.findOraclePda(params.marketSymbol);

    await this.oracleProgram.methods
      .updatePrice(new BN(params.newPrice))
      .accountsStrict({
        oracle: oraclePda,
        authority: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Get oracle data
   */
  async getOracle(marketSymbol: string): Promise<Oracle> {
    const [oraclePda] = await this.findOraclePda(marketSymbol);
    return await this.oracleProgram.account.oracle.fetch(oraclePda) as unknown as Oracle;
  }

  /**
   * Find the PDA for an oracle
   */
  async findOraclePda(marketSymbol: string): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from("oracle"), Buffer.from(marketSymbol)],
      this.oracleProgram.programId
    );
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
    // Get the margin account data to check for positions
    const marginAccount = await this.getMarginAccount(userPublicKey, params.market);
    
    // If there are no positions, we can proceed without position PDAs
    if (marginAccount.positions.length === 0) {
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
        .instruction();

      const transaction = new Transaction();
      transaction.add(instruction);
      return transaction;
    }

    // If there are positions, get all position PDAs and include them
    const positionAccounts = await Promise.all(
      marginAccount.positions.map(async (positionKey) => {
        const position = await this.getPosition(positionKey);
        return {
          pubkey: positionKey,
          isWritable: true,
          isSigner: false
        };
      })
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
      .remainingAccounts(positionAccounts)
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
    const [positionPda, positionBump] = await this.findPositionPda(
      params.market,
      userPublicKey,
      params.nonce
    );

    const instruction = await this.program.methods
      .openPosition(params.side, params.size, params.leverage, positionBump, params.nonce)
      .accountsStrict({
        market: params.market,
        position: positionPda,
        marginAccount: params.marginAccount,
        trader: userPublicKey,
        priceUpdate: params.oracleAccount,
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
  async buildClosePositionTransaction(
    params: ClosePositionParams,
    userPublicKey: PublicKey
  ): Promise<Transaction> {
    const instruction = await this.program.methods
      .closePosition()
      .accountsStrict({
        market: params.market,
        position: params.position,
        marginAccount: params.marginAccount,
        trader: userPublicKey,
        priceUpdate: params.oracleAccount,
      })
      .instruction();

    const transaction = new Transaction();
    transaction.add(instruction);
    
    return transaction;
  }

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
  async getMarginAccount(
    userPublicKey: PublicKey,
    marketPda: PublicKey
  ): Promise<MarginAccount> {
    const [marginAccountPda] = await this.findMarginAccountPda(userPublicKey, marketPda);
    return await this.program.account.marginAccount.fetch(marginAccountPda) as unknown as MarginAccount;
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
  async findPositionPda(market: PublicKey, trader: PublicKey, nonce: number): Promise<[PublicKey, number]> {
    const [pda, bump] = await PublicKey.findProgramAddress(
      [
        Buffer.from("position"),
        market.toBuffer(),
        trader.toBuffer(),
        Buffer.from([nonce]),
      ],
      this.program.programId
    );
    return [pda, bump];
  }

  /**
   * Get all markets from the program
   */
  async getAllMarkets(): Promise<Market[]> {
    const markets = await this.program.account.market.all();
    return markets.map(market => market.account as unknown as Market);
  }

  async findOrderPda(market: PublicKey, trader: PublicKey, nonce: number): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from("order"), market.toBuffer(), trader.toBuffer(), Buffer.from([nonce])],
      this.program.programId
    );
  }

  async getOrder(orderPda: PublicKey) {
    return await this.program.account.order.fetch(orderPda) as any;
  }

  async buildPlaceMarketOrderTransaction(
    params: {
      market: PublicKey;
      marginAccount: PublicKey;
      side: { long: {} } | { short: {} };
      size: BN;
      leverage: BN;
      oracleAccount: PublicKey;
      orderNonce: number;
      positionNonce: number;
    },
    trader: PublicKey
  ): Promise<Transaction> {
    const [orderPda, orderBump] = await this.findOrderPda(params.market, trader, params.orderNonce);
    const [positionPda, positionBump] = await this.findPositionPda(params.market, trader, params.positionNonce);

    const tx = await this.program.methods
      .placeMarketOrder(params.side, params.size, params.leverage, orderBump, positionBump, params.orderNonce, params.positionNonce)
      .accountsStrict({
        market: params.market,
        order: orderPda,
        position: positionPda,
        marginAccount: params.marginAccount,
        trader,
        priceUpdate: params.oracleAccount,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    return tx;
  }

  async buildPauseMarketTransaction(
    params: {
      market: PublicKey;
    },
    authority: PublicKey
  ): Promise<Transaction> {
    const tx = await this.program.methods
      .pauseMarket()
      .accountsStrict({
        market: params.market,
        authority,
      })
      .transaction();

    return tx;
  }

  async buildResumeMarketTransaction(
    params: {
      market: PublicKey;
    },
    authority: PublicKey
  ): Promise<Transaction> {
    const tx = await this.program.methods
      .resumeMarket()
      .accountsStrict({
        market: params.market,
        authority,
      })
      .transaction();

    return tx;
  }
}

// Export types
export * from './types/market';
export * from './types/margin-account';
export * from './types/position';

// Export utility functions
export * from './utils';

// Export oracle types
export * from './types/oracle'; 