import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
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

console.log('\n🚀 完整循环贷测试\n');

const initialAmount = 5; // 用 5 USDT 测试

// Step 1: Supply USDT
console.log(`📥 [1/2] 存入 ${initialAmount} USDT...`);
const usdtContract = new ethers.Contract(USDT, ERC20_ABI, wallet);
const supplyWei = ethers.parseUnits(initialAmount.toString(), 6);

const supplyTx = await pool.supply(USDT, supplyWei, wallet.address, 0);
await supplyTx.wait();
console.log(`   ✅ ${supplyTx.hash}\n`);

// Step 2: Borrow USDC
const acct = await pool.getUserAccountData(wallet.address);
const available = Number(ethers.formatUnits(acct.availableBorrowsBase, 8));
const borrowAmount = Math.min(3, available * 0.7); // 借 3 USDC 或可用的 70%

console.log(`💰 [2/2] 借出 ${borrowAmount.toFixed(2)} USDC...`);
console.log(`   可借额度: $${available.toFixed(2)}`);

const borrowWei = ethers.parseUnits(borrowAmount.toFixed(6), 6);
const borrowTx = await pool.borrow(USDC, borrowWei, 2, 0, wallet.address);
await borrowTx.wait();
console.log(`   ✅ ${borrowTx.hash}\n`);

// Final summary
const finalAcct = await pool.getUserAccountData(wallet.address);
const finalCollateral = Number(ethers.formatUnits(finalAcct.totalCollateralBase, 8));
const finalDebt = Number(ethers.formatUnits(finalAcct.totalDebtBase, 8));
const finalHF = Number(ethers.formatUnits(finalAcct.healthFactor, 18));
const leverage = (initialAmount + finalDebt) / initialAmount;

console.log('✅ 循环贷完成！\n');
console.log('📊 最终状态:');
console.log(`   抵押品: $${finalCollateral.toFixed(2)}`);
console.log(`   债务: $${finalDebt.toFixed(2)}`);
console.log(`   杠杆率: ${leverage.toFixed(2)}x`);
console.log(`   健康因子: ${finalHF.toFixed(3)}`);
