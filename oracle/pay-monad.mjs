// Pay for a fixing over x402 with USDC on Monad (eip155:143) and verify the signed result.
//   PAYER_KEY=0x... node pay-monad.mjs "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO"
// The wallet needs USDC on Monad (0x754704Bc059F8C67012fEd69BC8A327a5aafb603); the facilitator pays gas.
import { x402Client } from '@x402/core/client';
import { encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { createPublicClient, http, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { FIXING_DOMAIN, FIXING_TYPES, messageOf } from './fixing-types.mjs';

const MONAD = { id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [process.env.MONAD_RPC || 'https://rpc.monad.xyz'] } } };
const url = process.argv[2]; if (!url) { console.error('usage: PAYER_KEY=0x... node pay-monad.mjs <paid url>'); process.exit(2); }
const account = privateKeyToAccount(process.env.PAYER_KEY);
const signer = toClientEvmSigner(account, createPublicClient({ chain: MONAD, transport: http(MONAD.rpcUrls.default.http[0]) }));
const client = new x402Client((_v, accepts) => { const o = accepts.find((a) => a.network === 'eip155:143'); if (!o) throw new Error('no Monad offer in accepts[]'); return o; }).register('eip155:143', new ExactEvmScheme(signer));
const first = await fetch(url);
if (first.status !== 402) { console.error('expected 402, got', first.status); process.exit(1); }
const required = await first.json();
const payload = await client.createPaymentPayload(required);
const paid = await fetch(url, { headers: { 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) } });
const body = await paid.json();
let tx = ''; try { tx = decodePaymentResponseHeader(paid.headers.get('payment-response')).transaction || ''; } catch { /* no receipt header */ }
const ok = body.attestation ? await verifyTypedData({ address: body.attestation.publisher, domain: FIXING_DOMAIN, types: FIXING_TYPES, primaryType: 'Fixing', message: messageOf(body), signature: body.attestation.signature }) : null;
console.log(JSON.stringify({ status: paid.status, facilitator: paid.headers.get('x-payment-facilitator'), settlement_tx: tx, ticker: body.ticker, day: body.day, value: body.value, verified: ok }));
console.log(JSON.stringify(body));
