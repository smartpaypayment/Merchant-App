import type { ISODate } from '@models/index';

/**
 * Date helpers.
 *
 * Formatting is hand-rolled for the same reason as currency grouping: Hermes on
 * older Android builds may lack full ICU, so `toLocaleDateString` output is not
 * dependable. Month/day names come from i18n keys, not from this module.
 */

const MS_PER_DAY = 86_400_000;

export const MONTH_KEYS = [
  'common.months.jan',
  'common.months.feb',
  'common.months.mar',
  'common.months.apr',
  'common.months.may',
  'common.months.jun',
  'common.months.jul',
  'common.months.aug',
  'common.months.sep',
  'common.months.oct',
  'common.months.nov',
  'common.months.dec',
] as const;

const pad = (n: number): string => String(n).padStart(2, '0');

export const nowIso = (): ISODate => new Date().toISOString();

export const parseIso = (iso: ISODate): Date => new Date(iso);

/** `14:32` (24h — unambiguous across locales). */
export function formatTime(iso: ISODate): string {
  const d = parseIso(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** i18n month key + day/year parts, for the caller to interpolate. */
export function dateParts(iso: ISODate): { day: number; monthKey: string; year: number } {
  const d = parseIso(iso);
  return {
    day: d.getDate(),
    monthKey: MONTH_KEYS[d.getMonth()] ?? MONTH_KEYS[0],
    year: d.getFullYear(),
  };
}

/** `2026-08-23` — the wire format for `from`/`to` query params. */
export function toDateKey(date: Date | ISODate): string {
  const d = typeof date === 'string' ? parseIso(date) : date;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isSameDay(a: Date | ISODate, b: Date | ISODate): boolean {
  return toDateKey(a) === toDateKey(b);
}

export const isToday = (iso: ISODate): boolean => isSameDay(iso, new Date());

export function isYesterday(iso: ISODate): boolean {
  return isSameDay(iso, new Date(Date.now() - MS_PER_DAY));
}

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Seconds remaining until `iso`, floored at 0. Drives QR expiry countdowns. */
export function secondsUntil(iso: ISODate): number {
  return Math.max(0, Math.floor((parseIso(iso).getTime() - Date.now()) / 1000));
}

/** `mm:ss` for countdown timers (OTP resend, QR expiry). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/**
 * Buckets a timestamp into a relative i18n key so transaction lists can show
 * "Today" / "Yesterday" headers instead of repeating the full date.
 */
export function relativeDayKey(iso: ISODate): 'common.today' | 'common.yesterday' | null {
  if (isToday(iso)) return 'common.today';
  if (isYesterday(iso)) return 'common.yesterday';
  return null;
}
