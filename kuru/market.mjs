// List corpus compute on Kuru (Monad mainnet): wrap the ERC-1155 into its ERC-20 view, create the cS1-256/USDC market
// on Kuru's Router, deposit the wrapped tokens into the MarginAccount and post asks. Sell side only: no self-trades.
//
//   DEPLOYER_KEY=0x... TOKEN=0x... WRAPPER=0x... node market.mjs --qty 2 --ask 620 [--rpc URL] [--market 0x...]
//   node market.mjs --status --market 0x...                      read the book (no key)
import { ethers } from 'ethers';
import * as KuruSdk from '@kuru-labs/kuru-sdk';

const args = process.argv.slice(2); const has = (f) => args.includes(f); const after = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const RPC = after('--rpc', process.env.MONAD_RPC || 'https://rpc.monad.xyz');
// Kuru contracts (docs.kuru.io/contracts/Contract-addresses). Mainnet's Router.deployProxy is owner-gated
// (reverts Unauthorized() for third parties); testnet's is open, so the demo market lives on testnet.
const NETS = {
  143:   { router: '0xd651346d7c789536ebf06dc72aE3C8502cd695CC', margin: '0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5', usdc: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' },
  10143: { router: '0x7EFbE105Ca7415dE98F96622173458ac1c054630', margin: '0xd029C2D98ff85D8F64799017fE00a59B1159CE02', usdc: process.env.USDC || '' },
};
const chainId = +(process.env.CHAIN_ID || 143); const KURU = NETS[chainId]; const USDC = KURU.usdc;
if (!USDC) { console.error('USDC env required on testnet (the mock from the deployment)'); process.exit(2); }
const provider = new ethers.providers.JsonRpcProvider(RPC);
const erc20 = ['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function decimals() view returns (uint8)'];
const erc1155 = ['function setApprovalForAll(address,bool)', 'function isApprovedForAll(address,address) view returns (bool)', 'function balanceOf(address,uint256) view returns (uint256)'];
const wrapperAbi = ['function wrap(uint256)', 'function id() view returns (uint256)'];
const bookAbi = ['function getL2Book() view returns (bytes)', 'function bestBidAsk() view returns (uint256,uint256)'];

if (has('--status')) {
  const market = after('--market'); const p = await KuruSdk.ParamFetcher.getMarketParams(provider, market);
  const ob = await KuruSdk.OrderBook.getL2OrderBook(provider, market, p);
  console.log(JSON.stringify({ market, base: p.baseAssetAddress, quote: p.quoteAssetAddress, pricePrecision: p.pricePrecision.toString(), sizePrecision: p.sizePrecision.toString(), tickSize: p.tickSize.toString(), minSize: p.minSize.toString(), asks: ob.asks.slice(0, 5), bids: ob.bids.slice(0, 5) }, null, 1));
  process.exit(0);
}

const signer = new ethers.Wallet(process.env.DEPLOYER_KEY, provider); const me = await signer.getAddress();
const TOKEN = process.env.TOKEN, WRAPPER = process.env.WRAPPER; if (!TOKEN || !WRAPPER) { console.error('TOKEN and WRAPPER required'); process.exit(2); }
const qty = BigInt(after('--qty', '2')); const ask = Number(after('--ask', '620')); const out = { me, token: TOKEN, wrapper: WRAPPER, txs: {} };
const token = new ethers.Contract(TOKEN, erc1155, signer); const wrapper = new ethers.Contract(WRAPPER, [...erc20, ...wrapperAbi], signer);
const id = (await wrapper.id()).toNumber();

// 1. wrap: ERC-1155 -> ERC-20
const held1155 = (await token.balanceOf(me, id)).toBigInt();
if (held1155 < qty) { console.error(`hold ${held1155} of size ${id}, need ${qty}`); process.exit(1); }
if (!(await token.isApprovedForAll(me, WRAPPER))) out.txs.approve1155 = (await (await token.setApprovalForAll(WRAPPER, true)).wait()).transactionHash;
out.txs.wrap = (await (await wrapper.wrap(qty)).wait()).transactionHash;
const baseUnits = (await wrapper.balanceOf(me)).toString(); out.wrapped = ethers.utils.formatUnits(baseUnits, 18);

// 2. market: create cS1-256 / USDC on the Router (type 0 = two ERC-20s), unless --market is given
let market = after('--market', null);
if (!market) {
  const pc = new KuruSdk.ParamCreator();
  // quote and base amounts only set the reference price (ask / 1); maxPrice bounds the book; minSize 0.01 machine; tick 10 bps.
  const prec = pc.calculatePrecisions(ask, 1, ask * 20, 0.01, 10);
  out.marketParams = { pricePrecision: prec.pricePrecision.toString(), sizePrecision: prec.sizePrecision.toString(), tickSize: prec.tickSize.toString(), minSize: prec.minSize.toString(), maxSize: prec.maxSize.toString() };
  market = await pc.deployMarket(signer, KURU.router, 0, WRAPPER, USDC, prec.sizePrecision, prec.pricePrecision, prec.tickSize, prec.minSize, prec.maxSize, 30, 10, ethers.BigNumber.from(30));
  out.marketCreated = true;
}
out.market = market;
const p = await KuruSdk.ParamFetcher.getMarketParams(provider, market);

// 3. deposit the wrapped tokens into the margin account and post asks: half at `ask`, half 2 % higher.
const dep = await KuruSdk.MarginDeposit.deposit(signer, KURU.margin, me, WRAPPER, out.wrapped, 18, true);
out.txs.deposit = dep.transactionHash;
const n = Number(qty); const lots = n === 1 ? [[ask, 1]] : [[ask, Math.ceil(n / 2)], [+(ask * 1.02).toFixed(2), Math.floor(n / 2)]];
out.asks = [];
for (const [price, size] of lots) {
  if (!size) continue;
  const rc = await KuruSdk.GTC.placeLimit(signer, market, p, { price: String(price), size: String(size), isBuy: false, postOnly: true });
  out.asks.push({ price, size, tx: rc.transactionHash });
}
const ob = await KuruSdk.OrderBook.getL2OrderBook(provider, market, p);
out.book = { asks: ob.asks.slice(0, 5), bids: ob.bids.slice(0, 5) };
console.log(JSON.stringify(out, null, 1));
