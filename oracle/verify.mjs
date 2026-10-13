// Verify a fixing response from https://cloud.trycorpus.ai offline.
//   node verify.mjs fixing.json        (a saved /v1/index/fixing or /v1/tokens/fixing response)
//   curl -s -H "X-Api-Key: $KEY" "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO" | node verify.mjs
import fs from 'node:fs';
import { verifyTypedData } from 'viem';
import { FIXING_DOMAIN, FIXING_TYPES, messageOf } from './fixing-types.mjs';
const text = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
const f = JSON.parse(text);
if (!f.attestation) { console.error('no attestation block: the response was not a signed fixing'); process.exit(2); }
const ok = await verifyTypedData({ address: f.attestation.publisher, domain: FIXING_DOMAIN, types: FIXING_TYPES, primaryType: 'Fixing', message: messageOf(f), signature: f.attestation.signature });
console.log(JSON.stringify({ ticker: f.ticker, day: f.day, value: f.value, n: f.n, methodology: f.methodology, publisher: f.attestation.publisher, verified: ok }));
process.exit(ok ? 0 : 1);
