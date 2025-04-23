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
const spl_token_1 = require("@solana/spl-token");
const index_1 = require("./idl/index");
const utils_1 = require("./utils");
class PerpetualSwapSDK {
    constructor(connection, wallet) {
        const provider = new anchor_1.AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
        });
        this.program = new anchor_1.Program(index_1.IDL, provider);
        this.provider = provider;
    }
    // Market functions
    async initializeMarket(params) {
        const [market] = (0, utils_1.findMarketPda)(this.program.programId, params.marketSymbol);
        await this.program.methods
            .initializeMarket(params.marketSymbol, new anchor_1.BN(params.initialFundingRate), new anchor_1.BN(params.fundingInterval), new anchor_1.BN(params.maintenanceMarginRatio), new anchor_1.BN(params.initialMarginRatio), new anchor_1.BN(params.maxLeverage), params.bump)
            .accountsStrict({
            market,
            authority: this.provider.wallet.publicKey,
            oracleAccount: params.oracleAccount,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .rpc();
        return market;
    }
    async getMarket(marketAddress) {
        return await this.program.account.market.fetch(marketAddress);
    }
    // Margin Account functions
    async createMarginAccount(params) {
        const [marginAccount] = (0, utils_1.findMarginAccountPda)(this.program.programId, this.provider.wallet.publicKey, params.market);
        await this.program.methods
            .createMarginAccount(params.bump)
            .accountsStrict({
            owner: this.provider.wallet.publicKey,
            marginAccount,
            market: params.market,
            vault: params.vault,
            mint: params.mint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .rpc();
        return marginAccount;
    }
    async getMarginAccount(marginAccountAddress) {
        return await this.program.account.marginAccount.fetch(marginAccountAddress);
    }
    async depositCollateral(params) {
        await this.program.methods
            .depositCollateral(params.amount)
            .accountsStrict({
            owner: this.provider.wallet.publicKey,
            marginAccount: params.marginAccount,
            userTokenAccount: params.userTokenAccount,
            vault: params.vault,
            mint: params.mint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .rpc();
    }
    async withdrawCollateral(params) {
        await this.program.methods
            .withdrawCollateral(params.amount)
            .accountsStrict({
            owner: this.provider.wallet.publicKey,
            marginAccount: params.marginAccount,
            market: params.market,
            userTokenAccount: params.userTokenAccount,
            vault: params.vault,
            mint: params.mint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .rpc();
    }
    // Position methods
    async getPosition(positionPda) {
        return await this.program.account.position.fetch(positionPda);
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
    async findMarketPda(marketSymbol) {
        return (0, utils_1.findMarketPda)(this.program.programId, marketSymbol);
    }
    async findMarginAccountPda(owner, marketPda) {
        return (0, utils_1.findMarginAccountPda)(this.program.programId, owner, marketPda);
    }
    async findPositionPda(marketPda, owner) {
        return (0, utils_1.findPositionPda)(this.program.programId, marketPda, owner);
    }
}
exports.PerpetualSwapSDK = PerpetualSwapSDK;
// Export types
__exportStar(require("./types/market"), exports);
__exportStar(require("./types/margin-account"), exports);
// export * from './types/position';
// export * from './types/contracts';
// Export utility functions
__exportStar(require("./utils"), exports);
