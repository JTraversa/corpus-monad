# corpusAI on Monad

Redeemable, transferable compute on Monad: mint a corpus VM as a token in USDC, hold or trade it, redeem it for the machine. Underneath: a verifiable compute price oracle, x402 payments for prices in USDC on Monad, and a treasury that puts the float to work in Monad DeFi. Built for the Monad Metropolis hackathon, Track 4 (Trust, Identity and AI Infrastructure).

**What it is.** Agents already pay [corpusAI Cloud Pricing](https://cloud.trycorpus.ai) per call for cloud, GPU and LLM token prices over x402. Since 1 October 2026 those calls settle in USDC on Monad through Monad's facilitator, and every index fixing the feed serves carries an EIP-712 signature by the corpusAI publisher key plus a daily on-chain attestation of the whole fixing set. This repository is the Monad side of that system:

- `src/FixingOracle.sol`: verifies publisher-signed fixings on Monad and stores them so any contract can read a GPU-hour price (`latest("CX.H100SXM.NEO")`). Anyone may relay a signed fixing; the signature is the authority. The EIP-712 domain has no chainId, so a fixing signed once verifies on every chain.
- `src/ComputeToken.sol`: an ERC-1155 where each id is one corpus VM size (Fly-modeled: shared-cpu-1x 1 GB and so on) for a 30-day term, and one token is one VM-term. Minting is the payment: the catalog price in USDC on Monad goes to the treasury and the buyer holds a transferable claim. Redeeming burns the token and emits `Redeemed(holder, id, qty, accountRef)`; corpus indexes that event and provisions the machine. `totalSupply(id)` is the outstanding liability per size. `token/` is the CLI (types, mint, redeem, balance) and `web/mint.html` is the mint page.
- `treasury/`: fund management. Customer deposits on Monad follow the deposit flow corpus already runs on Ethereum (HD-derived USDC address, finality-gated watcher, ledger), and settled float is swept into a curated USDC lending vault on Morpho (Hyperithm USDC Apex, with Aave v3 as fallback) instead of sitting idle; `sweep.mjs` supplies and withdraws. See `treasury/README.md` for the integration and the reasoning.
- `oracle/`: the publisher side, extracted from the live feed: EIP-712 fixing signatures, daily attestations, a client that pays the x402 402 on Monad and verifies what comes back, and a permissionless relay that posts a fixing on chain.
- `script/Deploy.s.sol`: deployment to Monad testnet.

## The compute token, and what it is not yet

Today a corpus customer funds a machine from a balance held by corpus. The token separates paying from provisioning: pay once on Monad, hold a claim that any wallet can own, redeem whenever the machine is wanted. That makes compute a thing third parties can hold, gift, sell or market-make, with the oracle as the public price reference for the GPU sizes that come next.

Deliberately out of scope for this submission, and listed so nobody mistakes the demo for the product: the corpus-api side of redemption (wallet-to-account link, a VM-terms ledger beside the USD ledger, the watcher indexing `Redeemed` and provisioning), secondary liquidity, price hedging for GPU sizes, and the legal treatment of a tradeable claim on a service. The Fly-modeled sizes were chosen as the proof of concept precisely because their price is a catalog number set by corpus, so none of the GPU forward dynamics apply yet.

## Why Monad

400 ms blocks and 800 ms finality make per-call settlement feel like an ordinary API round trip, which is what agent commerce needs: an agent pays 0.01 USDC for a price, gets it back signed, and can hand that signature to a contract on the same chain in the same second. The Monad facilitator settles the x402 payment without any API key, so the whole loop runs with no accounts on either side. And the same USDC that agents pay with is the asset Aave, Euler and Morpho lend on Monad, so customer float can earn without leaving the chain.

## Live surfaces

- Feed: https://cloud.trycorpus.ai (docs at /docs, methodology at /methodology, governance and the signing scheme at /governance)
- A paid call on Monad: `curl -i "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO"` returns a 402 whose `accepts[]` includes `eip155:143` USDC
- Daily attestations: https://cloud.trycorpus.ai/v1/attestations
- Contracts, treasury position and demo transactions on Monad: see `deployments.md`

## Setup

```
forge install
forge test
# deploy oracle + token to Monad (mainnet by default; MOCK_USDC=1 on a testnet deploys a mock USDC)
export MONAD_RPC=https://rpc.monad.xyz DEPLOYER_KEY=0x...
forge script script/Deploy.s.sol --rpc-url $MONAD_RPC --broadcast --private-key $DEPLOYER_KEY
# mint one shared-cpu-1x 1 GB VM-term (id 2) and redeem it to a corpus account
cd token && npm install
TOKEN=0x... node token.mjs types
TOKEN=0x... BUYER_KEY=0x... node token.mjs mint 2 1
TOKEN=0x... BUYER_KEY=0x... node token.mjs redeem 2 1 my-corpus-account
```

`web/mint.html?token=0x...` is the same flow in a browser with an injected wallet.

The test suite includes a real fixing signed by the production publisher key; `FixingOracle` must accept it unchanged and reject any edit.

## Pre-existing foundation (identified per the hackathon rules)

- The corpusAI Cloud Pricing feed (collectors, archive, index methodology, API) predates this repository. Its API and governance are public; its collectors are not part of this submission. Everything here consumes the feed as an external service, the way any third party would.
- The corpusAI compute platform on Ethereum (corpus-api, corpus-website) and its deposit flow predate the hackathon and are not part of this submission. `treasury/` describes how that flow is pointed at Monad and adds the Morpho sweep; the sweep script is new.

## Built during the hackathon window (1 Sep to 13 Oct 2026)

The x402 feed itself (from 12 Sep), EIP-712 fixing signatures and daily attestations (27 Sep), the Monad facilitator integration (1 Oct), and everything in this repository: the oracle contract, the compute token, the mint page, the clients and the treasury sweep (10 to 13 Oct).

## Team and AI tools

Julian Traversa and Alexandra, one team, one submission. Developed with AI assistance (Claude Code) under the team's direction; every design decision, key and deployment is the team's.

## Licence

MIT. The feed's data is licensed separately at https://cloud.trycorpus.ai/license.
