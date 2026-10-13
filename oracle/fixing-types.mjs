// The EIP-712 types corpusAI signs fixings with. No chainId or verifyingContract in the domain:
// a fixing is a statement about a published number, valid on every chain.
export const FIXING_DOMAIN = { name: 'corpusAI Cloud Pricing', version: '1' };
export const FIXING_TYPES = { Fixing: [
  { name: 'ticker', type: 'string' }, { name: 'day', type: 'string' }, { name: 'valueE18', type: 'uint256' },
  { name: 'n', type: 'uint32' }, { name: 'methodology', type: 'string' },
] };
/** The struct a fixing response's `attestation.message` carries, with valueE18 as a bigint. */
export const messageOf = (fixing) => ({ ...fixing.attestation.message, valueE18: BigInt(fixing.attestation.message.valueE18) });
