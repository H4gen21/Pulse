'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { chain } from '@/lib/chain';

/** RainbowKit ConnectButton.Custom styled as the prototype's chips. SIWE runs through the auth adapter. */
export function WalletButton({ label = 'Connect wallet' }: { label?: string }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain: current, openAccountModal, openChainModal, openConnectModal, mounted, authenticationStatus }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected = ready && account && current && authenticationStatus !== 'unauthenticated';
        return (
          <div className="who" aria-hidden={!ready} style={ready ? undefined : { opacity: 0, pointerEvents: 'none' }}>
            {!connected ? (
              <button className="btn btn-primary" type="button" onClick={openConnectModal}>
                {account ? 'Sign in' : label}
              </button>
            ) : current.unsupported || current.id !== chain.id ? (
              <button className="btn btn-danger" type="button" onClick={openChainModal}>
                Wrong network
              </button>
            ) : (
              <>
                <button className="chip chip-btn hide-sm" type="button" onClick={openChainModal} aria-label={`Network: ${current.name}`}>
                  {current.name}
                </button>
                <button className="chip chip-btn" type="button" onClick={openAccountModal} aria-label={`Account ${account.address}`}>
                  <span className="dot" aria-hidden="true" />
                  <span className="addr">{account.displayName}</span>
                </button>
              </>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
