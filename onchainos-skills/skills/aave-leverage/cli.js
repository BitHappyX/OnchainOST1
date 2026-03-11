#!/usr/bin/env node
import { AaveLeverageAgent } from './index.js';
import { Command } from 'commander';

const program = new Command();

program
  .name('aave-leverage')
  .description('Execute leveraged positions on Aave V3 using loop lending')
  .version('1.0.0')
  .requiredOption('-c, --collateral <token>', 'Collateral token (USDC, DAI, WETH)')
  .requiredOption('-t, --target <token>', 'Target exposure token (USDC, DAI, WETH)')
  .requiredOption('-a, --amount <number>', 'Initial collateral amount', parseFloat)
  .requiredOption('-l, --leverage <number>', 'Target leverage multiplier (1.1-3.0)', parseFloat)
  .option('-m, --min-hf <number>', 'Minimum health factor', parseFloat, 1.3)
  .action(async (options) => {
    try {
      const agent = new AaveLeverageAgent();
      const result = await agent.executeLoopLending({
        collateral: options.collateral,
        target: options.target,
        amount: options.amount,
        leverage: options.leverage,
        minHF: options.minHf
      });

      console.log('\n✅ Success!');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
