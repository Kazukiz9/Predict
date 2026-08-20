import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPublicClient, createWalletClient, custom, formatEther, formatUnits, http, isAddress, parseEther, type Address, type Hash } from 'viem';
import { bsc } from 'viem/chains';
import abi from '@/abi/contract.json';
import { Copy, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, Wallet, ChevronDown, Code2, Trophy, History, AlertTriangle, CheckCircle2 } from 'lucide-react';

const queryClient = new QueryClient();
const contractAddress = ((import.meta.env.VITE_PREDICTION_CONTRACT_ADDRESS as string | undefined) || '0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA') as Address;
const explorer = `https://bscscan.com/tx/`;
const contractExplorer = `https://bscscan.com/address/${contractAddress}`;
const publicClient = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.binance.org/') });
const contractAbi = abi as readonly unknown[];

type Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, handler: (...args: unknown[]) => void) => void; removeListener?: (event: string, handler: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: Provider } }
type Round = { epoch: bigint; startTimestamp: bigint; lockTimestamp: bigint; closeTimestamp: bigint; lockPrice: bigint; closePrice: bigint; lockOracleId: bigint; closeOracleId: bigint; totalAmount: bigint; bullAmount: bigint; bearAmount: bigint; rewardBaseCalAmount: bigint; rewardAmount: bigint; oracleCalled: boolean };
type Ledger = { position: number; amount: bigint; claimed: boolean };
type TxState = { label: string; hash?: Hash; error?: string };

