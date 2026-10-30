import { describe, expect, it } from 'vitest';
import { bpsToPct, equalBps, formatAmount, parseAmount, pctToBps, splitAmount, TOTAL_BPS } from '@/lib/split';

// Reference implementation copied from InheritanceGuard._execute, line for line.
function contractSplit(amount: bigint, bps: number[]): bigint[] {
  const out: bigint[] = [];
  let distributed = 0n;
  const last = bps.length - 1;
  for (let i = 0; i < last; ++i) {
    const share = (amount * BigInt(bps[i])) / 10_000n;
    distributed += share;
    out.push(share);
  }
  out.push(amount - distributed);
  return out;
}

describe('splitAmount (BR-03)', () => {
  it('sweeps dust into the last heir: 100 / 3 -> 33, 33, 34', () => {
    expect(splitAmount(100n, [3333, 3333, 3334])).toEqual([33n, 33n, 34n]);
  });

  it('matches the contract arithmetic and conserves the total', () => {
    const cases: number[][] = [[10_000], [5000, 5000], [1234, 4321, 4445], [100, 100, 9800], equalBps(7), equalBps(10)];
    for (const amount of [0n, 1n, 7n, 999_999n, 3_240_000_000n, 10n ** 24n]) {
      for (const bps of cases) {
        const parts = splitAmount(amount, bps);
        expect(parts).toEqual(contractSplit(amount, bps));
        expect(parts.reduce((s, p) => s + p, 0n)).toBe(amount);
      }
    }
  });

  it('returns nothing for no heirs', () => {
    expect(splitAmount(100n, [])).toEqual([]);
  });
});

describe('equalBps', () => {
  it.each([1, 2, 3, 6, 7, 10])('splits %i heirs to exactly 10,000 with the remainder last', (n) => {
    const bps = equalBps(n);
    expect(bps).toHaveLength(n);
    expect(bps.reduce((a, b) => a + b, 0)).toBe(TOTAL_BPS);
    expect(bps.slice(0, -1).every((b) => b === Math.floor(TOTAL_BPS / n))).toBe(true);
  });

  it('3 heirs -> 3333, 3333, 3334', () => {
    expect(equalBps(3)).toEqual([3333, 3333, 3334]);
  });
});

describe('pctToBps / bpsToPct', () => {
  it.each([
    ['50', 5000],
    ['33.33', 3333],
    ['33.34', 3334],
    ['12.5', 1250],
    ['0.01', 1],
    ['100', 10_000],
    [' 7 ', 700],
    ['1.', 100],
  ])('%s%% -> %i bps', (pct, bps) => {
    expect(pctToBps(pct)).toBe(bps);
  });

  it.each(['', 'abc', '33.333', '-5', '1e2', '100.01', '1,5'])('rejects %j', (pct) => {
    expect(pctToBps(pct)).toBeNull();
  });

  it('avoids float drift: 33.33 + 33.33 + 33.34 = 100% exactly', () => {
    expect(['33.33', '33.33', '33.34'].map((p) => pctToBps(p)!).reduce((a, b) => a + b, 0)).toBe(TOTAL_BPS);
  });

  it('round-trips', () => {
    for (const bps of [1, 100, 1250, 3333, 5000, 10_000]) expect(pctToBps(bpsToPct(bps))).toBe(bps);
  });
});

describe('parseAmount / formatAmount (6 decimals)', () => {
  it('parses commas and decimals into base units', () => {
    expect(parseAmount('5,000.50')).toBe(5_000_500_000n);
    expect(parseAmount('0.000001')).toBe(1n);
    expect(parseAmount('100')).toBe(100_000_000n);
  });

  it.each(['', '1.0000001', 'abc', '-1', '1e6'])('rejects %j', (s) => {
    expect(parseAmount(s)).toBeNull();
  });

  it('formats with grouping and keeps dust visible', () => {
    expect(formatAmount(5_000_500_000n)).toBe('5,000.50');
    expect(formatAmount(0n)).toBe('0.00');
    expect(formatAmount(33_333_334n)).toBe('33.333334');
  });
});
