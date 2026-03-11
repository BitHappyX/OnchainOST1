# Aave Leverage Agent - Quick Start

## Installation

```bash
cd onchainos-skills/skills/aave-leverage
npm install
```

## Configuration

1. Copy `.env.example` to `../../../.env`:
```bash
cp .env.example ../../../.env
```

2. Edit `.env` with your credentials:
- `PRIVATE_KEY`: Your Sepolia testnet private key
- `RPC_URL`: Sepolia RPC endpoint (Alchemy/Infura)
- `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`: OKX API credentials

3. Get Sepolia testnet tokens:
- ETH: https://sepoliafaucet.com/
- USDC: https://faucet.circle.com/
- Use Aave Sepolia faucet: https://staging.aave.com/faucet/

## Usage

### Command Line

```bash
# Open 2.5x long ETH position with 1000 USDC
node index.js --collateral USDC --target WETH --amount 1000 --leverage 2.5

# Open 2x leveraged DAI position
node index.js --collateral DAI --target DAI --amount 500 --leverage 2 --min-hf 1.5
```

### Programmatic

```javascript
import { AaveLeverageAgent } from './index.js';

const agent = new AaveLeverageAgent();
const result = await agent.executeLoopLending({
  collateral: 'USDC',
  target: 'WETH',
  amount: 1000,
  leverage: 2.5,
  minHF: 1.3
});

console.log(result.summary);
console.log(result.reportPath);
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `collateral` | string | Yes | - | USDC, DAI, or WETH |
| `target` | string | Yes | - | USDC, DAI, or WETH |
| `amount` | number | Yes | - | Initial collateral amount |
| `leverage` | number | Yes | - | Target leverage (1.1 - 3.0) |
| `minHF` | number | No | 1.3 | Minimum health factor |

## Output

The agent will:
1. Execute loop lending strategy
2. Print transaction hashes and progress
3. Generate HTML report with position visualization
4. Return JSON summary

Example output:
```
🚀 Opening 2.5x USDC→WETH position

📥 Depositing initial collateral...
   ✅ 0xabc...

🔄 2 loop iterations

Loop 1: $750.00 available | HF 2.145
  💰 Borrow $525.00
  🔄 Swap USDC→WETH
  📥 Re-deposit

Loop 2: $380.00 available | HF 1.523
  💰 Borrow $266.00
  🔄 Swap USDC→WETH
  📥 Re-deposit

✅ Position Summary:
   Collateral: $2491.00
   Debt: $791.00
   Leverage: 2.47x
   Health Factor: 1.352

📄 aave-position-report.html
```

## Troubleshooting

**Error: Insufficient balance**
- Get testnet tokens from faucets

**Error: Health factor too low**
- Reduce leverage or increase minHF parameter

**Error: Swap failed**
- Check OKX API credentials in .env
- Ensure onchainos.exe is in project root

**Error: Transaction reverted**
- Ensure tokens are approved for Aave
- Check gas limits

## Architecture

```
index.js
├── AaveLeverageAgent class
│   ├── executeLoopLending() - Main orchestration
│   ├── deposit() - Supply to Aave
│   ├── borrow() - Borrow from Aave
│   ├── swapViaOKX() - DEX aggregator swap
│   ├── getPositionSummary() - Query position data
│   └── generateHTMLReport() - Visual report
```

## Safety Notes

⚠️ **Testnet Only**: This is a hackathon demo
- Do NOT use on mainnet without audits
- Leveraged positions carry liquidation risk
- Always monitor health factor
- Test with small amounts first

## License

Apache-2.0
