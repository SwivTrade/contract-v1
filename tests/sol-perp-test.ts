import * as anchor from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, createMint, createAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";
import { PerpetualSwapSDK } from "../sdk/src/index";
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

describe("SOL-PERP Tests", () => {
  // Connection setup
  const connection = new Connection('https://api.testnet.sonic.game/', 'confirmed');
  
  // Keypair setup
  const keypairPath = path.join(__dirname, 'keypair.json');
  const tokenDataPath = path.join(__dirname, 'token-data.json');
  let keypair: Keypair;

  // Market setup
  const marketSymbol = "SOL-PERP-TEST4";
  const initialFundingRate = 0;
  const fundingInterval = 3600;
  const maintenanceMarginRatio = 100; // 1% (changed from 500 to support higher leverage)
  const initialMarginRatio = 200; // 2% (changed from 1000 to support up to 50x leverage)
  const maxLeverage = 50; // Increased from 10 to 50
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

  before(async function() {
    this.timeout(30000); // Set timeout to 30 seconds
    
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
        const amountToMint = Math.floor((100 - currentAmount) * 1_000_000);
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

  it("Initializes oracle and market", async function() {
    this.timeout(30000); // Set timeout to 30 seconds
    try {
      // Check if oracle already exists
      const existingOracle = await sdk.getOracle(marketSymbol);
      console.log('Oracle already exists, updating price...');
      
      // Get current SOL price
      const solPrice = await fetchSolPrice();
      console.log('Updating oracle price to:', solPrice);
      
      // Update oracle price
      await sdk.updateOraclePrice({
        marketSymbol,
        newPrice: solPrice
      });
    } catch (error) {
      // Oracle doesn't exist, create it
      console.log('Initializing new oracle...');
      const solPrice = await fetchSolPrice();
      console.log('Creating oracle with initial price:', solPrice);
      
      await sdk.initializeOracle({
        marketSymbol,
        initialPrice: solPrice
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
      
      // Add delay to ensure market is fully initialized
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  });

  it("Creates a margin account", async function() {
    this.timeout(30000); // Set timeout to 30 seconds
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

  it("Opens and monitors a long position", async function() {
    this.timeout(300000); // 5 minutes for this test since it monitors for 5 minutes
    
    try {
      // First deposit collateral
      console.log('\nDepositing collateral...');
      const depositTx = await sdk.buildDepositCollateralTransaction({
        marginAccount: marginAccountPda,
        market: marketPda,
        userTokenAccount,
        vault: marketVaultPda,
        mint: tokenMint,
        amount: new BN(50_000_000) // 50 tokens
      }, keypair.publicKey);

      await provider.sendAndConfirm(depositTx);
      console.log('Collateral deposited successfully\n');

      // Get margin account state before placing order
      const marginAccountBefore = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      
      console.log('=== COLLATERAL TRACKING ===');
      console.log('Before Placing Order:');
      console.log('- Collateral:', marginAccountBefore.collateral.toNumber() / 1_000_000, 'tokens');
      console.log('- Allocated Margin:', marginAccountBefore.allocatedMargin.toNumber() / 1_000_000, 'tokens');
      console.log('- Available Margin:', (marginAccountBefore.collateral.toNumber() - marginAccountBefore.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
      console.log('- Total Margin:', marginAccountBefore.collateral.toNumber() / 1_000_000, 'tokens');
      
      // Place long market order with larger size
      const side = 'long';
      const size = new BN(100_000); // 0.1 tokens (doubled from before)
      const leverage = new BN(50); // Changed from 5 to 50 to test higher leverage
      
      console.log('\nPlacing order with:');
      console.log('- Size:', size.toNumber() / 1_000_000, 'tokens');
      console.log('- Leverage:', leverage.toNumber(), 'x');
      
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
      console.log('\nAfter Placing Order:');
      console.log('- Collateral:', marginAccountAfterOrder.collateral.toNumber() / 1_000_000, 'tokens');
      console.log('- Allocated Margin:', marginAccountAfterOrder.allocatedMargin.toNumber() / 1_000_000, 'tokens');
      console.log('- Available Margin:', (marginAccountAfterOrder.collateral.toNumber() - marginAccountAfterOrder.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
      console.log('- Total Margin:', marginAccountAfterOrder.collateral.toNumber() / 1_000_000, 'tokens');
      console.log('- Margin Change:', (marginAccountAfterOrder.allocatedMargin.toNumber() - marginAccountBefore.allocatedMargin.toNumber()) / 1_000_000, 'tokens');

      const positionPda = marginAccountAfterOrder.positions[0];

      // Verify position was created
      const position = await sdk.getPosition(positionPda);
      console.log('\nPosition Details:');
      console.log('- PDA:', positionPda.toBase58());
      console.log('- Size:', position.size.toNumber() / 1_000_000, 'tokens');
      console.log('- Leverage:', position.leverage.toNumber(), 'x');
      console.log('- Is Open:', position.isOpen);
      console.log('- Entry Price:', position.entryPrice.toNumber());
      console.log('- Position Collateral:', position.collateral.toNumber() / 1_000_000, 'tokens');
      console.log('- Required Margin:', (position.size.toNumber() * position.entryPrice.toNumber() / position.leverage.toNumber()) / 1_000_000, 'tokens');

      console.log('\nMonitoring position for 2 minutes...\n');

      // Monitor position for 2 minutes
      const startTime = Date.now();
      const endTime = startTime + (2 * 60 * 1000); // 2 minutes

      while (Date.now() < endTime) {
        // Get current price
        const currentPrice = await fetchSolPrice();
        console.log('\nCurrent price:', currentPrice);
        
        // Update oracle price to match current price
        await sdk.updateOraclePrice({
          marketSymbol,
          newPrice: currentPrice
        });
        console.log('Updated oracle price to:', currentPrice);

        // Get position details
        const currentPosition = await sdk.getPosition(positionPda);
        const currentMarginAccount = await sdk.getMarginAccount(keypair.publicKey, marketPda);
        
        // Calculate PnL
        const rawEntryValue = currentPosition.size.toNumber() * currentPosition.entryPrice.toNumber();
        const rawCurrentValue = currentPosition.size.toNumber() * currentPrice;
        
        const rawPnl = currentPosition.side === 'long' 
          ? rawCurrentValue - rawEntryValue
          : rawEntryValue - rawCurrentValue;
        
        const pnl = Math.floor(rawPnl / 1_000_000);
        
        console.log('\n=== DETAILED PNL TRACKING ===');
        console.log('Raw Calculations:');
        console.log('- Position Size:', currentPosition.size.toNumber() / 1_000_000, 'tokens');
        console.log('- Entry Price:', currentPosition.entryPrice.toNumber());
        console.log('- Current Price:', currentPrice);
        console.log('- Raw Entry Value:', rawEntryValue);
        console.log('- Raw Current Value:', rawCurrentValue);
        
        console.log('\nScaled Calculations:');
        console.log('- Raw PnL:', rawPnl);
        console.log('- Scaled PnL:', pnl);
        
        console.log('\nPosition State:');
        console.log('- Position Size:', currentPosition.size.toNumber() / 1_000_000, 'tokens');
        console.log('- Position Collateral:', currentPosition.collateral.toNumber() / 1_000_000, 'tokens');
        console.log('- Position Leverage:', currentPosition.leverage.toNumber(), 'x');
        console.log('- Position Entry Price:', currentPosition.entryPrice.toNumber());
        console.log('- Position Realized PnL:', currentPosition.realizedPnl.toNumber() / 1_000_000, 'tokens');
        
        console.log('\nMargin Account State:');
        console.log('- Total Collateral:', currentMarginAccount.collateral.toNumber() / 1_000_000, 'tokens');
        console.log('- Allocated Margin:', currentMarginAccount.allocatedMargin.toNumber() / 1_000_000, 'tokens');
        console.log('- Available Margin:', (currentMarginAccount.collateral.toNumber() - currentMarginAccount.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
        console.log('- Required Margin:', (currentPosition.size.toNumber() * currentPrice / currentPosition.leverage.toNumber()) / 1_000_000, 'tokens');
        console.log('- Raw Required Margin:', (currentPosition.size.toNumber() * currentPrice / currentPosition.leverage.toNumber()), 'raw units');
        
        console.log('\nPnL Impact:');
        const expectedPnL = (currentPosition.size.toNumber() * (currentPrice - currentPosition.entryPrice.toNumber())) / 1_000_000;
        console.log('- Expected PnL:', expectedPnL.toFixed(6), 'tokens');
        console.log('- Actual PnL:', pnl, 'tokens');
        console.log('- PnL Difference:', (expectedPnL - pnl).toFixed(6), 'tokens');
        console.log('=== END PNL TRACKING ===\n');
        
        // Wait 15 seconds before next update
        await new Promise(resolve => setTimeout(resolve, 15000));
      }

      // Get final price and update oracle one last time
      const finalPrice = await fetchSolPrice();
      console.log('\nFinal price:', finalPrice);
      await sdk.updateOraclePrice({
        marketSymbol,
        newPrice: finalPrice
      });
      console.log('Updated oracle to final price:', finalPrice);

      // Get position state before closing
      const positionBeforeClose = await sdk.getPosition(positionPda);
      const marginAccountBeforeClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      
      console.log('\n=== FINAL POSITION STATE ===');
      console.log('Position Details:');
      console.log('- Size:', positionBeforeClose.size.toNumber() / 1_000_000, 'tokens');
      console.log('- Entry Price:', positionBeforeClose.entryPrice.toNumber());
      console.log('- Current Price:', finalPrice);
      console.log('- Position PnL:', (positionBeforeClose.size.toNumber() * (finalPrice - positionBeforeClose.entryPrice.toNumber()) / 1_000_000).toFixed(6), 'tokens');
      console.log('- Position Collateral:', positionBeforeClose.collateral.toNumber() / 1_000_000, 'tokens');
      console.log('- Position Leverage:', positionBeforeClose.leverage.toNumber(), 'x');
      console.log('- Position Realized PnL:', positionBeforeClose.realizedPnl.toNumber() / 1_000_000, 'tokens');
      
      console.log('\nMargin Account Before Close:');
      console.log('- Total Collateral:', marginAccountBeforeClose.collateral.toNumber() / 1_000_000, 'tokens');
      console.log('- Allocated Margin:', marginAccountBeforeClose.allocatedMargin.toNumber() / 1_000_000, 'tokens');
      console.log('- Available Margin:', (marginAccountBeforeClose.collateral.toNumber() - marginAccountBeforeClose.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
      console.log('- Required Margin:', (positionBeforeClose.size.toNumber() * finalPrice / positionBeforeClose.leverage.toNumber()) / 1_000_000, 'tokens');
      console.log('=== END FINAL STATE ===\n');

      // Close position
      console.log('\nClosing position...');
      const closeOrderTx = await sdk.buildCloseMarketOrderTransaction({
        market: marketPda,
        position: positionPda,
        marginAccount: marginAccountPda,
        oracleAccount: mockOraclePda
      }, keypair.publicKey);

      await provider.sendAndConfirm(closeOrderTx);

      // Verify the margin account state after closing
      const marginAccountAfterClose = await sdk.getMarginAccount(keypair.publicKey, marketPda);
      console.log('\n=== FINAL MARGIN ACCOUNT STATE ===');
      console.log('After Closing Position:');
      console.log('- Total Collateral:', marginAccountAfterClose.collateral.toNumber() / 1_000_000, 'tokens');
      console.log('- Allocated Margin:', marginAccountAfterClose.allocatedMargin.toNumber() / 1_000_000, 'tokens');
      console.log('- Available Margin:', (marginAccountAfterClose.collateral.toNumber() - marginAccountAfterClose.allocatedMargin.toNumber()) / 1_000_000, 'tokens');
      console.log('- Total PnL:', (marginAccountAfterClose.collateral.toNumber() - marginAccountBefore.collateral.toNumber()) / 1_000_000, 'tokens');
      console.log('- Expected PnL:', (positionBeforeClose.size.toNumber() * (finalPrice - positionBeforeClose.entryPrice.toNumber()) / 1_000_000).toFixed(6), 'tokens');
      console.log('- PnL Difference:', ((marginAccountAfterClose.collateral.toNumber() - marginAccountBefore.collateral.toNumber()) / 1_000_000 - (positionBeforeClose.size.toNumber() * (finalPrice - positionBeforeClose.entryPrice.toNumber()) / 1_000_000)).toFixed(6), 'tokens');
      console.log('=== END FINAL MARGIN ACCOUNT STATE ===\n');
      
      assert.equal(marginAccountAfterClose.positions.length, 0);
      
      if ('isolated' in marginAccountAfterClose.marginType) {
        assert.equal(marginAccountAfterClose.allocatedMargin.toNumber(), 0);
      }
    } catch (error) {
      console.error('Error opening and monitoring position:', error);
      throw error;
    }
  });

  // Helper function to fetch SOL price
  async function fetchSolPrice(): Promise<number> {
    // Simulate a more volatile asset with larger price movements
    // Start at 1000 and move up/down by larger amounts
    const basePrice = 1000;
    const volatility = 50; // 5% volatility
    const randomMove = (Math.random() * volatility * 2) - volatility;
    return basePrice + randomMove;
  }
}); 