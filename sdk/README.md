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
  maintenanceMarginRatio: 100, // 1%
  initialMarginRatio: 200, // 2%
  maxLeverage: 50,
  liquidationFeeRatio: 250, // 2.5%
  oracleAccount: oraclePda,
  mint: tokenMint
});
```

### Initialize Oracle

```typescript
const oraclePda = await sdk.initializeOracle({
  marketSymbol: "SOL-PERP",
  initialPrice: 1000
});
```

### Update Oracle Price

```typescript
await sdk.updateOraclePrice({
  marketSymbol: "SOL-PERP",
  newPrice: 1100
});
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
const marginAccount = await sdk.getMarginAccount(userPublicKey, marketPda);
console.log('Collateral:', marginAccount.collateral.toNumber() / 1_000_000);
console.log('Positions:', marginAccount.positions.length);
```

### Get Position Details

```typescript
const position = await sdk.getPosition(positionPda);
console.log('Size:', position.size.toNumber() / 1_000_000);
console.log('Entry Price:', position.entryPrice.toNumber());
console.log('Leverage:', position.leverage.toNumber());
```

## Utility Functions

### Find PDAs

```typescript
// Find market PDA
const [marketPda, marketBump] = await sdk.findMarketPda(marketSymbol);

// Find margin account PDA
const [marginAccountPda, marginAccountBump] = await sdk.findMarginAccountPda(
  userPublicKey,
  marketPda
);

// Find oracle PDA
const [oraclePda, oracleBump] = await sdk.findOraclePda(marketSymbol);
```

## Examples

See the `tests/` directory for complete examples:

- `contracts.ts` - Basic contract functionality tests
- `sol-perp-test.ts` - SOL perpetual trading tests
- `network-example.ts` - Network configuration examples

## Error Handling

The SDK throws descriptive errors for common issues:

- `InsufficientMargin` - Not enough collateral for the position
- `LeverageTooHigh` - Leverage exceeds maximum allowed
- `MarketInactive` - Market is paused
- `PositionNotLiquidatable` - Position doesn't meet liquidation criteria

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT 