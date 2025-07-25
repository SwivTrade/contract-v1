# PerpetualSwap SDK

A TypeScript SDK for interacting with the PerpetualSwap protocol on multiple networks.

## Features

- Support for multiple networks (Sonic Testnet, Solana Devnet, Localnet)
- Admin operations (market initialization, oracle management)
- User operations (position management, collateral operations)
- Transaction building for client-side signing
- Type-safe interactions with the protocol

## Network Support

The SDK supports the following networks:

| Network | RPC URL | Contracts Program ID | Mock Oracle Program ID |
|---------|---------|---------------------|----------------------|
| Sonic Testnet | `https://api.testnet.sonic.game/` | `9wdJq5R7VUuXDrAZBnXfDqc1vW6nwAW5aYneMKiryppz` | `F7r5C99gqsAXgsFJjKQD2KuEGVXgsXaYJgG9nn43cdfk` |
| Solana Devnet | `https://api.devnet.solana.com` | `9wdJq5R7VUuXDrAZBnXfDqc1vW6nwAW5aYneMKiryppz` | `F7r5C99gqsAXgsFJjKQD2KuEGVXgsXaYJgG9nn43cdfk` |
| Localnet | `http://localhost:8899` | `2nga8op3u3j7Df7wsQv2n5hkRqjEFLjkWGGAfn4cHsfy` | `G2EDsqC3igU7f1PgvZgTSLdAMTn9qmwEq7y8Z92hFTCH` |

## Installation

```bash
npm install @perpetualswap/sdk
```

## Basic Usage

### 1. Initialize SDK for a specific network

```typescript
import { PerpetualSwapSDK, Network } from '@perpetualswap/sdk';

// For Sonic Testnet
const sdk = PerpetualSwapSDK.createForNetwork(Network.SONIC_TESTNET);

// For Solana Devnet
const sdk = PerpetualSwapSDK.createForNetwork(Network.SOLANA_DEVNET);

// For Localnet
const sdk = PerpetualSwapSDK.createForNetwork(Network.LOCALNET);
```

### 2. Initialize SDK with wallet for admin operations

```typescript
import { PerpetualSwapSDK, Network } from '@perpetualswap/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const keypair = Keypair.generate();
const connection = new Connection('https://api.testnet.sonic.game/', 'confirmed');

const sdk = new PerpetualSwapSDK(connection, wallet, keypair, Network.SONIC_TESTNET);
```

### 3. Get network information

```typescript
console.log('Network:', sdk.getNetwork());
console.log('RPC URL:', sdk.getNetworkConfig().rpcUrl);
console.log('Contracts Program ID:', sdk.getContractsProgramId().toBase58());
console.log('Mock Oracle Program ID:', sdk.getMockOracleProgramId().toBase58());
```

## Admin Operations

### Initialize Market

```typescript
const market = await sdk.initializeMarket({
  marketSymbol: "SOL-PERP",
  initialFundingRate: 0,
  fundingInterval: 3600,
  maintenanceMarginRatio: 500, // 5%
  initialMarginRatio: 1000, // 10%
  maxLeverage: 10,
  oracleAccount: new PublicKey('your-oracle-account'),
  mint: new PublicKey('your-token-mint')
});

// The market object now contains all market details
console.log('Market Symbol:', market.marketSymbol);
console.log('Market Authority:', market.authority.toString());
console.log('Market Oracle:', market.oracleAccount.toString());
console.log('Market Vault:', market.vault.toString());
console.log('Market Bump:', market.bump);
console.log('Is Active:', market.isActive);

// Get market details (if needed)
const marketDetails = await sdk.getMarket(market.authority);

// Get all markets
const allMarkets = await sdk.getAllMarkets();
console.log('Available markets:', allMarkets.map(m => m.marketSymbol));

// Create a margin account
const marginAccount = await sdk.createMarginAccount({
  market: market.authority,
  bump: 0 // This will be calculated
});

// Deposit collateral
await sdk.depositCollateral({
  marginAccount: marginAccount,
  market: market.authority,
  amount: new BN(1000000) // 1 token with 6 decimals
});

// Withdraw collateral
await sdk.withdrawCollateral({
  marginAccount: marginAccount,
  market: market.authority,
  amount: new BN(500000) // 0.5 token with 6 decimals
});

// Place orders using the global margin account
const orderTx = await sdk.buildPlaceMarketOrderTransaction({
  market: market.authority,
  marginAccount: marginAccount,
  side: 'long',
  size: new BN(1000), // 1000 tokens
  leverage: new BN(5), // 5x leverage
  oracleAccount: new PublicKey('your-oracle-account')
}, wallet.publicKey);

// Close positions
const closeTx = await sdk.buildCloseMarketOrderTransaction({
  market: market.authority,
  position: positionPda,
  marginAccount: marginAccount,
  oracleAccount: new PublicKey('your-oracle-account')
}, wallet.publicKey);
```

