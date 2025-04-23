import { Program, AnchorProvider, web3, BN, Wallet } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type {  Contracts} from "./idl/index"
import { IDL } from "./idl/index"

import { Market, InitializeMarketParams } from './types/market';
import { MarginAccount, CreateMarginAccountParams, DepositCollateralParams, WithdrawCollateralParams } from './types/margin-account';
import { Position } from './types/position';
import { 
  findMarketPda,
  findMarginAccountPda,
  findPositionPda
} from './utils';

export class PerpetualSwapSDK {
  constructor(
    connection: web3.Connection,
    wallet: Wallet,
  ) {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    
    this.program = new Program<Contracts>(
      IDL as Contracts,
      provider
    );
    this.provider = provider;
  }

  public program: Program<Contracts>;
  public provider: AnchorProvider;

  // Market functions
  async initializeMarket(params: InitializeMarketParams): Promise<PublicKey> {
    const [market] = findMarketPda(this.program.programId, params.marketSymbol);

    await this.program.methods
      .initializeMarket(
        params.marketSymbol,
        new BN(params.initialFundingRate),
        new BN(params.fundingInterval),
        new BN(params.maintenanceMarginRatio),
        new BN(params.initialMarginRatio),
        new BN(params.maxLeverage),
        params.bump
      )
      .accountsStrict({
        market,
        authority: this.provider.wallet.publicKey,
        oracleAccount: params.oracleAccount,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    return market;
  }

  async getMarket(marketAddress: PublicKey): Promise<Market> {
    return await this.program.account.market.fetch(marketAddress) as unknown as Market;
  }

  // Margin Account functions
  async createMarginAccount(params: CreateMarginAccountParams): Promise<PublicKey> {
    const [marginAccount] = findMarginAccountPda(
      this.program.programId,
      this.provider.wallet.publicKey,
      params.market
    );

    await this.program.methods
      .createMarginAccount(params.bump)
      .accountsStrict({
        owner: this.provider.wallet.publicKey,
        marginAccount,
        market: params.market,
        vault: params.vault,
        mint: params.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    return marginAccount;
  }

  async getMarginAccount(marginAccountAddress: PublicKey): Promise<MarginAccount> {
    return await this.program.account.marginAccount.fetch(marginAccountAddress) as unknown as MarginAccount;
  }

  async depositCollateral(params: DepositCollateralParams): Promise<void> {
    await this.program.methods
      .depositCollateral(params.amount)
      .accountsStrict({
        owner: this.provider.wallet.publicKey,
        marginAccount: params.marginAccount,
        userTokenAccount: params.userTokenAccount,
        vault: params.vault,
        mint: params.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async withdrawCollateral(params: WithdrawCollateralParams): Promise<void> {
    await this.program.methods
      .withdrawCollateral(params.amount)
      .accountsStrict({
        owner: this.provider.wallet.publicKey,
        marginAccount: params.marginAccount,
        market: params.market,
        userTokenAccount: params.userTokenAccount,
        vault: params.vault,
        mint: params.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  // Position methods
  async getPosition(positionPda: PublicKey): Promise<Position> {
    return await this.program.account.position.fetch(positionPda) as unknown as Position;
  }

  // async openPosition(
  //   marketPda: PublicKey,
  //   marginAccountPda: PublicKey,
  //   size: number,
  //   leverage: number,
  //   side: 'long' | 'short'
  // ): Promise<{ positionPda: PublicKey, bump: number }> {
  //   const [positionPda, bump] = findPositionPda(
  //     this.program.programId,
  //     marketPda,
  //     this.provider.wallet.publicKey
  //   );

  //   await this.program.methods
  //     .openPosition(
  //       side === 'long' ? { long: {} } : { short: {} },
  //       new BN(size),
  //       new BN(leverage),
  //       bump
  //     )
  //     .accounts({
  //       market: marketPda,
  //       position: positionPda,
  //       marginAccount: marginAccountPda,
  //       trader: this.provider.wallet.publicKey,
  //       oracleAccount: this.program.account.market.fetch(marketPda).then(m => m.oracle),
  //       systemProgram: web3.SystemProgram.programId,
  //     })
  //     .rpc();

  //   return { positionPda, bump };
  // }

  // async closePosition(
  //   positionPda: PublicKey,
  //   marginAccountPda: PublicKey,
  //   size: number
  // ): Promise<string> {
  //   const position = await this.program.account.position.fetch(positionPda);
  //   const marketPda = position.market;

  //   await this.program.methods
  //     .closePosition(new BN(size))
  //     .accounts({
  //       market: marketPda,
  //       position: positionPda,
  //       marginAccount: marginAccountPda,
  //       trader: this.provider.wallet.publicKey,
  //       oracleAccount: this.program.account.market.fetch(marketPda).then(m => m.oracle),
  //       systemProgram: web3.SystemProgram.programId,
  //     })
  //     .rpc();

  //   return `Position closed: ${positionPda.toString()}`;
  // }

  // Utility methods
  async findMarketPda(marketSymbol: string): Promise<[PublicKey, number]> {
    return findMarketPda(this.program.programId, marketSymbol);
  }

  async findMarginAccountPda(
    owner: PublicKey,
    marketPda: PublicKey
  ): Promise<[PublicKey, number]> {
    return findMarginAccountPda(this.program.programId, owner, marketPda);
  }

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
// export * from './types/position';
// export * from './types/contracts';

// Export utility functions
export * from './utils'; 