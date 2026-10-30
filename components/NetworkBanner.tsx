'use client';
import { useAccount, useSwitchChain } from 'wagmi';
import { chain } from '@/lib/chain';
import { Icon } from './icons';

/** Shown whenever a connected wallet is on any chain other than the configured one. */
export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();
  if (!isConnected || chainId === chain.id) return null;
  return (
    <div className="wrap">
      <div className="net-banner" role="alert">
        <Icon name="alert" />
        <span>
          Wrong network. Pulse runs on <b>{chain.name}</b>.
          {error && <span className="small"> Switch manually in your wallet if the button doesn&apos;t work.</span>}
        </span>
        <button className="btn btn-sm btn-danger" type="button" disabled={isPending} onClick={() => switchChain({ chainId: chain.id })}>
          {isPending ? 'Switching…' : `Switch to ${chain.name}`}
        </button>
      </div>
    </div>
  );
}
