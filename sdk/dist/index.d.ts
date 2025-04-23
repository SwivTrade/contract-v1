import { Program, AnchorProvider, web3, Wallet } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import type { Contracts } from "./idl/index";
import { Market, InitializeMarketParams } from './types/market';
import { MarginAccount, CreateMarginAccountParams, DepositCollateralParams, WithdrawCollateralParams } from './types/margin-account';
import { Position } from './types/position';
export declare class PerpetualSwapSDK {
    constructor(connection: web3.Connection, wallet: Wallet);
    program: Program<Contracts>;
    provider: AnchorProvider;
    initializeMarket(params: InitializeMarketParams): Promise<PublicKey>;
    getMarket(marketAddress: PublicKey): Promise<Market>;
    createMarginAccount(params: CreateMarginAccountParams): Promise<PublicKey>;
    getMarginAccount(marginAccountAddress: PublicKey): Promise<MarginAccount>;
    depositCollateral(params: DepositCollateralParams): Promise<void>;
    withdrawCollateral(params: WithdrawCollateralParams): Promise<void>;
    getPosition(positionPda: PublicKey): Promise<Position>;
    findMarketPda(marketSymbol: string): Promise<[PublicKey, number]>;
    findMarginAccountPda(owner: PublicKey, marketPda: PublicKey): Promise<[PublicKey, number]>;
    findPositionPda(marketPda: PublicKey, owner: PublicKey): Promise<[PublicKey, number]>;
}
export * from './types/market';
export * from './types/margin-account';
export * from './utils';
