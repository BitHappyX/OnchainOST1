---
name: aave-leverage
description: "Use when user asks to 'open leveraged position', 'leverage long ETH', 'loop borrow on Aave', 'loop lending', '循环贷', 'leveraged long/short', 'increase exposure with leverage', 'borrow and re-deposit', 'create leveraged position', or mentions Aave leverage, loop lending, or leveraged positions on Ethereum. Automatically calculates optimal deposit/borrow cycles, manages health factor, and returns position summary. Do NOT use for simple Aave deposits/withdrawals without leverage, general DeFi questions, or non-Aave protocols."
license: Apache-2.0
metadata:
  author: okx-hackathon
  version: "1.0.0"
  homepage: "https://web3.okx.com"
---

# Aave Leverage Agent Skill

Execute leveraged positions on Aave V3 using loop lending strategy.

## Pre-flight Checks

Before running any command, follow these steps:

1. **Confirm Node.js installed**: Run `node --version` (requires v18+)
2. **Install dependencies**:
   ```bash
   cd skills/aave-leverage && npm install
   ```
3. **Set up environment**: Create `.env` file:
   ```bash
   cat > .env << EOF
   PRIVATE_KEY=your_private_key
   RPC_URL=https://eth.drpc.org
   EOF
   ```
4. **Verify network**: Ensure connected to Ethereum Mainnet or Sepolia testnet

## Skill Routing

- For token swaps during leverage loops → use `okx-dex-swap`
- For checking wallet balances → use `okx-wallet-portfolio`
- For token prices → use `okx-dex-market`
- For broadcasting transactions → use `okx-onchain-gateway`

## Overview

This skill enables users to open leveraged long/short positions by:
1. Depositing collateral to Aave V3
2. Borrowing against it
3. Swapping borrowed assets (via OKX DEX)
4. Re-depositing to increase leverage
5. Repeating until target leverage is reached

## Supported Networks

- **Ethereum Mainnet** - Chain ID: 1
  - Aave V3 Pool: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`
- **Ethereum Sepolia** (testnet) - Chain ID: 11155111
  - Aave V3 Pool: `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951`

## Quickstart

### Long Position (1.6x ETH with USDT)

```bash
# Execute leveraged long position
node cli.js \
  --collateral USDT \
  --target USDT \
  --amount 10 \
  --leverage 1.6 \
  --min-health-factor 1.3
# → Expected: 1.6x leverage, health factor 1.5+, position summary
```

### Using Natural Language

```
"用 10 USDT 在 ETH 主网的 AAVE 上开启循环贷仓位，目标杠杆 1.6x，健康因子保持在 1.3 以上"
```

### Output Example

```
🚀 Aave V3 循环贷 - 目标杠杆 1.6x

⛽ Gas: 0.42 gwei

📥 [1/2] 存入 10 USDT...
   ✅ 0x4053b111312fd05cc7f39c9015ec94301cf08b062dc0493def33f9abbd941b0d

💰 [2/2] 借出 6 USDC...
   ✅ 0xb5bd0724d96b7adfdca6c2b06628be527a28c4ecd9d395ef905a07bc0a8450b6

✅ 仓位已开启！

📊 最终状态:
   抵押品: $13.00 USDT
   债务: $7.50 USDC
   杠杆率: 1.58x
   健康因子: 1.35 ✅
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `collateral` | string | Yes | Collateral token symbol (USDT, USDC, DAI, WETH) |
| `target` | string | Yes | Target exposure token (same as collateral for simple leverage) |
| `amount` | number | Yes | Initial collateral amount in UI units (e.g., `10` = 10 USDT) |
| `leverage` | number | Yes | Target leverage multiplier (1.1 - 3.0, e.g., `1.6` = 1.6x) |
| `min-health-factor` | number | No | Minimum health factor threshold (default: 1.3, must be > 1.0) |

### Parameter Details

- **amount**: In UI units (e.g., `10` = 10 USDT, `1.5` = 1.5 ETH)
- **leverage**: Decimal between 1.1 and 3.0 (calculated as: (initial + debt) / initial)
- **collateral/target**: Must match Aave V3 supported assets on the target network
- **min-health-factor**: Safety threshold to prevent liquidation (recommended: 1.3-1.5)
- **Chain**: Automatically detected from RPC_URL in .env

## Amount Display Rules

- Input amounts in UI units (`10 USDT`, `1.5 ETH`)
- Output amounts in UI units with proper decimals
- Gas fees in ETH and USD equivalent
- Health factor as decimal (1.35 = safe, <1.0 = liquidation risk)
- Leverage as multiplier (1.6 = 1.6x exposure)

## Output

Returns a JSON object with:
- Transaction hashes for each step (supply, borrow)
- Final position summary
- Health factor (must be > 1.0 to avoid liquidation)
- Leverage ratio achieved
- Total gas cost in ETH and USD
- Visual HTML report path

## Example Output

```json
{
  "success": true,
  "position": {
    "collateral": "$13.00 USDT",
    "debt": "$7.50 USDC",
    "leverage": 1.58,
    "healthFactor": 1.35,
    "netBalance": "$5.50"
  },
  "transactions": [
    "0x4053b111312fd05cc7f39c9015ec94301cf08b062dc0493def33f9abbd941b0d",
    "0xb5bd0724d96b7adfdca6c2b06628be527a28c4ecd9d395ef905a07bc0a8450b6"
  ],
  "gasUsed": "0.0012 ETH ($2.45)",
  "reportPath": "aave-position-report.html"
}
```

## Edge Cases

- **Insufficient collateral**: Check balance first, show current balance, suggest minimum amount (at least $5 for mainnet)
- **Health factor too low (<1.2)**: Block transaction, suggest reducing leverage or increasing collateral
- **High leverage (>2.5x)**: Warn user about liquidation risk, require explicit confirmation
- **Token not supported**: List supported tokens (USDT, USDC, DAI, WETH on Mainnet)
- **Slippage exceeded during swap**: Retry with adjusted parameters or suggest manual swap
- **Network error**: Retry once, then prompt user to check RPC connection
- **Insufficient gas**: Estimate total gas cost upfront (~$3-5 on mainnet), warn if wallet balance too low
- **Position already exists**: Check existing Aave position, show current status, suggest adjusting or closing first
- **Price impact too high (>5%)**: Warn user, suggest reducing amount or splitting into multiple transactions
- **Borrow cap reached**: Show current utilization, suggest alternative tokens or waiting
- **Health factor drops during execution**: Abort transaction, refund gas, suggest increasing collateral

## Risk Warnings

⚠️ **Important Safety Information**
- Leveraged positions carry liquidation risk if health factor drops below 1.0
- Always maintain health factor > 1.3 for safety margin
- Monitor gas costs on mainnet (typically $3-5 per position)
- Market volatility can quickly reduce health factor
- Test on Sepolia testnet before using mainnet
- Start with low leverage (1.5x-2x) until familiar with the system

## Implementation Notes

The skill uses:
- `ethers.js v6` for contract interaction
- OKX Gas Price API for optimal gas fee estimation
- Aave V3 Pool contract for supply/borrow operations
- OKX DEX aggregator for token swaps (when needed)
- HTML/CSS for visual position reports

## Global Notes

- All token addresses must be checksummed (proper case)
- Health factor calculation: (collateral * LTV) / debt
- Leverage calculation: (initial + debt) / initial
- Minimum position size: $5 on mainnet, $1 on testnet
- Maximum leverage: 3.0x (limited by Aave LTV ratios)
- Gas estimation includes: approve + supply + borrow transactions
- Positions are non-custodial (user retains full control)
