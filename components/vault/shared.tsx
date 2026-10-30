'use client';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useState, type ReactNode } from 'react';
import type { GuardStatus } from '@/lib/guard-status';
import { Icon, type IconName } from '../icons';

export function EmptyCard({ icon, title, children, action }: { icon: IconName; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="app">
      <div className="wrap">
        <div className="card empty">
          <span style={{ color: 'var(--accent-ink)' }}>
            <Icon name={icon} size={26} strokeWidth={1.8} />
          </span>
          <h1>{title}</h1>
          <p className="muted" style={{ maxWidth: '28em' }}>{children}</p>
          {action}
        </div>
      </div>
    </main>
  );
}

/** Connected but no SIWE session (or a session for a different wallet). */
export function SignInCard({ title }: { title: string }) {
  const { openConnectModal } = useConnectModal();
  return (
    <EmptyCard
      icon="wallet"
      title={title}
      action={
        <button className="btn btn-primary" type="button" onClick={openConnectModal} disabled={!openConnectModal}>
          Sign in with your wallet
        </button>
      }
    >
      Sign a short message so Pulse knows this vault is yours. Signing is free and sends no transaction.
    </EmptyCard>
  );
}

export function LoadingCard({ label = 'Reading the contract…' }: { label?: string }) {
  return (
    <main className="app">
      <div className="wrap">
        <div className="card empty" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p className="muted">{label}</p>
        </div>
      </div>
    </main>
  );
}

const BADGE: Record<GuardStatus, [string, string]> = {
  ACTIVE: ['b-active', 'Active'],
  EXECUTED: ['b-exec', 'Executed'],
  REVOKED: ['b-revoked', 'Revoked'],
  NONE: ['b-revoked', 'No vault'],
};

export function StatusBadge({ status }: { status: GuardStatus }) {
  const [cls, label] = BADGE[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

/** Current unix time in seconds, ticking every second (client only, avoids hydration mismatch). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const fmtDate = (unixSec: number | bigint) =>
  new Date(Number(unixSec) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ago(unixSec: number, now: number) {
  const d = now - unixSec;
  if (d < 60) return 'just now';
  const m = Math.floor(d / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

const BEAT = ' h10 l5 -8 l5 8 h8 l5 -55 l7 85 l6 -38 l4 8 h10';

/** Heartbeat trace: one beat per check-in; the dot walks toward the deadline marker. */
export function Trace({ beats, frac, label }: { beats: number; frac: number; label: string }) {
  const n = Math.max(1, Math.min(beats, 4));
  let d = 'M0 90';
  let x = 24;
  for (let i = 0; i < n; i++) {
    d += ` H${x}${BEAT}`;
    x += 100;
  }
  const end = x - 40;
  const dotX = (end + (512 - end) * Math.max(0, Math.min(1, frac))).toFixed(1);
  const ink = '#1E173A';
  const red = '#9E2418';
  return (
    <svg viewBox="0 0 560 150" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={label}>
      <line x1="0" y1="90" x2="560" y2="90" stroke="rgba(30,23,58,.18)" strokeWidth="1" />
      <path d={`${d} H${dotX}`} fill="none" stroke={ink} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={dotX} y1="90" x2="512" y2="90" stroke={red} strokeWidth="2.6" strokeDasharray="6 7" />
      <line x1="520" y1="38" x2="520" y2="132" stroke={red} strokeWidth="2" />
      <circle cx={dotX} cy="90" r="6" fill={ink} />
    </svg>
  );
}
