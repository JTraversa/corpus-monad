// Relay a signed fixing to FixingOracle on Monad testnet (or mainnet). Permissionless: anyone can run it.
//   RELAYER_KEY=0x... ORACLE=0x... node relay.mjs fixing.json
//   RELAYER_KEY=0x... ORACLE=0x... node relay.mjs --fetch "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO" --key ck_live_...
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const args = process.argv.slice(2); const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const chainId = +(process.env.CHAIN_ID || 10143);
const chain = { id: chainId, name: chainId === 143 ? 'Monad' : 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [process.env.MONAD_RPC || (chainId === 143 ? 'https://rpc.monad.xyz' : 'https://testnet-rpc.monad.xyz')] } } };
const abi = parseAbi([
  'struct Fixing { string ticker; string day; uint256 valueE18; uint32 n; string methodology; }',
  'function post((string ticker,string day,uint256 valueE18,uint32 n,string methodology) f, bytes sig)',
  'function latest(string ticker) view returns ((uint256 valueE18,uint32 n,uint64 postedAt,string day,string methodology))',
]);
let f;
if (flag('--fetch')) { const r = await fetch(flag('--fetch'), { headers: flag('--key') ? { 'X-Api-Key': flag('--key') } : {} }); f = await r.json(); if (r.status !== 200) { console.error('fetch failed', r.status, JSON.stringify(f).slice(0, 200)); process.exit(1); } }
else f = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const a = f.attestation; if (!a) { console.error('not a signed fixing'); process.exit(2); }
const account = privateKeyToAccount(process.env.RELAYER_KEY);
const transport = http(chain.rpcUrls.default.http[0]);
const pub = createPublicClient({ chain, transport }); const wal = createWalletClient({ account, chain, transport });
const fixing = { ticker: a.message.ticker, day: a.message.day, valueE18: BigInt(a.message.valueE18), n: a.message.n, methodology: a.message.methodology };
const { request } = await pub.simulateContract({ address: process.env.ORACLE, abi, functionName: 'post', args: [fixing, a.signature], account });
const hash = await wal.writeContract(request);
const rc = await pub.waitForTransactionReceipt({ hash });
const latest = await pub.readContract({ address: process.env.ORACLE, abi, functionName: 'latest', args: [fixing.ticker] });
console.log(JSON.stringify({ tx: hash, status: rc.status, chain: chainId, ticker: fixing.ticker, day: latest.day, valueE18: latest.valueE18.toString(), n: latest.n }));
