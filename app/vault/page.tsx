'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { VaultPreview } from '@/components/vault/previews';
import { useGuardStatus, useUsdc, useVaultApi } from '@/hooks/useGuardContract';
import { useTxFlow } from '@/hooks/useTxFlow';
import { calls, USDC_ADDRESS } from '@/lib/contract';
import { deadlineOf } from '@/lib/guard-status';
import type { GuardEvent } from '@/lib/guard-events';
import { formatAmount, minBigint, splitAmount } from '@/lib/split';
import { countdownParts, formatPeriod } from '@/lib/period';
import { IS_STAGING } from '@/lib/pulse-env';
import { shortAddr, txUrl } from '@/lib/explorer';
import { Icon, type IconName } from '@/components/icons';
import { Modal } from '@/components/Modal';
import { TxModal } from '@/components/TxModal';
import { useToast } from '@/components/Toasts';
import { EmptyCard, LoadingCard, StatusBadge, Trace, ago, fmtDate, useNow } from '@/components/vault/shared';

const TOKEN = 'USDC';
const period = (sec: number | bigint, adjective = false) => formatPeriod(Number(sec), { staging: IS_STAGING, adjective });

export default function VaultPage() {
  return <AuthGate preview={<VaultPreview />}>{(owner) => <Dashboard owner={owner} />}</AuthGate>;
}

