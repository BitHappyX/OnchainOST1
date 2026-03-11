import { ethers } from 'ethers';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const TOKENS = { USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F', WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' };
const POOL_ABI = ['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)', 'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)', 'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'];
const ERC20_ABI = ['function approve(address spender, uint256 amount) returns (bool)', 'function decimals() view returns (uint8)', 'function allowance(address owner, address spender) view returns (uint256)', 'function balanceOf(address account) view returns (uint256)'];

class AaveLeverageAgent {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
    this.pool = new ethers.Contract(AAVE_POOL, POOL_ABI, this.wallet);
    this.gasPrice = null;
  }

  async getGasPrice() {
    if (this.gasPrice) return this.gasPrice;
    try {
      const response = await fetch('https://web3.okx.com/api/v5/dex/pre-transaction/gas-price?chainIndex=1');
      const data = await response.json();
      if (data.code === '0' && data.data && data.data[0]) {
        const gasData = data.data[0];
        if (gasData.supporteip1559 && gasData.eip1559Protocol) {
          // Use safe (low) priority fee for cost efficiency
          const baseFee = BigInt(gasData.eip1559Protocol.baseFee);
          const priorityFee = BigInt(gasData.eip1559Protocol.safePriorityFee);
          this.gasPrice = {
            maxPriorityFeePerGas: priorityFee,
            maxFeePerGas: baseFee + priorityFee
          };
          console.log(`   ⛽ Gas: base ${ethers.formatUnits(baseFee, 'gwei')} + priority ${ethers.formatUnits(priorityFee, 'gwei')} gwei\n`);
          return this.gasPrice;
        }
      }
    } catch (e) {
      console.log('   ⚠️  Failed to fetch gas price, using defaults\n');
    }
    // Fallback to very low gas
    this.gasPrice = {
      maxPriorityFeePerGas: ethers.parseUnits('0.15', 'gwei'),
      maxFeePerGas: ethers.parseUnits('0.4', 'gwei')
    };
    return this.gasPrice;
  }

  async executeLoopLending({ collateral, target, amount, leverage, minHF = 1.3 }) {
    console.log(`\n🚀 Opening ${leverage}x ${collateral}→${target} position\n`);
    const txs = [], collateralAddr = TOKENS[collateral], targetAddr = TOKENS[target];
    const initialAmount = amount;

    // Step 1: Initial deposit
    console.log('📥 [1/4] Depositing initial collateral...');
    txs.push(await this.deposit(collateralAddr, amount));
    console.log(`   ✅ ${txs[0]}\n`);

    // Step 2: Borrow different asset (USDC if depositing USDT)
    let accountData = await this.pool.getUserAccountData(this.wallet.address);
    let availableBorrowUSD = Number(ethers.formatUnits(accountData.availableBorrowsBase, 8));
    let hf = Number(ethers.formatUnits(accountData.healthFactor, 18));

    console.log('💰 [2/4] Borrowing USDC...');
    console.log(`   Available: $${availableBorrowUSD.toFixed(2)} | HF: ${hf.toFixed(3)}`);

    // Calculate borrow amount to reach target leverage
    const targetBorrowAmount = initialAmount * (leverage - 1);
    const safeBorrowAmount = Math.min(targetBorrowAmount, availableBorrowUSD * 0.75);

    console.log(`   Target borrow: $${targetBorrowAmount.toFixed(2)}`);
    console.log(`   Safe borrow: $${safeBorrowAmount.toFixed(2)}`);

    if (safeBorrowAmount < 0.5) {
      console.log('   ⚠️  Borrow amount too small, skipping\n');
    } else {
      // Borrow USDC instead of USDT
      const borrowToken = collateral === 'USDT' ? TOKENS.USDC : TOKENS.USDT;
      txs.push(await this.borrow(borrowToken, safeBorrowAmount));
      console.log(`   ✅ ${txs[txs.length - 1]}\n`);

      // Step 3: Swap USDC to USDT via OKX
      console.log('🔄 [3/4] Swapping USDC → USDT via OKX DEX...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const swapResult = await this.swapViaOKX('USDC', collateral, safeBorrowAmount);
      console.log(`   ✅ Swapped ~$${safeBorrowAmount.toFixed(2)}\n`);

      // Step 4: Re-deposit swapped USDT
      console.log('📥 [4/4] Re-depositing swapped funds...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const token = new ethers.Contract(collateralAddr, ERC20_ABI, this.wallet);
      const balance = await token.balanceOf(this.wallet.address);
      const decimals = Number(await token.decimals());
      const balanceUSD = Number(ethers.formatUnits(balance, decimals));

      console.log(`   Wallet balance: $${balanceUSD.toFixed(2)}`);

      if (balanceUSD > 0.1) {
        txs.push(await this.deposit(collateralAddr, balanceUSD));
        console.log(`   ✅ ${txs[txs.length - 1]}\n`);
      } else {
        console.log('   ⚠️  Insufficient balance to re-deposit\n');
      }
    }

    const summary = await this.getPositionSummary(initialAmount);
    const reportPath = this.generateHTMLReport(summary, txs);

    console.log('✅ Position Summary:');
    console.log(`   Initial: $${initialAmount.toFixed(2)}`);
    console.log(`   Collateral: $${summary.totalCollateral.toFixed(2)}`);
    console.log(`   Debt: $${summary.totalDebt.toFixed(2)}`);
    console.log(`   Leverage: ${summary.leverage.toFixed(2)}x`);
    console.log(`   Health Factor: ${summary.healthFactor.toFixed(3)}`);
    console.log(`\n📄 ${reportPath}\n`);
    return { success: true, summary, transactions: txs, reportPath };
  }

  async deposit(tokenAddr, amountUSD) {
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, this.wallet);
    const decimals = Number(await token.decimals());
    const rounded = Math.floor(amountUSD * 10 ** decimals) / 10 ** decimals;
    const amountWei = ethers.parseUnits(rounded.toFixed(decimals), decimals);

    const gasOpts = await this.getGasPrice();
    const allowance = await token.allowance(this.wallet.address, AAVE_POOL);
    if (allowance < amountWei) {
      if (allowance > 0n) {
        const resetTx = await token.approve(AAVE_POOL, 0, gasOpts);
        await resetTx.wait();
      }
      const approveTx = await token.approve(AAVE_POOL, ethers.MaxUint256, gasOpts);
      await approveTx.wait();
    }

    const tx = await this.pool.supply(tokenAddr, amountWei, this.wallet.address, 0, gasOpts);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async borrow(tokenAddr, amountUSD) {
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, this.wallet);
    const decimals = Number(await token.decimals());
    const rounded = Math.floor(amountUSD * 10 ** decimals) / 10 ** decimals;
    const amountWei = ethers.parseUnits(rounded.toFixed(decimals), decimals);

    const gasOpts = await this.getGasPrice();
    const tx = await this.pool.borrow(tokenAddr, amountWei, 2, 0, this.wallet.address, gasOpts);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getPositionSummary(initialAmount) {
    const accountData = await this.pool.getUserAccountData(this.wallet.address);
    const totalCollateral = Number(ethers.formatUnits(accountData.totalCollateralBase, 8));
    const totalDebt = Number(ethers.formatUnits(accountData.totalDebtBase, 8));
    const healthFactor = Number(ethers.formatUnits(accountData.healthFactor, 18));
    const leverage = totalDebt > 0 ? (initialAmount + totalDebt) / initialAmount : 1.0;
    return { totalCollateral, totalDebt, healthFactor, leverage, initialAmount };
  }

  generateHTMLReport(summary, txs) {
    const reportPath = path.join(__dirname, 'aave-position-report.html');
    const hfStatus = summary.healthFactor > 1.5 ? 'healthy' : summary.healthFactor > 1.2 ? 'warning' : 'critical';
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Aave Leverage Monitor</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'SF Pro Display',-apple-system,sans-serif;background:#0a0e27;color:#e2e8f0;min-height:100vh;padding:20px}
.container{max-width:1400px;margin:0 auto}
.header{background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border:1px solid #334155;border-radius:16px;padding:32px;margin-bottom:24px;box-shadow:0 4px 20px rgba(0,0,0,0.4)}
.header h1{font-size:28px;font-weight:700;color:#f1f5f9;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.header p{color:#94a3b8;font-size:14px}
.status-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600}
.status-badge.healthy{background:#10b98120;color:#10b981;border:1px solid #10b981}
.status-badge.warning{background:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b}
.status-badge.critical{background:#ef444420;color:#ef4444;border:1px solid #ef4444}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:24px}
.card{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:16px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.4)}
.card-label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;font-weight:600}
.card-value{font-size:36px;font-weight:700;color:#f1f5f9;margin-bottom:8px}
.card-sub{font-size:13px;color:#64748b}
.section{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:16px;padding:32px;margin-bottom:24px;box-shadow:0 4px 20px rgba(0,0,0,0.4)}
.section h2{font-size:20px;color:#f1f5f9;margin-bottom:20px;font-weight:700;display:flex;align-items:center;gap:10px}
.tx-list{display:flex;flex-direction:column;gap:12px}
.tx-item{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;transition:all 0.2s}
.tx-item:hover{border-color:#475569;transform:translateX(4px)}
.tx-badge{background:#3b82f6;color:white;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;min-width:60px;text-align:center}
.tx-hash{font-family:'SF Mono',monospace;font-size:13px;color:#94a3b8;flex:1;word-break:break-all}
.tx-hash a{color:#60a5fa;text-decoration:none}
.tx-hash a:hover{text-decoration:underline}
.chart{margin:24px 0;padding:24px;background:#0f172a;border:1px solid #334155;border-radius:12px}
.bar-container{margin:16px 0}
.bar-label{font-size:13px;color:#94a3b8;margin-bottom:8px;font-weight:600}
.bar{height:48px;border-radius:8px;display:flex;align-items:center;padding:0 20px;color:white;font-weight:700;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,0.3);transition:all 0.3s}
.bar.collateral{background:linear-gradient(90deg,#10b981,#059669)}
.bar.debt{background:linear-gradient(90deg,#f59e0b,#dc2626)}
.footer{text-align:center;padding:24px;color:#64748b;font-size:12px;border-top:1px solid #334155}
.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
.metric-item{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;text-align:center}
.metric-item-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px}
.metric-item-value{font-size:24px;font-weight:700;color:#f1f5f9}
</style></head><body>
<div class="container">
<div class="header">
<h1>🏦 Aave V3 Leverage Monitor <span class="status-badge ${hfStatus}">● ${hfStatus === 'healthy' ? 'All Systems Go' : hfStatus === 'warning' ? 'Caution' : 'Critical'}</span></h1>
<p>Real-time Position Tracking • Ethereum Mainnet</p>
</div>

<div class="grid">
<div class="card">
<div class="card-label">Total Collateral</div>
<div class="card-value">$${summary.totalCollateral.toFixed(2)}</div>
<div class="card-sub">USDT deposited in Aave V3</div>
</div>
<div class="card">
<div class="card-label">Total Debt</div>
<div class="card-value">$${summary.totalDebt.toFixed(2)}</div>
<div class="card-sub">Variable rate borrowing</div>
</div>
<div class="card">
<div class="card-label">Leverage Ratio</div>
<div class="card-value">${summary.leverage.toFixed(2)}x</div>
<div class="card-sub">Effective position size</div>
</div>
<div class="card">
<div class="card-label">Health Factor</div>
<div class="card-value" style="color:${hfStatus === 'healthy' ? '#10b981' : hfStatus === 'warning' ? '#f59e0b' : '#ef4444'}">${summary.healthFactor > 1000 ? '∞' : summary.healthFactor.toFixed(3)}</div>
<div class="card-sub">Liquidation threshold</div>
</div>
</div>

<div class="section">
<h2>📊 Position Visualization</h2>
<div class="chart">
<div class="bar-container">
<div class="bar-label">Collateral</div>
<div class="bar collateral" style="width:${Math.min((summary.totalCollateral / Math.max(summary.totalCollateral, summary.totalDebt, 10)) * 100, 100)}%">
$${summary.totalCollateral.toFixed(2)} USDT
</div>
</div>
<div class="bar-container">
<div class="bar-label">Debt</div>
<div class="bar debt" style="width:${Math.min((summary.totalDebt / Math.max(summary.totalCollateral, summary.totalDebt, 10)) * 100, 100)}%">
$${summary.totalDebt.toFixed(2)} USDT
</div>
</div>
</div>
<div class="metric-grid">
<div class="metric-item">
<div class="metric-item-label">Initial Deposit</div>
<div class="metric-item-value">$${summary.initialAmount.toFixed(2)}</div>
</div>
<div class="metric-item">
<div class="metric-item-label">Net Position</div>
<div class="metric-item-value">$${(summary.totalCollateral - summary.totalDebt).toFixed(2)}</div>
</div>
</div>
</div>

<div class="section">
<h2>📝 Transaction History</h2>
<div class="tx-list">
${txs.map((tx, i) => `<div class="tx-item">
<span class="tx-badge">TX ${i + 1}</span>
<div class="tx-hash"><a href="https://etherscan.io/tx/${tx}" target="_blank">${tx}</a></div>
</div>`).join('')}
</div>
</div>

<div class="footer">
Generated ${new Date().toLocaleString()} • Powered by Aave V3 & OKX DEX Aggregator
</div>
</div>
</body></html>`;
    fs.writeFileSync(reportPath, html);
    return reportPath;
  }
}

export { AaveLeverageAgent };

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const params = { collateral: args[0] || 'USDT', target: args[1] || 'USDT', amount: parseFloat(args[2]) || 10, leverage: parseFloat(args[3]) || 2.0 };
  const agent = new AaveLeverageAgent();
  agent.executeLoopLending(params).then(result => console.log('Done!')).catch(console.error);
}
