/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";
import { PerpetualSwapSDK } from "../sdk/src/index";
import * as fs from 'fs';
import * as path from 'path';
import { Program } from "@coral-xyz/anchor";
import { MockOracle } from "../target/types/mock_oracle";
import mockOracleIdl from "../target/idl/mock_oracle.json";

describe("contracts", () => {
  // Connection setup
  const connection = new Connection('https://api.testnet.sonic.game/', 'confirmed');
  
  // Keypair setup
  const keypairPath = path.join(__dirname, 'keypair.json');
  let keypair: Keypair;
  
  // Market setup
  const marketSymbol = "abk-PERP";
  const initialFundingRate = 0;
  const fundingInterval = 3600;
  const maintenanceMarginRatio = 500; // 5%
  const initialMarginRatio = 1000; // 10%
  const maxLeverage = 10;

  // PDAs and accounts
  let marketPda: PublicKey;
  let marketBump: number;
  let marginAccountPda: PublicKey;
  let marginAccountBump: number;
  let tokenMint: PublicKey;
  let userTokenAccount: PublicKey;
  let marketVaultPda: PublicKey;
  let mintAuthority: Keypair;
  let wallet: Wallet;
  let sdk: PerpetualSwapSDK;
  let provider: anchor.AnchorProvider;
  let mockOracleProgram: Program<MockOracle>;
  let mockOraclePda: PublicKey;
  let mockOracleBump: number;

  before(async () => {
    // Load or create keypair
    if (fs.existsSync(keypairPath)) {
      const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')));
      keypair = Keypair.fromSecretKey(secretKey);
    } else {
      keypair = Keypair.generate();
      fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
      console.log('New keypair generated and saved. Please fund this wallet:');
      console.log('Public Key:', keypair.publicKey.toBase58());
    }
    
    wallet = new Wallet(keypair);
    
    // Check wallet balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Wallet balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    if (balance === 0) {
      throw new Error('Wallet needs funding. Please send SOL to: ' + keypair.publicKey.toBase58());
    }

    // Initialize provider
    provider = new anchor.AnchorProvider(connection as any, wallet, {});
    anchor.setProvider(provider);

    // Initialize SDK
    sdk = new PerpetualSwapSDK(connection as any, wallet);

    // Initialize mock oracle program
    mockOracleProgram = new Program<MockOracle>(
      mockOracleIdl as MockOracle,
      provider
    );

    // Setup token accounts
    mintAuthority = Keypair.generate();
    console.log('Creating token mint...');
    tokenMint = await createMint(
      connection,
      keypair,
      mintAuthority.publicKey,
      null,
      6 // 6 decimals
    );
    console.log('Token mint created:', tokenMint.toBase58());

    console.log('Creating user token account...');
    userTokenAccount = await createAccount(
      connection,
      keypair,
      tokenMint,
      keypair.publicKey
    );
    console.log('User token account created:', userTokenAccount.toBase58());

    // Get market PDA
    [marketPda, marketBump] = await sdk.findMarketPda(marketSymbol);

    // Get market vault PDA
    [marketVaultPda] = await sdk.findMarketVaultPda(marketPda);

    // Get margin account PDA
    [marginAccountPda, marginAccountBump] = await sdk.findMarginAccountPda(
      keypair.publicKey,
      marketPda
    );

    // Initialize mock oracle
    [mockOraclePda, mockOracleBump] = await PublicKey.findProgramAddress(
      [Buffer.from("oracle"), Buffer.from(marketSymbol)],
      mockOracleProgram.programId
    );

    await mockOracleProgram.methods
      .initialize(marketSymbol, new BN(1000000000)) // Initial price: 1000.000000
      .accountsStrict({
        oracle: mockOraclePda,
        authority: keypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([keypair])
      .rpc();

    // Mint tokens to user account
    console.log('Minting tokens to user account...');
    await mintTo(
      connection,
      keypair,
      tokenMint,
      userTokenAccount,
      mintAuthority,
      100_000_000 // 100 tokens
    );
    console.log('Tokens minted successfully');
  });

  it("Initializes a market", async () => {
    const market = await sdk.initializeMarket({
      marketSymbol,
      initialFundingRate,
      fundingInterval,
      maintenanceMarginRatio,
      initialMarginRatio,
      maxLeverage,
      oracleAccount: mockOraclePda,
      mint: tokenMint
    });

    // Verify the market was initialized correctly
    assert.equal(market.marketSymbol, marketSymbol);
    assert.equal(market.authority.toString(), keypair.publicKey.toString());
    assert.equal(market.oracle.toString(), mockOraclePda.toString());
    assert.equal(market.fundingRate.toString(), initialFundingRate.toString());
    assert.equal(market.fundingInterval.toString(), fundingInterval.toString());
    assert.equal(market.maintenanceMarginRatio.toString(), maintenanceMarginRatio.toString());
    assert.equal(market.initialMarginRatio.toString(), initialMarginRatio.toString());
    assert.equal(market.maxLeverage.toString(), maxLeverage.toString());
    assert.equal(market.bump, marketBump);
    assert.equal(market.isActive, true);
    assert.equal(market.vault.toString(), marketVaultPda.toString());
  });

  it("Creates a margin account", async () => {
    const marginAccount = await sdk.buildCreateMarginAccountTransaction({
      market: marketPda,
      marginType: { isolated: {} }
    }, keypair.publicKey);

    // Send the transaction
    await provider.sendAndConfirm(marginAccount);

    const marginAccountDetails = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountDetails.owner.toString(), keypair.publicKey.toString());
    assert.equal(marginAccountDetails.perpMarket.toString(), marketPda.toString());
    assert.equal(marginAccountDetails.collateral.toNumber(), 0);
    assert.equal(marginAccountDetails.positions.length, 0);
    assert.equal(marginAccountDetails.orders.length, 0);
    assert.equal(marginAccountDetails.bump, marginAccountBump);
    assert.deepEqual(marginAccountDetails.marginType, { isolated: {} });
  });

  it("Deposits collateral", async () => {
    const amount = new BN(50_000_000); // 50 tokens

    const depositTx = await sdk.buildDepositCollateralTransaction({
      marginAccount: marginAccountPda,
      market: marketPda,
      userTokenAccount,
      vault: marketVaultPda,
      mint: tokenMint,
      amount
    }, keypair.publicKey);

    // Send the transaction
    await provider.sendAndConfirm(depositTx);

    const marginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccount.collateral.toNumber(), amount.toNumber());

    const userTokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
    assert.equal(userTokenBalance.value.uiAmount, 50); // 100 - 50 = 50 remaining
  });

  it("Withdraws collateral", async () => {
    const amount = new BN(10_000_000); // 10 tokens

    const withdrawTx = await sdk.buildWithdrawCollateralTransaction(
      {
        marginAccount: marginAccountPda,
        market: marketPda,
        userTokenAccount,
        vault: marketVaultPda,
        mint: tokenMint,
        amount
      },
      keypair.publicKey
    );

    // Send transaction
    await provider.sendAndConfirm(withdrawTx);

    const marginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccount.collateral.toNumber(), 40_000_000); // 50 - 10 = 40

    const userTokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
    assert.equal(userTokenBalance.value.uiAmount, 60); // 50 + 10 = 60
  });
});