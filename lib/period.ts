// Inactivity-period formatting and units. Production periods are whole days (60–730);
// staging also allows seconds and minutes.

import { DAY } from './validation';

export { DAY };
export const HOUR = 3_600;
export const MINUTE = 60;

export const PERIOD_UNITS = [
  ['seconds', 1],
  ['minutes', MINUTE],
  ['days', DAY],
] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number][0];

export const unitSeconds = (unit: PeriodUnit) => PERIOD_UNITS.find(([u]) => u === unit)![1];

/** Parse a whole, positive amount of `unit` into seconds. Null when malformed. */
export function toSeconds(value: string, unit: PeriodUnit): number | null {
  const t = value.trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t) * unitSeconds(unit);
  return n > 0 ? n : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Production (staging=false): "180 days" / "180-day", exactly as before staging existed.
 * Staging: the largest unit that divides evenly, so 15 → "15 seconds", 120 → "2 minutes".
 */
export function formatPeriod(sec: number, { staging = false, adjective = false } = {}): string {
  if (!staging) return adjective ? `${sec / DAY}-day` : `${sec / DAY} days`;
  const [n, word] =
    sec % DAY === 0 ? [sec / DAY, 'day'] : sec % HOUR === 0 ? [sec / HOUR, 'hour'] : sec % MINUTE === 0 ? [sec / MINUTE, 'minute'] : [sec, 'second'];
  return adjective ? `${n}-${word}` : plural(n, word);
}

/**
 * Countdown cells. Production always shows days/hours/min/sec. Staging switches to a
 * single seconds cell once under an hour is left, so 15-second timers are readable.
 */
export function countdownParts(left: number, staging = false): [number, string][] {
  if (staging && left < HOUR) return [[left, 'sec']];
  return [
    [Math.floor(left / DAY), 'days'],
    [Math.floor((left % DAY) / HOUR), 'hours'],
    [Math.floor((left % HOUR) / MINUTE), 'min'],
    [left % MINUTE, 'sec'],
  ];
}
