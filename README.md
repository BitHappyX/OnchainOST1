# Aave V3 循环贷 Skill - OKX OnchainOS 黑客松项目

本项目为 OKX OnchainOS 黑客松开发的 Aave V3 循环贷（Loop Lending）技能，允许用户通过重复存入抵押品、借款、通过 OKX DEX 交换、再存入的方式创建杠杆仓位。

## 快速开始

### 1. 安装依赖

```bash
cd onchainos-skills/skills/aave-leverage
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
PRIVATE_KEY=你的钱包私钥
RPC_URL=https://eth.drpc.org
```

**⚠️ 重要提示：**
- 请勿将 `.env` 文件提交到 Git 仓库
- 建议使用测试钱包，不要使用存有大量资金的主钱包
- 免费 RPC 节点（如 eth.drpc.org）可能不稳定，建议使用付费 RPC 服务（如 Infura、Alchemy）以避免交易中断

### 3. 使用方式

**方式一：CLI 命令行（推荐）**

```bash
node cli.js \
  --collateral USDT \
  --target USDT \
  --amount 10 \
  --leverage 1.6 \
  --min-health-factor 1.3
```

**方式二：分步执行（适合调试）**

```bash
# 步骤 1: 存入抵押品
node step1-supply.js USDT 10

# 步骤 2: 借出资产
node step2-borrow.js USDC 6

# 步骤 3: 通过 OKX DEX 交换
node step3-okx-swap.js USDC USDT 6

# 步骤 4: 再次存入
node step4-redeposit.js USDT
```

## 功能特性

- ✅ 自动化 Aave V3 循环贷（以太坊主网）
- ✅ 集成 OKX DEX 聚合器，获取最优交换路径
- ✅ 使用 OKX Gas Price API 优化交易费用
- ✅ 实时健康因子监控
- ✅ 可视化 HTML 仪表盘
- ✅ 模块化分步执行，支持中断恢复

## 开发过程中遇到的问题与解决方案

### 1. 环境变量覆盖问题
**问题**：`dotenv.config()` 不会覆盖已存在的环境变量，导致私钥不匹配。
**解决方案**：使用 `dotenv.config({ override: true })` 强制覆盖。

### 2. USDT 授权机制特殊性
**问题**：USDT 代币要求在设置新授权额度前必须先将额度重置为 0，否则交易失败。
**解决方案**：检查当前授权额度，如果大于 0 则先重置为 0，再授权 MaxUint256。

```javascript
if (allowance > 0n) {
  await token.approve(spender, 0);
}
await token.approve(spender, ethers.MaxUint256);
```

### 3. Aave 借贷限制
**问题**：Aave V3 不允许借出与抵押品相同的代币。
**解决方案**：存入 USDT 时借出 USDC，然后通过 OKX DEX 交换回 USDT。

### 4. OKX DEX 路由地址不匹配
**问题**：OKX `/approve` API 返回的 `dexContractAddress` 与 `/swap` API 返回的 `tx.to` 地址不同，授权错误地址导致 "SafeERC20: low-level call failed" 错误。
**解决方案**：先获取 swap 数据，然后授权 `swapData.data[0].tx.to` 地址（实际路由地址）。

```javascript
const swapData = await fetch(swapUrl).then(r => r.json());
const routerAddress = swapData.data[0].tx.to;
await token.approve(routerAddress, amount);
```

### 5. RPC 超时与不稳定问题 ⚠️
**问题**：免费 RPC 节点（eth.drpc.org、flashbots）在 `tx.wait()` 时经常超时，导致交易中断。
**解决方案**：
- 使用显式 `gasLimit` 参数避免触发 `estimateGas` 调用
- **强烈建议使用付费 RPC 服务**（Infura、Alchemy、QuickNode）以确保稳定性
- 如果使用免费 RPC，建议采用分步执行方式，每步单独运行，避免因中断丢失进度

**RPC 推荐配置：**
```bash
# 付费 RPC（推荐）
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# 免费 RPC（不稳定，仅供测试）
RPC_URL=https://eth.drpc.org
```

### 6. USDT 精度处理
**问题**：`ethers.parseUnits()` 在处理 USDT（6 位小数）时浮点精度问题导致失败。
**解决方案**：解析前先对金额进行向下取整。

```javascript
const rounded = Math.floor(amount * 10 ** decimals) / 10 ** decimals;
const amountWei = ethers.parseUnits(rounded.toFixed(decimals), decimals);
```

### 7. 杠杆率计算公式
**问题**：初始杠杆率计算公式错误。
**解决方案**：正确公式为 `(初始金额 + 总债务) / 初始金额`。

## 项目架构

```
onchainos-skills/skills/aave-leverage/
├── index.js              # 核心 AaveLeverageAgent 类
├── cli.js                # 基于 Commander 的 CLI 接口
├── step1-supply.js       # 模块化步骤：存入抵押品
├── step2-borrow.js       # 模块化步骤：借出资产
├── step3-okx-swap.js     # 模块化步骤：OKX DEX 交换
├── step4-redeposit.js    # 模块化步骤：再次存入
├── SKILL.md              # 遵循 OKX 格式的技能文档
├── package.json          # 依赖配置
├── .env.example          # 环境变量模板
└── examples/             # 测试示例
```

## 技术栈

- **ethers.js v6** - 以太坊交互
- **OKX DEX Aggregator** - 代币交换聚合
- **OKX Gas Price API** - Gas 费用优化
- **Aave V3 Pool Contract** - 借贷协议
- **dotenv** - 环境变量管理

---

## ⚠️ 免责声明

**本项目仅供学习和研究使用，不构成任何投资建议。**

### 风险警告

1. **清算风险**：杠杆仓位在健康因子低于 1.0 时会被清算。市场波动可能导致快速清算。

2. **智能合约风险**：本代码与 Aave V3 和 OKX DEX 智能合约交互。智能合约可能存在漏洞或缺陷。

3. **Gas 费用**：以太坊主网交易需要支付高额 Gas 费用。使用真实资金前请充分测试。

4. **无担保**：本软件按"原样"提供，不提供任何形式的担保。使用风险自负。

5. **未经审计**：本代码未经专业安全审计。请勿用于大额资金操作。

6. **RPC 不稳定**：免费 RPC 节点可能导致交易中断或失败。建议使用付费 RPC 服务。

### 法律声明

- 开发者对因使用本软件造成的任何财务损失不承担责任
- 用户需自行理解风险并遵守当地法律法规
- 本工具不托管资金，用户保留完全控制权和责任
- 使用本软件即表示您理解这些风险并同意自行承担后果

**请在使用前充分了解 DeFi 协议风险，强烈建议先在测试网测试。开发者不对任何资金损失负责。**

---

## 许可证

Apache-2.0

## 作者

OKX OnchainOS Hackathon Team
