import type { Rule, Transaction } from './types';
import { weekdayOf } from './dates';

export type MatchableTx = Pick<Transaction, 'category' | 'merchant' | 'paymentMethod' | 'date'>;

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
  return true;
}

export function rateFor(rule: Rule, periodSpend: number): number {
  if (!rule.tiers?.length) return rule.rate;
  let rate = 0;
  for (const t of rule.tiers) if (periodSpend >= t.minPeriodSpend) rate = t.rate;
  return rate;
}

export function selectRule(rules: Rule[], tx: MatchableTx, periodSpend: number): { rule: Rule; rate: number } | null {
  let best: { rule: Rule; rate: number } | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, tx)) continue;
    const rate = rateFor(rule, periodSpend);
    if (!best || rate > best.rate) best = { rule, rate };
  }
  return best;
}

export function nextTierFor(rule: Rule, periodSpend: number): { spendNeeded: number; nextRate: number } | null {
  const next = rule.tiers?.find((t) => t.minPeriodSpend > periodSpend);
  return next ? { spendNeeded: next.minPeriodSpend - periodSpend, nextRate: next.rate } : null;
}
