import type { CardProduct } from './types';
import { addDays, parseISODate, toISODate } from './dates';

export interface Period {
  start: string;
  end: string;
}

type PeriodCard = Pick<CardProduct, 'periodType' | 'defaultCycleDay'>;

export function getPeriod(card: PeriodCard, date: string): Period {
  const { y, m, d } = parseISODate(date);
  const c = card.defaultCycleDay;
  if (card.periodType === 'calendar' || !c || c === 1) {
    return { start: toISODate(y, m, 1), end: toISODate(y, m + 1, 0) };
  }
  if (d >= c) return { start: toISODate(y, m, c), end: toISODate(y, m + 1, c - 1) };
  return { start: toISODate(y, m - 1, c), end: toISODate(y, m, c - 1) };
}

export function inPeriod(date: string, p: Period): boolean {
  return date >= p.start && date <= p.end;
}

export function nextPeriod(card: PeriodCard, p: Period): Period {
  return getPeriod(card, addDays(p.end, 1));
}
