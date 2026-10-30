// Share math shared by the create form, the dashboard preview and the home calculator.
// Mirrors InheritanceGuard.executeFor exactly: floor(amount * bps / 10_000) per heir,
// and the last heir receives `amount - distributed` (BR-03: dust to the last heir).

export const TOTAL_BPS = 10_000; // BR-02
export const USDC_DECIMALS = 6;

/** BR-03 split: integer shares, remainder to the last heir. Same arithmetic as the contract. */
export function splitAmount(amount: bigint, bps: readonly number[]): bigint[] {
  if (bps.length === 0) return [];
  let distributed = 0n;
  return bps.map((b, i) => {
    if (i === bps.length - 1) return amount - distributed;
    const share = (amount * BigInt(b)) / BigInt(TOTAL_BPS);
    distributed += share;
    return share;
  });
}

/** n equal shares that total exactly 10,000 BPS; the last heir takes the remainder. */
export function equalBps(n: number): number[] {
  if (!Number.isInteger(n) || n < 1) return [];
  const base = Math.floor(TOTAL_BPS / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? TOTAL_BPS - base * (n - 1) : base));
}

/**
 * Parse a percentage string ("50", "33.33", "12.5") into whole BPS without floating point.
 * Returns null for anything that is not a non-negative number with at most 2 decimals.
 */
export function pctToBps(pct: string): number | null {
  const t = pct.trim();
  const m = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(t);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bps > TOTAL_BPS ? null : bps;
}

/** 3333 → "33.33", 5000 → "50", 1250 → "12.5" */
export function bpsToPct(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** Parse a token amount such as "5,000.50" into base units. Null if malformed or too precise. */
export function parseAmount(input: string, decimals = USDC_DECIMALS): bigint | null {
  const t = input.replace(/,/g, '').trim();
  const m = new RegExp(`^(\\d+)(?:\\.(\\d{0,${decimals}}))?$`).exec(t);
  if (!m) return null;
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt((m[2] ?? '').padEnd(decimals, '0') || '0');
}

/**
 * Format base units with thousands separators. Shows at least `minFraction` decimals and
 * more only when they are non-zero, so rounding dust stays visible (33.333334).
 */
export function formatAmount(value: bigint, decimals = USDC_DECIMALS, minFraction = 2): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const whole = (v / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let frac = (v % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  if (frac.length < minFraction) frac = frac.padEnd(minFraction, '0');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

export const minBigint = (a: bigint, b: bigint) => (a < b ? a : b);
