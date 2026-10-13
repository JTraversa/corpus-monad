// Treasury sweep: put settled customer deposits (USDC on Monad) to work until they are needed to pay compute
// bills, and pull them back out. Run by the corpus treasury; the position is held by the treasury itself.
//
//   node sweep.mjs --status [--address 0x...]            balances and the live rate (no key needed)
//   TREASURY_KEY=0x... node sweep.mjs --supply [amount]   supply `amount` USDC (default: the whole USDC balance)
//   TREASURY_KEY=0x... node sweep.mjs --withdraw amount   withdraw `amount` USDC (or `max`) back to the treasury
//   --venue morpho (default) | aave
//
// Venues on Monad mainnet (chain 143), all verified on chain:
//   morpho: Hyperithm USDC Apex, a Morpho Vault V2 (ERC-4626). Curated overcollateralised lending; ~$52M USDC.
//   aave:   Aave v3 USDC pool, from the Aave address book (bgd-labs/aave-address-book, AaveV3Monad). Fallback.
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits, maxUint256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
export const MORPHO_VAULT = '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371'; // Hyperithm USDC Apex (hyperUSDCa)
export const AAVE = { POOL: '0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef', A_USDC: '0x35a73BAcb179d3740395A3ceCc87FF2e581d6042' };

const chain = { id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [process.env.MONAD_RPC || 'https://rpc.monad.xyz'] } } };
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']);
const erc4626 = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function maxWithdraw(address owner) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
]);
const aavePool = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
  'function getReserveData(address asset) view returns ((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))',
]);

const args = process.argv.slice(2); const has = (f) => args.includes(f); const after = (f) => args[args.indexOf(f) + 1];
const venue = has('--venue') ? after('--venue') : 'morpho';
if (!['morpho', 'aave'].includes(venue)) { console.error('venue must be morpho or aave'); process.exit(2); }
const transport = http(chain.rpcUrls.default.http[0]);
const pub = createPublicClient({ chain, transport });
const account = process.env.TREASURY_KEY ? privateKeyToAccount(process.env.TREASURY_KEY) : null;
const who = has('--address') ? after('--address') : account?.address;
if (!who) { console.error('need --address or TREASURY_KEY'); process.exit(2); }

async function morphoApy() {
  // Morpho's API reports the vault's net APY; fall back to null if unreachable. The rate is not on chain.
  try {
    const r = await fetch('https://blue-api.morpho.org/graphql', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ vaultV2ByAddress(address: "${MORPHO_VAULT}", chainId: 143) { netApy totalAssetsUsd } }` }) });
    const v = (await r.json()).data?.vaultV2ByAddress; return v ? { net_apy: +(v.netApy * 100).toFixed(2), vault_tvl_usd: Math.round(v.totalAssetsUsd) } : null;
  } catch { return null; }
}
async function status() {
  const [usdc, mon] = await Promise.all([pub.readContract({ address: USDC, abi: erc20, functionName: 'balanceOf', args: [who] }), pub.getBalance({ address: who })]);
  const out = { address: who, chain: chain.id, venue, usdc: formatUnits(usdc, 6), mon: formatUnits(mon, 18) };
  if (venue === 'morpho') {
    const [shares, withdrawable, apy] = await Promise.all([
      pub.readContract({ address: MORPHO_VAULT, abi: erc20, functionName: 'balanceOf', args: [who] }),
      pub.readContract({ address: MORPHO_VAULT, abi: erc4626, functionName: 'maxWithdraw', args: [who] }), morphoApy()]);
    const assets = shares ? await pub.readContract({ address: MORPHO_VAULT, abi: erc4626, functionName: 'convertToAssets', args: [shares] }) : 0n;
    Object.assign(out, { vault: MORPHO_VAULT, shares: formatUnits(shares, 18), supplied_usdc: formatUnits(assets, 6), withdrawable_now_usdc: formatUnits(withdrawable, 6), ...(apy || {}) });
  } else {
    const [aUsdc, rd] = await Promise.all([pub.readContract({ address: AAVE.A_USDC, abi: erc20, functionName: 'balanceOf', args: [who] }),
      pub.readContract({ address: AAVE.POOL, abi: aavePool, functionName: 'getReserveData', args: [USDC] })]);
    const apr = Number(rd.currentLiquidityRate) / 1e27;
    Object.assign(out, { pool: AAVE.POOL, supplied_usdc: formatUnits(aUsdc, 6), supply_apr: +(apr * 100).toFixed(2), supply_apy: +((Math.exp(apr) - 1) * 100).toFixed(2) });
  }
  return out;
}

if (has('--status')) { console.log(JSON.stringify(await status())); process.exit(0); }
if (!account) { console.error('TREASURY_KEY required'); process.exit(2); }
const wal = createWalletClient({ account, chain, transport });
const send = async (fn) => { const { request } = await pub.simulateContract({ ...fn, account }); const hash = await wal.writeContract(request); const rc = await pub.waitForTransactionReceipt({ hash }); if (rc.status !== 'success') throw new Error('reverted ' + hash); return hash; };
const spender = venue === 'morpho' ? MORPHO_VAULT : AAVE.POOL;

if (has('--supply')) {
  const bal = await pub.readContract({ address: USDC, abi: erc20, functionName: 'balanceOf', args: [who] });
  const amt = after('--supply') && !after('--supply').startsWith('--') ? parseUnits(after('--supply'), 6) : bal;
  if (amt === 0n || amt > bal) { console.error('nothing to supply', { balance: formatUnits(bal, 6) }); process.exit(1); }
  const allowance = await pub.readContract({ address: USDC, abi: erc20, functionName: 'allowance', args: [who, spender] });
  const txs = {};
  if (allowance < amt) txs.approve = await send({ address: USDC, abi: erc20, functionName: 'approve', args: [spender, amt] });
  txs.supply = venue === 'morpho'
    ? await send({ address: MORPHO_VAULT, abi: erc4626, functionName: 'deposit', args: [amt, who] })
    : await send({ address: AAVE.POOL, abi: aavePool, functionName: 'supply', args: [USDC, amt, who, 0] });
  console.log(JSON.stringify({ action: 'supply', venue, amount: formatUnits(amt, 6), ...txs, after: await status() }));
} else if (has('--withdraw')) {
  const a = after('--withdraw'); let tx;
  if (venue === 'morpho') {
    if (a === 'max') { const shares = await pub.readContract({ address: MORPHO_VAULT, abi: erc20, functionName: 'balanceOf', args: [who] }); tx = await send({ address: MORPHO_VAULT, abi: erc4626, functionName: 'redeem', args: [shares, who, who] }); }
    else tx = await send({ address: MORPHO_VAULT, abi: erc4626, functionName: 'withdraw', args: [parseUnits(a, 6), who, who] });
  } else tx = await send({ address: AAVE.POOL, abi: aavePool, functionName: 'withdraw', args: [USDC, a === 'max' ? maxUint256 : parseUnits(a, 6), who] });
  console.log(JSON.stringify({ action: 'withdraw', venue, amount: a, tx, after: await status() }));
} else { console.error('use --status, --supply [amount] or --withdraw amount|max'); process.exit(2); }
