# Perpetual Swap SDK

A TypeScript SDK for interacting with the Solana Perpetual Swap Protocol.

## Installation

```bash
npm install @swiv-sdk/perpetual-swap-sdk
# or
yarn add @swiv-sdk/perpetual-swap-sdk
# or
pnpm add @swiv-sdk/perpetual-swap-sdk
```

## Usage

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { PerpetualSwapSDK } from '@swiv-sdk/perpetual-swap-sdk';

// Initialize the SDK
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new Wallet(/* your keypair */);
const sdk = new PerpetualSwapSDK(connection, wallet);

// Initialize a market
const market = await sdk.initializeMarket({
  marketSymbol: 'SOL-PERP',
  initialFundingRate: 0,
  fundingInterval: 3600,
  maintenanceMarginRatio: 100, // 1%
  initialMarginRatio: 200, // 2%
  maxLeverage: 50, // 50x leverage
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

// Create a global margin account (used across all markets)
const marginAccount = await sdk.createMarginAccount({
  marginType: { isolated: {} }, // or { cross: {} }
  bump: 0 // This will be calculated
});

// Deposit collateral to the global margin account
await sdk.depositCollateral({
  marginAccount: marginAccount,
  market: market.authority, // Specify which market's vault to use
  amount: new BN(1000000) // 1 token with 6 decimals
});

// Withdraw collateral from the global margin account
await sdk.withdrawCollateral({
  marginAccount: marginAccount,
  market: market.authority, // Specify which market's vault to use
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

## API Reference

### `PerpetualSwapSDK`

The main class for interacting with the Perpetual Swap Protocol.

#### Constructor

```typescript
constructor(connection: Connection, wallet: Wallet)
```

#### Methods

- `initializeMarket(params: InitializeMarketParams): Promise<Market>` - Returns the complete market object
- `getMarket(marketAddress: PublicKey): Promise<Market>`
- `getAllMarkets(): Promise<Market[]>` - Returns all markets in the program
- `createMarginAccount(params: CreateMarginAccountParams): Promise<PublicKey>` - Creates global margin account
- `getMarginAccount(userPublicKey: PublicKey): Promise<MarginAccount>` - Gets global margin account for user
- `depositCollateral(params: DepositCollateralParams): Promise<void>` - Deposits to global margin account
- `withdrawCollateral(params: WithdrawCollateralParams): Promise<void>` - Withdraws from global margin account
- `buildPlaceMarketOrderTransaction(params, userPublicKey): Promise<Transaction>` - Builds order transaction
- `buildCloseMarketOrderTransaction(params, userPublicKey): Promise<Transaction>` - Builds close transaction

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

### Global Margin Account Object

The global margin account contains:

```typescript
interface MarginAccount {
  owner: PublicKey;
  marginType: { isolated: {} } | { cross: {} };
  collateral: BN;
  allocatedMargin: BN;
  positions: PublicKey[]; // Positions across all markets
  bump: number;
}
```

## Multi-Network Support

The SDK supports multiple Solana networks:

```typescript
import { PerpetualSwapSDK, Network } from '@swiv-sdk/perpetual-swap-sdk';

// Create SDK for specific network
const sonicSdk = PerpetualSwapSDK.createForNetwork(Network.SONIC_TESTNET);
const devnetSdk = PerpetualSwapSDK.createForNetwork(Network.SOLANA_DEVNET);

// Or initialize manually
const sdk = new PerpetualSwapSDK(connection, wallet, Network.SONIC_TESTNET);
```

## Troubleshooting

### Common Errors

1. **"Account not initialised caused by account position"**
   - This occurs when trying to close a position that's already been closed
   - Use `safeClosePosition()` method for robust position closing
   - Check if position exists before closing

2. **"InsufficientMargin"**
   - Ensure you have enough collateral in your global margin account
   - Check leverage requirements for the market
   - Verify position size doesn't exceed available margin

3. **"insufficient funds" during withdrawal**
   - Ensure the market vault has enough tokens
   - Check that you're not withdrawing more than your collateral
   - Verify the correct market vault is being used

### Best Practices

1. **Always check margin account state** before placing orders
2. **Use isolated margin** for better risk management
3. **Monitor position sizes** to avoid liquidation
4. **Clean up positions** in tests using `beforeEach` hooks
5. **Handle network-specific program IDs** correctly

## License

MIT 