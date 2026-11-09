import { chain } from '@/lib/chain';
import { GUARD_ADDRESS } from '@/lib/contract';
import { addressUrl } from '@/lib/explorer';
import { TESTNET_NOTICE } from './TestnetBanner';

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <span>Pulse. Non-custodial inheritance guard on {chain.name}.</span>
        <span className="foot-notice">{TESTNET_NOTICE}</span>
        <a href={addressUrl(GUARD_ADDRESS)} target="_blank" rel="noreferrer">
          Contract on BaseScan
        </a>
      </div>
    </footer>
  );
}
