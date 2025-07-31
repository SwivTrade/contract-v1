#!/usr/bin/env node

// Solana Mainnet Deployment Cost Calculator
// Based on current Solana rent costs and program sizes

const LAMPORTS_PER_SOL = 1_000_000_000;
const RENT_PER_BYTE_YEAR = 3480; // lamports per byte per year (current rate)
const RENT_EXEMPTION_THRESHOLD = 2 * 1024 * 1024; // 2MB minimum for rent exemption

// Program sizes from build output
const programSizes = {
  contracts: 430184, // bytes
  mockOracle: 213040 // bytes
};

// Calculate rent for each program
function calculateRent(bytes) {
  const rentPerYear = bytes * RENT_PER_BYTE_YEAR;
  const rentForExemption = Math.max(rentPerYear, RENT_EXEMPTION_THRESHOLD * RENT_PER_BYTE_YEAR);
  return rentForExemption;
}

// Calculate deployment costs
function calculateDeploymentCosts() {
  console.log('=== SOLANA MAINNET DEPLOYMENT COST CALCULATOR ===\n');
  
  console.log('Program Sizes:');
  console.log(`- contracts.so: ${programSizes.contracts.toLocaleString()} bytes`);
  console.log(`- mock_oracle.so: ${programSizes.mockOracle.toLocaleString()} bytes`);
  console.log(`- Total: ${(programSizes.contracts + programSizes.mockOracle).toLocaleString()} bytes\n`);
  
  console.log('Rent Calculations:');
  const contractsRent = calculateRent(programSizes.contracts);
  const mockOracleRent = calculateRent(programSizes.mockOracle);
  
  console.log(`- contracts.so rent: ${(contractsRent / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`- mock_oracle.so rent: ${(mockOracleRent / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`- Total rent: ${((contractsRent + mockOracleRent) / LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);
  
  // Transaction fees (approximate)
  const deployTransactionFee = 0.000005; // SOL per transaction
  const numTransactions = 2; // One for each program
  const totalTransactionFees = deployTransactionFee * numTransactions;
  
  console.log('Transaction Fees:');
  console.log(`- Per transaction: ${deployTransactionFee} SOL`);
  console.log(`- Number of transactions: ${numTransactions}`);
  console.log(`- Total transaction fees: ${totalTransactionFees} SOL\n`);
  
  // Total deployment cost
  const totalRent = contractsRent + mockOracleRent;
  const totalCost = (totalRent / LAMPORTS_PER_SOL) + totalTransactionFees;
  
  console.log('=== TOTAL DEPLOYMENT COST ===');
  console.log(`Total Rent: ${(totalRent / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`Transaction Fees: ${totalTransactionFees.toFixed(6)} SOL`);
  console.log(`TOTAL: ${totalCost.toFixed(6)} SOL\n`);
  
  // Add buffer for safety
  const safetyBuffer = 0.01; // 0.01 SOL buffer
  const totalWithBuffer = totalCost + safetyBuffer;
  
  console.log('=== RECOMMENDED FUNDING ===');
  console.log(`Base cost: ${totalCost.toFixed(6)} SOL`);
  console.log(`Safety buffer: ${safetyBuffer} SOL`);
  console.log(`RECOMMENDED TOTAL: ${totalWithBuffer.toFixed(6)} SOL\n`);
  
  // Current SOL price estimate (you can update this)
  const solPriceUSD = 180; // Approximate SOL price in USD
  const costUSD = totalWithBuffer * solPriceUSD;
  
  console.log('=== COST IN USD (approximate) ===');
  console.log(`SOL Price: $${solPriceUSD}`);
  console.log(`Total Cost: $${costUSD.toFixed(2)}\n`);
  
  console.log('=== DEPLOYMENT STEPS ===');
  console.log('1. Ensure your wallet has at least ' + totalWithBuffer.toFixed(6) + ' SOL');
  console.log('2. Update Anchor.toml to use mainnet cluster');
  console.log('3. Run: anchor deploy --provider.cluster mainnet');
  console.log('4. Verify programs are deployed correctly\n');
  
  console.log('=== IMPORTANT NOTES ===');
  console.log('- These costs are for rent exemption (permanent storage)');
  console.log('- Programs will be permanently stored on-chain');
  console.log('- Rent costs are one-time only');
  console.log('- Transaction fees are minimal (~0.00001 SOL total)');
  console.log('- Consider adding extra SOL for future transactions');
}

// Run the calculation
calculateDeploymentCosts(); 