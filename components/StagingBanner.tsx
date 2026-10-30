import { IS_STAGING } from '@/lib/pulse-env';

/** Sticky with the header. Rendered only when NEXT_PUBLIC_PULSE_ENV=staging. */
export function StagingBanner() {
  if (!IS_STAGING) return null;
  return (
    <div className="staging-banner" role="status">
      STAGING — test contract, short timers
    </div>
  );
}
