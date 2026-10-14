/* Addresses and links the hackathon pages read. Filled in by deployments.md as contracts go live. */
export const CONFIG = {
  /* The token, oracle and Kuru market are on Monad testnet (10143); the x402 rail and the treasury vault are mainnet. */
  chainId: 10143,
  chainName: 'Monad Testnet',
  rpc: 'https://testnet-rpc.monad.xyz',
  explorer: 'https://testnet.monadexplorer.com',
  mainnetExplorer: 'https://monadexplorer.com',
  usdc: '0x966ca2c9a5c3927C6AB1Ccd7068E13e698458A2F',   /* mock USDC on testnet (6 decimals) */
  token: '0xc6B96de257d3E1285080Fdb43BeF60DcbeDcd70c',
  oracle: '0x0452ABd329B6C4006ECCdA9FBb5c9e87F5d73744',
  wrapper: '0xc38b980224E7f7ca981AF8B9Ae868849dD32b19F', /* ComputeToken20, cS1-256 */
  kuruMarket: '0x9178E699E33c0253E39d769dA0A7B87cfb1346c5',
  treasury: '0x774135421446D452b3F04A84709Fb62DaBAaD3E3',
  vault: '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371',   /* Hyperithm USDC Apex on Morpho */
  publisher: '0x1b77aE05cd23C514A1De304b6b771513f6eFa780',
  feed: 'https://cloud.trycorpus.ai',
  repo: 'https://github.com/JTraversa/corpus-monad',
  txs: {
    deploy: '0x09b8c17d185dea089e441393a9d6d60cabe2f50a00983dbcf190c8683f171d26',
    relay: '0xecbea073f781e9c80c45ae391376f3eedbd02c26709fc0f4b1b51f783fd38804',
    mint: '0xa32824f00c2a15f4d0c9a5dddbfea91bd1c9f8a960832632bea1e801ed50d125',
    redeem: '0x526f4186ef0baf24c2776828845e2de1d87f35bdb17650f4d6a6c8b3608a6165',
    kuruDeposit: '0x3f530f783b6aa75e5b6aca34daf4b106eaf502d0dc13d40daa8ea86a65404ffa',
    kuruAsk: '0x9bf441401f09e2fb45e94fdb9fda7aa78fb0e33ff22429505f444f767cb85e34'
  }
};
