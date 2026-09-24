import type { CardProduct, Rule, Transaction } from './types';
import { inPeriod, type Period } from './periods';
import { nextTierFor, selectRule } from './rules';

export function capKeysFor(rule: Rule): string[] {
  return [`rule:${rule.id}`, ...(rule.capGroup ? [`group:${rule.capGroup}`] : []), 'total'];
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
  const factor = card.rewardType === 'points' ? card.pointValueRM ?? 0 : 1;
  const locked =
    card.minMonthlySpendToEarn != null && totalSpend < card.minMonthlySpendToEarn
      ? { spendNeeded: round2(card.minMonthlySpendToEarn - totalSpend) }
      : undefined;

  const limits: { key: string; label: string; limit: number }[] = [];
  for (const r of card.rules) if (r.capPerPeriod != null) limits.push({ key: `rule:${r.id}`, label: r.label, limit: r.capPerPeriod });
  for (const [g, limit] of Object.entries(card.capGroups ?? {})) limits.push({ key: `group:${g}`, label: g, limit });
  if (card.totalCapPerPeriod != null) limits.push({ key: 'total', label: 'Card total', limit: card.totalCapPerPeriod });
  const limitOf = new Map(limits.map((l) => [l.key, l.limit]));

  const used = new Map<string, number>(); // reward units per cap key
  const earnedByRule = new Map<string, number>(); // reward units per rule
  const perTransaction: TxEarning[] = [];
  let totalUnits = 0;

  for (const t of txs) {
    const sel = selectRule(card.rules, t, totalSpend);
    if (!sel || locked) {
      perTransaction.push({ transactionId: t.id, ruleId: sel?.rule.id ?? null, earnedRM: 0, cappedRM: 0 });
      continue;
    }
    const keys = capKeysFor(sel.rule).filter((k) => limitOf.has(k));
    const raw = t.amount * sel.rate;
    let units: number;
    if (raw >= 0) {
      units = Math.max(0, Math.min(raw, ...keys.map((k) => limitOf.get(k)! - (used.get(k) ?? 0))));
    } else {
      const back = Math.min(-raw, earnedByRule.get(sel.rule.id) ?? 0);
      units = back === 0 ? 0 : -back;
    }
    for (const k of keys) used.set(k, Math.max(0, (used.get(k) ?? 0) + units));
    earnedByRule.set(sel.rule.id, (earnedByRule.get(sel.rule.id) ?? 0) + units);
    totalUnits += units;
    perTransaction.push({
      transactionId: t.id,
      ruleId: sel.rule.id,
      earnedRM: round2(units * factor),
      cappedRM: raw > 0 ? round2((raw - units) * factor) : 0,
    });
  }

  let nextTier: PeriodEarnings['nextTier'];
  for (const r of card.rules) {
    const n = nextTierFor(r, totalSpend);
    if (n && (!nextTier || n.spendNeeded < nextTier.spendNeeded)) {
      nextTier = { ruleId: r.id, spendNeeded: round2(n.spendNeeded), nextRate: n.nextRate };
    }
  }

  return {
    period,
    totalSpend,
    totalEarnedRM: round2(totalUnits * factor),
    perTransaction,
    caps: limits.map((l) => ({
      key: l.key,
      label: l.label,
      usedRM: round2((used.get(l.key) ?? 0) * factor),
      limitRM: round2(l.limit * factor),
    })),
    ...(nextTier ? { nextTier } : {}),
    ...(locked ? { locked } : {}),
  };
}
