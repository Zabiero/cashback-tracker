import { round2, unitValueRM, type PeriodEarnings } from './earnings';
import { inPeriod } from './periods';
import { rateFor, ruleMatches } from './rules';
import type { CardProduct, Rule, Transaction } from './types';

export interface SpendTarget {
  key: string;
  label: string;
  /** RM spent this period on transactions that count toward this cap. */
  spent: number;
  /** RM of period spend that earns the whole cap ('max') or unlocks the rule ('unlock'); null while nothing is earned at the current tier. */
  target: number | null;
  kind: 'max' | 'unlock';
  maxed: boolean;
  earnedRM: number;
  capRM: number;
}

function rulesUnder(card: CardProduct, key: string): Rule[] {
  if (key === 'total') return card.rules;
  if (key.startsWith('group:')) return card.rules.filter((r) => r.capGroup === key.slice('group:'.length));
  return card.rules.filter((r) => `rule:${r.id}` === key);
}

/**
 * For each cashback cap on the card: how much has been spent toward it and how much spend earns the full cap,
 * at the rate of the tier the period's spend has reached.
 */
export function spendTargets(card: CardProduct, transactions: Transaction[], earnings: PeriodEarnings): SpendTarget[] {
  const txs = transactions.filter((t) => inPeriod(t.date, earnings.period));
  const ruleOf = new Map(earnings.perTransaction.map((e) => [e.transactionId, e.ruleId]));
  const valueOf = (r: Rule) => rateFor(r, earnings.tierSpend) * unitValueRM(card, r);
  const bestRate = (rules: Rule[]) => Math.max(0, ...rules.map(valueOf));
  const byId = new Map(card.rules.map((r) => [r.id, r]));

  return earnings.caps.map((c) => {
    const rules = rulesUnder(card, c.key);
    const ids = new Set(rules.map((r) => r.id));
    const base = { key: c.key, label: c.label, earnedRM: c.usedRM, capRM: c.limitRM, maxed: c.limitRM > 0 && c.usedRM >= c.limitRM - 0.005 };

    const gated = c.key.startsWith('rule:') ? rules.find((r) => r.minCategorySpend != null) : undefined;
    if (gated) {
      const categorySpend = round2(Math.max(0, txs.reduce((s, t) => (ruleMatches(gated, t) ? s + t.amount : s), 0)));
      if (categorySpend < gated.minCategorySpend!) return { ...base, spent: categorySpend, target: gated.minCategorySpend!, kind: 'unlock' as const };
    }

    // A transaction counts toward this cap when it earns under one of its rules, or when it matches one of them
    // and nothing else is earning on it (e.g. below the first spend tier every rule earns 0%).
    const counts = (t: Transaction) => {
      const winner = byId.get(ruleOf.get(t.id) ?? '');
      if (winner && ids.has(winner.id)) return true;
      return (!winner || valueOf(winner) <= 0) && rules.some((r) => ruleMatches(r, t));
    };
    const spent = round2(Math.max(0, txs.reduce((s, t) => (counts(t) ? s + t.amount : s), 0)));
    let target: number | null;
    if (c.key === 'total') {
      // Mixed rates: project the rest of the cap at the rate actually earned so far.
      const rate = c.usedRM > 0 && spent > 0 ? c.usedRM / spent : bestRate(rules);
      target = rate > 0 ? round2(spent + Math.max(0, c.limitRM - c.usedRM) / rate) : null;
    } else {
      const rate = bestRate(rules);
      target = rate > 0 ? round2(c.limitRM / rate) : null;
    }
    return { ...base, spent, target, kind: 'max' as const };
  });
}
