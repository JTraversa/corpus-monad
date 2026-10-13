# treasury/

Fund management for corpus compute on Monad. The design is deliberately the one corpus already runs on Ethereum, with one change: settled deposits earn yield in a curated USDC lending vault on Monad instead of sitting idle in the treasury.

## How a customer funds compute today (Ethereum)

1. `POST /api/funding/checkout` on corpus-api derives a fresh USDC deposit address for the customer from a watch-only xpub and records what the payment funds.
2. The customer sends USDC. The watcher (`POST /admin/deposits/scan`) reads `balanceOf` at the `finalized` block, settles the deposit into the customer's positions and the ledger, and the machines move to `creating`.
3. Deposits are swept to the treasury, which pays the hosting bills.

## What changes on Monad

- **Monad as a deposit chain.** Same checkout, same HD-derived address, same watcher. corpus-api is configured per chain by `ETH_RPC_URL`, `USDC_ADDRESS` and `DEPOSIT_CONFIRMATIONS`; for Monad these are `https://rpc.monad.xyz`, USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (chain 143) and a confirmation depth of a few blocks, since Monad finalises in under a second rather than the 64-block floor used on Ethereum. The watcher already reads at the `finalized` tag, which Monad supports.
- **Sweeps go to a lending vault, not to an idle wallet.** `sweep.mjs --supply` deposits the treasury's USDC into the Hyperithm USDC Apex vault on Morpho (a Morpho Vault V2, ERC-4626, `0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371`, about $52M of USDC at a net 7.3% when this was written). The treasury holds vault shares, and `sweep.mjs --withdraw` pulls USDC back when bills fall due. `--venue aave` switches to the Aave v3 USDC pool (`0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef`, aMonUSDC `0x35a73BAcb179d3740395A3ceCc87FF2e581d6042`) as a lower-rate, deeper-exit fallback.
- **Venue choice.** On 13 Oct 2026 Monad stablecoin yields ranged from 3.7% (Aave USDC, on chain) through 7 to 8% (curated Morpho and Euler USDC vaults) to 10 to 13% (Accountable, private credit with queued withdrawals) and 17 to 19% (Pendle fixed yield on small synthetic dollars). Customer float needs same-day exit, so the curated overcollateralised vaults are the ceiling; the private-credit and fixed-yield venues are not treasury products.
- **Billing is unchanged.** Customers are billed from the corpus ledger at catalog prices, as now. The yield on float subsidises hosting; it is not credited to customers.

## Why this and not an escrow contract

An earlier draft of this project held customer funds in a bespoke vault contract that paid for jobs at the oracle price. It would have added a new custody contract and a new operator key with 22 hours on the clock, and it did not change what customers actually trust corpus with (metering). Keeping the proven deposit flow and changing only where the float sits is the version corpus can ship. The oracle remains the on-chain piece: it is what the x402 feed, the attestations and the Compute Forwards project all build on.

## Usage

```
npm install
node sweep.mjs --status --address 0x<treasury>
TREASURY_KEY=0x... node sweep.mjs --supply          # whole USDC balance into the Morpho vault
TREASURY_KEY=0x... node sweep.mjs --supply 25       # 25 USDC
TREASURY_KEY=0x... node sweep.mjs --withdraw max
TREASURY_KEY=0x... node sweep.mjs --venue aave --supply 25
```

`--status` needs no key and reports USDC, vault shares and their USDC value, what is withdrawable right now, MON for gas, and the vault's net APY from Morpho's API (the rate is not on chain).