function Dashboard({ owner }: { owner: `0x${string}` }) {
  const guard = useGuardStatus(owner);
  const usdc = useUsdc(owner);
  const api = useVaultApi(owner);
  const toast = useToast();
  const now = useNow();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const refetchAll = () => {
    void guard.refetch();
    void usdc.refetch();
    void guard.events.refetch();
    void api.refetch();
  };

  const pingFlow = useTxFlow({
    onDone: () => toast(`Timer restarted. Next deadline ${fmtDate(Math.floor(Date.now() / 1000) + Number(guard.config?.timeoutDuration ?? 0))}.`),
  });
  const revokeFlow = useTxFlow({ onDone: () => toast('Vault revoked and approval set to 0.') });
  const resetFlow = useTxFlow({ onDone: () => toast('Approval set to 0.') });

  if (guard.isLoading) return <LoadingCard />;
  if (guard.error)
    return (
      <EmptyCard icon="alert" title="Couldn’t read the contract" action={<button className="btn btn-primary" type="button" onClick={refetchAll}>Try again</button>}>
        {guard.error.message.split('\n')[0]}
      </EmptyCard>
    );

  const { config, beneficiaries, status } = guard;
  if (!config || status === 'NONE')
    return (
      <EmptyCard icon="shield" title="You don’t have a vault yet" action={<Link className="btn btn-primary" href="/vault/create">Create your vault</Link>}>
        It takes about two minutes: approve USDC, choose your period, and name your heirs.
      </EmptyCard>
    );

  const events = guard.events.data?.events ?? [];
  const sinceSetup = events.slice(0, events.findIndex((e) => e.name === 'GuardSetup') + 1 || events.length);
  const balance = usdc.balance ?? 0n;
  const allowance = usdc.allowance ?? 0n;
  const movable = minBigint(balance, allowance);
  const bps = beneficiaries.map((b) => b.bps);

  // Executed: actual payouts from BeneficiaryPaid in the latest execution. Otherwise: today's preview.
  const execIdx = sinceSetup.findIndex((e) => e.name === 'InheritanceExecuted');
  const paid = new Map<string, bigint>();
  if (status === 'EXECUTED' && execIdx >= 0) {
    for (const e of sinceSetup.slice(execIdx)) {
      if (e.name === 'BeneficiaryPaid') paid.set(String(e.args.wallet).toLowerCase(), e.args.amount as bigint);
    }
  }
  const amounts =
    status === 'EXECUTED'
      ? beneficiaries.map((b) => paid.get(b.wallet.toLowerCase()) ?? 0n)
      : splitAmount(movable, bps);
  const totalOut = amounts.reduce((a, b) => a + b, 0n);
  const emails = new Map(api.data?.beneficiaries.map((b) => [b.walletAddress.toLowerCase(), b.email]) ?? []);
  const timeout = Number(config.timeoutDuration);

  return (
    <main className="app">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Your vault</h1>
            <p className="muted">
              {TOKEN}, {beneficiaries.length} {beneficiaries.length === 1 ? 'heir' : 'heirs'}, {period(timeout, true)} period
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="layout">
          <div className="main">
            {status === 'ACTIVE' ? (
              <TimerCard
                deadline={Number(deadlineOf(config))}
                timeout={Number(config.timeoutDuration)}
                lastPing={Number(config.lastPingTimestamp)}
                beats={sinceSetup.filter((e) => e.name === 'Pinged' || e.name === 'GuardSetup').length}
                now={now}
                busy={pingFlow.busy}
                onPing={() => pingFlow.start([{ label: 'Check in', detail: `Calls ping(). Your timer restarts at ${period(timeout)}.`, call: calls.ping, onConfirmed: refetchAll }])}
              />
            ) : status === 'EXECUTED' ? (
              <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 style={{ fontSize: 24 }}>Inheritance executed</h2>
                <p className="muted">
                  Chainlink Automation ran
                  {sinceSetup[execIdx]?.timestamp ? ` on ${fmtDate(sinceSetup[execIdx].timestamp!)}` : ''} after {period(timeout)}
                  of silence. {formatAmount(totalOut)} {TOKEN} was sent to your heirs.
                </p>
                <div><Link className="btn btn-ghost" href="/vault/create">Create a new vault</Link></div>
              </section>
            ) : (
              <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 style={{ fontSize: 24 }}>{guard.events.data?.latest === 'InheritanceFailed' ? 'Automatic transfer failed' : 'Vault revoked'}</h2>
                <p className="muted">
                  {guard.events.data?.latest === 'InheritanceFailed'
                    ? 'The contract couldn’t read your token balance, so it deactivated the vault. Nothing left your wallet.'
                    : 'The timer is stopped and heirs can no longer inherit.'}{' '}
                  {allowance === 0n ? `Your ${TOKEN} approval is 0.` : `Your ${TOKEN} approval for Pulse is still ${formatAmount(allowance)}.`}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {allowance > 0n && (
                    <button className="btn btn-ghost" type="button" disabled={resetFlow.busy} onClick={() => resetFlow.start([{ label: `Set ${TOKEN} approval to 0`, call: () => calls.approve(0n), onConfirmed: refetchAll }])}>
                      Reset approval to 0
                    </button>
                  )}
                  <Link className="btn btn-primary" href="/vault/create">Create a new vault</Link>
                </div>
              </section>
            )}

            <div className="grid-auto">
              <div className="card pad">
                <span className="muted small">Wallet balance</span>
                <span className="stat num">{usdc.balance === undefined ? '…' : `${formatAmount(balance)} ${TOKEN}`}</span>
              </div>
              <div className="card pad">
                <span className="muted small">Approved for Pulse</span>
                <span className="stat num">{usdc.allowance === undefined ? '…' : `${formatAmount(allowance)} ${TOKEN}`}</span>
              </div>
              <div className="card pad">
                <span className="muted small">{status === 'EXECUTED' ? 'Sent to heirs' : 'Heirs would receive today'}</span>
                <span className="stat num" style={{ color: 'var(--accent-ink)' }}>{formatAmount(totalOut)} {TOKEN}</span>
                {status !== 'EXECUTED' && <span className="muted" style={{ fontSize: 13 }}>The smaller of balance and approval</span>}
              </div>
            </div>

            <section className="card pad" aria-labelledby="heirs-h">
              <h2 id="heirs-h" style={{ fontSize: 22, marginBottom: 10 }}>Heirs</h2>
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Wallet</th>
                    <th scope="col">Email</th>
                    <th scope="col" className="r">Share</th>
                    <th scope="col" className="r">{status === 'EXECUTED' ? 'Received' : 'Would receive'}</th>
                  </tr>
                </thead>
                <tbody>
                  {beneficiaries.map((b, i) => (
                    <tr key={b.wallet}>
                      <td data-label="Wallet" className="addr" title={b.wallet}>{shortAddr(b.wallet)}</td>
                      <td data-label="Email">{emails.get(b.wallet.toLowerCase()) ?? <span className="muted">—</span>}</td>
                      <td data-label="Share" className="r num">{(b.bps / 100).toFixed(2)}%</td>
                      <td data-label={status === 'EXECUTED' ? 'Received' : 'Would receive'} className="r num" style={{ fontWeight: 600 }}>
                        {formatAmount(amounts[i] ?? 0n)} {TOKEN}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small" style={{ marginTop: 12 }}>
                The last heir also receives any rounding leftover. Emails are stored off-chain and only shown to you.
              </p>
            </section>
          </div>

          <div className="side">
            {status === 'ACTIVE' && (
              <section className="card pad" aria-labelledby="rv-h">
                <h2 id="rv-h" style={{ fontSize: 20 }}>Cancel this vault</h2>
                <p className="muted" style={{ margin: '10px 0 14px' }}>
                  Stops the timer and removes your heirs. Takes two wallet signatures.
                </p>
                <button className="btn btn-outline-danger" type="button" disabled={revokeFlow.busy} onClick={() => setConfirmRevoke(true)}>
                  Revoke vault
                </button>
              </section>
            )}
            <section className="card pad" aria-labelledby="a-h">
              <h2 id="a-h" style={{ fontSize: 20, marginBottom: 6 }}>Activity</h2>
              <Activity events={events} loading={guard.events.isLoading} failed={guard.events.isError} now={now} />
            </section>
          </div>
        </div>
      </div>

      <Modal open={confirmRevoke} onClose={() => setConfirmRevoke(false)} title="Revoke your vault?">
        <p className="muted" style={{ marginTop: 8 }}>Heirs will no longer inherit automatically. This takes two transactions:</p>
        <ol style={{ paddingLeft: 20, margin: '12px 0', color: 'var(--muted)', listStyle: 'decimal' }}>
          <li>Revoke the vault in the contract</li>
          <li>Set your {TOKEN} approval to 0</li>
        </ol>
        <div className="modal-actions">
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setConfirmRevoke(false);
              revokeFlow.start([
                { label: 'Revoke vault', detail: 'Calls revokeGuard().', call: calls.revokeGuard, onConfirmed: refetchAll },
                { label: `Reset ${TOKEN} approval`, detail: `Sets your ${TOKEN} approval for Pulse to 0.`, call: () => calls.approve(0n), onConfirmed: refetchAll },
              ]);
            }}
          >
            Revoke and reset
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setConfirmRevoke(false)}>Keep vault</button>
        </div>
      </Modal>
      <TxModal flow={pingFlow} title="Check in" />
      <TxModal flow={revokeFlow} title="Revoke vault" />
      <TxModal flow={resetFlow} title="Reset approval" />
    </main>
  );
}

