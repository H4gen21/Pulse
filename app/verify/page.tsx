'use client';
import { useId, useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { useAccount } from 'wagmi';
import { useGuardStatus, useVaultApi } from '@/hooks/useGuardContract';
import { chain } from '@/lib/chain';
import { USDC_ADDRESS } from '@/lib/contract';
import { deadlineOf } from '@/lib/guard-status';
import { addressUrl, shortAddr, txUrl } from '@/lib/explorer';
import { StatusBadge, fmtDate } from '@/components/vault/shared';

export default function VerifyPage() {
  const id = useId();
  const { address: connected } = useAccount();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState<`0x${string}`>();
  const [inputError, setInputError] = useState<string | null>(null);

  const check = (value: string) => {
    const v = value.trim();
    if (!isAddress(v, { strict: false })) {
      setInputError('That isn’t a wallet address. It should be 0x followed by 40 hex characters.');
      setQuery(undefined);
      return;
    }
    setInputError(null);
    setQuery(v.toLowerCase() as `0x${string}`);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    check(input);
  };

  return (
    <main className="app">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="page-head">
          <div>
            <h1>Verify a vault</h1>
            <p className="muted">Anyone can check a vault’s status. No sign-in needed.</p>
          </div>
        </div>
        <form className="card pad" role="search" onSubmit={onSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }} noValidate>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <label className="lbl" htmlFor={`${id}-q`}>Owner wallet address</label>
            <input
              className="field addr"
              id={`${id}-q`}
              placeholder="0x…"
              value={input}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!inputError}
              aria-describedby={`${id}-qe`}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit">Check</button>
          {connected && (
            <div style={{ flex: '1 1 100%' }} className="muted small">
              Try{' '}
              <button className="linkish" type="button" onClick={() => (setInput(connected), check(connected))}>
                your wallet
              </button>
            </div>
          )}
          <p className="err" id={`${id}-qe`} role="alert" style={{ flex: '1 1 100%', margin: 0 }}>{inputError}</p>
        </form>
        <div style={{ marginTop: 20 }} aria-live="polite">
          {query && <VaultResult owner={query} />}
        </div>
      </div>
    </main>
  );
}

function VaultResult({ owner }: { owner: `0x${string}` }) {
  const api = useVaultApi(owner);
  const guard = useGuardStatus(owner, api.data?.status === 'EXECUTED' ? 'EXECUTED' : undefined);

  if (guard.isLoading) return <div className="card pad" role="status"><div className="spinner" aria-hidden="true" /><p className="muted center">Reading the contract…</p></div>;
  if (guard.error) return <div className="card pad" role="alert"><p style={{ color: 'var(--pulse)' }}>Couldn’t read the contract: {guard.error.message.split('\n')[0]}</p></div>;

  const { config, beneficiaries, status } = guard;
  if (!config || status === 'NONE')
    return (
      <div className="card pad">
        <h2 style={{ fontSize: 20 }}>No vault found</h2>
        <p className="muted" style={{ marginTop: 6 }}>This wallet has never set up a Pulse vault on {chain.name}.</p>
      </div>
    );

  const dl = deadlineOf(config);
  const isUsdc = config.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
  const events = guard.events.data?.events ?? [];
  const setupTx = api.data?.txHash ?? events.find((e) => e.name === 'GuardSetup')?.txHash;

  return (
    <section className="card pad" aria-labelledby="vr">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h2 id="vr" className="addr" style={{ fontSize: 16 }}>
          <a href={addressUrl(owner)} target="_blank" rel="noreferrer">{owner}</a>
        </h2>
        <StatusBadge status={status} />
      </div>
      <div className="grid-auto" style={{ marginTop: 20 }}>
        <div><span className="muted small">Token</span><div style={{ fontWeight: 600 }} className={isUsdc ? '' : 'addr'}>{isUsdc ? 'USDC' : config.token}</div></div>
        <div><span className="muted small">Inactivity period</span><div style={{ fontWeight: 600 }}>{Number(config.timeoutDuration) / 86_400} days</div></div>
        <div><span className="muted small">Last check-in</span><div style={{ fontWeight: 600 }}>{fmtDate(config.lastPingTimestamp)}</div></div>
        <div>
          <span className="muted small">{status === 'ACTIVE' ? 'Transfer starts' : 'Deadline was'}</span>
          <div style={{ fontWeight: 600, color: 'var(--pulse)' }}>{fmtDate(dl)}</div>
        </div>
      </div>
      <h3 style={{ fontSize: 18, marginTop: 24 }}>Heirs</h3>
      {/* Wallets and shares only: emails are never rendered here, even for the owner. */}
      <ul className="feed">
        {beneficiaries.map((b, i) => (
          <li key={b.wallet}>
            <span className="ic">{i + 1}</span>
            <span className="addr" title={b.wallet}>{shortAddr(b.wallet)}</span>
            <span className="end num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{(b.bps / 100).toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      {setupTx && (
        <p className="small" style={{ marginTop: 12 }}>
          <a href={txUrl(setupTx)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Setup transaction on BaseScan</a>
        </p>
      )}
      <p className="muted small" style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--surface-2)' }}>
        Heir emails are never shown on this page. Status read from the contract on {chain.name}.
      </p>
    </section>
  );
}
