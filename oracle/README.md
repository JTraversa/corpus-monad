# oracle/

The publisher side and the consumer side of corpusAI fixings on Monad.

- `fixing-types.mjs`: the EIP-712 domain and struct the publisher signs.
- `verify.mjs`: verify a saved fixing response offline.
- `pay-monad.mjs`: pay the x402 402 for a fixing in USDC on Monad through Monad's facilitator and verify what comes back.
- `relay.mjs`: post a signed fixing to `FixingOracle` on Monad; permissionless.
- `publisher-sign.mjs`, `publisher-attest.mjs`: the signing and daily-attestation modules as they run inside the live feed (reference; they are the same files the production server loads). The publisher key never leaves the feed.

```
npm install
curl -s -H "X-Api-Key: $KEY" "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO" > fixing.json
node verify.mjs fixing.json
RELAYER_KEY=0x... ORACLE=0x... node relay.mjs fixing.json
```
