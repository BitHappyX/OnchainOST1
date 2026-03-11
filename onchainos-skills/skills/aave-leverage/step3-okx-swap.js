import { ethers } from 'ethers';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const TOKENS = { USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F', WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' };
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function allowance(address owner, address spender) view returns (uint256)', 'function approve(address spender, uint256 amount) returns (bool)'];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const fromToken = process.argv[2] || 'USDC';
const toToken = process.argv[3] || 'USDT';
const amount = parseFloat(process.argv[4]) || 5.7;

console.log(`\n🔄 [Step 3/4] OKX Swap: ${fromToken} → ${toToken}\n`);

const fromAddr = TOKENS[fromToken];
const toAddr = TOKENS[toToken];
const fromContract = new ethers.Contract(fromAddr, ERC20_ABI, provider);
const decimals = Number(await fromContract.decimals());
const rounded = Math.floor(amount * 10 ** decimals) / 10 ** decimals;
const amountWei = ethers.parseUnits(rounded.toFixed(decimals), decimals);

// Get approval address from OKX
const onchainosPath = path.join(__dirname, '../../../onchainos.exe');
const approveCmd = `"${onchainosPath}" swap approve --chain ethereum --token ${fromAddr} --amount ${amountWei.toString()}`;
const approveOutput = execSync(approveCmd, { encoding: 'utf-8' });
const approveData = JSON.parse(approveOutput);
const approvalAddress = approveData.data[0].dexContractAddress;

console.log('🔐 Checking approval...');
const allowance = await fromContract.allowance(wallet.address, approvalAddress);
if (allowance < amountWei) {
  console.log(`   Approving ${approvalAddress}...`);
  if (allowance > 0n) {
    const resetTx = await fromContract.connect(wallet).approve(approvalAddress, 0);
    await resetTx.wait();
  }
  const approveTx = await fromContract.connect(wallet).approve(approvalAddress, ethers.MaxUint256);
  await approveTx.wait();
  console.log('   ✅ Approved\n');
} else {
  console.log('   ✅ Already approved\n');
}

// Get swap data from OKX
const swapCmd = `"${onchainosPath}" swap swap --from ${fromAddr} --to ${toAddr} --amount ${amountWei.toString()} --chain ethereum --slippage 5 --wallet ${wallet.address}`;
console.log('📋 Getting swap quote from OKX...');
const swapOutput = execSync(swapCmd, { encoding: 'utf-8' });
const swapData = JSON.parse(swapOutput);

if (!swapData.data?.[0]?.tx) {
  console.log('❌ Failed to get swap data');
  process.exit(1);
}

const tx = swapData.data[0].tx;
console.log(`   Router: ${tx.to}`);
console.log(`   Expected output: ${swapData.data[0].routerResult.toTokenAmount} ${toToken}\n`);

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

  const toContract = new ethers.Contract(toAddr, ERC20_ABI, provider);
  const toDecimals = Number(await toContract.decimals());
  const toBal = await toContract.balanceOf(wallet.address);
  console.log(`💼 New ${toToken} Balance: ${ethers.formatUnits(toBal, toDecimals)}`);
} else {
  console.log('   ❌ Swap failed');
  process.exit(1);
}
