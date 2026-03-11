# Aave V3 Loop Lending Skill for OKX OnchainOS

This project implements an Aave V3 loop lending (循环贷) skill for the OKX OnchainOS Hackathon. It allows users to create leveraged positions by repeatedly depositing collateral, borrowing, swapping via OKX DEX, and re-depositing.

## Features

- Automated loop lending on Aave V3 (Ethereum Mainnet)
- Integration with OKX DEX Aggregator for optimal token swaps
- OKX Gas Price API for transaction optimization
- Real-time health factor monitoring
- Visual HTML dashboard for position tracking
- Modular step-by-step execution

## Problems Encountered & Solutions

### 1. Environment Variable Override Issue
**Problem**: `dotenv.config()` wouldn't override existing environment variables, causing private key mismatch.
**Solution**: Used `dotenv.config({ override: true })` to force override.

### 2. USDT Approve Mechanism
**Problem**: USDT token requires allowance to be reset to 0 before setting a new value, causing approve transactions to fail.
**Solution**: Check current allowance, reset to 0 if > 0, then approve MaxUint256.

```javascript
if (allowance > 0n) {
  await token.approve(spender, 0);
}
await token.approve(spender, ethers.MaxUint256);
```

### 3. Aave Borrow Restriction
**Problem**: Cannot borrow the same token used as collateral on Aave V3.
**Solution**: When depositing USDT, borrow USDC instead, then swap back to USDT via OKX DEX.

### 4. OKX DEX Router Address Mismatch
**Problem**: OKX `/approve` API returns `dexContractAddress`, but `/swap` API returns different `tx.to` address. Approving wrong address caused "SafeERC20: low-level call failed".
**Solution**: Get swap data first, then approve the `swapData.data[0].tx.to` address (the actual router).

```javascript
const swapData = await fetch(swapUrl).then(r => r.json());
const routerAddress = swapData.data[0].tx.to;
await token.approve(routerAddress, amount);
```

### 5. RPC Timeout Issues
**Problem**: Free RPC endpoints (eth.drpc.org, flashbots) timeout on `tx.wait()` calls.
**Solution**: Use explicit `gasLimit` parameter to avoid `estimateGas` calls that trigger timeouts.

### 6. USDT Decimal Precision
**Problem**: `ethers.parseUnits()` fails with floating point precision for USDT (6 decimals).
**Solution**: Floor the amount before parsing.

```javascript
const rounded = Math.floor(amount * 10 ** decimals) / 10 ** decimals;
const amountWei = ethers.parseUnits(rounded.toFixed(decimals), decimals);
```

### 7. Leverage Calculation
**Problem**: Initial leverage formula was incorrect.
**Solution**: Correct formula is `(initialAmount + totalDebt) / initialAmount`.

## Installation

```bash
cd onchainos-skills/skills/aave-leverage
npm install
```

## Configuration

Create `.env` file:

```bash
PRIVATE_KEY=your_private_key_here
RPC_URL=https://eth.drpc.org
```

## Usage

### CLI Interface

```bash
node cli.js \
  --collateral USDT \
  --target USDT \
  --amount 10 \
  --leverage 1.6 \
  --min-health-factor 1.3
```

### Modular Steps

```bash
# Step 1: Supply collateral
node step1-supply.js USDT 10

# Step 2: Borrow
node step2-borrow.js USDC 6

# Step 3: Swap via OKX DEX
node step3-okx-swap.js USDC USDT 6

# Step 4: Re-deposit
node step4-redeposit.js USDT
```

## Architecture

- `index.js` - Core AaveLeverageAgent class
- `cli.js` - Commander-based CLI interface
- `step1-supply.js` - Modular supply step
- `step2-borrow.js` - Modular borrow step
- `step3-okx-swap.js` - OKX DEX swap integration
- `step4-redeposit.js` - Re-deposit to Aave
- `SKILL.md` - Skill documentation following OKX format

## Technical Stack

- ethers.js v6 - Ethereum interaction
- OKX DEX Aggregator - Token swaps
- OKX Gas Price API - Gas optimization
- Aave V3 Pool Contract - Lending protocol
- dotenv - Environment management

---

## ⚠️ DISCLAIMER / 免责声明

**本项目仅供学习和研究使用，不构成任何投资建议。**

This project is for EDUCATIONAL and RESEARCH purposes only. It is NOT financial advice.

### Risk Warnings / 风险警告

1. **Liquidation Risk / 清算风险**: Leveraged positions can be liquidated if the health factor drops below 1.0. Market volatility can cause rapid liquidation.

2. **Smart Contract Risk / 智能合约风险**: This code interacts with Aave V3 and OKX DEX smart contracts. Smart contracts may contain bugs or vulnerabilities.

3. **Gas Costs / Gas 费用**: Ethereum mainnet transactions require significant gas fees. Test thoroughly before using real funds.

4. **No Warranty / 无担保**: This software is provided "AS IS" without warranty of any kind. Use at your own risk.

5. **Not Audited / 未经审计**: This code has NOT been professionally audited. Do not use with large amounts of funds.

### Legal / 法律声明

- The developers assume NO responsibility for any financial losses incurred through the use of this software.
- Users are solely responsible for understanding the risks and complying with local regulations.
- This tool does NOT provide custody of funds. Users retain full control and responsibility.
- By using this software, you acknowledge that you understand these risks and agree to use it at your own discretion.

**请在使用前充分了解 DeFi 协议风险，建议先在测试网测试。开发者不对任何资金损失负责。**

---

## License

Apache-2.0

## Author

OKX OnchainOS Hackathon Team
