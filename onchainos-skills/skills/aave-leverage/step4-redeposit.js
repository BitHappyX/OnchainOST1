import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const TOKENS = { USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F', WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' };
const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)', 'function decimals() view returns (uint8)'];
const POOL_ABI = ['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)'];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const token = process.argv[2] || 'USDT';
const tokenAddr = TOKENS[token];

console.log(`\n📥 [Step 4/4] Re-deposit ${token} to Aave\n`);

const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
const decimals = Number(await tokenContract.decimals());
const balance = await tokenContract.balanceOf(wallet.address);
const amount = Number(ethers.formatUnits(balance, decimals));

console.log(`💼 ${token} Balance: ${amount.toFixed(2)}`);

if (amount < 0.1) {
  console.log(`⚠️  Insufficient ${token} to deposit`);
  process.exit(0);
}

// Approve Aave
console.log(`\n🔐 Approving ${token} for Aave...`);
const allowance = await tokenContract.allowance(wallet.address, AAVE_POOL);
if (allowance < balance) {
  if (allowance > 0n) {
    await (await tokenContract.approve(AAVE_POOL, 0)).wait();
  }
  await (await tokenContract.approve(AAVE_POOL, ethers.MaxUint256)).wait();
  console.log('   ✅ Approved\n');
} else {
  console.log('   ✅ Already approved\n');
}

// Deposit to Aave
console.log('📥 Depositing to Aave...');
const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, wallet);
const depositTx = await pool.supply(tokenAddr, balance, wallet.address, 0);
console.log(`   TX: ${depositTx.hash}`);

const receipt = await depositTx.wait();

if (receipt.status === 1) {
  console.log(`   ✅ Deposit successful! (Block ${receipt.blockNumber})\n`);
  console.log('🎉 循环贷完成！');
} else {
  console.log('   ❌ Deposit failed');
  process.exit(1);
}