function TimerCard({ deadline, timeout, lastPing, beats, now, busy, onPing }: {
  deadline: number; timeout: number; lastPing: number; beats: number; now: number | null; busy: boolean; onPing: () => void;
}) {
  const left = now === null ? timeout : Math.max(0, deadline - now);
  const parts = countdownParts(left, IS_STAGING);
  const frac = 1 - left / timeout;
  const expired = now !== null && left === 0;

  return (
    <section className="timer" aria-labelledby="t-h">
      <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 id="t-h" style={{ fontSize: 17, fontWeight: 600, color: '#3B3260' }}>
          {expired ? 'Deadline passed' : 'Transfer starts in'}
        </h2>
        <div className="count num" role="timer" aria-label={parts.length === 1 ? `${parts[0][0]} seconds left` : `${parts[0][0]} days, ${parts[1][0]} hours, ${parts[2][0]} minutes left`}>
          {parts.map(([v, unit], i) => (
            <div key={unit} aria-hidden="true">
              <b style={i === 0 ? { color: '#9E2418' } : undefined}>{now === null ? '–' : String(v).padStart(i === 0 ? 1 : 2, '0')}</b>
              <span>{unit}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(2)}%` }} /></div>
          <p className="muted small" style={{ marginTop: 8 }}>
            {expired
              ? 'Chainlink Automation will transfer on its next run. Checking in now still cancels it.'
              : `Deadline ${fmtDate(deadline)}. Last check-in ${now === null ? fmtDate(lastPing) : ago(lastPing, now)}.`}
          </p>
        </div>
        <div>
          <button className="btn btn-primary" type="button" onClick={onPing} disabled={busy}>
            <Icon name="heart" size={18} />
            I’m still here
          </button>
        </div>
      </div>
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        <Trace beats={beats} frac={frac} label="Check-in trace. The dot moves toward the deadline marker as time passes." />
      </div>
    </section>
  );
}

const EVENT_UI: Record<GuardEvent['name'], [IconName, (e: GuardEvent) => string]> = {
  GuardSetup: ['shield', (e) => `Vault created: ${e.args.beneficiaryCount} heirs, ${period(e.args.timeoutDuration as bigint, true)} period`],
  Pinged: ['heart', () => 'Checked in'],
  GuardRevoked: ['stop', () => 'Vault revoked'],
  InheritanceExecuted: ['send', (e) => `Chainlink Automation sent ${formatAmount(e.args.totalAmount as bigint)} ${String(e.args.token).toLowerCase() === USDC_ADDRESS.toLowerCase() ? TOKEN : 'tokens'}`],
  InheritanceFailed: ['alert', () => 'Automatic transfer failed. Nothing left your wallet'],
  BeneficiaryPaid: ['send', (e) => `Paid ${formatAmount(e.args.amount as bigint)} ${TOKEN} to ${shortAddr(e.args.wallet as string)}`],
  BeneficiaryTransferFailed: ['alert', (e) => `Transfer of ${formatAmount(e.args.amount as bigint)} ${TOKEN} to ${shortAddr(e.args.wallet as string)} failed. It stayed in your wallet`],
};

function Activity({ events, loading, failed, now }: { events: GuardEvent[]; loading: boolean; failed: boolean; now: number | null }) {
  if (loading) return <p className="muted small" role="status">Loading on-chain activity…</p>;
  if (failed) return <p className="muted small" role="status">Couldn’t load activity from the RPC. Your vault status above is read directly from the contract.</p>;
  if (events.length === 0) return <p className="muted small">No activity yet.</p>;
  return (
    <ul className="feed">
      {events.slice(0, 10).map((e) => {
        const [icon, text] = EVENT_UI[e.name];
        return (
          <li key={`${e.txHash}-${e.logIndex}`}>
            <span className="ic"><Icon name={icon} size={18} /></span>
            <span>
              {text(e)}
              <br />
              <a className="addr" style={{ fontSize: 12 }} href={txUrl(e.txHash)} target="_blank" rel="noreferrer">
                {shortAddr(e.txHash)} on BaseScan
              </a>
            </span>
            <span className="end">{e.timestamp ? (now ? ago(e.timestamp, now) : fmtDate(e.timestamp)) : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}
