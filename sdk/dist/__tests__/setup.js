"use strict";
// import { Connection, Keypair } from '@solana/web3.js';
// import { AnchorProvider } from '@coral-xyz/anchor';
// // Mock Connection
// jest.mock('@solana/web3.js', () => {
//   const originalModule = jest.requireActual('@solana/web3.js');
//   return {
//     ...originalModule,
//     Connection: jest.fn().mockImplementation(() => ({
//       getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'test-blockhash' }),
//       getMinimumBalanceForRentExemption: jest.fn().mockResolvedValue(1000000),
//     })),
//   };
// });
// // Mock AnchorProvider
// jest.mock('@coral-xyz/anchor', () => {
//   const originalModule = jest.requireActual('@coral-xyz/anchor');
//   return {
//     ...originalModule,
//     AnchorProvider: jest.fn().mockImplementation(() => ({
//       connection: new Connection('https://api.testnet.sonic.game/', 'confirmed'),
//       wallet: {
//         publicKey: Keypair.generate().publicKey,
//         signTransaction: jest.fn(),
//         signAllTransactions: jest.fn(),
//       },
//     })),
//   };
// });
// // Global setup
// beforeAll(async () => {
//   // Any global setup before tests
// });
// // Global teardown
// afterAll(async () => {
//   // Any global cleanup after tests
// }); 
