import type { CardProduct, Category, Transaction } from './types';
import { calculateEarnings, round2, type PeriodEarnings } from './earnings';
import { getPeriod, type Period } from './periods';
import type { CardInput } from './recommend';

export function allPeriodEarnings(card: CardProduct, txs: Transaction[]): PeriodEarnings[] {
  const groups = new Map<string, { period: Period; txs: Transaction[] }>();
  for (const t of txs) {
    const period = getPeriod(card, t.date);
    const g = groups.get(period.start) ?? { period, txs: [] };
    g.txs.push(t);
    groups.set(period.start, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.period.start.localeCompare(b.period.start))
    .map((g) => calculateEarnings(card, g.txs, g.period));
}

export interface MonthRow {
  month: string; // YYYY-MM of the period's end date
  spend: number;
  earnedRM: number;
  byCard: Record<string, number>; // cashback RM
  spendByCard: Record<string, number>; // RM spent
  byCategory: Partial<Record<Category, number>>; // cashback RM
  spendByCategory: Partial<Record<Category, number>>; // RM spent, net of refunds
}

/** RM spent per category (net of refunds), largest first. */
export function spendByCategory(txs: Pick<Transaction, 'category' | 'amount'>[]): [Category, number][] {
  const out: Partial<Record<Category, number>> = {};
  for (const t of txs) out[t.category] = round2((out[t.category] ?? 0) + t.amount);
  return (Object.entries(out) as [Category, number][]).sort((a, b) => b[1] - a[1]);
}

export function monthlyReport(inputs: CardInput[]): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  for (const { userCard, card, transactions } of inputs) {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    for (const pe of allPeriodEarnings(card, transactions)) {
      const month = pe.period.end.slice(0, 7);
      const row = rows.get(month) ?? { month, spend: 0, earnedRM: 0, byCard: {}, spendByCard: {}, byCategory: {}, spendByCategory: {} };
      row.spend = round2(row.spend + pe.totalSpend);
      row.earnedRM = round2(row.earnedRM + pe.totalEarnedRM);
      row.byCard[userCard.id] = round2((row.byCard[userCard.id] ?? 0) + pe.totalEarnedRM);
      row.spendByCard[userCard.id] = round2((row.spendByCard[userCard.id] ?? 0) + pe.totalSpend);
      for (const e of pe.perTransaction) {
        const t = byId.get(e.transactionId)!;
        row.byCategory[t.category] = round2((row.byCategory[t.category] ?? 0) + e.earnedRM);
        row.spendByCategory[t.category] = round2((row.spendByCategory[t.category] ?? 0) + t.amount);
      }
      rows.set(month, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function effectiveRate(row: MonthRow): number {
  return row.spend > 0 ? row.earnedRM / row.spend : 0;
}
