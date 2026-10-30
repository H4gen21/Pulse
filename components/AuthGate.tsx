'use client';
import { Fragment, useId, type ReactNode } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useSwitchChain } from 'wagmi';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { chain } from '@/lib/chain';
import { Icon } from './icons';

type Props = {
  /** Static placeholder shown blurred behind the lock card. Must not read real data. */
  preview: ReactNode;
  /** Ends "Connect your wallet to …". */
  purpose?: string;
  /** Rendered only once the connected wallet has a SIWE session on the right network. */
  children: (owner: `0x${string}`) => ReactNode;
};

/**
 * Owner-only pages render for everyone. Until the wallet is connected, on the right network
 * and signed in, visitors see a blurred placeholder and one clear next step. The real page
 * (and every data hook in it) mounts only in the signed-in state; the API checks the session
 * on its own.
 */
export function AuthGate({ preview, purpose = 'see your vault', children }: Props) {
  const { address, state } = useAuthGuard();

  if (state === 'loading') return <GateSkeleton />;
  // Keyed by wallet so switching accounts starts the page fresh.
  if (state === 'ready') return <Fragment key={address}>{children(address!)}</Fragment>;

  return (
    <main className="app gate">
      {/* React 18 only renders inert as a string attribute; the typings expect a boolean. */}
      <div className="gate-preview" aria-hidden="true" {...({ inert: '' } as object)}>
        {preview}
      </div>
      <div className="gate-veil" aria-hidden="true" />
      <div className="gate-center">
        <LockCard state={state} purpose={purpose} />
      </div>
    </main>
  );
}

function LockCard({ state, purpose }: { state: 'disconnected' | 'wrong-network' | 'signed-out'; purpose: string }) {
  const id = useId();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending, error } = useSwitchChain();

  const [title, body, action] =
    state === 'disconnected'
      ? [
          `Connect your wallet to ${purpose}`,
          'Pulse never holds your funds. Connecting only shares your wallet address.',
          <button key="c" className="btn btn-primary" type="button" onClick={openConnectModal} disabled={!openConnectModal}>
            <Icon name="wallet" size={18} />
            Connect wallet
          </button>,
        ]
      : state === 'wrong-network'
        ? [
            `Switch to ${chain.name}`,
            `Pulse runs on ${chain.name}. Your wallet is on another network.`,
            <button key="n" className="btn btn-primary" type="button" onClick={() => switchChain({ chainId: chain.id })} disabled={isPending}>
              {isPending ? 'Check your wallet…' : `Switch to ${chain.name}`}
            </button>,
          ]
        : [
            'Sign in with your wallet',
            'Sign in to prove this wallet is yours. It’s free and sends no transaction.',
            <button key="s" className="btn btn-primary" type="button" onClick={openConnectModal} disabled={!openConnectModal}>
              Sign in
            </button>,
          ];

  return (
    <section className="card gate-card" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
      <span className="gate-lock" aria-hidden="true">
        <Icon name="lock" size={22} strokeWidth={1.8} />
      </span>
      <h1 id={`${id}-t`}>{title}</h1>
      <p id={`${id}-d`} className="muted">{body}</p>
      {action}
      {state === 'wrong-network' && error && (
        <p className="err" role="alert">
          Your wallet didn’t switch. Change the network to {chain.name} in the wallet itself.
        </p>
      )}
    </section>
  );
}

function GateSkeleton() {
  return (
    <main className="app" aria-busy="true">
      <div className="wrap">
        <p className="sr-only" role="status">Checking your wallet…</p>
        <div className="gate-skel" aria-hidden="true">
          <i style={{ width: 'min(320px, 70%)', height: 44 }} />
          <i style={{ width: 'min(240px, 50%)', height: 16, marginTop: 12 }} />
          <i style={{ height: 240, marginTop: 28, borderRadius: 'var(--r-lg)' }} />
          <div className="grid-auto" style={{ marginTop: 20 }}>
            <i style={{ height: 96 }} />
            <i style={{ height: 96 }} />
            <i style={{ height: 96 }} />
          </div>
        </div>
      </div>
    </main>
  );
}
