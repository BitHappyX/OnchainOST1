import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const POOL_ABI = [
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, wallet);

console.log('\n🧪 Testing Borrow 6 USDC\n');

// Fetch gas price
async function getGasPrice() {
  try {
    const resp = await fetch('https://web3.okx.com/api/v5/dex/pre-transaction/gas-price?chainIndex=1');
    const data = await resp.json();
    if (data.code === '0' && data.data[0].eip1559Protocol) {
      const p = data.data[0].eip1559Protocol;
      const base = BigInt(p.baseFee);
      const priority = BigInt(p.safePriorityFee);
      console.log(`⛽ Gas: base ${ethers.formatUnits(base, 'gwei')} + tip ${ethers.formatUnits(priority, 'gwei')} gwei`);
      return { maxPriorityFeePerGas: priority, maxFeePerGas: base + priority };
    }
  } catch (e) {}
  return { maxPriorityFeePerGas: ethers.parseUnits('0.1', 'gwei'), maxFeePerGas: ethers.parseUnits('0.5', 'gwei') };
}

const gasOpts = await getGasPrice();

// Check current position
const acct = await pool.getUserAccountData(wallet.address);
const available = Number(ethers.formatUnits(acct.availableBorrowsBase, 8));
const collateral = Number(ethers.formatUnits(acct.totalCollateralBase, 8));
const debt = Number(ethers.formatUnits(acct.totalDebtBase, 8));
const hf = Number(ethers.formatUnits(acct.healthFactor, 18));

console.log(`📊 Current Position:`);
console.log(`   Collateral: $${collateral.toFixed(2)}`);
console.log(`   Debt: $${debt.toFixed(2)}`);
console.log(`   Available to borrow: $${available.toFixed(2)}`);
console.log(`   Health Factor: ${hf > 1000 ? '∞' : hf.toFixed(3)}\n`);

// Borrow 6 USDC
const borrowAmount = 6;
console.log(`💰 Borrowing ${borrowAmount} USDC...`);

const borrowWei = ethers.parseUnits(borrowAmount.toString(), 6);
console.log(`   Amount in wei: ${borrowWei.toString()}`);
console.log(`   Wallet: ${wallet.address}`);
console.log(`   USDC: ${USDC}`);
console.log(`   Pool: ${AAVE_POOL}\n`);

try {
  // Estimate gas first
  console.log('🔍 Estimating gas...');
  const gasEstimate = await pool.borrow.estimateGas(USDC, borrowWei, 2, 0, wallet.address, gasOpts);
  console.log(`   Estimated gas: ${gasEstimate.toString()}\n`);

  console.log('📤 Sending transaction...');
  const tx = await pool.borrow(USDC, borrowWei, 2, 0, wallet.address, gasOpts);
  console.log(`   TX hash: ${tx.hash}`);
  console.log('⏳ Waiting for confirmation...\n');

  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log('✅ Borrow successful!');
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}\n`);

    // Check new position
    const newAcct = await pool.getUserAccountData(wallet.address);
    const newDebt = Number(ethers.formatUnits(newAcct.totalDebtBase, 8));
    const newHF = Number(ethers.formatUnits(newAcct.healthFactor, 18));

    console.log('📊 New Position:');
    console.log(`   Debt: $${newDebt.toFixed(2)}`);
    console.log(`   Health Factor: ${newHF > 1000 ? '∞' : newHF.toFixed(3)}`);
  } else {
    console.log('❌ Transaction failed');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.data) {
    console.error('   Error data:', error.data);
  }
}
