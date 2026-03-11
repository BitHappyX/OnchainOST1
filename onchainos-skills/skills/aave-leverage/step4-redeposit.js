import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'];
const POOL_ABI = ['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)'];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

console.log('\n📥 [Step 4/4] Re-deposit USDC to Aave\n');

const usdcContract = new ethers.Contract(USDC, ERC20_ABI, wallet);
const usdcBal = await usdcContract.balanceOf(wallet.address);
const usdcAmount = Number(ethers.formatUnits(usdcBal, 6));

console.log(`💼 USDC Balance: ${usdcAmount.toFixed(2)}`);

if (usdcAmount < 0.1) {
  console.log('⚠️  Insufficient USDC to deposit');
  process.exit(0);
}

// Approve Aave
console.log('\n🔐 Approving USDC for Aave...');
const allowance = await usdcContract.allowance(wallet.address, AAVE_POOL);
if (allowance < usdcBal) {
  const approveTx = await usdcContract.approve(AAVE_POOL, ethers.MaxUint256);
  await approveTx.wait();
  console.log('   ✅ Approved\n');
} else {
  console.log('   ✅ Already approved\n');
}

// Deposit to Aave
console.log('📥 Depositing to Aave...');
const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, wallet);
const depositTx = await pool.supply(USDC, usdcBal, wallet.address, 0);
console.log(`   TX: ${depositTx.hash}`);

const receipt = await depositTx.wait();

if (receipt.status === 1) {
  console.log(`   ✅ Deposit successful! (Block ${receipt.blockNumber})\n`);
  console.log('🎉 循环贷完成！');
} else {
  console.log('   ❌ Deposit failed');
  process.exit(1);
}
