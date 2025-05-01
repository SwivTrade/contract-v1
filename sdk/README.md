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