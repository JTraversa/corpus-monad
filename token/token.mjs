// ComputeToken client. One token = one permanently funded corpus VM of a size; minting pays corpus's position price in USDC on Monad.
//   TOKEN=0x... node token.mjs types                         list sizes, prices and outstanding supply (no key)
//   TOKEN=0x... node token.mjs balance 0x...                 a holder's balances (no key)
//   TOKEN=0x... BUYER_KEY=0x... node token.mjs mint <id> <qty>
//   TOKEN=0x... BUYER_KEY=0x... node token.mjs redeem <id> <qty> <corpus account id>
// CHAIN_ID=10143 for Monad testnet (default 143, mainnet). MONAD_RPC overrides the RPC.
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const chainId = +(process.env.CHAIN_ID || 143);
const chain = { id: chainId, name: chainId === 143 ? 'Monad' : 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [process.env.MONAD_RPC || (process.env.ALCHEMY_KEY ? `https://monad-${chainId === 143 ? 'mainnet' : 'testnet'}.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}` : (chainId === 143 ? 'https://rpc.monad.xyz' : 'https://testnet-rpc.monad.xyz'))] } } };
const TOKEN = process.env.TOKEN; if (!TOKEN) { console.error('TOKEN=0x... required'); process.exit(2); }
export const abi = parseAbi([
  'function usdc() view returns (address)', 'function treasury() view returns (address)', 'function typeCount() view returns (uint256)',
  'function types(uint256) view returns (string slug, string label, uint256 monthlyUsdc, uint256 principalUsdc, uint256 priceUsdc, bool active)',
  'function totalSupply(uint256 id) view returns (uint256)', 'function balanceOf(address, uint256) view returns (uint256)',
  'function mint(uint256 id, uint256 qty) returns (uint256)', 'function redeem(uint256 id, uint256 qty, bytes32 accountRef)',
]);
const erc20 = parseAbi(['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const transport = http(chain.rpcUrls.default.http[0]); const pub = createPublicClient({ chain, transport });
const [cmd, ...rest] = process.argv.slice(2);

async function types() {
  const n = Number(await pub.readContract({ address: TOKEN, abi, functionName: 'typeCount' }));
  const out = [];
  for (let id = 0; id < n; id++) {
    const [t, supply] = await Promise.all([pub.readContract({ address: TOKEN, abi, functionName: 'types', args: [BigInt(id)] }), pub.readContract({ address: TOKEN, abi, functionName: 'totalSupply', args: [BigInt(id)] })]);
    out.push({ id, slug: t[0], label: t[1], monthlyUsdc: formatUnits(t[2], 6), principalUsdc: formatUnits(t[3], 6), priceUsdc: formatUnits(t[4], 6), active: t[5], outstanding: supply.toString() });
  }
  return out;
}
const send = async (wal, account, fn) => { const { request } = await pub.simulateContract({ ...fn, account }); const hash = await wal.writeContract(request); const rc = await pub.waitForTransactionReceipt({ hash }); if (rc.status !== 'success') throw new Error('reverted ' + hash); return hash; };

if (cmd === 'types') console.log(JSON.stringify(await types(), null, 1));
else if (cmd === 'balance') {
  const who = rest[0]; const list = await types();
  const bals = await Promise.all(list.map((t) => pub.readContract({ address: TOKEN, abi, functionName: 'balanceOf', args: [who, BigInt(t.id)] })));
  console.log(JSON.stringify(list.map((t, i) => ({ id: t.id, slug: t.slug, balance: bals[i].toString() })).filter((b) => b.balance !== '0')));
} else if (cmd === 'mint' || cmd === 'redeem') {
  const account = privateKeyToAccount(process.env.BUYER_KEY); const wal = createWalletClient({ account, chain, transport });
  const id = BigInt(rest[0]); const qty = BigInt(rest[1]);
  if (cmd === 'mint') {
    const [t, usdc] = await Promise.all([pub.readContract({ address: TOKEN, abi, functionName: 'types', args: [id] }), pub.readContract({ address: TOKEN, abi, functionName: 'usdc' })]);
    const cost = t[4] * qty; const txs = {};
    const allowance = await pub.readContract({ address: usdc, abi: erc20, functionName: 'allowance', args: [account.address, TOKEN] });
    if (allowance < cost) txs.approve = await send(wal, account, { address: usdc, abi: erc20, functionName: 'approve', args: [TOKEN, cost] });
    txs.mint = await send(wal, account, { address: TOKEN, abi, functionName: 'mint', args: [id, qty] });
    console.log(JSON.stringify({ action: 'mint', chain: chainId, id: Number(id), slug: t[0], qty: Number(qty), paidUsdc: formatUnits(cost, 6), ...txs }));
  } else {
    const ref = keccak256(toHex(rest[2] || ''));
    const tx = await send(wal, account, { address: TOKEN, abi, functionName: 'redeem', args: [id, qty, ref] });
    console.log(JSON.stringify({ action: 'redeem', chain: chainId, id: Number(id), qty: Number(qty), accountRef: ref, tx }));
  }
} else { console.error('commands: types | balance <addr> | mint <id> <qty> | redeem <id> <qty> <account>'); process.exit(2); }
