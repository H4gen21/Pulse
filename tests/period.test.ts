import { describe, expect, it } from 'vitest';
import { countdownParts, DAY, formatPeriod, toSeconds } from '@/lib/period';

describe('formatPeriod', () => {
  it('production output is unchanged: whole days only', () => {
    expect(formatPeriod(180 * DAY)).toBe('180 days');
    expect(formatPeriod(60 * DAY, { adjective: true })).toBe('60-day');
    expect(formatPeriod(730 * DAY)).toBe('730 days');
  });

  it('staging picks the largest unit that divides evenly', () => {
    expect(formatPeriod(15, { staging: true })).toBe('15 seconds');
    expect(formatPeriod(1, { staging: true })).toBe('1 second');
    expect(formatPeriod(120, { staging: true })).toBe('2 minutes');
    expect(formatPeriod(90, { staging: true })).toBe('90 seconds');
    expect(formatPeriod(7200, { staging: true })).toBe('2 hours');
    expect(formatPeriod(DAY, { staging: true })).toBe('1 day');
    expect(formatPeriod(15, { staging: true, adjective: true })).toBe('15-second');
  });
});

describe('toSeconds', () => {
  it('converts each unit', () => {
    expect(toSeconds('15', 'seconds')).toBe(15);
    expect(toSeconds('2', 'minutes')).toBe(120);
    expect(toSeconds('60', 'days')).toBe(60 * DAY);
  });

  it('rejects zero, decimals, negatives and junk', () => {
    for (const v of ['0', '1.5', '-3', '', 'abc', '1e3']) expect(toSeconds(v, 'seconds')).toBeNull();
  });
});

describe('countdownParts', () => {
  it('production always shows days/hours/min/sec', () => {
    expect(countdownParts(59)).toEqual([[0, 'days'], [0, 'hours'], [0, 'min'], [59, 'sec']]);
    expect(countdownParts(DAY + 3661)).toEqual([[1, 'days'], [1, 'hours'], [1, 'min'], [1, 'sec']]);
  });

  it('staging switches to seconds under 1 hour', () => {
    expect(countdownParts(3599, true)).toEqual([[3599, 'sec']]);
    expect(countdownParts(0, true)).toEqual([[0, 'sec']]);
    expect(countdownParts(3600, true)).toEqual([[0, 'days'], [1, 'hours'], [0, 'min'], [0, 'sec']]);
  });
});
