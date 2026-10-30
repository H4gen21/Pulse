import { chain } from '@/lib/chain';
import { GUARD_ADDRESS } from '@/lib/contract';
import { addressUrl } from '@/lib/explorer';

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <span>Pulse. Non-custodial inheritance guard on {chain.name}.</span>
        <a href={addressUrl(GUARD_ADDRESS)} target="_blank" rel="noreferrer">
          Contract on BaseScan
        </a>
      </div>
    </footer>
  );
}
