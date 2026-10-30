import { base } from 'viem/chains';

// NEXT_PUBLIC_PULSE_ENV=staging points the UI at InheritanceGuardStaging (15-second minimum
// timer). It is ignored on Base mainnet, so a misconfigured production deploy can't show
// short-timer controls.
export const IS_STAGING =
  process.env.NEXT_PUBLIC_PULSE_ENV === 'staging' && Number(process.env.NEXT_PUBLIC_CHAIN_ID) !== base.id;
