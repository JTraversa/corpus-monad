// corpusAI fixing relay as a Chainlink CRE workflow.
//
// CRE is the orchestration layer between an external API and the chain: on a schedule, the DON fetches the
// day's signed index fixing from corpusAI Cloud Pricing (an authenticated HTTP call), every node parses it and
// the nodes reach consensus on the identical payload, the workflow verifies the publisher's EIP-712 signature
// itself, encodes the fixing for FixingOracle, and submits it on Monad through the CRE forwarder to
// FixingReceiver, which calls FixingOracle.post. The oracle re-verifies the signature on chain, so no step in
// the pipeline, CRE included, can alter a value: the publisher key is the only authority, and CRE is what makes
// the relay run without us.
import {
  consensusIdenticalAggregation,
  cre,
  getNetwork,
  type HTTPSendRequester,
  json,
  prepareReportRequest,
  Runner,
  type Runtime,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, hashTypedData, keccak256, type Hex } from 'viem'
import { secp256k1 } from '@noble/curves/secp256k1'

// Synchronous EIP-712 recovery (the CRE handler is synchronous): hash the typed data, recover the public key.
const recoverSigner = (typed: any, signature: Hex): Hex => {
  const digest = hashTypedData(typed)
  const sig = signature.slice(2)
  const r = BigInt('0x' + sig.slice(0, 64)); const sVal = BigInt('0x' + sig.slice(64, 128)); const v = parseInt(sig.slice(128, 130), 16)
  const pub = new secp256k1.Signature(r, sVal).addRecoveryBit(v >= 27 ? v - 27 : v).recoverPublicKey(digest.slice(2)).toRawBytes(false)
  return ('0x' + keccak256(pub.slice(1)).slice(-40)) as Hex
}

type Config = {
  schedule: string
  feedUrl: string          // e.g. https://cloud.trycorpus.ai/v1/index/fixing?ticker=CX.H100SXM.NEO
  chainSelectorName: string // monad-testnet | monad-mainnet
  receiver: Hex            // FixingReceiver
  publisher: Hex           // the corpusAI publisher address the fixing must be signed by
  gasLimit: string
  write: boolean           // false: stop after verification and report encoding (dry simulation)
}

type Attestation = {
  publisher: Hex
  domain: { name: string; version: string }
  primaryType: 'Fixing'
  types: Record<string, { name: string; type: string }[]>
  message: { ticker: string; day: string; valueE18: string; n: number; methodology: string }
  signature: Hex
}
type FixingResponse = { ticker: string; day: string; value: number; n: number; attestation: Attestation }

// Runs on every node: fetch the fixing with the prepaid key from secrets, return the parts that matter.
// The signed payload is identical across nodes for a given day, so identical aggregation is the right consensus.
const fetchFixing = (requester: HTTPSendRequester, config: Config, apiKey: string): string => {
  const resp = requester
    .sendRequest({ url: config.feedUrl, method: 'GET' as const, headers: { Accept: 'application/json', 'X-Api-Key': apiKey } })
    .result()
  const body = json(resp) as FixingResponse
  if (!body?.attestation?.signature) throw new Error('feed returned no signed fixing (payment or key problem?)')
  const a = body.attestation
  return JSON.stringify({ domain: a.domain, types: a.types, primaryType: a.primaryType, message: a.message, signature: a.signature, publisher: a.publisher })
}

const onCron = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config
  const apiKey = runtime.getSecret({ id: 'CORPUS_API_KEY' }).result().value
  runtime.log(`fetching ${cfg.feedUrl}`)
  const http = new cre.capabilities.HTTPClient()
  const raw = http.sendRequest(runtime, fetchFixing, consensusIdenticalAggregation<string>())(cfg, apiKey).result()
  const a = JSON.parse(raw) as Attestation
  const m = a.message

  // Verify the publisher signature inside the workflow, before anything touches the chain.
  const typed = { domain: a.domain, types: a.types, primaryType: 'Fixing' as const, message: { ...m, valueE18: BigInt(m.valueE18) } }
  const signer = recoverSigner(typed, a.signature)
  {
    if (signer.toLowerCase() !== cfg.publisher.toLowerCase()) throw new Error(`fixing signed by ${signer}, expected publisher ${cfg.publisher}`)
    runtime.log(`verified ${m.ticker} ${m.day} valueE18=${m.valueE18} n=${m.n} signer=${signer}`)

    // Report payload = abi.encode(Fixing, signature): what FixingReceiver.onReport decodes and hands to FixingOracle.post.
    const payload = encodeAbiParameters(
      [
        { type: 'tuple', components: [{ name: 'ticker', type: 'string' }, { name: 'day', type: 'string' }, { name: 'valueE18', type: 'uint256' }, { name: 'n', type: 'uint32' }, { name: 'methodology', type: 'string' }] },
        { type: 'bytes' },
      ],
      [{ ticker: m.ticker, day: m.day, valueE18: BigInt(m.valueE18), n: m.n, methodology: m.methodology }, a.signature],
    )
    const report = runtime.report(prepareReportRequest(payload)).result()
    runtime.log(`report prepared, ${payload.length / 2 - 1} bytes`)
    if (!cfg.write) return JSON.stringify({ ticker: m.ticker, day: m.day, valueE18: m.valueE18, n: m.n, signer, written: false })

    const network = getNetwork({ chainFamily: 'evm', chainSelectorName: cfg.chainSelectorName, isTestnet: cfg.chainSelectorName.endsWith('testnet') })
    if (!network) throw new Error(`unknown chain ${cfg.chainSelectorName}`)
    const evm = new cre.capabilities.EVMClient(network.chainSelector.selector)
    const res = evm.writeReport(runtime, { receiver: cfg.receiver, report, gasConfig: { gasLimit: cfg.gasLimit } }).result()
    runtime.log(`written to ${cfg.receiver} on ${cfg.chainSelectorName}: ${JSON.stringify(res)}`)
    return JSON.stringify({ ticker: m.ticker, day: m.day, valueE18: m.valueE18, n: m.n, signer, written: true, tx: (res as any)?.txHash ?? res })
  }
}

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability()
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron)]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

main()
