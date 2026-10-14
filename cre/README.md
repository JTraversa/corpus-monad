# cre/: the fixing relay as a Chainlink CRE workflow

CRE is the orchestration layer between the corpusAI price feed (an external, authenticated HTTP API) and the
FixingOracle contract on Monad. Without it, the daily relay is a script we run. With it, the relay is a scheduled
workflow a DON runs: fetch, agree, verify, write.

## What the workflow does (`relay-fixing/main.ts`)

1. **Trigger.** A cron at 00:10 UTC, ten minutes after the feed publishes the day's fixings.
2. **Fetch (HTTP capability).** Every node calls `GET /v1/index/fixing?ticker=CX.H100SXM.NEO` on
   cloud.trycorpus.ai with a prepaid key from CRE secrets, and extracts the `attestation`: the EIP-712 domain,
   types, message and the publisher's signature.
3. **Consensus.** The nodes aggregate with identical aggregation: the signed payload for a day is deterministic, so
   any node that saw something different is outvoted.
4. **Verify (compute).** The workflow recovers the signer from the EIP-712 digest and refuses anything not signed by
   the corpusAI publisher `0x1b77aE05cd23C514A1De304b6b771513f6eFa780`.
5. **Report and write (EVM capability).** It abi-encodes `(Fixing, signature)`, has the DON sign it as a report, and
   `writeReport`s it to `FixingReceiver` on `monad-testnet` through the CRE forwarder. The receiver calls
   `FixingOracle.post`, which verifies the publisher signature again on chain.

The trust model is the point: CRE makes the relay run without us, but it cannot change a number. The only
authority over a value is the publisher key, checked once in the workflow and once in the contract.

## Files

- `relay-fixing/main.ts`: the workflow (TypeScript, `@chainlink/cre-sdk`, viem for ABI and EIP-712 hashing).
- `relay-fixing/config.json`: schedule, feed URL, chain selector, receiver, publisher, gas, and `write` (false = stop after
  verification and report encoding, for a dry simulation; true = submit).
- `relay-fixing/workflow.yaml`, `project.yaml`: CRE CLI settings (staging on monad-testnet, production on monad-mainnet).
- `secrets.example.yaml`: the one secret, `CORPUS_API_KEY`. Copy to `secrets.yaml` and put the key in `.env` as `CORPUS_API_KEY_VAR`.
- `../src/FixingReceiver.sol`: the IReceiver the forwarder calls. Deployed on Monad testnet at
  `0xe38729aedb2866AD136dbEBfc1bA62fc95e5Ac77`; proven with a direct `onReport` of a real signed fixing
  (tx `0x2fe6706b…c80f`), after which `reportsAccepted() == 1`.

## Run

```
cd cre && npm install
cp secrets.example.yaml secrets.yaml && echo CORPUS_API_KEY_VAR=ck_live_... > .env
cre login
cre workflow simulate ./relay-fixing                # dry: fetch, consensus, verify, encode the report
# set "write": true in config.json to submit through the forwarder; set the forwarder on the receiver once Monad's is known
```

## Status at submission (13 Oct 2026, 20:20 MDT)

`cre workflow simulate ./relay-fixing --trigger-index 0` ran successfully (`simulation.log`): the cron trigger fired,
the HTTP capability fetched the live fixing for 2026-10-14 from the feed, consensus passed, the workflow verified
the signer as the corpusAI publisher, and the 544-byte report for FixingReceiver was prepared. The run was made
with `write: false`, so the EVM write step was wired but not exercised in the simulator: a `write: true` run failed
the CLI's config validation and there was no time left to resolve it. The receiver itself is deployed on Monad
testnet and was exercised directly with the same report (`reportsAccepted() == 1`), so the chain side is proven
outside the simulator. Next step: resolve the write-mode config, set the Monad forwarder on the receiver, and
deploy the workflow with `cre account access`.
