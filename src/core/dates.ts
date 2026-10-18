/**
 * src/core/dates.ts
 *
 * Local-calendar date helpers shared by views, seeds and engines.
 *
 * Why this exists: `new Date().toISOString().split('T')[0]` returns the UTC
 * date. In Brazil (UTC-3) that is already "tomorrow" after ~21:00, which dated
 * transactions, bill payments and the dashboard month one day ahead. Every
 * "today" in the app must come from `getLocalTodayISO()` instead.
 *
 * All functions are pure string/integer math on 'YYYY-MM-DD' values and never
 * depend on the runtime timezone except `getLocalTodayISO`/`getLocalYearMonth`,
 * which intentionally read the user's local clock.
 */

import type { ISODate, SupportedLocale, YearMonth } from '../types';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Returns the user's LOCAL calendar date as 'YYYY-MM-DD'. */
export function getLocalTodayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Returns the user's LOCAL 'YYYY-MM' for the current month. */
export function getLocalYearMonth(now: Date = new Date()): YearMonth {
  return getLocalTodayISO(now).slice(0, 7);
}

/** Splits a 'YYYY-MM-DD' string into integers. Returns null when malformed. */
export function splitISODate(iso: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** True when the string is a real calendar date (rejects 2026-02-31, month 13, day 0...). */
export function isValidISODate(iso: string): boolean {
  const p = splitISODate(iso);
  if (!p) return false;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return (
    d.getUTCFullYear() === p.year &&
    d.getUTCMonth() === p.month - 1 &&
    d.getUTCDate() === p.day
  );
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffCalendarDays(from: ISODate, to: ISODate): number {
  const a = splitISODate(from);
  const b = splitISODate(to);
  if (!a || !b) return 0;
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/** Adds (or subtracts) whole days to a 'YYYY-MM-DD' date. */
export function addDaysISO(iso: ISODate, days: number): ISODate {
  const p = splitISODate(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Formats a 'YYYY-MM-DD' date for display in the given locale WITHOUT any
 * timezone shift (the date is interpreted as a calendar day, not an instant).
 * pt-BR → '18/10/2026', en-US → '10/18/2026'. Malformed input is returned as is.
 */
export function formatDateForLocale(
  iso: ISODate,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions
): string {
  const p = splitISODate(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  }).format(d);
}

/** Short month label for a 'YYYY-MM' value, e.g. 'out. de 2026' / 'Oct 2026'. */
export function formatYearMonthForLocale(yearMonth: YearMonth, locale: SupportedLocale): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) return yearMonth;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(d);
}
