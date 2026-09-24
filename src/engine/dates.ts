import type { Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function parseISODate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** m is 1–12; out-of-range months/days roll over (day 0 = last day of previous month). */
export function toISODate(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseISODate(date);
  return toISODate(y, m, d + n);
}

export function weekdayOf(date: string): Weekday {
  const { y, m, d } = parseISODate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

/** Local calendar date. Never use toISOString() for this — it is UTC. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => {
    const { y, m, d } = parseISODate(s);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}
