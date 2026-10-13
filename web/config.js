/* Addresses and links the hackathon pages read. Filled in by deployments.md as contracts go live. */
export const CONFIG = {
  chainId: 143,
  chainName: 'Monad',
  rpc: 'https://rpc.monad.xyz',
  explorer: 'https://monadexplorer.com',
  usdc: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
  token: '',      /* ComputeToken, set after deployment */
  oracle: '',     /* FixingOracle, set after deployment */
  treasury: '0x774135421446D452b3F04A84709Fb62DaBAaD3E3',
  vault: '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371',   /* Hyperithm USDC Apex on Morpho */
  publisher: '0x1b77aE05cd23C514A1De304b6b771513f6eFa780',
  feed: 'https://cloud.trycorpus.ai',
  repo: 'https://github.com/JTraversa/corpus-monad',
  txs: {}         /* demo transactions: relay, supply, mint, redeem, x402 */
};
