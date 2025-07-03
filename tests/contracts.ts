/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";
import { PerpetualSwapSDK, Network } from "../sdk/src/index";
import * as fs from 'fs';
import * as path from 'path';

describe("Contract Tests", () => {
  // Network configuration - using Sonic testnet
  const network = Network.SOLANA_DEVNET;
  
  // Keypair setup
  const keypairPath = path.join(__dirname, 'keypair.json');
  const tokenDataPath = path.join(__dirname, 'token-data.json');
  let keypair: Keypair;

  // Market setup
  const marketSymbol = "t3-PERP";
  const initialFundingRate = 0;
  const fundingInterval = 3600;
  const maintenanceMarginRatio = 100; // 1% (changed from 500 to support higher leverage)
  const initialMarginRatio = 200; // 2% (changed from 1000 to support up to 50x leverage)
  const maxLeverage = 30; // Increased from 10 to 50
  const liquidationFeeRatio = 250; // 2.5%

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
  let connection: Connection;

  before(async () => {
    // Initialize SDK with network configuration
    sdk = PerpetualSwapSDK.createForNetwork(network);
    connection = sdk.getProvider().connection;
    
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
    console.log('Network:', sdk.getNetwork());
    console.log('Contracts Program ID:', sdk.getContractsProgramId().toBase58());
    console.log('Mock Oracle Program ID:', sdk.getMockOracleProgramId().toBase58());
    
    if (balance === 0) {
      throw new Error('Wallet needs funding. Please send SOL to: ' + keypair.publicKey.toBase58());
    }

    // Initialize provider
    provider = new anchor.AnchorProvider(connection as any, wallet, {});
    anchor.setProvider(provider);

    // Reinitialize SDK with wallet for admin operations
    sdk = new PerpetualSwapSDK(connection, wallet, keypair, network);

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
        liquidationFeeRatio,
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

  it("Opens and closes a long market order with profit", async () => {
    // Place long market order
    const side = 'long';
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    // Log margin account state before placing order
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\n=== COLLATERAL TRACKING ===');
    console.log('Before Placing Order:');
    console.log('- Collateral:', marginAccountBefore.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountBefore.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountBefore.collateral.toNumber() - marginAccountBefore.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Get the position PDA from the margin account
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const positionPda = marginAccountAfterOrder.positions[0];

    // Verify position was created
    const position = await sdk.getPosition(positionPda);
    console.log('\nPosition Details:');
    console.log('- PDA:', positionPda.toBase58());
    console.log('- Size:', position.size.toNumber());
    console.log('- Entry Price:', position.entryPrice.toNumber());
    console.log('- Leverage:', position.leverage.toNumber());
    console.log('- Is Open:', position.isOpen);

    // Update oracle price to create profit scenario
    const exitPrice = 1200; // Higher than entry price for long profit
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: exitPrice
    });
    
    // Calculate expected PnL
    const expectedPnL = (exitPrice - position.entryPrice.toNumber()) * position.size.toNumber();
    console.log('\nExpected PnL Calculation:');
    console.log('- Exit Price:', exitPrice);
    console.log('- Entry Price:', position.entryPrice.toNumber());
    console.log('- Price Difference:', exitPrice - position.entryPrice.toNumber());
    console.log('- Position Size:', position.size.toNumber());
    console.log('- Expected PnL:', expectedPnL);
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\nAfter Closing Position:');
    console.log('- Collateral:', marginAccountAfterClose.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterClose.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterClose.collateral.toNumber() - marginAccountAfterClose.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Actual PnL:', (marginAccountAfterClose.collateral.toNumber() - marginAccountBeforeClose.collateral.toNumber()));
    console.log('- Expected PnL:', expectedPnL);
    console.log('=== END COLLATERAL TRACKING ===\n');
    
    assert.equal(marginAccountAfterClose.positions.length, 0);
    assert.isTrue(marginAccountAfterClose.collateral.gt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfterClose.marginType) {
      assert.equal(marginAccountAfterClose.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a short market order with profit", async () => {
    // Place short market order
    const side = 'short';
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Get the position PDA from the margin account
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const positionPda = marginAccountAfterOrder.positions[0];

    // Verify position was created
    const position = await sdk.getPosition(positionPda);
    console.log('\nShort Position Details:');
    console.log('- PDA:', positionPda.toBase58());
    console.log('- Size:', position.size.toNumber());
    console.log('- Entry Price:', position.entryPrice.toNumber());
    console.log('- Leverage:', position.leverage.toNumber());
    console.log('- Is Open:', position.isOpen);

    // Update oracle price to create profit scenario for short
    const exitPrice = 800; // Lower than entry price for short profit
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: exitPrice
    });
    
    // Calculate expected PnL
    const expectedPnL = (position.entryPrice.toNumber() - exitPrice) * position.size.toNumber();
    console.log('\nExpected PnL Calculation:');
    console.log('- Entry Price:', position.entryPrice.toNumber());
    console.log('- Exit Price:', exitPrice);
    console.log('- Price Difference:', position.entryPrice.toNumber() - exitPrice);
    console.log('- Position Size:', position.size.toNumber());
    console.log('- Expected PnL:', expectedPnL);
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\nAfter Closing Position:');
    console.log('- Collateral:', marginAccountAfterClose.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterClose.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterClose.collateral.toNumber() - marginAccountAfterClose.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Actual PnL:', (marginAccountAfterClose.collateral.toNumber() - marginAccountBeforeClose.collateral.toNumber()));
    console.log('- Expected PnL:', expectedPnL);
    
    assert.equal(marginAccountAfterClose.positions.length, 0);
    assert.isTrue(marginAccountAfterClose.collateral.gt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfterClose.marginType) {
      assert.equal(marginAccountAfterClose.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a long market order with loss", async () => {
    // Place long market order
    const side = 'long';
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Get the position PDA from the margin account
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const positionPda = marginAccountAfterOrder.positions[0];

    // Get the position details
    const position = await sdk.getPosition(positionPda);

    // Update oracle price to create loss scenario for long
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 800 // Lower than entry price for long loss
    });
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfterClose.positions.length, 0);
    assert.isTrue(marginAccountAfterClose.collateral.lt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfterClose.marginType) {
      assert.equal(marginAccountAfterClose.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a short market order with loss", async () => {
    // Place short market order
    const side = 'short';
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Get the position PDA from the margin account
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const positionPda = marginAccountAfterOrder.positions[0];

    // Get the position details
    const position = await sdk.getPosition(positionPda);

    // Update oracle price to create loss scenario for short
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 1300 // Higher than entry price for short loss
    });
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfterClose.positions.length, 0);
    assert.isTrue(marginAccountAfterClose.collateral.lt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfterClose.marginType) {
      assert.equal(marginAccountAfterClose.allocatedMargin.toNumber(), 0);
    }
  });

  it("Liquidates a market order when position becomes undercollateralized", async () => {
    // Place long market order with high leverage
    const side = 'long';
    const size = new BN(100_000); // 0.1 tokens
    const leverage = new BN(10); // High leverage
    
    // Log margin account state before placing order
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\nMargin Account Before Order:');
    console.log('- Positions:', marginAccountBefore.positions.map(p => p.toBase58()));
    console.log('- Collateral:', marginAccountBefore.collateral.toNumber() / 1_000_000);
    console.log('- Allocated Margin:', marginAccountBefore.allocatedMargin.toNumber() / 1_000_000);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Get the position PDA from the margin account
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    const positionPda = marginAccountAfterOrder.positions[0];

    // Get the position details
    const position = await sdk.getPosition(positionPda);

    // Update oracle price to make position liquidatable
    // Move price down significantly to trigger liquidation for long position
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 500 // 50% price drop
    });
    
    // Load or create liquidator keypair
    const liquidatorKeypairPath = path.join(__dirname, 'liquidator-keypair.json');
    let liquidator: Keypair;
    
    if (fs.existsSync(liquidatorKeypairPath)) {
      const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(liquidatorKeypairPath, 'utf-8')));
      liquidator = Keypair.fromSecretKey(secretKey);
    } else {
      liquidator = Keypair.generate();
      fs.writeFileSync(liquidatorKeypairPath, JSON.stringify(Array.from(liquidator.secretKey)));
      console.log('\nNew liquidator keypair generated and saved.');
      console.log('Please fund this wallet with SOL:');
      console.log('Liquidator Public Key:', liquidator.publicKey.toBase58());
      console.log('\nTo transfer SOL, use this command:');
      console.log(`solana transfer ${liquidator.publicKey.toBase58()} 1 --allow-unfunded-recipient`);
      throw new Error('Please fund the liquidator wallet and run the test again');
    }
    
    // Create a new wallet for the liquidator
    const liquidatorWallet = new Wallet(liquidator);
    const liquidatorProvider = new anchor.AnchorProvider(connection as any, liquidatorWallet, {});
    
    // Get the order PDA
    const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, position.createdAt.toNumber());
    
    // Build and send liquidation transaction
    const liquidateTx = await sdk.buildLiquidateMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, liquidator.publicKey);

    await liquidatorProvider.sendAndConfirm(liquidateTx);

    // Verify the margin account state after liquidation
    const marginAccountAfterLiquidation = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\nMargin Account After Liquidation:');
    console.log('- Positions:', marginAccountAfterLiquidation.positions.map(p => p.toBase58()));
    console.log('- Collateral:', marginAccountAfterLiquidation.collateral.toNumber() / 1_000_000);
    console.log('- Allocated Margin:', marginAccountAfterLiquidation.allocatedMargin.toNumber() / 1_000_000);
    
    // Verify position is closed
    assert.equal(marginAccountAfterLiquidation.positions.length, 0);
    
    // Verify allocated margin is 0 for isolated margin
    if ('isolated' in marginAccountAfterLiquidation.marginType) {
      assert.equal(marginAccountAfterLiquidation.allocatedMargin.toNumber(), 0);
    }
    
    // Verify market state
    const market = await sdk.getMarket(marketPda);
    assert.isTrue(market.insuranceFund.gt(new BN(0))); // Insurance fund should have received fees
  });

  it("Updates market parameters and reverts them", async () => {
    // Get current market parameters
    const marketBefore = await sdk.getMarket(marketPda);
    console.log('\n=== MARKET PARAMETERS UPDATE TEST ===');
    console.log('Original Market Parameters:');
    console.log('- Maintenance Margin Ratio:', marketBefore.maintenanceMarginRatio.toNumber());
    console.log('- Initial Margin Ratio:', marketBefore.initialMarginRatio.toNumber());
    console.log('- Funding Interval:', marketBefore.fundingInterval.toNumber());
    console.log('- Max Leverage:', marketBefore.maxLeverage.toNumber());

    // Store original values for later restoration
    const originalMaintenanceMargin = marketBefore.maintenanceMarginRatio.toNumber();
    const originalInitialMargin = marketBefore.initialMarginRatio.toNumber();
    const originalFundingInterval = marketBefore.fundingInterval.toNumber();
    const originalMaxLeverage = marketBefore.maxLeverage.toNumber();

    // Update market parameters to new values
    const newMaintenanceMargin = 150; // 1.5%
    const newInitialMargin = 300; // 3%
    const newFundingInterval = 7200; // 2 hours
    const newMaxLeverage = 25; // 25x leverage

    console.log('\nUpdating Market Parameters to:');
    console.log('- Maintenance Margin Ratio:', newMaintenanceMargin);
    console.log('- Initial Margin Ratio:', newInitialMargin);
    console.log('- Funding Interval:', newFundingInterval);
    console.log('- Max Leverage:', newMaxLeverage);

    const updateTx = await sdk.buildUpdateMarketParamsTransaction({
      market: marketPda,
      maintenanceMarginRatio: newMaintenanceMargin,
      initialMarginRatio: newInitialMargin,
      fundingInterval: newFundingInterval,
      maxLeverage: newMaxLeverage
    }, keypair.publicKey);

    await provider.sendAndConfirm(updateTx);

    // Verify the parameters were updated
    const marketAfterUpdate = await sdk.getMarket(marketPda);
    console.log('\nMarket Parameters After Update:');
    console.log('- Maintenance Margin Ratio:', marketAfterUpdate.maintenanceMarginRatio.toNumber());
    console.log('- Initial Margin Ratio:', marketAfterUpdate.initialMarginRatio.toNumber());
    console.log('- Funding Interval:', marketAfterUpdate.fundingInterval.toNumber());
    console.log('- Max Leverage:', marketAfterUpdate.maxLeverage.toNumber());

    // Assert that parameters were updated correctly
    assert.equal(marketAfterUpdate.maintenanceMarginRatio.toNumber(), newMaintenanceMargin);
    assert.equal(marketAfterUpdate.initialMarginRatio.toNumber(), newInitialMargin);
    assert.equal(marketAfterUpdate.fundingInterval.toNumber(), newFundingInterval);
    assert.equal(marketAfterUpdate.maxLeverage.toNumber(), newMaxLeverage);

    // Revert parameters back to original values
    console.log('\nReverting Market Parameters to Original Values:');
    console.log('- Maintenance Margin Ratio:', originalMaintenanceMargin);
    console.log('- Initial Margin Ratio:', originalInitialMargin);
    console.log('- Funding Interval:', originalFundingInterval);
    console.log('- Max Leverage:', originalMaxLeverage);

    const revertTx = await sdk.buildUpdateMarketParamsTransaction({
      market: marketPda,
      maintenanceMarginRatio: originalMaintenanceMargin,
      initialMarginRatio: originalInitialMargin,
      fundingInterval: originalFundingInterval,
      maxLeverage: originalMaxLeverage
    }, keypair.publicKey);

    await provider.sendAndConfirm(revertTx);

    // Verify the parameters were reverted
    const marketAfterRevert = await sdk.getMarket(marketPda);
    console.log('\nMarket Parameters After Revert:');
    console.log('- Maintenance Margin Ratio:', marketAfterRevert.maintenanceMarginRatio.toNumber());
    console.log('- Initial Margin Ratio:', marketAfterRevert.initialMarginRatio.toNumber());
    console.log('- Funding Interval:', marketAfterRevert.fundingInterval.toNumber());
    console.log('- Max Leverage:', marketAfterRevert.maxLeverage.toNumber());

    // Assert that parameters were reverted correctly
    assert.equal(marketAfterRevert.maintenanceMarginRatio.toNumber(), originalMaintenanceMargin);
    assert.equal(marketAfterRevert.initialMarginRatio.toNumber(), originalInitialMargin);
    assert.equal(marketAfterRevert.fundingInterval.toNumber(), originalFundingInterval);
    assert.equal(marketAfterRevert.maxLeverage.toNumber(), originalMaxLeverage);

    console.log('=== MARKET PARAMETERS UPDATE TEST COMPLETED ===\n');
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
    
    // Clean up any existing positions
    try {
      const marginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      
      // Close all positions
      for (const positionKey of marginAccount.positions) {
        try {
          const position = await sdk.getPosition(positionKey);
          if (position.isOpen) {
            console.log(`Closing position ${positionKey.toBase58()}...`);
            // Get the order PDA
            const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, position.createdAt.toNumber());
            
            const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
              market: marketPda,
              position: positionKey,
              marginAccount: marginAccountPda,
              oracleAccount: mockOraclePda
            }, keypair.publicKey);
            await provider.sendAndConfirm(closeOrderTx);
          }
        } catch (error) {
          console.log('Error closing position:', error.message);
        }
      }

      // Verify cleanup
      const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      if (marginAccountAfter.positions.length > 0) {
        console.log('Warning: Some positions could not be closed');
        console.log('Remaining positions:', marginAccountAfter.positions.map(p => p.toBase58()));
      }
    } catch (error) {
      console.log('Error during cleanup:', error.message);
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