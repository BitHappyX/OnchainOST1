import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

const POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, wallet);

console.log('\n🔍 调试 Aave Supply\n');

// Check balance
const usdtContract = new ethers.Contract(USDT, ERC20_ABI, wallet);
const balance = await usdtContract.balanceOf(wallet.address);
console.log(`💼 USDT Balance: ${ethers.formatUnits(balance, 6)}`);

// Check current position
const acct = await pool.getUserAccountData(wallet.address);
console.log(`📊 Current Position:`);
console.log(`   Collateral: $${Number(ethers.formatUnits(acct.totalCollateralBase, 8)).toFixed(2)}`);
console.log(`   Debt: $${Number(ethers.formatUnits(acct.totalDebtBase, 8)).toFixed(2)}\n`);

// Try small amount first
const testAmount = 1; // 1 USDT
const testWei = ethers.parseUnits(testAmount.toString(), 6);

console.log(`🧪 测试存入 ${testAmount} USDT...`);

// Check allowance
const allowance = await usdtContract.allowance(wallet.address, AAVE_POOL);
console.log(`   Allowance: ${ethers.formatUnits(allowance, 6)}`);

if (allowance < testWei) {
  console.log('   需要 approve...');
  if (allowance > 0n) {
    const resetTx = await usdtContract.approve(AAVE_POOL, 0);
    await resetTx.wait();
    console.log('   ✅ Reset to 0');
  }
  const approveTx = await usdtContract.approve(AAVE_POOL, ethers.MaxUint256);
  await approveTx.wait();
  console.log('   ✅ Approved\n');
}

// Try supply
try {
  console.log('📤 Sending supply transaction...');
  const tx = await pool.supply(USDT, testWei, wallet.address, 0);
  console.log(`   TX: ${tx.hash}`);
  const receipt = await tx.wait();
  
  if (receipt.status === 1) {
    console.log(`   ✅ 成功！区块 ${receipt.blockNumber}`);
  } else {
    console.log(`   ❌ 失败 (status: ${receipt.status})`);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.data) {
    console.error('   Data:', error.data);
  }
}
