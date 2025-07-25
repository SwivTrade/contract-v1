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

 
  const marketSymbol = "t4-PERP";

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
        1_000_000_000 // 1,000,000,000 tokens (much larger for very large orders)
      );
      console.log('Tokens minted successfully');
    } else {
      // Check current balance and mint more if needed
      const balance = await connection.getTokenAccountBalance(userTokenAccount);
      const currentAmount = balance.value.uiAmount || 0;
      
      if (currentAmount < 1000000000) {
        console.log(`Current balance: ${currentAmount} tokens, minting more...`);
        const amountToMint = Math.floor((1000000000 - currentAmount) * 1_000_000);
        await mintTo(
          connection,
          keypair,
          tokenMint,
          userTokenAccount,
          mintAuthority,
          amountToMint
        );
        console.log(`Minted ${(1000000000 - currentAmount)} more tokens`);
      } else {
        console.log(`Sufficient token balance: ${currentAmount} tokens`);
      }
    }

    // Get PDAs
    [marketPda, marketBump] = await sdk.findMarketPda(marketSymbol);
    [marketVaultPda] = await sdk.findMarketVaultPda(marketPda);
    [marginAccountPda, marginAccountBump] = await sdk.findMarginAccountPda(
      keypair.publicKey
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
      const existingMarginAccount = await sdk.getMarginAccount(keypair.publicKey);
      console.log('Margin account already exists, skipping creation');
      
      assert.equal(existingMarginAccount.owner.toString(), keypair.publicKey.toString());
      assert.deepEqual(existingMarginAccount.marginType, { isolated: {} });
    } catch (error) {
      // Margin account doesn't exist, create it
      console.log('Creating new margin account...');
      const marginAccount = await sdk.buildCreateMarginAccountTransaction({
        marginType: { isolated: {} }
      }, keypair.publicKey);

      await provider.sendAndConfirm(marginAccount);

      const marginAccountDetails = await sdk.getMarginAccount(keypair.publicKey);
      assert.equal(marginAccountDetails.owner.toString(), keypair.publicKey.toString());
      assert.deepEqual(marginAccountDetails.marginType, { isolated: {} });
    }
  });

  it("Deposits collateral", async () => {
    const amount = new BN(100_000_000 * 1_000_000); // 100,000,000 tokens scaled to 6 decimals
    
    // Get current balance
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey);
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

    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey);
    const userTokenAfter = await connection.getTokenAccountBalance(userTokenAccount);
    
    // Check that collateral increased by the deposit amount
    const collateralIncrease = marginAccountAfter.collateral.toNumber() - marginAccountBefore.collateral.toNumber();
    assert.equal(collateralIncrease, amount.toNumber());
    
    // Check that user token balance decreased
    const tokenDecrease = (userTokenBefore.value.uiAmount! - userTokenAfter.value.uiAmount!) * 1_000_000;
    assert.equal(tokenDecrease, amount.toNumber());
  });

  it("Withdraws collateral", async () => {
    const amount = new BN(20_000_000 * 1_000_000); // 20,000,000 tokens scaled to 6 decimals
    
    // Get current balances
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey);
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

    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey);
    const userTokenAfter = await connection.getTokenAccountBalance(userTokenAccount);
    
    // Check that collateral decreased by the withdrawal amount
    const collateralDecrease = marginAccountBefore.collateral.toNumber() - marginAccountAfter.collateral.toNumber();
    assert.equal(collateralDecrease, amount.toNumber());
    
    // Check that user token balance increased
    const tokenIncrease = (userTokenAfter.value.uiAmount! - userTokenBefore.value.uiAmount!) * 1_000_000;
    assert.equal(tokenIncrease, amount.toNumber());
  });

  it("Opens and closes a long market order with profit", async () => {
    // Place long market order with very large size
    const side = 'long';
    const size = new BN(5_000_000); // 5,000,000 tokens (very large size)
    const leverage = new BN(5);
    
    // Log margin account state before placing order
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey);
    console.log('\n=== COLLATERAL TRACKING ===');
    console.log('Before Placing Order:');
    console.log('- Collateral:', marginAccountBefore.collateral.toNumber(), 'tokens');
    console.log('- Allocated Margin:', marginAccountBefore.allocatedMargin.toNumber(), 'tokens');
    console.log('- Available Margin:', (marginAccountBefore.collateral.toNumber() - marginAccountBefore.allocatedMargin.toNumber()), 'tokens');
    
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
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey);
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
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey);
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
    // Place short market order with very large size
    const side = 'short';
    const size = new BN(6_000_000); // 6,000,000 tokens (very large size)
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
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey);
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
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey);
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
    // Place long market order with very large size
    const side = 'long';
    const size = new BN(7_000_000); // 7,000,000 tokens (very large size)
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
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey);
    const positionPda = marginAccountAfterOrder.positions[0];

    // Get the position details
    const position = await sdk.getPosition(positionPda);

    // Update oracle price to create loss scenario for long
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 800 // Lower than entry price for long loss
    });
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey);
    assert.equal(marginAccountAfterClose.positions.length, 0);
    assert.isTrue(marginAccountAfterClose.collateral.lt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfterClose.marginType) {
      assert.equal(marginAccountAfterClose.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a short market order with loss", async () => {
    // Place short market order with very large size
    const side = 'short';
    const size = new BN(8_000_000); // 8,000,000 tokens (very large size)
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
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey);
    const positionPda = marginAccountAfterOrder.positions[0];

    // Get the position details
    const position = await sdk.getPosition(positionPda);

    // Update oracle price to create loss scenario for short
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 1300 // Higher than entry price for short loss
    });
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey);
    assert.equal(marginAccountAfterClose.positions.length, 0);
    assert.isTrue(marginAccountAfterClose.collateral.lt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfterClose.marginType) {
      assert.equal(marginAccountAfterClose.allocatedMargin.toNumber(), 0);
    }
  });

  it("Tests consecutive open and close operations to verify margin accounting", async () => {
    console.log('\n=== CONSECUTIVE ORDER TEST ===');
    
    // Get initial margin account state
    const initialMarginAccount = await sdk.getMarginAccount(keypair.publicKey);
    console.log('\nInitial State:');
    console.log('- Collateral:', initialMarginAccount.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', initialMarginAccount.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (initialMarginAccount.collateral.toNumber() - initialMarginAccount.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Positions:', initialMarginAccount.positions.length);

    // Test 1: Open and close a long position with profit
    console.log('\n--- TEST 1: Long Position with Profit ---');
    
    // Place long order with very large size
    const side1 = 'long';
    const size1 = new BN(5_000_000); // 5,000,000 tokens (very large size)
    const leverage1 = new BN(5);
    
    console.log('Placing long order:', {
      size: size1.toNumber(),
      leverage: leverage1.toNumber(),
      side: side1
    });
    
    const placeOrderTx1 = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side: side1,
      size: size1,
      leverage: leverage1,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx1);

    // Get position and margin account after placing order
    const marginAccountAfterOrder1 = await sdk.getMarginAccount(keypair.publicKey);
    const positionPda1 = marginAccountAfterOrder1.positions[0];
    const position1 = await sdk.getPosition(positionPda1);
    
    console.log('After placing order:');
    console.log('- Collateral:', marginAccountAfterOrder1.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterOrder1.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterOrder1.collateral.toNumber() - marginAccountAfterOrder1.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Position Size:', position1.size.toNumber(), 'tokens');
    console.log('- Position Entry Price:', position1.entryPrice.toNumber());

    // Update oracle price for profit
    const profitPrice1 = 1200; // 20% profit
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: profitPrice1
    });
    console.log('Updated oracle price to:', profitPrice1, 'for profit');

    // Close position
    const closeOrderTx1 = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda1,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx1);

    // Get margin account after closing
    const marginAccountAfterClose1 = await sdk.getMarginAccount(keypair.publicKey);
    console.log('After closing order:');
    console.log('- Collateral:', marginAccountAfterClose1.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterClose1.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterClose1.collateral.toNumber() - marginAccountAfterClose1.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Positions:', marginAccountAfterClose1.positions.length);

    // Verify position is closed
    assert.equal(marginAccountAfterClose1.positions.length, 0);
    assert.equal(marginAccountAfterClose1.allocatedMargin.toNumber(), 0);

    // Test 2: Open and close a short position with profit
    console.log('\n--- TEST 2: Short Position with Profit ---');
    
    // Place short order with realistic size
    const side2 = 'short';
    const size2 = new BN(6_000_000); // 6,000,000 tokens (realistic size)
    const leverage2 = new BN(4);
    
    console.log('Placing short order:', {
      size: size2.toNumber(),
      leverage: leverage2.toNumber(),
      side: side2
    });
    
    const placeOrderTx2 = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side: side2,
      size: size2,
      leverage: leverage2,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx2);

    // Get position and margin account after placing order
    const marginAccountAfterOrder2 = await sdk.getMarginAccount(keypair.publicKey);
    const positionPda2 = marginAccountAfterOrder2.positions[0];
    const position2 = await sdk.getPosition(positionPda2);
    
    console.log('After placing order:');
    console.log('- Collateral:', marginAccountAfterOrder2.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterOrder2.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterOrder2.collateral.toNumber() - marginAccountAfterOrder2.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Position Size:', position2.size.toNumber(), 'tokens');
    console.log('- Position Entry Price:', position2.entryPrice.toNumber());

    // Update oracle price for profit (lower price for short)
    const profitPrice2 = 900; // 10% profit for short
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: profitPrice2
    });
    console.log('Updated oracle price to:', profitPrice2, 'for short profit');

    // Close position
    const closeOrderTx2 = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda2,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx2);

    // Get margin account after closing
    const marginAccountAfterClose2 = await sdk.getMarginAccount(keypair.publicKey);
    console.log('After closing order:');
    console.log('- Collateral:', marginAccountAfterClose2.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterClose2.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterClose2.collateral.toNumber() - marginAccountAfterClose2.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Positions:', marginAccountAfterClose2.positions.length);

    // Verify position is closed
    assert.equal(marginAccountAfterClose2.positions.length, 0);
    assert.equal(marginAccountAfterClose2.allocatedMargin.toNumber(), 0);

    // Test 3: Open and close a long position with loss
    console.log('\n--- TEST 3: Long Position with Loss ---');
    
    // Place long order with realistic size
    const side3 = 'long';
    const size3 = new BN(7_000_000); // 7,000,000 tokens (realistic size)
    const leverage3 = new BN(3);
    
    console.log('Placing long order:', {
      size: size3.toNumber(),
      leverage: leverage3.toNumber(),
      side: side3
    });
    
    const placeOrderTx3 = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side: side3,
      size: size3,
      leverage: leverage3,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx3);

    // Get position and margin account after placing order
    const marginAccountAfterOrder3 = await sdk.getMarginAccount(keypair.publicKey);
    const positionPda3 = marginAccountAfterOrder3.positions[0];
    const position3 = await sdk.getPosition(positionPda3);
    
    console.log('After placing order:');
    console.log('- Collateral:', marginAccountAfterOrder3.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterOrder3.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterOrder3.collateral.toNumber() - marginAccountAfterOrder3.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Position Size:', position3.size.toNumber(), 'tokens');
    console.log('- Position Entry Price:', position3.entryPrice.toNumber());

    // Update oracle price for loss
    const lossPrice3 = 800; // 20% loss
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: lossPrice3
    });
    console.log('Updated oracle price to:', lossPrice3, 'for loss');

    // Close position
    const closeOrderTx3 = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: positionPda3,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx3);

    // Get margin account after closing
    const marginAccountAfterClose3 = await sdk.getMarginAccount(keypair.publicKey);
    console.log('After closing order:');
    console.log('- Collateral:', marginAccountAfterClose3.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', marginAccountAfterClose3.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (marginAccountAfterClose3.collateral.toNumber() - marginAccountAfterClose3.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Positions:', marginAccountAfterClose3.positions.length);

    // Verify position is closed
    assert.equal(marginAccountAfterClose3.positions.length, 0);
    assert.equal(marginAccountAfterClose3.allocatedMargin.toNumber(), 0);

    // Test 4: Try to place another order to verify margin is available
    console.log('\n--- TEST 4: Verify Margin Available for New Order ---');
    
    // Try to place a new order with realistic size
    const side4 = 'long';
    const size4 = new BN(8_000_000); // 8,000,000 tokens (realistic size)
    const leverage4 = new BN(2);
    
    console.log('Attempting to place new order:', {
      size: size4.toNumber(),
      leverage: leverage4.toNumber(),
      side: side4
    });
    
    const placeOrderTx4 = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side: side4,
      size: size4,
      leverage: leverage4,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx4);

    // Get final margin account state
    const finalMarginAccount = await sdk.getMarginAccount(keypair.publicKey);
    const finalPositionPda = finalMarginAccount.positions[0];
    const finalPosition = await sdk.getPosition(finalPositionPda);
    
    console.log('Final state after placing new order:');
    console.log('- Collateral:', finalMarginAccount.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', finalMarginAccount.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (finalMarginAccount.collateral.toNumber() - finalMarginAccount.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Positions:', finalMarginAccount.positions.length);
    console.log('- Final Position Size:', finalPosition.size.toNumber(), 'tokens');

    // Verify the new order was placed successfully
    assert.equal(finalMarginAccount.positions.length, 1);
    assert.isTrue(finalMarginAccount.allocatedMargin.gt(new BN(0)));

    // Close the final position to clean up
    console.log('\nClosing final position to clean up...');
    const closeFinalTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      position: finalPositionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeFinalTx);

    // Verify final cleanup
    const finalCleanupMargin = await sdk.getMarginAccount(keypair.publicKey);
    console.log('After final cleanup:');
    console.log('- Collateral:', finalCleanupMargin.collateral.toNumber() / 1_000_000, 'tokens');
    console.log('- Allocated Margin:', finalCleanupMargin.allocatedMargin.toNumber() / 1_000_000, 'tokens');
    console.log('- Available Margin:', (finalCleanupMargin.collateral.toNumber() - finalCleanupMargin.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
    console.log('- Positions:', finalCleanupMargin.positions.length);

    assert.equal(finalCleanupMargin.positions.length, 0);
    assert.equal(finalCleanupMargin.allocatedMargin.toNumber(), 0);

    console.log('\n=== CONSECUTIVE ORDER TEST COMPLETED SUCCESSFULLY ===');
  });


  it("Liquidates a market order when position becomes undercollateralized", async () => {
    // Place long market order with high leverage and very large size
    const side = 'long';
    const size = new BN(10_000_000); // 10,000,000 tokens (very large size)
    const leverage = new BN(10); // High leverage
    
    // Log margin account state before placing order
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey);
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
    const marginAccountAfterOrder = await sdk.getMarginAccount(keypair.publicKey);
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
    const marginAccountAfterLiquidation = await sdk.getMarginAccount(keypair.publicKey);
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
      const marginAccount = await sdk.getMarginAccount(keypair.publicKey);
      
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
      const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey);
      if (marginAccountAfter.positions.length > 0) {
        console.log('Warning: Some positions could not be closed');
        console.log('Remaining positions:', marginAccountAfter.positions.map(p => p.toBase58()));
      }
    } catch (error) {
      console.log('Error during cleanup:', error.message);
    }
    
    // Reset margin account collateral to a known state (very large amount for very large orders)
    try {
      const marginAccount = await sdk.getMarginAccount(keypair.publicKey);
      const targetCollateral = 500_000_000 * 1_000_000; // 500,000,000 tokens scaled to 6 decimals
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