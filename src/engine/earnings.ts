import type { CardProduct, Rule, Transaction } from './types';
import { inPeriod, type Period } from './periods';
import { nextTierFor, ruleMatches, selectRule } from './rules';

export function capKeysFor(rule: Rule): string[] {
  return [`rule:${rule.id}`, ...(rule.capGroup ? [`group:${rule.capGroup}`] : []), 'total'];
}

/** RM value of one reward unit earned under this rule (points rules may carry their own value even on a cashback card). */
export function unitValueRM(card: CardProduct, rule: Rule): number {
  return rule.pointValueRM ?? (card.rewardType === 'points' ? card.pointValueRM ?? 0 : 1);
}

function cardUnitValue(card: CardProduct): number {
  return card.rewardType === 'points' ? card.pointValueRM ?? 0 : 1;
}

export interface CapStatus {
  key: string;
  label: string;
  usedRM: number;
  limitRM: number;
}

export interface TxEarning {
  transactionId: string;
  ruleId: string | null;
  earnedRM: number;
  cappedRM: number;
}

export interface PeriodEarnings {
  period: Period;
  totalSpend: number;
  tierSpend: number;
  totalEarnedRM: number;
  perTransaction: TxEarning[];
  caps: CapStatus[];
  nextTier?: { ruleId: string; spendNeeded: number; nextRate: number };
  locked?: { spendNeeded: number };
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100 || 0;

export function calculateEarnings(card: CardProduct, transactions: Transaction[], period: Period): PeriodEarnings {
  const txs = transactions
    .filter((t) => inPeriod(t.date, period))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const totalSpend = round2(Math.max(0, txs.reduce((s, t) => s + t.amount, 0)));
  const excluded = new Set(card.tierExcludedCategories ?? []);
  const tierSpend = round2(Math.max(0, txs.reduce((s, t) => (excluded.has(t.category) ? s : s + t.amount), 0)));
  const cardFactor = cardUnitValue(card);
  const locked =
    card.minMonthlySpendToEarn != null && tierSpend < card.minMonthlySpendToEarn
      ? { spendNeeded: round2(card.minMonthlySpendToEarn - tierSpend) }
      : undefined;

  const eligibleRules = card.rules.filter((r) => {
    if (r.minCategorySpend == null) return true;
    const categorySpend = txs.reduce((s, t) => (ruleMatches(r, t) ? s + t.amount : s), 0);
    return categorySpend >= r.minCategorySpend;
  });

  const limits: { key: string; label: string; limit: number }[] = [];
  for (const r of card.rules) if (r.capPerPeriod != null) limits.push({ key: `rule:${r.id}`, label: r.label, limit: r.capPerPeriod * unitValueRM(card, r) });
  for (const [g, limit] of Object.entries(card.capGroups ?? {})) {
    const groupLabels = card.rules.filter((r) => r.capGroup === g).map((r) => r.label);
    limits.push({ key: `group:${g}`, label: groupLabels.length ? groupLabels.join(' + ') : g, limit: limit * cardFactor });
  }
  if (card.totalCapPerPeriod != null) limits.push({ key: 'total', label: 'Card total', limit: card.totalCapPerPeriod * cardFactor });
  const limitOf = new Map(limits.map((l) => [l.key, l.limit]));

  const used = new Map<string, number>(); // RM per cap key
  const earnedByRule = new Map<string, number>(); // RM per rule, including overflow (for refund reversal)
  const uncappedByRule = new Map<string, number>(); // raw RM per rule before caps, net of refunds (net-spend semantics)
  const perTransaction: TxEarning[] = [];
  let totalRM = 0;

  for (const t of txs) {
    const sel = selectRule(eligibleRules, t, tierSpend, (r) => unitValueRM(card, r));
    if (!sel || locked) {
      perTransaction.push({ transactionId: t.id, ruleId: sel?.rule.id ?? null, earnedRM: 0, cappedRM: 0 });
      continue;
    }
    const uv = unitValueRM(card, sel.rule);
    const raw = t.amount * sel.rate * uv; // RM
    const keys = capKeysFor(sel.rule).filter((k) => limitOf.has(k));
    const ruleGroupKeys = keys.filter((k) => k !== 'total');
    const hasTotal = keys.includes('total');

    let final: number;
    if (raw >= 0) {
      const allowed = Math.max(0, ruleGroupKeys.length ? Math.min(raw, ...ruleGroupKeys.map((k) => limitOf.get(k)! - (used.get(k) ?? 0))) : raw);
      let overflow = 0;
      if (sel.rule.overflowRate != null && allowed < raw && sel.rate * uv > 0) {
        const uncoveredRM = raw - allowed;
        const uncoveredSpend = uncoveredRM / (sel.rate * uv);
        overflow = uncoveredSpend * sel.rule.overflowRate * uv;
      }
      let combined = allowed + overflow;
      if (hasTotal) combined = Math.max(0, Math.min(combined, limitOf.get('total')! - (used.get('total') ?? 0)));
      final = combined;
      const ruleGroupUsed = Math.min(allowed, final); // never fill a rule/group cap with reward the total cap then cut
      for (const k of ruleGroupKeys) used.set(k, (used.get(k) ?? 0) + ruleGroupUsed);
      if (hasTotal) used.set('total', (used.get('total') ?? 0) + final);
    } else {
      // Net-spend semantics: reverse only what the reduced net period spend no longer earns.
      const alreadyEarned = earnedByRule.get(sel.rule.id) ?? 0;
      const uncappedAfter = (uncappedByRule.get(sel.rule.id) ?? 0) + raw;
      const back = Math.min(alreadyEarned, Math.max(0, alreadyEarned - uncappedAfter));
      final = back === 0 ? 0 : -back;
      for (const k of keys) used.set(k, Math.max(0, (used.get(k) ?? 0) + final));
    }
    uncappedByRule.set(sel.rule.id, (uncappedByRule.get(sel.rule.id) ?? 0) + raw);
    earnedByRule.set(sel.rule.id, (earnedByRule.get(sel.rule.id) ?? 0) + final);
    totalRM += final;
    perTransaction.push({
      transactionId: t.id,
      ruleId: sel.rule.id,
      earnedRM: round2(final),
      cappedRM: raw > 0 ? round2(Math.max(0, raw - final)) : 0,
    });
  }

  let nextTier: PeriodEarnings['nextTier'];
  for (const r of card.rules) {
    const n = nextTierFor(r, tierSpend);
    if (n && (!nextTier || n.spendNeeded < nextTier.spendNeeded)) {
      nextTier = { ruleId: r.id, spendNeeded: round2(n.spendNeeded), nextRate: n.nextRate };
    }
  }

  return {
    period,
    totalSpend,
    tierSpend,
    totalEarnedRM: round2(totalRM),
    perTransaction,
    caps: limits.map((l) => ({
      key: l.key,
      label: l.label,
      usedRM: round2(used.get(l.key) ?? 0),
      limitRM: round2(l.limit),
    })),
    ...(nextTier ? { nextTier } : {}),
    ...(locked ? { locked } : {}),
  };
}
