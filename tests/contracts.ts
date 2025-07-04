import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";
import idl from "../target/idl/contracts.json"; // Adjust path if different

describe("contracts", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;

  // Replace with your actual deployed program ID
  const programId = new PublicKey("s2zmrr2SqcwCdeAGRiPFftDSV9CRhXqAbRcMgmh4goC"); // e.g., "7vW3vX4QDGzqXwN2cZ9zZ8r5g5e5e5e5e5e5e5e5e5e5e5e5e5e5"
  let program: Program;

  // Use a devnet Pyth SOL/USD price update feed (for pyth-solana-receiver-sdk)
  const pythPriceUpdate = new PublicKey("6FteNKKPH2WHLr7rP3Z8X6SWsKo2PhCRe6cYx2c2s5wL"); // SOL/USD devnet

  // Market setup
  const marketSymbol = "SOL-PERP";
  const initialFundingRate = 0;
  const fundingInterval = 3600;
  const maintenanceMarginRatio = 500; // 5%
  const initialMarginRatio = 1000; // 10%
  const maxLeverage = 10;

  // PDAs and bumps
  let marketPda: PublicKey;
  let marketBump: number;
  let positionPda: PublicKey;
  let positionBump: number;
  let marginAccountPda: PublicKey;
  let marginAccountBump: number;

  // Token setup
  let tokenMint: PublicKey;
  let userTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;
  const mintAuthority = Keypair.generate();

  before(async () => {
    // Use the imported IDL directly
    program = new Program(idl, programId, provider);

    // Initialize market PDA
    [marketPda, marketBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(marketSymbol)],
      programId
    );

    // Token setup
    tokenMint = await createMint(
      provider.connection,
      wallet.payer,
      mintAuthority.publicKey,
      null,
      6 // 6 decimals
    );
    userTokenAccount = await createAccount(
      provider.connection,
      wallet.payer,
      tokenMint,
      wallet.publicKey
    );
    vaultTokenAccount = await createAccount(
      provider.connection,
      wallet.payer,
      tokenMint,
      marketPda // Vault owned by market PDA
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      tokenMint,
      userTokenAccount,
      mintAuthority,
      100_000_000 // 100 tokens
    );

    // Initialize margin account PDA
    [marginAccountPda, marginAccountBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("margin_account"), wallet.publicKey.toBuffer(), marketPda.toBuffer()],
      programId
    );

    // Initialize position PDA
    [positionPda, positionBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
      programId
    );
  });

  it("Initializes a market", async () => {
    await program.methods
      .initializeMarket(
        marketSymbol,
        new anchor.BN(initialFundingRate),
        new anchor.BN(fundingInterval),
        new anchor.BN(maintenanceMarginRatio),
        new anchor.BN(initialMarginRatio),
        new anchor.BN(maxLeverage),
        marketBump
      )
      .accounts({
        market: marketPda,
        authority: wallet.publicKey,
        oracleAccount: pythPriceUpdate,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const marketAccount = await program.account.market.fetch(marketPda);
    assert.equal(marketAccount.authority.toString(), wallet.publicKey.toString());
    assert.equal(marketAccount.marketSymbol, marketSymbol);
    assert.equal(marketAccount.fundingRate.toNumber(), initialFundingRate);
    assert.equal(marketAccount.fundingInterval.toNumber(), fundingInterval);
    assert.equal(marketAccount.maintenanceMarginRatio.toNumber(), maintenanceMarginRatio);
    assert.equal(marketAccount.initialMarginRatio.toNumber(), initialMarginRatio);
    assert.equal(marketAccount.maxLeverage.toNumber(), maxLeverage);
    assert.ok(marketAccount.isActive);
    assert.equal(marketAccount.bump, marketBump);
  });

  it("Creates a margin account", async () => {
    await program.methods
      .createMarginAccount(marginAccountBump)
      .accounts({
        owner: wallet.publicKey,
        marginAccount: marginAccountPda,
        market: marketPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const marginAccount = await program.account.marginAccount.fetch(marginAccountPda);
    assert.equal(marginAccount.owner.toString(), wallet.publicKey.toString());
    assert.equal(marginAccount.perpMarket.toString(), marketPda.toString());
    assert.equal(marginAccount.collateral.toNumber(), 0);
    assert.equal(marginAccount.positions.length, 0);
    assert.equal(marginAccount.orders.length, 0);
    assert.equal(marginAccount.bump, marginAccountBump);
  });

  it("Deposits collateral", async () => {
    const amount = new anchor.BN(50_000_000); // 50 tokens

    await program.methods
      .depositCollateral(amount)
      .accounts({
        owner: wallet.publicKey,
        marginAccount: marginAccountPda,
        userTokenAccount: userTokenAccount,
        vaultTokenAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const marginAccount = await program.account.marginAccount.fetch(marginAccountPda);
    assert.equal(marginAccount.collateral.toNumber(), amount.toNumber());

    const userTokenBalance = await provider.connection.getTokenAccountBalance(userTokenAccount);
    assert.equal(userTokenBalance.value.uiAmount, 50); // 100 - 50 = 50 remaining
  });

  it("Opens a position to enable withdrawal test", async () => {
    const side = { long: {} };
    const size = new anchor.BN(1_000_000); // 1 token
    const leverage = new anchor.BN(5);

    await program.methods
      .openPosition(side, size, leverage, positionBump)
      .accounts({
        market: marketPda,
        position: positionPda,
        marginAccount: marginAccountPda,
        trader: wallet.publicKey,
        oracleAccount: pythPriceUpdate,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.trader.toString(), wallet.publicKey.toString());
    assert.equal(positionAccount.market.toString(), marketPda.toString());
    assert.deepEqual(positionAccount.side, side);
    assert.equal(positionAccount.size.toNumber(), size.toNumber());
    assert.ok(positionAccount.isOpen);
    assert.equal(positionAccount.leverage.toNumber(), leverage.toNumber());
    assert.equal(positionAccount.bump, positionBump);

    const marginAccount = await program.account.marginAccount.fetch(marginAccountPda);
    assert.ok(marginAccount.positions.includes(positionPda));
  });

  it("Withdraws collateral", async () => {
    const amount = new anchor.BN(10_000_000); // 10 tokens

    await program.methods
      .withdrawCollateral(amount)
      .accounts({
        owner: wallet.publicKey,
        marginAccount: marginAccountPda,
        userTokenAccount: userTokenAccount,
        vaultTokenAccount: vaultTokenAccount,
        market: marketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: positionPda, isWritable: true, isSigner: false }])
      .rpc();

    const marginAccount = await program.account.marginAccount.fetch(marginAccountPda);
    assert.equal(marginAccount.collateral.toNumber(), 40_000_000); // 50 - 10 = 40

    const userTokenBalance = await provider.connection.getTokenAccountBalance(userTokenAccount);
    assert.equal(userTokenBalance.value.uiAmount, 60); // 50 + 10 = 60
  });
});