'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { isAddress } from 'viem';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useGuardStatus, useUsdc } from '@/hooks/useGuardContract';
import { useTxFlow } from '@/hooks/useTxFlow';
import { chain } from '@/lib/chain';
import { calls, USDC_ADDRESS } from '@/lib/contract';
import { shortAddr, txUrl } from '@/lib/explorer';
import { bpsToPct, equalBps, formatAmount, minBigint, parseAmount, pctToBps, splitAmount, TOTAL_BPS } from '@/lib/split';
import { DAY, DEFAULT_TIMEOUT_DAYS, MAX_BENEFICIARIES, validateHeirs } from '@/lib/validation';
import { Icon } from '@/components/icons';
import { TxModal } from '@/components/TxModal';
import { useToast } from '@/components/Toasts';
import { EmptyCard, LoadingCard, SignInCard } from '@/components/vault/shared';

const TOKEN = 'USDC';
const PRESETS: [number, string][] = [[90, '90 days'], [180, '180 days'], [365, '1 year'], [730, '2 years']];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Heir = { wallet: string; email: string; pct: string };
const blank = (pct: string): Heir => ({ wallet: '', email: '', pct });

export default function CreateVaultPage() {
  const { address, isConnected, isConnecting, needsSignIn } = useAuthGuard();
  const owner = needsSignIn ? undefined : address;
  const guard = useGuardStatus(owner);
  const usdc = useUsdc(owner);
  const router = useRouter();
  const toast = useToast();
  const id = useId();

  const [amount, setAmount] = useState('1,000');
  const [days, setDays] = useState(DEFAULT_TIMEOUT_DAYS);
  const [heirs, setHeirs] = useState<Heir[]>([blank('50'), blank('50')]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<{ txHash: `0x${string}`; message: string } | null>(null);

  const approveFlow = useTxFlow({ onDone: () => toast(`${TOKEN} approved.`) });
  const createFlow = useTxFlow();

  // ─── Derived validation (mirrors InheritanceGuard.setupGuard) ─────────────
  const amt = parseAmount(amount);
  const allowance = usdc.allowance;
  const balance = usdc.balance ?? 0n;
  const approved = amt !== null && amt > 0n && allowance === amt;
  const bps = heirs.map((h) => pctToBps(h.pct) ?? 0);
  const total = bps.reduce((a, b) => a + b, 0);
  const heirErr = validateHeirs(address, heirs.map((h, i) => ({ wallet: h.wallet.trim(), bps: bps[i] })));
  const problems: string[] = [];
  if (amt === null || amt === 0n) problems.push('Enter an approval amount above 0.');
  else if (!approved) problems.push(`Approve ${formatAmount(amt)} ${TOKEN} in step 1.`);
  heirs.forEach((h, i) => {
    if (pctToBps(h.pct) === null) problems.push(`Heir ${i + 1}: share must be a number with up to 2 decimals.`);
    if (h.email.trim() && !EMAIL.test(h.email.trim())) problems.push(`Heir ${i + 1}: check the email.`);
  });
  if (heirErr) problems.push(heirErr.replace(/BPS/g, 'basis points'));
  const ready = problems.length === 0;

  const movable = minBigint(amt ?? 0n, balance);
  const preview = splitAmount(movable, bps);

  const update = (i: number, patch: Partial<Heir>) => setHeirs((p) => p.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const touch = (key: string) => setTouched((t) => new Set(t).add(key));

  async function saveVault(txHash: `0x${string}`) {
    const res = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: chain.id,
        txHash,
        beneficiaries: heirs.map((h) => ({ walletAddress: h.wallet.trim(), email: h.email.trim() || undefined })),
      }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error || `HTTP ${res.status}`);
    }
  }

  async function afterSetup(txHash: `0x${string}`) {
    try {
      await saveVault(txHash);
      setSaveError(null);
      toast('Vault created. Heirs with an email will get a setup notice.');
      router.push('/vault');
    } catch (e) {
      // The guard is live on-chain either way; only the off-chain email record failed.
      setSaveError({ txHash, message: e instanceof Error ? e.message : 'Saving failed' });
    }
  }

  if (!isConnected || isConnecting) return isConnecting ? <LoadingCard label="Connecting wallet…" /> : null;
  if (needsSignIn) return <SignInCard title="Sign in to create a vault" />;
  if (guard.isLoading) return <LoadingCard />;
  if (guard.status === 'ACTIVE' && !createFlow.busy && !saveError)
    return (
      <EmptyCard icon="shield" title="You already have an active vault" action={<Link className="btn btn-primary" href="/vault">Go to dashboard</Link>}>
        One active vault per wallet. To change your heirs, revoke the current vault first.
      </EmptyCard>
    );

  const showErr = (key: string, msg: string | null) => (touched.has(key) && msg ? msg : null);

  return (
    <main className="app">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Create a vault</h1>
            <p className="muted">Three settings, two wallet signatures. You can revoke at any time.</p>
          </div>
        </div>

        {saveError && (
          <div className="card pad" role="alert" style={{ marginBottom: 20, borderLeft: '6px solid var(--pulse)' }}>
            <h2 style={{ fontSize: 20 }}>Your vault is active, but heir emails weren’t saved</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              {saveError.message}. The guard is live on-chain (
              <a href={txUrl(saveError.txHash)} target="_blank" rel="noreferrer">view on BaseScan</a>). Retry to store the emails.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              <button className="btn btn-primary" type="button" onClick={() => afterSetup(saveError.txHash)}>Retry saving</button>
              <Link className="btn btn-ghost" href="/vault">Skip, go to dashboard</Link>
            </div>
          </div>
        )}

        <div className="layout">
          <div className="main">
            {/* 1. Token and approval */}
            <section className="card pad" aria-labelledby={`${id}-c1`}>
              <h2 id={`${id}-c1`} style={{ fontSize: 22, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="badge b-active">1</span>Token and approval
              </h2>
              <div style={{ marginTop: 18 }}>
                <span className="lbl" id={`${id}-tok`}>Token</span>
                <div className="seg" role="group" aria-labelledby={`${id}-tok`}>
                  <button type="button" aria-pressed="true">{TOKEN}</button>
                </div>
                <p className="muted small addr" style={{ marginTop: 6 }}>{USDC_ADDRESS}</p>
              </div>
              <div style={{ marginTop: 16, maxWidth: 360 }}>
                <label className="lbl" htmlFor={`${id}-amt`}>Amount Pulse may move ({TOKEN})</label>
                <input
                  className="field num"
                  id={`${id}-amt`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  aria-invalid={amount.trim() !== '' && amt === null}
                  aria-describedby={`${id}-amt-e ${id}-amt-h`}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <div className="err" id={`${id}-amt-e`}>
                  {amount.trim() && amt === null ? 'Use numbers only, like 5000 or 5,000.50' : ''}
                </div>
              </div>
              <p className="muted small" id={`${id}-amt-h`} style={{ marginTop: 6 }}>
                Your wallet holds {usdc.balance === undefined ? '…' : formatAmount(balance)} {TOKEN}. Tokens stay there until transfer.
                {allowance !== undefined && allowance > 0n && !approved && ` Current approval: ${formatAmount(allowance)} ${TOKEN}.`}
              </p>
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                {approved ? (
                  <span className="badge b-exec"><Icon name="check" />Approved {formatAmount(amt!)} {TOKEN}</span>
                ) : (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={amt === null || amt === 0n || approveFlow.busy}
                    onClick={() =>
                      approveFlow.start([{
                        label: `Approve ${formatAmount(amt!)} ${TOKEN}`,
                        detail: `Lets Pulse move up to ${formatAmount(amt!)} ${TOKEN} after your deadline.`,
                        call: () => calls.approve(amt!),
                        onConfirmed: () => void usdc.refetch(),
                      }])
                    }
                  >
                    {approveFlow.busy ? 'Approving…' : `Approve ${TOKEN}`}
                  </button>
                )}
              </div>
            </section>

            {/* 2. Period */}
            <section className="card pad" aria-labelledby={`${id}-c2`}>
              <h2 id={`${id}-c2`} style={{ fontSize: 22, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="badge b-active">2</span>Silence before transfer
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, marginTop: 16 }} aria-live="polite">
                <span className="num" style={{ fontWeight: 700, letterSpacing: '-.04em', fontSize: 'clamp(44px, 12vw, 64px)', lineHeight: 1, color: 'var(--accent-ink)' }}>
                  {days} days
                </span>
                <span className="muted">about {Math.round(days / 30.4)} months</span>
              </div>
              <label className="lbl" htmlFor={`${id}-days`} style={{ marginTop: 14 }}>Inactivity period</label>
              <input type="range" id={`${id}-days`} min={60} max={730} step={1} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-valuetext={`${days} days`} />
              <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span>60 days minimum</span>
                <span>730 days maximum</span>
              </div>
              <div className="seg" style={{ marginTop: 12 }} role="group" aria-label="Presets">
                {PRESETS.map(([d, label]) => (
                  <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{label}</button>
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 14 }}>
                Pulse doesn’t send you reminders. Add a calendar reminder shorter than this period.
              </p>
            </section>

            {/* 3. Heirs */}
            <section className="card pad" aria-labelledby={`${id}-c3`}>
              <h2 id={`${id}-c3`} style={{ fontSize: 22, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="badge b-active">3</span>Heirs
              </h2>
              <div>
                {heirs.map((h, i) => {
                  const w = h.wallet.trim();
                  const walletErr = showErr(`w${i}`, w && !isAddress(w, { strict: false }) ? 'Must be 0x followed by 40 hex characters' : null);
                  const emailErr = showErr(`e${i}`, h.email.trim() && !EMAIL.test(h.email.trim()) ? 'Check this email' : null);
                  const pctErr = showErr(`p${i}`, pctToBps(h.pct) === null ? 'Up to 2 decimals' : null);
                  return (
                    <div className="heir-row" key={i}>
                      <div className="w">
                        <label className="lbl" htmlFor={`${id}-hw${i}`}>Heir {i + 1} wallet</label>
                        <input className="field addr" id={`${id}-hw${i}`} placeholder="0x…" value={h.wallet} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                          aria-invalid={!!walletErr} aria-describedby={`${id}-ew${i}`} onBlur={() => touch(`w${i}`)} onChange={(e) => update(i, { wallet: e.target.value })} />
                        <div className="err" id={`${id}-ew${i}`}>{walletErr}</div>
                      </div>
                      <div className="e">
                        <label className="lbl" htmlFor={`${id}-he${i}`}>Email <span className="muted">(optional)</span></label>
                        <input className="field" id={`${id}-he${i}`} type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" value={h.email}
                          aria-invalid={!!emailErr} aria-describedby={`${id}-ee${i}`} onBlur={() => touch(`e${i}`)} onChange={(e) => update(i, { email: e.target.value })} />
                        <div className="err" id={`${id}-ee${i}`}>{emailErr}</div>
                      </div>
                      <div>
                        <label className="lbl" htmlFor={`${id}-hp${i}`}>Share %</label>
                        <input className="field num" id={`${id}-hp${i}`} inputMode="decimal" autoComplete="off" value={h.pct}
                          aria-invalid={!!pctErr} aria-describedby={`${id}-ep${i}`} onBlur={() => touch(`p${i}`)} onChange={(e) => update(i, { pct: e.target.value })} />
                        <div className="err" id={`${id}-ep${i}`}>{pctErr}</div>
                      </div>
                      <div className="rm">
                        <button className="icon-btn" type="button" aria-label={`Remove heir ${i + 1}`} disabled={heirs.length <= 1}
                          onClick={() => setHeirs((p) => p.filter((_, j) => j !== i))}>
                          <Icon name="x" strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" type="button" disabled={heirs.length >= MAX_BENEFICIARIES}
                    onClick={() => setHeirs((p) => [...p, blank('0')])}>Add heir</button>
                  <button className="btn btn-ghost btn-sm" type="button"
                    onClick={() => { const even = equalBps(heirs.length); setHeirs((p) => p.map((h, i) => ({ ...h, pct: bpsToPct(even[i]) }))); }}>
                    Split evenly
                  </button>
                </div>
                <div className="total" role="status">
                  <span className="muted">Total</span>
                  <b className="num" style={{ color: total === TOTAL_BPS ? 'var(--ok)' : 'var(--pulse)' }}>{(total / 100).toFixed(2)}%</b>
                </div>
              </div>
              <p className="err" style={{ marginTop: 8 }}>
                {total === TOTAL_BPS ? '' : total < TOTAL_BPS ? `${((TOTAL_BPS - total) / 100).toFixed(2)}% left to assign.` : `${((total - TOTAL_BPS) / 100).toFixed(2)}% over 100%.`}
              </p>
              <p className="muted small">
                Up to {MAX_BENEFICIARIES} heirs, at least 1% each. Emails stay off-chain and are used only for the setup and transfer notices.
              </p>
            </section>
          </div>

          {/* Review: sticky beside the form on ≥1024px */}
          <div className="side sticky">
            <section className="review" aria-labelledby={`${id}-rv`}>
              <h2 id={`${id}-rv`} style={{ fontSize: 20 }}>Review</h2>
              <ul className="feed" style={{ marginTop: 8 }}>
                <li><span>Token</span><span className="end">{TOKEN}</span></li>
                <li><span>Period</span><span className="end">{days} days</span></li>
                {heirs.map((h, i) => (
                  <li key={i}>
                    <span>
                      Heir {i + 1}{' '}
                      <span className="muted addr" style={{ fontSize: 12 }}>{isAddress(h.wallet.trim(), { strict: false }) ? shortAddr(h.wallet.trim()) : ''}</span>
                    </span>
                    <span className="end num" style={{ fontWeight: 600 }}>{formatAmount(preview[i] > 0n ? preview[i] : 0n)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                If transfer ran today: {formatAmount(movable)} {TOKEN} (the smaller of your balance and approval). Leftover rounding goes to the last heir.
              </p>
              <button
                className="btn btn-block"
                style={{ background: '#AB9FF2', color: '#1E173A', marginTop: 18 }}
                type="button"
                disabled={!ready || createFlow.busy}
                onClick={() =>
                  createFlow.start([{
                    label: 'Create vault',
                    detail: `Calls setupGuard() with ${heirs.length} heirs and a ${days}-day period.`,
                    call: () => calls.setupGuard(USDC_ADDRESS, BigInt(days * DAY), heirs.map((h, i) => ({ wallet: h.wallet.trim() as `0x${string}`, bps: bps[i] }))),
                    onConfirmed: (r) => afterSetup(r.transactionHash),
                  }])
                }
              >
                {createFlow.busy ? 'Creating…' : 'Create vault'}
              </button>
              <p style={{ fontSize: 13, marginTop: 10, color: '#FFB4A8' }} role="status" aria-live="polite">
                {ready ? '' : problems[0]}
              </p>
            </section>
          </div>
        </div>
      </div>
      <TxModal flow={approveFlow} title={`Approve ${TOKEN}`} />
      <TxModal flow={createFlow} title="Create vault" />
    </main>
  );
}
