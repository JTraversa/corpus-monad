// EIP-712 attestations for index fixings.
//
// Every fixing the API serves can carry a signature by the corpusAI publisher key over a typed
// struct of the fixing itself (ticker, day, value in USD × 1e18 like an 18-decimal ERC-20, quote count, methodology version).
// The same signature verifies off-chain with any EIP-712 library (viem verifyTypedData, ethers
// verifyTypedData) and on-chain with ECDSA.recover over hashTypedDataV4, so a third party can
// submit a fixing to an oracle contract without corpusAI's involvement. The domain has no chainId:
// an attestation is a statement about a published number, not an authorisation, so it is valid
// on every chain. Signatures are deterministic (RFC 6979), so re-signing the same fixing yields the
// same bytes and memoisation is safe. Not required by BMR or IOSCO; see /governance.
import { privateKeyToAccount } from 'viem/accounts';
// Copied verbatim from the live feed (cloud-pricing-data/api/attest.mjs) on 2026-10-01 for reference.

export const FIXING_TYPES = {
  Fixing: [
    { name: 'ticker', type: 'string' },
    { name: 'day', type: 'string' },
    { name: 'valueE18', type: 'uint256' },
    { name: 'n', type: 'uint32' },
    { name: 'methodology', type: 'string' },
  ],
};
export const FIXING_DOMAIN = { name: 'corpusAI Cloud Pricing', version: '1' };

export function createAttester({ privateKey, log = () => {} }) {
  if (!privateKey) { log('attest: PUBLISHER_KEY not set, fixings are served unsigned'); return null; }
  const account = privateKeyToAccount(privateKey);
  const memo = new Map();
  log(`attest: publisher ${account.address}`);
  /** Message struct for a fixing: value as an exact 18-decimal integer (the fixing has 6 decimals, so ×1e6 is exact, then ×1e12). */
  const messageFor = (f) => ({ ticker: f.ticker, day: f.day, valueE18: BigInt(Math.round(+f.value * 1e6)) * 10n ** 12n, n: Number(f.n || 0), methodology: f.methodology });
  /** Returns the fixing with `indicative` (fewer than three quotes) and an `attestation` block. */
  async function attest(f) {
    if (!f || f.value == null) return f;
    const key = `${f.ticker}|${f.day}|${f.value}|${f.n}|${f.methodology}`;
    let signature = memo.get(key);
    const message = messageFor(f);
    if (!signature) {
      signature = await account.signTypedData({ domain: FIXING_DOMAIN, types: FIXING_TYPES, primaryType: 'Fixing', message });
      if (memo.size < 20000) memo.set(key, signature);
    }
    return { ...f, indicative: Number(f.n || 0) < 3, attestation: { publisher: account.address, standard: 'EIP-712', domain: FIXING_DOMAIN, primaryType: 'Fixing', types: FIXING_TYPES, message: { ...message, valueE18: message.valueE18.toString() }, signature, verify: 'https://cloud.trycorpus.ai/governance#verifying-a-fixing' } };
  }
  return { address: account.address, attest, domain: FIXING_DOMAIN, types: FIXING_TYPES };
}
