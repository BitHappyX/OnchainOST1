import { ethers } from 'ethers';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ override: true });

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

console.log('\n🔄 [Step 3/4] OKX Swap: USDT → USDC\n');

// Get fresh swap data from OKX
const onchainosPath = path.join(__dirname, '../../../onchainos.exe');
const swapCmd = `"${onchainosPath}" swap swap --from 0xdac17f958d2ee523a2206206994597c13d831ec7 --to 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 --amount 7808524 --chain ethereum --slippage 2 --wallet ${wallet.address}`;

console.log('📋 Getting swap quote from OKX...');
const swapOutput = execSync(swapCmd, { encoding: 'utf-8' });
const swapData = JSON.parse(swapOutput);

if (!swapData.data?.[0]?.tx) {
  console.log('❌ Failed to get swap data');
  process.exit(1);
}

const tx = swapData.data[0].tx;
console.log(`   Router: ${tx.to}`);
console.log(`   Expected output: ${swapData.data[0].routerResult.toTokenAmount} USDC\n`);

// Execute swap
console.log('📤 Executing swap...');
const swapTx = await wallet.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: tx.value || '0',
  gasLimit: parseInt(tx.gas) || 500000
});

console.log(`   TX: ${swapTx.hash}`);
console.log('⏳ Waiting for confirmation...');

const receipt = await swapTx.wait();

if (receipt.status === 1) {
  console.log(`   ✅ Swap successful! (Block ${receipt.blockNumber})\n`);
  
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const usdcContract = new ethers.Contract(USDC, ['function balanceOf(address) view returns (uint256)'], provider);
  const usdcBal = await usdcContract.balanceOf(wallet.address);
  console.log(`💼 New USDC Balance: ${ethers.formatUnits(usdcBal, 6)}`);
} else {
  console.log('   ❌ Swap failed');
  process.exit(1);
}
