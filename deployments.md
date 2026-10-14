# Deployments

Monad Metropolis submission, 13 October 2026. The token, oracle, wrapper and Kuru market are on **Monad testnet
(chain 10143)**; the x402 rail on the feed and the treasury's vault position are on **Monad mainnet (143)**.
Deployer and treasury for the demo: `0x774135421446D452b3F04A84709Fb62DaBAaD3E3`.

## Monad testnet (10143), explorer https://testnet.monadexplorer.com

| contract | address | tx |
|---|---|---|
| FixingOracle | `0x0452ABd329B6C4006ECCdA9FBb5c9e87F5d73744` | `0xb73ef0426dfc219cef20f083c6521580caec1e8cef7f9172d3f75d998733e6fe` |
| ComputeToken (ERC-1155) | `0xc6B96de257d3E1285080Fdb43BeF60DcbeDcd70c` | `0x09b8c17d185dea089e441393a9d6d60cabe2f50a00983dbcf190c8683f171d26` |
| ComputeToken20 `cS1-256` (ERC-20 view of size 0) | `0xc38b980224E7f7ca981AF8B9Ae868849dD32b19F` | `0xd8a10bde40db2be4b1aa94cccf2b06d06a7ded540b55ca133f06c68a32d630df` |
| Mock USDC (6 decimals, testnet stand-in) | `0x966ca2c9a5c3927C6AB1Ccd7068E13e698458A2F` | `0x1ac1d624926588d4d90ad240f2162832ed391a05fdb18c2556ea02fed3d42bec` |
| Kuru market cS1-256 / USDC (OrderBook proxy via Router `0x7EFbE105…4630`) | `0x9178E699E33c0253E39d769dA0A7B87cfb1346c5` | first run of `kuru/market.mjs` |

Publisher recognised by the oracle: `0x1b77aE05cd23C514A1De304b6b771513f6eFa780` (the live corpusAI publisher key).
Sizes registered: the ten corpus catalog sizes, priced `P = k·C/r` (k 1.15, r 7.24 %); see `script/Deploy.s.sol`.
Operator issuance at deploy: 2 × size 0 (`s1-256`) to the treasury, note "operator issuance: initial market liquidity,
backed by the corpus treasury". `issuedTotal() == 2`.

## Demo transactions (testnet)

| step | tx |
|---|---|
| Relay of the live fixing `CX.H100SXM.NEO` 2026-10-13, $4.0875/GPU-h, n 13 (signed by the production publisher) | `0xecbea073f781e9c80c45ae391376f3eedbd02c26709fc0f4b1b51f783fd38804` |
| Mock USDC to the deployer (2,000) | `0x23d8f961e4e1c1a7376edea6f590da789e74091af46dc01bdf8d85c7c72aa2d3` |
| Mint 1 × `s1-1g` for 1,086.46 USDC (approve, mint) | `0x6e1f4a9209874979cb975661a0a88ff3ebfab7b47b0065c4e1ff80470e69487b`, `0xa32824f00c2a15f4d0c9a5dddbfea91bd1c9f8a960832632bea1e801ed50d125` |
| Redeem it to account ref keccak("hello@trycorpus.ai") | `0x526f4186ef0baf24c2776828845e2de1d87f35bdb17650f4d6a6c8b3608a6165` |
| Wrap 2 × `s1-256` into cS1-256 | first run of `kuru/market.mjs` |
| Deposit 2 cS1-256 into Kuru MarginAccount `0xd029C2D9…CE02` | `0x3f530f783b6aa75e5b6aca34daf4b106eaf502d0dc13d40daa8ea86a65404ffa` |
| Ask 1 @ 620.00 USDC | `0x9bf441401f09e2fb45e94fdb9fda7aa78fb0e33ff22429505f444f767cb85e34` |
| Ask 1 @ 632.40 USDC | `0x4da6bc637084c0a5e54ccd471a0a129134a8039d05d2dee4e1a8ea7a29557aa5` |

The mint and redeem are self-transactions by the operator to show the flow; they are not customer traction. The asks
are sell-side only; no bids were placed by us.

## Monad mainnet (143)

- x402: every 402 from https://cloud.trycorpus.ai carries a USDC offer on `eip155:143` settled by the Monad facilitator (live since 1 Oct 2026).
- Treasury vault: Hyperithm USDC Apex on Morpho, `0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371` (`treasury/sweep.mjs`); fallback Aave v3 pool `0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef`.
- Kuru mainnet listing: `Router.deployProxy` on mainnet is owner-gated (reverts `Unauthorized()`), so the market is on testnet; a mainnet listing has been requested from Kuru.
- RPC: Alchemy (`monad-mainnet.g.alchemy.com`, `monad-testnet.g.alchemy.com`) for the relay, treasury and token scripts when `ALCHEMY_KEY` is set; public RPCs otherwise.

## Reproduce

```
export MONAD_RPC=https://testnet-rpc.monad.xyz DEPLOYER_KEY=0x...
MOCK_USDC=1 SEED_ISSUE=0:2 forge script script/Deploy.s.sol --rpc-url $MONAD_RPC --broadcast --private-key $DEPLOYER_KEY
CHAIN_ID=10143 RELAYER_KEY=$DEPLOYER_KEY ORACLE=<oracle> node oracle/relay.mjs --fetch "https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO" --key <prepaid key>
CHAIN_ID=10143 USDC=<mock> DEPLOYER_KEY=$DEPLOYER_KEY TOKEN=<token> WRAPPER=<wrapper> node kuru/market.mjs --qty 2 --ask 620
```
