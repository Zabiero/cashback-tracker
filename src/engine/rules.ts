import type { Rule, Transaction } from './types';
import { parseISODate, weekdayOf } from './dates';

export type MatchableTx = Pick<Transaction, 'category' | 'merchant' | 'paymentMethod' | 'date' | 'amount' | 'overseas'>;

export function ruleMatches(rule: Rule, tx: MatchableTx): boolean {
  if (rule.categories?.length && !rule.categories.includes(tx.category)) return false;
  if (
    rule.paymentMethods?.length &&
    !rule.paymentMethods.includes('any') &&
    !rule.paymentMethods.includes(tx.paymentMethod)
  ) {
    return false;
  }
  if (rule.days?.length && !rule.days.includes(weekdayOf(tx.date))) return false;
  if (rule.merchants?.length) {
    const m = (tx.merchant ?? '').trim().toLowerCase();
    if (!m || !rule.merchants.some((x) => m.includes(x.trim().toLowerCase()))) return false;
  }
  if (rule.overseas !== undefined && rule.overseas !== !!tx.overseas) return false;
  if (rule.minTxAmount != null && Math.abs(tx.amount) < rule.minTxAmount) return false;
  if (rule.daysOfMonth?.length) {
    const { d } = parseISODate(tx.date);
    if (!rule.daysOfMonth.includes(d)) return false;
  }
  return true;
}

export function rateFor(rule: Rule, periodSpend: number): number {
  if (!rule.tiers?.length) return rule.rate;
  let rate = 0;
  for (const t of rule.tiers) if (periodSpend >= t.minPeriodSpend) rate = t.rate;
  return rate;
}

export function selectRule(
  rules: Rule[],
  tx: MatchableTx,
  periodSpend: number,
  unitValue: (rule: Rule) => number = () => 1,
): { rule: Rule; rate: number } | null {
  let best: { rule: Rule; rate: number; value: number } | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, tx)) continue;
    const rate = rateFor(rule, periodSpend);
    const value = rate * unitValue(rule);
    if (!best || value > best.value) best = { rule, rate, value };
  }
  return best ? { rule: best.rule, rate: best.rate } : null;
}

export function nextTierFor(rule: Rule, periodSpend: number): { spendNeeded: number; nextRate: number } | null {
  const next = rule.tiers?.find((t) => t.minPeriodSpend > periodSpend);
  return next ? { spendNeeded: next.minPeriodSpend - periodSpend, nextRate: next.rate } : null;
}
