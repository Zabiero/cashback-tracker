import { round2, unitValueRM, type PeriodEarnings } from './earnings';
import { inPeriod } from './periods';
import { rateFor, ruleMatches } from './rules';
import type { CardProduct, Rule, Transaction } from './types';

export interface SpendTarget {
  key: string;
  label: string;
  /** RM spent this period that counts toward this cap. */
  spent: number;
  /** RM of spend that earns the whole cap at the best rate (and meets any category minimum). */
  target: number;
  /** RM still to spend to reach the target; 0 once maxed. */
  more: number;
  maxed: boolean;
  earnedRM: number;
  capRM: number;
}

export interface SpendPlan {
  rows: SpendTarget[];
  /** RM more to spend on the card to max every cap, assuming the best rates (top tier reached). */
  moreToMax: number;
}

function rulesUnder(card: CardProduct, key: string): Rule[] {
  if (key === 'total') return card.rules;
  if (key.startsWith('group:')) return card.rules.filter((r) => r.capGroup === key.slice('group:'.length));
  return card.rules.filter((r) => `rule:${r.id}` === key);
}

/**
 * How much to spend to get the maximum cashback, assuming every category earns its best rate:
 * per capped category, and for the whole card (which may also need the top tier or the card minimum).
 */
export function spendPlan(card: CardProduct, transactions: Transaction[], earnings: PeriodEarnings): SpendPlan {
  const txs = transactions.filter((t) => inPeriod(t.date, earnings.period));
  const ruleOf = new Map(earnings.perTransaction.map((e) => [e.transactionId, e.ruleId]));
  const byId = new Map(card.rules.map((r) => [r.id, r]));
  const valueNow = (r: Rule) => rateFor(r, earnings.tierSpend) * unitValueRM(card, r);
  const bestValue = (r: Rule) => (r.tiers?.length ? Math.max(...r.tiers.map((t) => t.rate)) : r.rate) * unitValueRM(card, r);

  const rows: SpendTarget[] = [];
  for (const c of earnings.caps) {
    const rules = rulesUnder(card, c.key);
    const best = Math.max(0, ...rules.map(bestValue));
    if (best <= 0) continue;
    const ids = new Set(rules.map((r) => r.id));
    // Counts when it earns under this cap, or matches it while the rule that won it earns nothing now or less at best.
    const counts = (t: Transaction) => {
      const winner = byId.get(ruleOf.get(t.id) ?? '');
      if (winner && ids.has(winner.id)) return true;
      return rules.some((r) => ruleMatches(r, t)) && (!winner || valueNow(winner) <= 0 || bestValue(winner) < best);
    };
    const spent = round2(Math.max(0, txs.reduce((s, t) => (counts(t) ? s + t.amount : s), 0)));
    const minimum = c.key.startsWith('rule:') ? rules[0].minCategorySpend ?? 0 : 0;
    const target = round2(Math.max(minimum, c.limitRM / best));
    const maxed = c.limitRM > 0 && c.usedRM >= c.limitRM - 0.005;
    rows.push({ key: c.key, label: c.label, spent, target, more: maxed ? 0 : round2(Math.max(0, target - spent)), maxed, earnedRM: c.usedRM, capRM: c.limitRM });
  }

  if (rows.length === 0 || rows.every((r) => r.maxed)) return { rows, moreToMax: 0 };
  const categories = rows.filter((r) => r.key !== 'total');
  const total = rows.find((r) => r.key === 'total');
  const categorySum = categories.reduce((s, r) => s + r.more, 0);
  // A card total cap smaller than the categories together is reached first.
  const categoryNeed = categories.length ? (total ? Math.min(categorySum, total.more) : categorySum) : total?.more ?? 0;
  const topTier = Math.max(0, ...card.rules.flatMap((r) => r.tiers?.map((t) => t.minPeriodSpend) ?? []));
  const tierNeed = topTier - earnings.tierSpend;
  const minimumNeed = (card.minMonthlySpendToEarn ?? 0) - earnings.tierSpend;
  return { rows, moreToMax: round2(Math.max(0, categoryNeed, tierNeed, minimumNeed)) };
}