## Key Changes in Global Margin Account Architecture

### What Changed

The SDK now uses a **global margin account system** instead of market-specific margin accounts:

- **Before**: Each market had its own margin account (`market + user` PDA)
- **Now**: Single global margin account per user (`user` PDA only)

### Benefits

1. **Better Capital Efficiency**: Collateral can be shared across all markets
2. **Simplified UX**: Users don't need to create separate margin accounts for each market
3. **Cross-Market Trading**: Users can trade on multiple markets with the same collateral
4. **Reduced Account Creation**: Only one margin account needed per user

### Migration Guide

If you're upgrading from the previous version:

```typescript
// OLD: Market-specific margin account
const [oldMarginAccountPda] = await sdk.findMarginAccountPda(userKey, marketKey);

// NEW: Global margin account
const [newMarginAccountPda] = await sdk.findMarginAccountPda(userKey);

// OLD: Create margin account for specific market
await sdk.createMarginAccount({ market: marketKey, marginType: { isolated: {} } });

// NEW: Create global margin account
await sdk.createMarginAccount({ marginType: { isolated: {} } });
```

## User Operations

### Build Transaction to Create Margin Account

```typescript
const tx = await sdk.buildCreateMarginAccountTransaction({
  market: marketPda,
  marginType: { isolated: {} }
}, userPublicKey);

// Send transaction
await provider.sendAndConfirm(tx);
```

### Build Transaction to Deposit Collateral

```typescript
const tx = await sdk.buildDepositCollateralTransaction({
  marginAccount: marginAccountPda,
  market: marketPda,
  userTokenAccount,
  vault: marketVaultPda,
  mint: tokenMint,
  amount: new BN(50_000_000) // 50 tokens
}, userPublicKey);

await provider.sendAndConfirm(tx);
```

### Build Transaction to Place Market Order

```typescript
const tx = await sdk.buildPlaceMarketOrderTransaction({
  market: marketPda,
  marginAccount: marginAccountPda,
  side: 'long',
  size: new BN(100_000), // 0.1 tokens
  leverage: new BN(5),
  oracleAccount: mockOraclePda
}, userPublicKey);

await provider.sendAndConfirm(tx);
```

## Read Operations

### Get Market Details

```typescript
const market = await sdk.getMarket(marketPda);
console.log('Market Symbol:', market.marketSymbol);
console.log('Max Leverage:', market.maxLeverage.toNumber());
```

### Get Margin Account

```typescript
constructor(connection: Connection, wallet: Wallet)
```

#### Methods

- `initializeMarket(params: InitializeMarketParams): Promise<Market>` - Returns the complete market object
- `getMarket(marketAddress: PublicKey): Promise<Market>`
- `getAllMarkets(): Promise<Market[]>` - Returns all markets in the program
- `createMarginAccount(params: CreateMarginAccountParams): Promise<PublicKey>`
- `getMarginAccount(marginAccountAddress: PublicKey): Promise<MarginAccount>`
- `depositCollateral(params: DepositCollateralParams): Promise<void>`
- `withdrawCollateral(params: WithdrawCollateralParams): Promise<void>`

### Market Object

The Market object contains the following properties:

```typescript
interface Market {
  authority: PublicKey;
  marketSymbol: string;
  initialFundingRate: BN;
  fundingInterval: BN;
  maintenanceMarginRatio: BN;
  initialMarginRatio: BN;
  maxLeverage: BN;
  oracleAccount: PublicKey;
  bump: number;
  isActive: boolean;
  vault: PublicKey;
}
```

## License

MIT 