// Step 1: Supply collateral to Aave V3
// Usage: node step1-supply.js <TOKEN> <AMOUNT>
// Example: node step1-supply.js USDT 10

import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const TOKENS = { USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F', WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' };
const ERC20_ABI = ['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)', 'function decimals() view returns (uint8)'];
const POOL_ABI = ['function supply(address,uint256,address,uint16)', 'function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)'];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, wallet);

const tokenSymbol = process.argv[2] || 'USDT';
const amount = parseFloat(process.argv[3]) || 10;
const tokenAddr = TOKENS[tokenSymbol];

console.log(`\n📥 [Step 1] Supply ${amount} ${tokenSymbol} to Aave V3\n`);

const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
const decimals = Number(await token.decimals());
const amountWei = ethers.parseUnits(Math.floor(amount * 10 ** decimals).toString(), 0);

// Approve (USDT needs reset to 0)
const allowance = await token.allowance(wallet.address, AAVE_POOL);
if (allowance < amountWei) {
  if (allowance > 0n) await (await token.approve(AAVE_POOL, 0)).wait();
  await (await token.approve(AAVE_POOL, ethers.MaxUint256)).wait();
  console.log('   ✅ Approved');
}

const tx = await pool.supply(tokenAddr, amountWei, wallet.address, 0, { gasLimit: 400000 });
console.log(`   TX: ${tx.hash}`);
const receipt = await tx.wait();
console.log(`   ✅ Supplied ${amount} ${tokenSymbol} (Block ${receipt.blockNumber})\n`);

const acct = await pool.getUserAccountData(wallet.address);
console.log(`📊 Position: Collateral $${Number(ethers.formatUnits(acct[0], 8)).toFixed(2)} | Debt $${Number(ethers.formatUnits(acct[1], 8)).toFixed(2)} | HF ${Number(ethers.formatUnits(acct[5], 18)).toFixed(3)}`);
