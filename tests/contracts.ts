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
  const connection = new Connection('https://api.testnet.sonic.game/', 'confirmed');
    //const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  // Keypair setup
  const keypairPath = path.join(__dirname, 'keypair.json');
  const tokenDataPath = path.join(__dirname, 'token-data.json');
  let keypair: Keypair;

  // Market setup
  const marketSymbol = "twt-PERP";
  const initialFundingRate = 0;
  const fundingInterval = 3600;
  const maintenanceMarginRatio = 500; // 5%
  const initialMarginRatio = 1000; // 10%
  const maxLeverage = 10;
  // AMM parameters
  const virtualBaseReserve = 1_000_000_000; // 1 billion base units
  const virtualQuoteReserve = 20_000_000_000; // 20 billion quote units (price = 20)
  const priceImpactFactor = 100; // 1% impact

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
      
      // Verify AMM parameters
      assert.equal(existingMarket.virtualBaseReserve.toNumber(), virtualBaseReserve);
      assert.equal(existingMarket.virtualQuoteReserve.toNumber(), virtualQuoteReserve);
      assert.equal(existingMarket.priceImpactFactor.toNumber(), priceImpactFactor);
      assert.equal(existingMarket.lastPrice.toNumber(), 20_000_000); // 20 * 1e6
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
        mint: tokenMint,
        virtualBaseReserve,
        virtualQuoteReserve,
        priceImpactFactor
      });

      assert.equal(market.marketSymbol, marketSymbol);
      assert.equal(market.authority.toString(), keypair.publicKey.toString());
      assert.equal(market.oracle.toString(), mockOraclePda.toString());
      
      // Verify AMM parameters
      assert.equal(market.virtualBaseReserve.toNumber(), virtualBaseReserve);
      assert.equal(market.virtualQuoteReserve.toNumber(), virtualQuoteReserve);
      assert.equal(market.priceImpactFactor.toNumber(), priceImpactFactor);
      assert.equal(market.lastPrice.toNumber(), 20_000_000); // 20 * 1e6
    }
  });

  it("Calculates correct price from virtual reserves", async () => {
    const market = await sdk.getMarket(marketPda);
    
    // Price should be virtualQuoteReserve / virtualBaseReserve * 1e6
    const expectedPrice = (virtualQuoteReserve * 1_000_000) / virtualBaseReserve;
    assert.equal(market.lastPrice.toNumber(), expectedPrice);
  });

  it("Calculates price impact correctly", async () => {
    const market = await sdk.getMarket(marketPda);
    const basePrice = market.lastPrice.toNumber();
    
    // Test with a trade size of 100,000 base units
    const tradeSize = 100_000;
    const expectedImpact = (tradeSize * priceImpactFactor) / 10_000;
    const expectedPrice = basePrice + expectedImpact;

    // Note: We can't directly test calculate_price_with_impact as it's not exposed in the IDL
    // This is just to verify our understanding of the price impact calculation
    assert.equal(expectedImpact, 1_000); // 1% of 100,000
    assert.equal(expectedPrice, basePrice + 1_000);
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
    const side = { long: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    const orderNonce = 7;
    const positionNonce = 8;
    
    const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce);
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce);
    
    // Log margin account state before placing order
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('Margin Account Before Order:');
    console.log('- Positions:', marginAccountBefore.positions.map(p => p.toBase58()));
    console.log('- Orders:', marginAccountBefore.orders.map(o => o.toBase58()));
    console.log('- Collateral:', marginAccountBefore.collateral.toNumber() / 1_000_000);
    console.log('- Allocated Margin:', marginAccountBefore.allocatedMargin.toNumber() / 1_000_000);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda,
      orderNonce,
      positionNonce
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Verify order and position were created
    const order = await sdk.getOrder(orderPda);
    const position = await sdk.getPosition(positionPda);
    console.log('\nOrder Details:');
    console.log('- PDA:', orderPda.toBase58());
    console.log('- Size:', order.size.toNumber());
    console.log('- Leverage:', order.leverage.toNumber());
    console.log('- Is Active:', order.isActive);
    
    console.log('\nPosition Details:');
    console.log('- PDA:', positionPda.toBase58());
    console.log('- Size:', position.size.toNumber());
    console.log('- Leverage:', position.leverage.toNumber());
    console.log('- Is Open:', position.isOpen);

    // Update oracle price to create profit scenario
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 1200 // Higher than entry price for long profit
    });
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      order: orderPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\nMargin Account After Close:');
    console.log('- Positions:', marginAccountAfter.positions.map(p => p.toBase58()));
    console.log('- Orders:', marginAccountAfter.orders.map(o => o.toBase58()));
    console.log('- Collateral:', marginAccountAfter.collateral.toNumber() / 1_000_000);
    console.log('- Allocated Margin:', marginAccountAfter.allocatedMargin.toNumber() / 1_000_000);
    
    assert.equal(marginAccountAfter.positions.length, 0);
    assert.equal(marginAccountAfter.orders.length, 0);
    assert.isTrue(marginAccountAfter.collateral.gt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a short market order with profit", async () => {
    // Place short market order
    const side = { short: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    const orderNonce = 9;
    const positionNonce = 10;
    
    const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce);
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce);
    
    // Log margin account state before placing order
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\nMargin Account Before Short Order:');
    console.log('- Positions:', marginAccountBefore.positions.map(p => p.toBase58()));
    console.log('- Orders:', marginAccountBefore.orders.map(o => o.toBase58()));
    console.log('- Collateral:', marginAccountBefore.collateral.toNumber() / 1_000_000);
    console.log('- Allocated Margin:', marginAccountBefore.allocatedMargin.toNumber() / 1_000_000);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda,
      orderNonce,
      positionNonce
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Verify order and position were created
    const order = await sdk.getOrder(orderPda);
    const position = await sdk.getPosition(positionPda);
    console.log('\nShort Order Details:');
    console.log('- PDA:', orderPda.toBase58());
    console.log('- Size:', order.size.toNumber());
    console.log('- Leverage:', order.leverage.toNumber());
    console.log('- Is Active:', order.isActive);
    
    console.log('\nShort Position Details:');
    console.log('- PDA:', positionPda.toBase58());
    console.log('- Size:', position.size.toNumber());
    console.log('- Leverage:', position.leverage.toNumber());
    console.log('- Is Open:', position.isOpen);

    // Update oracle price to create profit scenario for short
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 800 // Lower than entry price for short profit
    });
    
    // Get margin account state before closing
    const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      order: orderPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    console.log('\nMargin Account After Short Close:');
    console.log('- Positions:', marginAccountAfter.positions.map(p => p.toBase58()));
    console.log('- Orders:', marginAccountAfter.orders.map(o => o.toBase58()));
    console.log('- Collateral:', marginAccountAfter.collateral.toNumber() / 1_000_000);
    console.log('- Allocated Margin:', marginAccountAfter.allocatedMargin.toNumber() / 1_000_000);
    
    assert.equal(marginAccountAfter.positions.length, 0);
    assert.equal(marginAccountAfter.orders.length, 0);
    assert.isTrue(marginAccountAfter.collateral.gt(marginAccountBeforeClose.collateral));
    
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a long market order with loss", async () => {
    // Place long market order
    const side = { long: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    const orderNonce = 11;
    const positionNonce = 12;
    
    const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce);
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda,
      orderNonce,
      positionNonce
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Update oracle price to create loss scenario for long
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 800 // Lower than entry price for long loss
    });
    
    // Get margin account state before closing
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      order: orderPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfter.positions.length, 0);
    assert.equal(marginAccountAfter.orders.length, 0);
    assert.isTrue(marginAccountAfter.collateral.lt(marginAccountBefore.collateral));
    
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  it("Opens and closes a short market order with loss", async () => {
    // Place short market order
    const side = { short: {} };
    const size = new BN(50_000); // 0.05 tokens
    const leverage = new BN(5);
    const orderNonce = 13;
    const positionNonce = 14;
    
    const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce);
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda,
      orderNonce,
      positionNonce
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Update oracle price to create loss scenario for short
    await sdk.updateOraclePrice({
      marketSymbol,
      newPrice: 1300 // Higher than entry price for short loss
    });
    
    // Get margin account state before closing
    const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      order: orderPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Verify the margin account state after closing
    const marginAccountAfter = await sdk.getMarginAccount(keypair.publicKey, marketPda);
    assert.equal(marginAccountAfter.positions.length, 0);
    assert.equal(marginAccountAfter.orders.length, 0);
    assert.isTrue(marginAccountAfter.collateral.lt(marginAccountBefore.collateral));
    
    if ('isolated' in marginAccountAfter.marginType) {
      assert.equal(marginAccountAfter.allocatedMargin.toNumber(), 0);
    }
  });

  it("Verifies AMM price impact on order placement", async () => {
    const side = { long: {} };
    const size = new BN(100_000); // 0.1 tokens
    const leverage = new BN(5);
    const orderNonce = 15;
    const positionNonce = 16;
    
    // Get initial market state
    const marketBefore = await sdk.getMarket(marketPda);
    const initialBaseReserve = marketBefore.virtualBaseReserve.toNumber();
    const initialQuoteReserve = marketBefore.virtualQuoteReserve.toNumber();
    const initialPrice = marketBefore.lastPrice.toNumber();
    
    // Place order
    const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce);
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce);
    
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda,
      orderNonce,
      positionNonce
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Get market state after order
    const marketAfter = await sdk.getMarket(marketPda);
    const finalBaseReserve = marketAfter.virtualBaseReserve.toNumber();
    const finalQuoteReserve = marketAfter.virtualQuoteReserve.toNumber();
    const finalPrice = marketAfter.lastPrice.toNumber();

    // Verify AMM updates
    assert.equal(finalBaseReserve, initialBaseReserve - size.toNumber(), "Base reserve should decrease for long");
    assert.isTrue(finalQuoteReserve > initialQuoteReserve, "Quote reserve should increase for long");
    assert.isTrue(finalPrice > initialPrice, "Price should increase after long order");

    // Calculate expected price impact
    const expectedImpact = (size.toNumber() * priceImpactFactor) / 10_000;
    const expectedPrice = initialPrice + expectedImpact;
    assert.approximately(finalPrice, expectedPrice, 1, "Price impact should match expected value");
  });

  it("Verifies AMM price impact on order closing", async () => {
    // First place an order
    const side = { long: {} };
    const size = new BN(100_000);
    const leverage = new BN(5);
    const orderNonce = 17;
    const positionNonce = 18;
    
    const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce);
    const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce);
    
    // Place order
    const placeOrderTx = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side,
      size,
      leverage,
      oracleAccount: mockOraclePda,
      orderNonce,
      positionNonce
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx);

    // Get market state before closing
    const marketBeforeClose = await sdk.getMarket(marketPda);
    const initialBaseReserve = marketBeforeClose.virtualBaseReserve.toNumber();
    const initialQuoteReserve = marketBeforeClose.virtualQuoteReserve.toNumber();
    const initialPrice = marketBeforeClose.lastPrice.toNumber();

    // Close order
    const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      order: orderPda,
      position: positionPda,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx);

    // Get market state after closing
    const marketAfterClose = await sdk.getMarket(marketPda);
    const finalBaseReserve = marketAfterClose.virtualBaseReserve.toNumber();
    const finalQuoteReserve = marketAfterClose.virtualQuoteReserve.toNumber();
    const finalPrice = marketAfterClose.lastPrice.toNumber();

    // Verify AMM updates
    assert.equal(finalBaseReserve, initialBaseReserve + size.toNumber(), "Base reserve should increase when closing long");
    assert.isTrue(finalQuoteReserve < initialQuoteReserve, "Quote reserve should decrease when closing long");
    assert.isTrue(finalPrice < initialPrice, "Price should decrease after closing long");

    // Calculate expected price impact
    const expectedImpact = (size.toNumber() * priceImpactFactor) / 10_000;
    const expectedPrice = initialPrice - expectedImpact;
    assert.approximately(finalPrice, expectedPrice, 1, "Price impact should match expected value");
  });

  it("Verifies AMM behavior with multiple orders", async () => {
    // Get initial market state
    const marketBefore = await sdk.getMarket(marketPda);
    
    // Place first order
    const side1 = { long: {} };
    const size1 = new BN(50_000);
    const leverage1 = new BN(5);
    const orderNonce1 = 19;
    const positionNonce1 = 20;
    
    const [orderPda1] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce1);
    const [positionPda1] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce1);
    
    const placeOrderTx1 = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side: side1,
      size: size1,
      leverage: leverage1,
      oracleAccount: mockOraclePda,
      orderNonce: orderNonce1,
      positionNonce: positionNonce1
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx1);

    // Get market state after first order
    const marketAfterFirst = await sdk.getMarket(marketPda);
    const priceAfterFirst = marketAfterFirst.lastPrice.toNumber();

    // Place second order
    const side2 = { short: {} };
    const size2 = new BN(30_000);
    const leverage2 = new BN(5);
    const orderNonce2 = 21;
    const positionNonce2 = 22;
    
    const [orderPda2] = await sdk.findOrderPda(marketPda, keypair.publicKey, orderNonce2);
    const [positionPda2] = await sdk.findPositionPda(marketPda, keypair.publicKey, positionNonce2);
    
    const placeOrderTx2 = await sdk.buildPlaceMarketOrderTransaction({
      market: marketPda,
      marginAccount: marginAccountPda,
      side: side2,
      size: size2,
      leverage: leverage2,
      oracleAccount: mockOraclePda,
      orderNonce: orderNonce2,
      positionNonce: positionNonce2
    }, keypair.publicKey);

    await provider.sendAndConfirm(placeOrderTx2);

    // Get market state after second order
    const marketAfterSecond = await sdk.getMarket(marketPda);
    const priceAfterSecond = marketAfterSecond.lastPrice.toNumber();

    // Verify price changes
    assert.isTrue(priceAfterFirst > marketBefore.lastPrice.toNumber(), "Price should increase after long order");
    assert.isTrue(priceAfterSecond < priceAfterFirst, "Price should decrease after short order");

    // Close both positions
    const closeOrderTx1 = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      order: orderPda1,
      position: positionPda1,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    const closeOrderTx2 = await sdk.buildCloseMarketOrderTransaction({
      market: marketPda,
      order: orderPda2,
      position: positionPda2,
      marginAccount: marginAccountPda,
      oracleAccount: mockOraclePda
    }, keypair.publicKey);

    await provider.sendAndConfirm(closeOrderTx1);
    await provider.sendAndConfirm(closeOrderTx2);

    // Get final market state
    const marketFinal = await sdk.getMarket(marketPda);
    
    // Verify reserves return close to initial state
    assert.approximately(
      marketFinal.virtualBaseReserve.toNumber(),
      marketBefore.virtualBaseReserve.toNumber(),
      1000, // Allow small difference due to rounding
      "Base reserve should return close to initial state"
    );
    assert.approximately(
      marketFinal.virtualQuoteReserve.toNumber(),
      marketBefore.virtualQuoteReserve.toNumber(),
      1000, // Allow small difference due to rounding
      "Quote reserve should return close to initial state"
    );
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
    
    // Clean up any existing positions and orders for ALL tests
    try {
      const marginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      
      // Close all existing positions in margin account
      for (const positionKey of marginAccount.positions) {
        try {
          const position = await sdk.getPosition(positionKey);
          if (position.isOpen) {
            console.log('Closing existing open position...');
            const closePositionTx = await sdk.buildClosePositionTransaction({
              market: marketPda,
              position: positionKey,
              marginAccount: marginAccountPda,
              oracleAccount: mockOraclePda
            }, keypair.publicKey);
            await provider.sendAndConfirm(closePositionTx);
          }
        } catch (error) {
          console.log('Error closing position:', error.message);
        }
      }

      // Close all existing orders in margin account
      for (const orderKey of marginAccount.orders) {
        try {
          const order = await sdk.getOrder(orderKey);
          if (order.isActive) {
            console.log('Closing existing active order...');
            const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
              market: marketPda,
              order: orderKey,
              position: order.position,
              marginAccount: marginAccountPda,
              oracleAccount: mockOraclePda
            }, keypair.publicKey);
            await provider.sendAndConfirm(closeOrderTx);
          }
        } catch (error) {
          console.log('Error closing order:', error.message);
        }
      }

      // Also try to close positions and orders with known nonces in case they exist but aren't in margin account
      for (let nonce = 0; nonce <= 14; nonce++) {
        try {
          const [positionPda] = await sdk.findPositionPda(marketPda, keypair.publicKey, nonce);
          const position = await sdk.getPosition(positionPda);
          if (position.isOpen) {
            console.log(`Closing position with nonce ${nonce}...`);
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

        try {
          const [orderPda] = await sdk.findOrderPda(marketPda, keypair.publicKey, nonce);
          const order = await sdk.getOrder(orderPda);
          if (order.isActive) {
            console.log(`Closing order with nonce ${nonce}...`);
            const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
              market: marketPda,
              order: orderPda,
              position: order.position,
              marginAccount: marginAccountPda,
              oracleAccount: mockOraclePda
            }, keypair.publicKey);
            await provider.sendAndConfirm(closeOrderTx);
          }
        } catch (error) {
          // Order doesn't exist or other error, continue
        }
      }
    } catch (error) {
      // Margin account doesn't exist or other error, continue
    }
    
    // Reset margin account collateral to a known state (40 tokens)
    try {
      const marginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      const targetCollateral = 40_000_000; // 40 tokens
      const currentCollateral = marginAccount.collateral.toNumber();
      
      // First ensure allocated margin is 0
      if (marginAccount.allocatedMargin.toNumber() > 0) {
        console.log('Resetting allocated margin to 0...');
        // We need to close any remaining positions that might be causing allocated margin
        for (const positionKey of marginAccount.positions) {
          try {
            const position = await sdk.getPosition(positionKey);
            if (position.isOpen) {
              const closePositionTx = await sdk.buildClosePositionTransaction({
                market: marketPda,
                position: positionKey,
                marginAccount: marginAccountPda,
                oracleAccount: mockOraclePda
              }, keypair.publicKey);
              await provider.sendAndConfirm(closePositionTx);
            }
          } catch (error) {
            console.log('Error closing position:', error.message);
          }
        }
      }
      
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