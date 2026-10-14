# Metropolis submission: corpusAI on Monad

Portal text, the technical demo shot list and the pitch script. Deadline 13 Oct 2026, 23:59 EDT (21:59 MDT).

## Portal fields

**Project name:** corpusAI on Monad
**Tagline:** Compute that pays you: own a machine as a token on Monad, earn while it idles, trade it, or redeem it.
**Track:** Onchain Finance & Trading (Track 1)
**Live product:** https://hackathon.trycorpus.ai (overview) · https://hackathon.trycorpus.ai/mint (mint, redeem) · https://www.trycorpus.ai (corpus dashboard: deploy a machine and fund it by redeeming a token)
**Repos:** https://github.com/JTraversa/corpus-monad (contracts, clients, treasury, site) · https://github.com/JTraversa/corpus-agent-wallet-plugin (MetaMask Agent Wallet plugin) · corpus-api and corpus-website changes for redemption are in corpus's own repos (`POST /api/funding/redeem`, machine page "Redeem a compute token")
**Deployed on:** Monad testnet (chain 10143) for the token, oracle, wrapper and Kuru market; Monad mainnet for x402 payments on the feed and the treasury vault. Addresses: `deployments.md`.
**Access for judges:** everything is public. Mint page needs a browser wallet on Monad testnet with testnet MON (faucet.monad.xyz) and test USDC (the deployment's mock USDC, `0x966ca2c9a5c3927C6AB1Ccd7068E13e698458A2F`; mail hello@trycorpus.ai with an address for a balance). The corpus dashboard needs an invite code; judges can request one at hello@trycorpus.ai, or watch the demo video for that flow. The x402 call needs no account: `curl -i "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO"` returns the 402 with the Monad offer.

**Description (long):**
corpus sells permanently funded compute: one deposit whose principal is never spent and whose yield pays the machine's bill forever. On Monad we turned that machine into a token. ComputeToken is an ERC-1155 where one token is one permanently funded corpus machine of a given size, priced by corpus's own underwriting (P = k·C/r). Minting is the payment in USDC; the holder has a transferable claim backed by a principal that is never spent. A holder earns yield from jobs routed to the idle machine (the router is the next build), can trade the token (listed on Kuru as cS1-256/USDC), and can redeem it any time: burn it naming a corpus account, and corpus opens the position. That redemption is wired end to end: the corpus dashboard's deploy wizard has a "Redeem a compute token" path, the machine page redeems from the user's wallet, waits for the receipt and funds the machine from the token.

Underneath sit three pieces, all live. The corpusAI Cloud Pricing feed serves 29 priced endpoints and 35 MCP tools for cloud, GPU and LLM token prices; every 402 carries a USDC offer on Monad settled by the Monad facilitator, so an agent buys a price for a cent with no account. FixingOracle on Monad verifies the publisher's EIP-712 signature on each daily fixing, so anyone can relay and nobody can forge; today's H100 SXM fixing is on chain. The treasury sweeps customer float into a curated USDC vault on Morpho (Aave v3 fallback) so the money works while it waits. A MetaMask Agent Wallet plugin gives agents the whole loop, every signature and transaction through the wallet.

**What is new in the window (1 Sep to 13 Oct):** Monad x402 rail, signed fixings and daily attestations, hosted MCP server, FixingOracle, ComputeToken and its ERC-20 wrapper, the Kuru listing, the mint site, the treasury sweep, the corpus-api redemption endpoint and dashboard flow, and the Agent Wallet plugin.
**Pre-existing:** the pricing feed's collectors and archive, and corpus's deposit and position ledger on Ethereum. Disclosed in the README.
**Team:** Julian Traversa, Alexandra. Community: Encode Club.
**AI tools:** Claude Code, under the team's direction.

**Judging hooks (Track 1):**
- Technical execution: real settlement (USDC on Monad), real pricing logic on chain (catalog underwriting recorded per size; oracle fixings signed and verified), real issuance and redemption, real order book listing.
- Design and craft: the mint page states price, principal and buffer per size, the chain, the mock asset, and that seeded tokens were operator-issued; the dashboard flow is the production corpus UI.
- Originality: compute as a yield-bearing, redeemable asset rather than a prepaid credit; the oracle makes GPU sizes priceable next.
- Founder and market readiness: corpus's existing customers fund machines today; the first token users are those same customers who want to hold compute as a position, plus agents buying prices over x402 (the feed is in the Anthropic and OpenAI connector directories).
- Traction and path: live feed with paid x402 calls; the token on testnet with real mint, redeem and Kuru asks; next 30 days: mainnet token with real USDC, Kuru mainnet listing (by Kuru's approval), the job router for the yield leg, then GPU sizes priced by the oracle.

## Bounty answers

**B8 Kuru, new assets.** Asset class: permanently funded compute machines, one ERC-20 unit = one machine (cS1-256 wraps ComputeToken size 0). Customer: corpus customers and treasuries that want compute as a yield-bearing position; traders who want exposure to compute prices. Demand: corpus's existing paid deposits; the feed's paid x402 calls. Issuance: mint at corpus's underwritten price, or operator issuance disclosed on chain (`issuedTotal`). Redemption: burn with an account reference; corpus opens the position (live in the corpus dashboard). Liquidity and market formation: the two seeded tokens sit as asks at $620 and $632.40 on the testnet market `0x9178E699E33c0253E39d769dA0A7B87cfb1346c5`; mainnet market creation is owner-gated on Kuru's Router, listing requested; corpus will quote a continuous mint at price and a cash redemption at principal to pin the market. Legal/operational: token redeems for a service; cash leg deferred to counsel; the asks are sell-side only, no self-trades. Roadmap: mainnet listing, GPU sizes with the oracle as reference, job-yield accrual.

**B21 MetaMask Agent Wallet plugin.** `@corpusai/agent-wallet-plugin`: `mm corpus price` pays the feed's x402 402 in USDC on Monad with the EIP-3009 authorization signed by the wallet (typed-data request), verified against the offer, spend-capped; `mm corpus oracle` reads the fixing; `mm corpus sizes|mint|redeem` buy and redeem compute with approvals and mints as wallet transactions. No key handling, no bypass of signing, policy or MFA. SKILL.md: https://github.com/JTraversa/corpus-agent-wallet-plugin/blob/main/skills/corpus-compute/SKILL.md

**B10 Alchemy.** Alchemy's Monad mainnet and testnet RPC endpoints drive the relay, treasury sweep and token client when `ALCHEMY_KEY` is set, and the fork rehearsal of the Kuru listing was run against Alchemy's mainnet endpoint.

**B1 Community.** Encode Club.

## Technical demo, 3 minutes, live product only

Record the screen at 1080p. One tab per surface, opened beforehand. Narrate in your own words; the bullets are what to show.

1. (0:00) hackathon.trycorpus.ai. Let the splash settle. Point at the live strip: Monad offer count, the H100 fixing, attestations, vault APY. Scroll "three ways it pays".
2. (0:30) Terminal: `curl -i "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO"` shows the 402 with `eip155:143` USDC. Then `mm corpus oracle CX.H100SXM.NEO --json` (or the explorer page of the relay tx) shows the same fixing on chain, $4.0875, n 13.
3. (1:00) hackathon.trycorpus.ai/mint, wallet on Monad testnet. Sizes table live from chain (s1-256 outstanding 2). Mint one s1-1g: approval, mint, explorer link. Show "you hold 1".
4. (1:40) www.trycorpus.ai dashboard: deploy wizard, shared-cpu-1x 256 MB, click "Redeem a compute token". Machine page opens the redeem form: account reference, "Redeem with wallet", confirm in wallet, receipt, "Funding the machine…", status flips to creating. Scroll the position: principal, buffer, funded.
5. (2:30) Kuru testnet market page or `node kuru/market.mjs --status --market 0x9178…`: two asks. Then one line: mainnet listing is by Kuru's approval, requested.
6. (2:50) `mm corpus price --ticker CX.H100SXM.NEO --json` through the Agent Wallet, or the plugin README. End on the repo.

## Pitch, 2 minutes, team on camera

- (0:00) Who: Julian, built corpusAI, the permanently funded compute platform, and the corpusAI Cloud Pricing feed that agents already pay for over x402. Alexandra, [one line on her part].
- (0:20) Problem: compute is rented, never owned. A GPU or a VM is a cost line with no asset behind it; you cannot hold it, lend it, or sell it, and idle capacity earns nothing. Meanwhile agents need prices they can verify, not scrape.
- (0:50) What we built on Monad: a machine as a token. Pay once, the principal is never spent, the yield pays the bill. Hold it and jobs routed to the idle machine pay you. Trade it on Kuru. Or redeem it in the corpus dashboard and get the machine. Under it, a price oracle any contract can verify and a feed agents pay per call in USDC on Monad.
- (1:25) Why Monad: sub-second finality makes paying for a price feel like an API call, and the USDC agents pay with is the asset Morpho and Aave lend, so the float never leaves the chain.
- (1:40) Where it goes: mainnet token with real USDC this month, Kuru listing, the job router for the yield leg, then GPUs priced by the oracle. First users are corpus's own customers and the agents already hitting the feed.
