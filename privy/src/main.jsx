import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, createWalletClient, custom, http, parseAbi, formatUnits, keccak256, toHex, defineChain } from 'viem'

const APP_ID = 'cmv7kjt1c02os0fjq04y06phx'
const TOKEN = '0xc6B96de257d3E1285080Fdb43BeF60DcbeDcd70c'
const USDC = '0x966ca2c9a5c3927C6AB1Ccd7068E13e698458A2F'
const EXPLORER = 'https://testnet.monadexplorer.com'
const monadTestnet = defineChain({ id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } }, blockExplorers: { default: { name: 'Monad Explorer', url: EXPLORER } }, testnet: true })
const abi = parseAbi(['function typeCount() view returns (uint256)', 'function types(uint256) view returns (string,string,uint256,uint256,uint256,bool)', 'function totalSupply(uint256) view returns (uint256)', 'function balanceOf(address,uint256) view returns (uint256)', 'function mint(uint256,uint256) returns (uint256)', 'function redeem(uint256,uint256,bytes32)'])
const erc20 = parseAbi(['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'])
const pub = createPublicClient({ chain: monadTestnet, transport: http() })
const money = (v) => '$' + Number(formatUnits(v, 6)).toFixed(2)

function Mint() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const wallet = wallets.find((w) => w.walletClientType === 'privy') || wallets[0]
  const [types, setTypes] = useState([]); const [sel, setSel] = useState(2); const [log, setLog] = useState('Sign in with email. Privy creates a wallet for you; no extension needed.')
  const [busy, setBusy] = useState(false); const [usdc, setUsdc] = useState(null); const [acct, setAcct] = useState('')
  const me = wallet?.address

  const load = async () => {
    const n = Number(await pub.readContract({ address: TOKEN, abi, functionName: 'typeCount' })); const out = []
    for (let id = 0; id < n; id++) {
      const t = await pub.readContract({ address: TOKEN, abi, functionName: 'types', args: [BigInt(id)] }); await new Promise((r) => setTimeout(r, 70))
      const held = me ? await pub.readContract({ address: TOKEN, abi, functionName: 'balanceOf', args: [me, BigInt(id)] }) : 0n; if (me) await new Promise((r) => setTimeout(r, 70))
      out.push({ id, label: t[1], monthly: t[2], principal: t[3], price: t[4], active: t[5], held })
    }
    setTypes(out)
    if (me) setUsdc(await pub.readContract({ address: USDC, abi: erc20, functionName: 'balanceOf', args: [me] }))
  }
  useEffect(() => { load().catch((e) => setLog('Error: ' + e.message)) }, [me])

  const walletClient = async () => { await wallet.switchChain(10143); const provider = await wallet.getEthereumProvider(); return createWalletClient({ account: me, chain: monadTestnet, transport: custom(provider) }) }
  const send = async (wal, fn, what) => { const { request } = await pub.simulateContract({ ...fn, account: me }); const hash = await wal.writeContract(request); setLog(`${what} sent ${hash.slice(0, 12)}… waiting for Monad`); const rc = await pub.waitForTransactionReceipt({ hash }); if (rc.status !== 'success') throw new Error(what + ' reverted'); return hash }
  const mint = async () => { setBusy(true); try {
    const t = types[sel]; const wal = await walletClient()
    const bal = await pub.readContract({ address: USDC, abi: erc20, functionName: 'balanceOf', args: [me] })
    if (bal < t.price) { setLog(`This Privy wallet holds ${money(bal)} test USDC and the mint costs ${money(t.price)}. Send test USDC to ${me}.`); return }
    const allowance = await pub.readContract({ address: USDC, abi: erc20, functionName: 'allowance', args: [me, TOKEN] })
    if (allowance < t.price) await send(wal, { address: USDC, abi: erc20, functionName: 'approve', args: [TOKEN, t.price] }, 'Approval')
    const hash = await send(wal, { address: TOKEN, abi, functionName: 'mint', args: [BigInt(t.id), 1n] }, 'Mint')
    setLog(`Minted 1 × ${t.label} for ${money(t.price)} from your Privy embedded wallet. Tx ${hash}`); await load()
  } catch (e) { setLog('Error: ' + (e.shortMessage || e.message)) } finally { setBusy(false) } }
  const redeem = async () => { setBusy(true); try {
    const t = types[sel]; if (!acct) { setLog('Enter your corpus account reference, corpus:<id>, from the machine Funding tab.'); return }
    if (t.held < 1n) { setLog(`You hold no ${t.label} tokens.`); return }
    const wal = await walletClient(); const ref = keccak256(toHex(acct.trim()))
    const hash = await send(wal, { address: TOKEN, abi, functionName: 'redeem', args: [BigInt(t.id), 1n, ref] }, 'Redeem')
    setLog(`Redeemed 1 × ${t.label} to ${acct}. Tx ${hash}. Paste it on the machine's Funding tab, or use "Redeem with wallet" there.`); await load()
  } catch (e) { setLog('Error: ' + (e.shortMessage || e.message)) } finally { setBusy(false) } }

  if (!ready) return <p className="note">Loading Privy…</p>
  return (
    <section className="wrap" style={{ paddingBottom: 64 }}>
      <p className="eyebrow">Mint with email · Privy</p>
      <h1 style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 'clamp(30px,5vw,64px)', letterSpacing: '-.025em', lineHeight: 1, margin: '14px 0 18px' }}>No wallet? No problem.</h1>
      <p className="hero-lead" style={{ marginTop: 0 }}>Sign in with an email. Privy creates an embedded wallet on Monad for you, and that wallet signs the mint and the redeem. The token you get is the same ERC-1155 as on the main mint page.</p>
      <div className="strip-card" style={{ margin: '20px 0' }}><div className="strip-bar">
        <span className="wallet"><span className={'dot' + (me ? ' on' : '')}></span><span>{me ? `${user?.email?.address || 'signed in'} · ${me.slice(0, 6)}…${me.slice(-4)}` : 'Not signed in'}</span></span>
        <span className="row">{usdc != null && <span>{money(usdc)} test USDC</span>}{authenticated ? <button className="btn sm ghost" onClick={logout}>Sign out</button> : <button className="btn sm" onClick={login}>Sign in with email</button>}</span>
      </div></div>
      <div className="mint-grid">
        <div className="panel"><h3>Sizes</h3><p>Permanently funded corpus machines, priced principal plus buffer.</p>
          <div className="tbl-wrap" style={{ marginTop: 14 }}><table id="sizes"><thead><tr><th>Size</th><th className="num">Monthly</th><th className="num">Price, once</th><th className="num">You hold</th></tr></thead>
            <tbody>{types.map((t) => <tr key={t.id} onClick={() => setSel(t.id)} style={{ cursor: 'pointer', background: sel === t.id ? 'var(--bg)' : '' }}><td>{t.label}</td><td className="num">{money(t.monthly)}</td><td className="num">{money(t.price)}</td><td className="num">{t.held.toString()}</td></tr>)}</tbody></table></div>
        </div>
        <div>
          <div className="panel"><h3>Mint</h3><p>{types[sel] ? `${types[sel].label} for ${money(types[sel].price)}` : '…'}</p>
            <div className="actions" style={{ marginTop: 14 }}><button className={'btn' + (busy ? ' busy' : '')} disabled={!me || busy} onClick={mint}>Mint with Privy wallet</button></div></div>
          <div className="panel" style={{ marginTop: 16 }}><h3>Redeem</h3><p>Burn one token naming your corpus account reference.</p>
            <div className="field"><label>corpus account reference</label><input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="corpus:<account id>" /></div>
            <div className="actions" style={{ marginTop: 14 }}><button className={'btn ghost' + (busy ? ' busy' : '')} disabled={!me || busy} onClick={redeem}>Redeem with Privy wallet</button></div></div>
        </div>
      </div>
      <div className="log">{log}</div>
      <p className="note">Embedded wallet address is yours: fund it with test USDC ({USDC.slice(0, 10)}…) and testnet MON for gas. Part of <a href="/">corpusAI on Monad</a>.</p>
    </section>
  )
}

createRoot(document.getElementById('root')).render(
  <PrivyProvider appId={APP_ID} config={{ loginMethods: ['email'], embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } }, defaultChain: monadTestnet, supportedChains: [monadTestnet], appearance: { theme: 'light', accentColor: '#1cc744' } }}>
    <nav className="nav"><div className="wrap nav-in"><a className="brand" href="/">corpusAI <small>on Monad</small></a><div className="nav-links"><a href="/mint">mint_with_wallet</a><a href="/privy/" className="nav-cta current">mint_with_email</a></div></div></nav>
    <Mint />
  </PrivyProvider>
)