function short(value?: string) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'; }
function bnb(value?: bigint) { return value === undefined ? '—' : `${Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 5 })} BNB`; }
function rawPrice(value?: bigint) { return value === undefined || value === 0n ? '—' : value.toString(); }
function addressValue(value: unknown) { return typeof value === 'string' ? value : '—'; }
function readableError(error: unknown) { const text = error instanceof Error ? error.message : String(error); if (/reject|denied|4001/i.test(text)) return 'Transaction rejected in wallet.'; if (/insufficient|funds/i.test(text)) return 'Insufficient BNB balance for this transaction.'; if (/minimum|minBet/i.test(text)) return 'The amount is below the contract minimum bet.'; if (/closed|epoch|already/i.test(text)) return 'The contract rejected this round or position.'; return text.slice(0, 180); }
function countdown(target?: bigint) { if (!target) return null; return Math.max(0, Number(target) - Math.floor(Date.now() / 1000)); }
function time(value?: bigint) { return value ? new Date(Number(value) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; }

async function read(functionName: string, args: readonly unknown[] = []) {
  return publicClient.readContract({ address: contractAddress, abi: contractAbi as any, functionName, args: args as any });
}

function useChainData(address?: Address) {
  const epoch = useQuery({ queryKey: ['epoch'], queryFn: () => read('currentEpoch') as Promise<bigint>, refetchInterval: 4000 });
  const round = useQuery({ queryKey: ['round', epoch.data?.toString()], enabled: !!epoch.data, queryFn: () => read('rounds', [epoch.data]) as Promise<Round>, refetchInterval: 4000 });
  const minimum = useQuery({ queryKey: ['minBet'], queryFn: () => read('minBetAmount') as Promise<bigint>, refetchInterval: 30000 });
  const ledger = useQuery({ queryKey: ['ledger', epoch.data?.toString(), address], enabled: !!epoch.data && !!address, queryFn: () => read('ledger', [epoch.data, address]) as Promise<Ledger>, refetchInterval: 4000 });
  const claimable = useQuery({ queryKey: ['claimable', epoch.data?.toString(), address], enabled: !!epoch.data && !!address, queryFn: () => read('claimable', [epoch.data, address]) as Promise<boolean>, refetchInterval: 4000 });
  return { epoch, round, minimum, ledger, claimable };
}

function Button({ children, onClick, disabled, tone = 'dark' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'dark' | 'bull' | 'bear' | 'light' }) {
  return <button onClick={onClick} disabled={disabled} className={`action action-${tone}`} type="button">{children}</button>;
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div><div className="eyebrow">{label}</div><div className={emphasis ? 'metric-value accent' : 'metric-value'}>{value}</div></div>;
}

function Terminal() {
  const client = useQueryClient();
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<string>();
  const [balance, setBalance] = useState<bigint>();
  const [bull, setBull] = useState('');
  const [bear, setBear] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [historyMode, setHistoryMode] = useState<'user' | 'rounds'>('user');
  const [historySize, setHistorySize] = useState(10);
  const [tx, setTx] = useState<TxState>();
  const [notice, setNotice] = useState<string>();
  const provider = typeof window !== 'undefined' ? window.ethereum : undefined;
  const data = useChainData(address);
  const round = data.round.data;

  const syncWallet = async () => {
    if (!provider) return;
    try {
      const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
      const id = await provider.request({ method: 'eth_chainId' }) as string;
      setChainId(id);
      if (accounts[0] && isAddress(accounts[0])) { setAddress(accounts[0]); setBalance(await publicClient.getBalance({ address: accounts[0] as Address })); }
      else setAddress(undefined);
    } catch (error) { setNotice(readableError(error)); }
  };

  useEffect(() => { void syncWallet(); }, []);
  useEffect(() => { if (!provider?.on) return; const accounts = () => void syncWallet(); const chain = () => void syncWallet(); provider.on('accountsChanged', accounts); provider.on('chainChanged', chain); return () => { provider.removeListener?.('accountsChanged', accounts); provider.removeListener?.('chainChanged', chain); }; }, [provider]);
  useEffect(() => { const update = () => { const target = round && (Date.now() / 1000 < Number(round.lockTimestamp) ? round.lockTimestamp : round.closeTimestamp); const next = countdown(target); setRemaining(next); if (next === 0) void data.epoch.refetch(); }; update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, [round]);

  const onBsc = chainId === '0x38' || chainId === '56';
  const connect = async () => { if (!provider) { setNotice('No injected wallet found. Install MetaMask, Trust Wallet, or Binance Wallet.'); return; } try { await provider.request({ method: 'eth_requestAccounts' }); await syncWallet(); } catch (error) { setNotice(readableError(error)); } };
  const switchNetwork = async () => { if (!provider) return; try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] }); await syncWallet(); } catch (error: any) { if (error?.code === 4902) await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x38', chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org/'], blockExplorerUrls: ['https://bscscan.com'] }] }); else setNotice(readableError(error)); } };
  const runWrite = async (functionName: string, args: readonly unknown[], value?: bigint) => {
    if (!address) { await connect(); return; }
    if (!onBsc) { setNotice('Wrong network. Switch to BNB Smart Chain first.'); return; }
    if (!provider) { setNotice('Wallet provider unavailable.'); return; }
    try {
      setTx({ label: 'Waiting for wallet confirmation' });
      const wallet = createWalletClient({ chain: bsc, account: address, transport: custom(provider as any) });
      const hash = await wallet.writeContract({ address: contractAddress, abi: contractAbi as any, functionName, args: args as any, value, account: address, chain: bsc });
      setTx({ label: 'Confirming on BNB Chain', hash });
      await publicClient.waitForTransactionReceipt({ hash });
      setTx({ label: 'Confirmed', hash });
      await Promise.all([data.epoch.refetch(), data.round.refetch(), data.ledger.refetch(), data.claimable.refetch()]);
      client.invalidateQueries();
    } catch (error) { setTx({ label: 'Failed', error: readableError(error) }); }
  };
  const bet = async (side: 'bull' | 'bear') => {
    const amount = side === 'bull' ? bull : bear;
    try {
      const value = parseEther(amount || '0');
      if (!round?.epoch || value <= 0n) throw new Error('Enter a valid BNB amount.');
      if (data.minimum.data !== undefined && value < data.minimum.data) throw new Error('The amount is below the contract minimum bet.');
      if (balance !== undefined && value > balance) throw new Error('Insufficient BNB balance.');
      await runWrite(side === 'bull' ? 'betBull' : 'betBear', [round.epoch], value);
    } catch (error) { setNotice(readableError(error)); }
  };
  const secondsText = remaining === null ? '—:—:—' : `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const split = round && round.totalAmount > 0n ? Number((round.bullAmount * 10000n) / round.totalAmount) / 100 : 50;
  const priceNote = 'raw oracle price';

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">↑</div><div><strong>ROUND//ONE</strong><span>BSC market terminal</span></div></div><nav><a href="#terminal">Terminal</a><a href="#position">My position</a><a href="#history">History</a><a href="#contract">Contract</a></nav><div className="network-card"><ShieldCheck size={16} /><span>Network verified</span><small>BNB Smart Chain · Chain ID 56</small></div></aside>
    <main className="main"><header className="topbar"><div className="live-label"><span className="pulse" /> Live contract state · 4s refresh</div><div className="wallet-area">{!onBsc && address && <Button tone="light" onClick={() => void switchNetwork()}>Wrong network · Switch</Button>}{address ? <div className="wallet-chip"><span className="pulse" /> {short(address)}<small>{bnb(balance)}</small></div> : <Button onClick={() => void connect()}><Wallet size={15} /> Connect wallet</Button>}</div></header>
      <div className="content" id="terminal"><div className="page-intro"><div><div className="eyebrow teal">ON-CHAIN PREDICTION MARKET</div><h1>Current round<span>.</span></h1><p>Read the contract. Make an explicit call. Every position is wallet-confirmed.</p></div><button className="refresh" onClick={() => void Promise.all([data.epoch.refetch(), data.round.refetch(), syncWallet()])}><RefreshCw size={15} /> Refresh</button></div>
      <section className="round-hero"><div><div className="eyebrow teal"><span className="pulse" /> LIVE CONTRACT STATE</div><div className="epoch">#{data.epoch.data?.toString() ?? '—'}</div><div className="muted mono">Prices displayed as {priceNote}</div></div><div className="countdown"><div className="eyebrow">LOCKING / CLOSING IN</div><strong>{secondsText}</strong><small>{round && Date.now() / 1000 < Number(round.lockTimestamp) ? `Locks at ${time(round.lockTimestamp)}` : `Closes at ${time(round?.closeTimestamp)}`}</small></div><div className="metrics"><Metric label="Lock price" value={rawPrice(round?.lockPrice)} /><Metric label="Close price" value={rawPrice(round?.closePrice)} /><Metric label="Total pool" value={bnb(round?.totalAmount)} /><Metric label="Oracle settled" value={round?.oracleCalled ? 'Yes' : 'Pending'} /></div></section>
      <section className="bet-grid"><Bet side="bull" value={bull} setValue={setBull} minimum={data.minimum.data} onBet={() => void bet('bull')} epoch={round?.epoch} /><Bet side="bear" value={bear} setValue={setBear} minimum={data.minimum.data} onBet={() => void bet('bear')} epoch={round?.epoch} /></section>
      <section className="split-grid"><div className="panel"><div className="section-title"><div><div className="eyebrow teal">POOL COMPARISON</div><h2>Liquidity split</h2></div><div className="mono">{bnb(round?.totalAmount)}</div></div><div className="split-bar"><i style={{ width: `${split}%` }} /></div><div className="split-labels"><span><b className="dot bull-dot" /> Bull {bnb(round?.bullAmount)} <small>{split.toFixed(1)}%</small></span><span><b className="dot bear-dot" /> Bear {bnb(round?.bearAmount)} <small>{(100 - split).toFixed(1)}%</small></span></div><div className="payout-note">Final payout depends on the contract's actual reward calculation. Reward base: {bnb(round?.rewardBaseCalAmount)} · Reward pool: {bnb(round?.rewardAmount)}</div></div>
      <div className="panel" id="position"><div className="section-title"><div><div className="eyebrow teal">YOUR POSITION</div><h2>Round exposure</h2></div><Button tone="light" disabled={!data.claimable.data} onClick={() => void runWrite('claim', [round?.epoch])}><Trophy size={14} /> Claim reward</Button></div>{!address ? <div className="empty">Connect a wallet to read your position from the contract.</div> : <div className="position-grid"><Metric label="Direction" value={data.ledger.data ? (data.ledger.data.position === 0 ? 'BULL' : 'BEAR') : 'None'} /><Metric label="Amount" value={bnb(data.ledger.data?.amount)} /><Metric label="Claimed" value={data.ledger.data ? (data.ledger.data.claimed ? 'Yes' : 'No') : '—'} /><Metric label="Claimable" value={data.claimable.data ? 'Yes' : 'No'} emphasis /></div>}</div></section>
      <section className="panel history-panel" id="history"><div className="section-title"><div><div className="eyebrow">HISTORY</div><h2>On-chain activity</h2></div><div className="tabs"><button className={historyMode === 'user' ? 'active' : ''} onClick={() => setHistoryMode('user')}>My positions</button><button className={historyMode === 'rounds' ? 'active' : ''} onClick={() => setHistoryMode('rounds')}>Round history</button></div></div>{historyMode === 'user' && address ? <UserHistory address={address} size={historySize} onLoadMore={() => setHistorySize((value) => value + 10)} /> : historyMode === 'user' ? <div className="empty">Connect a wallet to load your positions.</div> : <RoundHistory epoch={data.epoch.data} />}</section>
      <section className="panel contract-panel" id="contract"><button className="collapse-trigger" onClick={() => setAdvanced(!advanced)}><span><div className="eyebrow">CONTRACT INFORMATION</div><h2>Advanced contract</h2></span><ChevronDown className={advanced ? 'rotate' : ''} /></button>{advanced && <Advanced address={address} onWrite={runWrite} />}</section>
      <footer><span>Non-custodial interface · BNB Smart Chain mainnet</span><a href={contractExplorer} target="_blank" rel="noreferrer">View contract on BscScan <ExternalLink size={12} /></a></footer>
      </div></main>
      {tx && <div className="toast"><strong>{tx.label}</strong>{tx.hash && <a href={`${explorer}${tx.hash}`} target="_blank" rel="noreferrer">{short(tx.hash)} · View on BscScan</a>}{tx.error && <span className="error">{tx.error}</span>}<button onClick={() => setTx(undefined)}>×</button></div>}{notice && <div className="toast notice"><AlertTriangle size={15} /><span>{notice}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
    </div>;
}

function Bet({ side, value, setValue, minimum, onBet, epoch }: { side: 'bull' | 'bear'; value: string; setValue: (value: string) => void; minimum?: bigint; onBet: () => void; epoch?: bigint }) {
  const isBull = side === 'bull';
  return <div className={`bet-panel ${side}`}><div className="bet-heading">{isBull ? <TrendingUp size={19} /> : <TrendingDown size={19} />}<span><strong>{isBull ? 'BULL / UP' : 'BEAR / DOWN'}</strong><small>{isBull ? 'Price settles above the lock mark' : 'Price settles below the lock mark'}</small></span><b>#{epoch?.toString() ?? '—'}</b></div><label>BNB AMOUNT<input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0.01" /></label><div className="quick"><button onClick={() => setValue('0.01')}>0.01</button><button onClick={() => setValue('0.05')}>0.05</button><button onClick={() => setValue('0.1')}>0.1</button></div><Button tone={isBull ? 'bull' : 'bear'} onClick={onBet}><ShieldCheck size={15} /> BET {isBull ? 'BULL' : 'BEAR'}</Button><small className="minimum">Minimum bet · {bnb(minimum)}</small></div>;
}

function UserHistory({ address, size, onLoadMore }: { address: Address; size: number; onLoadMore: () => void }) {
  const result = useQuery({ queryKey: ['userRounds', address, size], queryFn: () => read('getUserRounds', [address, 0n, BigInt(size)]) as Promise<[bigint[], Ledger[], bigint]>, refetchInterval: 15000 });
  if (result.isLoading) return <div className="empty"><LoaderCircle className="spin" /> Loading positions from contract…</div>;
  const [epochs, bets] = result.data ?? [[], []];
  if (!epochs.length) return <div className="empty"><History size={18} /> No positions returned for this wallet.</div>;
  return <><div className="table-wrap"><table><thead><tr><th>Epoch</th><th>Position</th><th>Amount</th><th>Claimed</th><th>Claimable</th></tr></thead><tbody>{epochs.map((epoch, index) => <tr key={`${epoch}-${index}`}><td className="mono">#{epoch.toString()}</td><td className={bets[index]?.position === 0 ? 'bull-text' : 'bear-text'}>{bets[index]?.position === 0 ? 'BULL' : 'BEAR'}</td><td>{bnb(bets[index]?.amount)}</td><td>{bets[index]?.claimed ? 'Yes' : 'No'}</td><td>{bets[index]?.claimed ? '—' : 'Check round'}</td></tr>)}</tbody></table></div>{epochs.length >= size && <Button tone="light" onClick={onLoadMore}>Load more</Button>}</>;
}

function RoundHistory({ epoch }: { epoch?: bigint }) {
  const rounds = useQuery({ queryKey: ['roundHistory', epoch?.toString()], enabled: !!epoch, queryFn: async () => { const start = Number(epoch); const values: Round[] = []; for (let i = 0; i < 10 && start - i > 0; i += 1) values.push(await read('rounds', [BigInt(start - i)]) as Round); return values; }, refetchInterval: 30000 });
  if (rounds.isLoading) return <div className="empty"><LoaderCircle className="spin" /> Loading round history…</div>;
  return <div className="table-wrap"><table><thead><tr><th>Epoch</th><th>Lock price</th><th>Close price</th><th>Bull</th><th>Bear</th><th>Result</th></tr></thead><tbody>{(rounds.data ?? []).map((item) => <tr key={item.epoch.toString()}><td className="mono">#{item.epoch.toString()}</td><td className="mono">{rawPrice(item.lockPrice)}</td><td className="mono">{rawPrice(item.closePrice)}</td><td>{bnb(item.bullAmount)}</td><td>{bnb(item.bearAmount)}</td><td>{!item.oracleCalled || item.closePrice === 0n ? 'Pending' : item.closePrice > item.lockPrice ? <span className="bull-text">Bull</span> : item.closePrice < item.lockPrice ? <span className="bear-text">Bear</span> : 'Draw'}</td></tr>)}</tbody></table></div>;
}

function Advanced({ address, onWrite }: { address?: Address; onWrite: (name: string, args: readonly unknown[], value?: bigint) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const entries = (abi as any[]).filter((item) => item.type === 'function');
  const execute = async (item: any) => {
    const args = (item.inputs ?? []).map((input: any) => { const value = values[item.name] ?? ''; if (input.type === 'uint256' || input.type === 'uint80') return BigInt(value || '0'); if (input.type === 'uint256[]') return (value as string).split(',').filter(Boolean).map((part) => BigInt(part.trim())); return value; });
    try { if (item.stateMutability === 'view') { const result = await read(item.name, args); setResults((prev) => ({ ...prev, [item.name]: JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value) })); } else await onWrite(item.name, args); } catch (error) { setResults((prev) => ({ ...prev, [item.name]: readableError(error) })); }
  };
  return <div className="advanced"><div className="contract-meta"><span className="mono">{contractAddress}</span><a href={contractExplorer} target="_blank" rel="noreferrer">BscScan <ExternalLink size={12} /></a></div><div className="advanced-grid">{entries.map((item: any) => <div className={`function-card ${item.stateMutability !== 'view' ? 'write' : ''}`} key={item.name}><div className="function-name"><Code2 size={14} />{item.name}<small>{item.stateMutability}</small></div>{item.inputs?.map((input: any, index: number) => <input key={`${item.name}-${index}`} placeholder={`${input.name || `arg${index}`} · ${input.type}`} value={values[`${item.name}-${index}`] ?? ''} onChange={(event) => setValues((prev) => ({ ...prev, [`${item.name}-${index}`]: event.target.value }))} />)}<button disabled={item.stateMutability !== 'view' && !address} onClick={() => void execute(item)}>{item.stateMutability === 'view' ? 'Read' : 'Write with wallet'}</button>{results[item.name] && <pre>{results[item.name]}</pre>}</div>)}</div></div>;
}

function App() { return <QueryClientProvider client={queryClient}><Terminal /></QueryClientProvider>; }
export default App;