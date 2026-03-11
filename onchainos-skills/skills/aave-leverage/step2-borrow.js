// Step 2: Borrow from Aave V3
// Usage: node step2-borrow.js <TOKEN> <AMOUNT>
// Example: node step2-borrow.js USDC 6

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const TOKENS = { USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F', WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' };
const ERC20_ABI = ['function decimals() view returns (uint8)'];
const POOL_ABI = ['function borrow(address,uint256,uint256,uint16,address)', 'function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)'];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, wallet);

const tokenSymbol = process.argv[2] || 'USDC';
const amount = parseFloat(process.argv[3]) || 6;
const tokenAddr = TOKENS[tokenSymbol];

console.log(`\n💰 [Step 2] Borrow ${amount} ${tokenSymbol} from Aave V3\n`);

// Check available
const acct = await pool.getUserAccountData(wallet.address);
const available = Number(ethers.formatUnits(acct[2], 8));
console.log(`   Available to borrow: $${available.toFixed(2)}`);

if (amount > available) {
  console.log(`   ⚠️  Requested $${amount} exceeds available $${available.toFixed(2)}`);
  process.exit(1);
}

const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
const decimals = Number(await token.decimals());
const amountWei = ethers.parseUnits(Math.floor(amount * 10 ** decimals).toString(), 0);

const tx = await pool.borrow(tokenAddr, amountWei, 2, 0, wallet.address, { gasLimit: 400000 });
console.log(`   TX: ${tx.hash}`);
const receipt = await tx.wait();
console.log(`   ✅ Borrowed ${amount} ${tokenSymbol} (Block ${receipt.blockNumber})\n`);

const newAcct = await pool.getUserAccountData(wallet.address);
console.log(`📊 Position: Collateral $${Number(ethers.formatUnits(newAcct[0], 8)).toFixed(2)} | Debt $${Number(ethers.formatUnits(newAcct[1], 8)).toFixed(2)} | HF ${Number(ethers.formatUnits(newAcct[5], 18)).toFixed(3)}`);
