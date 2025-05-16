/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";
import { PerpetualSwapSDK } from "../sdk/src/index";
import * as fs from 'fs';
import * as path from 'path';

describe("Contract Tests", () => {
  // Connection setup
  // Previous testnet configuration
  // const connection = new Connection('https://api.testnet.sonic.game/', 'confirmed');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Keypair setup
  const keypairPath = path.join(__dirname, 'keypair.json');
  const tokenDataPath = path.join(__dirname, 'token-data.json');
  let keypair: Keypair;

  // Market setup
  const marketSymbol = "mem-PERP";
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

    // Load or create token mint and authority
    let tokenData: {
      mint: string;
      mintAuthority: number[];
      userTokenAccount?: string;
    } | null = null;

    if (fs.existsSync(tokenDataPath)) {
      try {
        tokenData = JSON.parse(fs.readFileSync(tokenDataPath, 'utf-8'));
        tokenMint = new PublicKey(tokenData.mint);
        mintAuthority = Keypair.fromSecretKey(new Uint8Array(tokenData.mintAuthority));
        
        // Check if the mint still exists on-chain
        const mintInfo = await connection.getAccountInfo(tokenMint);
        if (mintInfo) {
          console.log('Using existing token mint:', tokenMint.toBase58());
          
          // Load user token account if saved
          if (tokenData.userTokenAccount) {
            userTokenAccount = new PublicKey(tokenData.userTokenAccount);
            
            // Verify the token account still exists
            const tokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
            if (!tokenAccountInfo) {
              // Token account doesn't exist, we'll create it below
              userTokenAccount = undefined as any;
            } else {
              console.log('Using existing user token account:', userTokenAccount.toBase58());
            }
          }
        } else {
          console.log('Saved mint no longer exists on-chain, creating new one...');
          tokenMint = undefined as any;
          mintAuthority = undefined as any;
        }
      } catch (error) {
        console.log('Error loading token data, creating new tokens...');
        tokenMint = undefined as any;
        mintAuthority = undefined as any;
      }
    }

    // Create mint if it doesn't exist
    if (!tokenMint || !mintAuthority) {
      console.log('Creating new token mint...');
      mintAuthority = Keypair.generate();
    tokenMint = await createMint(
        connection,
        keypair,
      mintAuthority.publicKey,
      null,
      6 // 6 decimals
    );
      console.log('Token mint created:', tokenMint.toBase58());
      
      // Save token data to file
      tokenData = {
        mint: tokenMint.toBase58(),
        mintAuthority: Array.from(mintAuthority.secretKey),
      };
      fs.writeFileSync(tokenDataPath, JSON.stringify(tokenData, null, 2));
    }

    // Create user token account if it doesn't exist
    if (!userTokenAccount) {
      console.log('Creating user token account...');
    userTokenAccount = await createAccount(
        connection,
        keypair,
      tokenMint,
        keypair.publicKey
      );
      console.log('User token account created:', userTokenAccount.toBase58());
      
      // Update saved token data with user token account
      tokenData = tokenData || {
        mint: tokenMint.toBase58(),
        mintAuthority: Array.from(mintAuthority.secretKey),
      };
      tokenData.userTokenAccount = userTokenAccount.toBase58();
      fs.writeFileSync(tokenDataPath, JSON.stringify(tokenData, null, 2));
      
      // Mint initial tokens
      console.log('Minting initial tokens to user account...');
    await mintTo(
        connection,
        keypair,
      tokenMint,
      userTokenAccount,
      mintAuthority,
      100_000_000 // 100 tokens
    );
      console.log('Tokens minted successfully');
    } else {
      // Check current balance and mint more if needed
      const balance = await connection.getTokenAccountBalance(userTokenAccount);
      const currentAmount = balance.value.uiAmount || 0;
      
      if (currentAmount < 100) {
        console.log(`Current balance: ${currentAmount} tokens, minting more...`);
        const amountToMint = (100 - currentAmount) * 1_000_000;
        await mintTo(
          connection,
          keypair,
          tokenMint,
          userTokenAccount,
          mintAuthority,
          amountToMint
        );
        console.log(`Minted ${(100 - currentAmount)} more tokens`);
      } else {
        console.log(`Sufficient token balance: ${currentAmount} tokens`);
      }
    }

    // Get PDAs
    [marketPda, marketBump] = await sdk.findMarketPda(marketSymbol);
    [marketVaultPda] = await sdk.findMarketVaultPda(marketPda);
    [marginAccountPda, marginAccountBump] = await sdk.findMarginAccountPda(
      keypair.publicKey,
      marketPda
    );
    [mockOraclePda, mockOracleBump] = await sdk.findOraclePda(marketSymbol);
  });

  it("Initializes oracle and market", async () => {
    try {
      // Check if oracle already exists
      const existingOracle = await sdk.getOracle(marketSymbol);
      console.log('Oracle already exists, resetting price to 1000');
      
      // Reset price to 1000 for consistent testing
      await sdk.updateOraclePrice({
        marketSymbol,
        newPrice: 1000
      });
    } catch (error) {
      // Oracle doesn't exist, create it
      console.log('Initializing new oracle...');
      await sdk.initializeOracle({
        marketSymbol,
        initialPrice: 1000
      });
    }

    try {
      // Check if market already exists
      const existingMarket = await sdk.getMarket(marketPda);
      console.log('Market already exists, skipping initialization');
      
      // Verify market properties
      assert.equal(existingMarket.marketSymbol, marketSymbol);
      assert.equal(existingMarket.authority.toString(), keypair.publicKey.toString());
    } catch (error) {
      // Market doesn't exist, create it
      console.log('Initializing new market...');
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

      assert.equal(market.marketSymbol, marketSymbol);
      assert.equal(market.authority.toString(), keypair.publicKey.toString());
      assert.equal(market.oracle.toString(), mockOraclePda.toString());
    }
  });

  it("Creates a margin account", async () => {
    try {
      // Check if margin account already exists
      const existingMarginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      console.log('Margin account already exists, skipping creation');
      
      assert.equal(existingMarginAccount.owner.toString(), keypair.publicKey.toString());
      assert.equal(existingMarginAccount.perpMarket.toString(), marketPda.toString());
      assert.deepEqual(existingMarginAccount.marginType, { isolated: {} });
    } catch (error) {
      // Margin account doesn't exist, create it
      console.log('Creating new margin account...');
      const marginAccount = await sdk.buildCreateMarginAccountTransaction({
        market: marketPda,
        marginType: { isolated: {} }
      }, keypair.publicKey);

      await provider.sendAndConfirm(marginAccount);

      const marginAccountDetails = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      assert.equal(marginAccountDetails.owner.toString(), keypair.publicKey.toString());
      assert.equal(marginAccountDetails.perpMarket.toString(), marketPda.toString());
      assert.deepEqual(marginAccountDetails.marginType, { isolated: {} });
    }
  });

  it("Deposits collateral", async () => {
    const amount = new BN(50_000_000); // 50 tokens
    
    // Get current balance
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const userTokenBefore = await connection.getTokenAccountBalance(userTokenAccount);
    
    const depositTx = await sdk.buildDepositCollateralTransaction({
      marginAccount: marginAccountPda,
      market: marketPda,
      userTokenAccount,
      vault: marketVaultPda,
      mint: tokenMint,
      amount
    }, keypair.publicKey);

    await provider.sendAndConfirm(depositTx);

    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const userTokenAfter = await connection.getTokenAccountBalance(userTokenAccount);
    
    // Check that collateral increased by the deposit amount
    const collateralIncrease = marginAccountAfter.collateral.toNumber() - marginAccountBefore.collateral.toNumber();
    assert.equal(collateralIncrease, amount.toNumber());
    
    // Check that user token balance decreased
    const tokenDecrease = (userTokenBefore.value.uiAmount! - userTokenAfter.value.uiAmount!) * 1_000_000;
    assert.equal(tokenDecrease, amount.toNumber());
  });

  it("Withdraws collateral", async () => {
    const amount = new BN(10_000_000); // 10 tokens
    
    // Get current balances
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const userTokenBefore = await connection.getTokenAccountBalance(userTokenAccount);

    const withdrawTx = await sdk.buildWithdrawCollateralTransaction({
      marginAccount: marginAccountPda,
      market: marketPda,
      userTokenAccount,
      vault: marketVaultPda,
      mint: tokenMint,
      amount
    }, keypair.publicKey);

    await provider.sendAndConfirm(withdrawTx);

    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const userTokenAfter = await connection.getTokenAccountBalance(userTokenAccount);
    
    // Check that collateral decreased by the withdrawal amount
    const collateralDecrease = marginAccountBefore.collateral.toNumber() - marginAccountAfter.collateral.toNumber();
    assert.equal(collateralDecrease, amount.toNumber());
    
    // Check that user token balance increased
    const tokenIncrease = (userTokenAfter.value.uiAmount! - userTokenBefore.value.uiAmount!) * 1_000_000;
    assert.equal(tokenIncrease, amount.toNumber());
  });

  it("Opens and closes a long position with profit", async () => {
    // Open long position
    const side = { long: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey);
    
    const openPositionTx = await sdk.buildOpenPositionTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(openPositionTx);

    // Verify position was created
    const position = await sdk.getPosition(positionPda);
    assert.equal(position.trader.toString(), keypair.publicKey.toString());
    assert.equal(position.market.toString(), marketPda.toString());
    assert.deepEqual(position.side, side);
    assert.equal(position.size.toNumber(), size.toNumber());
    assert.equal(position.leverage.toNumber(), leverage.toNumber());
    assert.equal(position.isOpen, true);

    // Update oracle price to create profit scenario
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 1200 // Higher than entry price for long profit
    });
    
    // Get margin account state before closing
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closePositionTx = await sdk.buildClosePositionTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closePositionTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfter.positions.length, 0);
    
    // Verify collateral increased due to profit
    assert.isTrue(marginAccountAfter.collateral.gt(marginAccountBefore.collateral));
    
    // For isolated margin, verify allocated margin was released
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a short position with profit", async () => {
    // Open short position
    const side = { short: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey);
    
    const openPositionTx = await sdk.buildOpenPositionTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(openPositionTx);

    // Verify position was created
    const position = await sdk.getPosition(positionPda);
    assert.equal(position.trader.toString(), keypair.publicKey.toString());
    assert.equal(position.market.toString(), marketPda.toString());
    assert.deepEqual(position.side, side);
    assert.equal(position.size.toNumber(), size.toNumber());
    assert.equal(position.leverage.toNumber(), leverage.toNumber());
    assert.equal(position.isOpen, true);

    // Update oracle price to create profit scenario for short
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 800 // Lower than entry price for short profit
    });
    
    // Get margin account state before closing
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closePositionTx = await sdk.buildClosePositionTransaction({
      market: marketPda,
      position: positionPda,
        marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closePositionTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfter.positions.length, 0);
    
    // Verify collateral increased due to profit
    assert.isTrue(marginAccountAfter.collateral.gt(marginAccountBefore.collateral));
    
    // For isolated margin, verify allocated margin was released
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a long position with loss", async () => {
    // Open long position
    const side = { long: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey);
    
    const openPositionTx = await sdk.buildOpenPositionTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(openPositionTx);

    // Update oracle price to create loss scenario for long
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 800 // Lower than entry price for long loss
    });
    
    // Get margin account state before closing
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closePositionTx = await sdk.buildClosePositionTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closePositionTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfter.positions.length, 0);
    
    // Verify collateral decreased due to loss
    assert.isTrue(marginAccountAfter.collateral.lt(marginAccountBefore.collateral));
    
    // For isolated margin, verify allocated margin was released
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a short position with loss", async () => {
    // Open short position
    const side = { short: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey);
    
    const openPositionTx = await sdk.buildOpenPositionTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(openPositionTx);

    // Update oracle price to create loss scenario for short
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 1300 // Higher than entry price for short loss
    });
    
    // Get margin account state before closing
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closePositionTx = await sdk.buildClosePositionTransaction({
        market: marketPda,
        position: positionPda,
        marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closePositionTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfter.positions.length, 0);
    
    // Verify collateral decreased due to loss
    assert.isTrue(marginAccountAfter.collateral.lt(marginAccountBefore.collateral));
    
    // For isolated margin, verify allocated margin was released
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  beforeEach(async function() {
    try {
      // Reset oracle price
      await sdk.updateOraclePrice({
        marketSymbol,
        newPrice: 1100
      });
    } catch (error) {
      console.log('Oracle not yet initialized, creating it...');
      await sdk.initializeOracle({
        marketSymbol,
        initialPrice: 1100
      });
      console.log('Oracle created with price 1100');
    }
    
    // Clean up any existing position for ALL tests
    try {
      const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey);
      const position = await sdk.getPosition(positionPda);
      
      if (position.isOpen) {
        console.log('Closing existing open position...');
        const closePositionTx = await sdk.buildClosePositionTransaction({
          market: marketPda,
          position: positionPda,
          marginAccount: marginAccountPda,
          oracleAccount: mockOraclePda
        }, keypair.publicKey);
        await provider.sendAndConfirm(closePositionTx);
      }
    } catch (error) {
      // Position doesn't exist or other error, continue
    }
    
    // Reset margin account collateral to a known state (40 tokens)
    try {
      const marginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      const targetCollateral = 40_000_000; // 40 tokens
      const currentCollateral = marginAccount.collateral.toNumber();
      
      if (currentCollateral > targetCollateral) {
        // Withdraw excess collateral
        const excess = currentCollateral - targetCollateral;
        console.log(`Withdrawing excess collateral: ${excess / 1_000_000} tokens`);
        
        const withdrawTx = await sdk.buildWithdrawCollateralTransaction({
        marginAccount: marginAccountPda,
        market: marketPda,
          userTokenAccount,
          vault: marketVaultPda,
          mint: tokenMint,
          amount: new BN(excess)
        }, keypair.publicKey);
        await provider.sendAndConfirm(withdrawTx);
        
      } else if (currentCollateral < targetCollateral) {
        // Deposit to reach target
        const needed = targetCollateral - currentCollateral;
        console.log(`Depositing needed collateral: ${needed / 1_000_000} tokens`);
        
        const depositTx = await sdk.buildDepositCollateralTransaction({
          marginAccount: marginAccountPda,
          market: marketPda,
          userTokenAccount,
          vault: marketVaultPda,
          mint: tokenMint,
          amount: new BN(needed)
        }, keypair.publicKey);
        await provider.sendAndConfirm(depositTx);
      }
    } catch (error) {
      console.log('Error resetting collateral:', error.message);
    }
  });
});