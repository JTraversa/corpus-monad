// Daily on-chain attestation of the fixings.
//
// Once per store day, after the store is ready: every fixing of the day (GPU segments, spot legs,
// token tickers) is signed (EIP-712, attest.mjs), written as one JSON file, hashed with keccak256,
// and the hash is posted to the Ethereum Attestation Service on Base from the publisher key under
// the schema registered 2026-09-27:
//   string day, string methodology, bytes32 fixingsHash, string fixingsUri, uint32 count
// The file is kept on the volume (ATTEST_DIR) and mirrored to R2 (attest/<day>.json), and served at
// /attest/<day>.json, so anyone can re-hash it and compare with the attestation. Idempotent: a day
// with a recorded attestation UID is skipped. Gas: ~120k at Base prices, well under a cent a day.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, encodeAbiParameters, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export const EAS = '0x4200000000000000000000000000000000000021';
export const SCHEMA_UID = '0xbf0b89df60e0fc214bd767094064eecce1a54b238319661a5b832e494595f072';
export const SCHEMA = 'string day,string methodology,bytes32 fixingsHash,string fixingsUri,uint32 count';
const easAbi = parseAbi([
  'function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)',
]);

/** keccak256 of the file bytes exactly as served. */
export const hashFile = (buf) => keccak256(buf);

/**
 * @param {object} o
 * @param {string} o.dir            directory for <day>.json and <day>.uid on the volume
 * @param {string} o.privateKey     publisher key (also the EIP-712 signer)
 * @param {string} o.publicBaseUrl
 * @param {(day:string)=>Promise<object[]>} o.fixingsFor  every signed fixing of the day
 * @param {object=} o.r2            lib/r2.cjs (optional mirror)
 * @param {(m:string)=>void} o.log
 */
export function createChainAttester({ dir, privateKey, publicBaseUrl, fixingsFor, r2, log = () => {}, rpcUrl }) {
  fs.mkdirSync(dir, { recursive: true });
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl || 'https://mainnet.base.org');
  const pub = createPublicClient({ chain: base, transport });
  const wal = createWalletClient({ account, chain: base, transport });
  const fileOf = (day) => path.join(dir, `${day}.json`);
  const uidOf = (day) => path.join(dir, `${day}.uid`);

  /** Build (or reuse) the day's file and attest it if not yet attested. Returns the record. */
  async function attestDay(day, methodology) {
    if (fs.existsSync(uidOf(day))) return JSON.parse(fs.readFileSync(uidOf(day), 'utf8'));
    let body;
    if (fs.existsSync(fileOf(day))) body = fs.readFileSync(fileOf(day));
    else {
      const fixings = await fixingsFor(day);
      if (!fixings.length) { log(`attest-chain: no fixings for ${day}, skipped`); return null; }
      const doc = { day, methodology, publisher: account.address, schema: SCHEMA, schemaUid: SCHEMA_UID, generated_at: new Date().toISOString(), count: fixings.length, fixings };
      body = Buffer.from(JSON.stringify(doc));
      fs.writeFileSync(fileOf(day), body);
      if (r2 && r2.configured()) { try { await r2.put(`attest/${day}.json`, body, 'application/json'); } catch (e) { log(`attest-chain: r2 mirror failed: ${String(e.message || e).slice(0, 120)}`); } }
    }
    const doc = JSON.parse(body.toString('utf8'));
    const fixingsHash = hashFile(body);
    const uri = `${publicBaseUrl}/attest/${day}.json`;
    const data = encodeAbiParameters([{ type: 'string' }, { type: 'string' }, { type: 'bytes32' }, { type: 'string' }, { type: 'uint32' }], [day, methodology, fixingsHash, uri, doc.count]);
    if (process.env.ATTEST_DRY_RUN === '1') { log(`attest-chain: DRY RUN ${day} ${doc.count} fixings hash ${fixingsHash}`); return { day, methodology, count: doc.count, fixingsHash, uri, dryRun: true }; }
    const args = [{ schema: SCHEMA_UID, data: { recipient: '0x0000000000000000000000000000000000000000', expirationTime: 0n, revocable: false, refUID: '0x0000000000000000000000000000000000000000000000000000000000000000', data, value: 0n } }];
    const { request } = await pub.simulateContract({ address: EAS, abi: easAbi, functionName: 'attest', args, account });
    const txHash = await wal.writeContract(request);
    const rc = await pub.waitForTransactionReceipt({ hash: txHash });
    if (rc.status !== 'success') throw new Error(`attest tx ${txHash} ${rc.status}`);
    const uid = rc.logs.find((l) => l.address.toLowerCase() === EAS.toLowerCase() && l.topics.length >= 4)?.data?.slice(0, 66) || null;
    const rec = { day, methodology, count: doc.count, fixingsHash, uri, tx: txHash, uid, publisher: account.address, chain: 'eip155:8453', schemaUid: SCHEMA_UID, attested_at: new Date().toISOString() };
    fs.writeFileSync(uidOf(day), JSON.stringify(rec));
    if (r2 && r2.configured()) { try { await r2.put(`attest/${day}.uid`, Buffer.from(JSON.stringify(rec)), 'application/json'); } catch { /* mirrored next time */ } }
    log(`attest-chain: ${day} ${doc.count} fixings hash ${fixingsHash.slice(0, 12)}… tx ${txHash} uid ${uid}`);
    return rec;
  }

  /** Records of attested days, newest first. */
  function list(limit = 60) {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.uid')).sort().reverse().slice(0, limit).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  const fileBuffer = (day) => (fs.existsSync(fileOf(day)) ? fs.readFileSync(fileOf(day)) : null);
  return { address: account.address, attestDay, list, fileBuffer, dir };
}
