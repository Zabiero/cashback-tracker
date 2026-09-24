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
  byCard: Record<string, number>;
  byCategory: Partial<Record<Category, number>>;
}

export function monthlyReport(inputs: CardInput[]): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  for (const { userCard, card, transactions } of inputs) {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    for (const pe of allPeriodEarnings(card, transactions)) {
      const month = pe.period.end.slice(0, 7);
      const row = rows.get(month) ?? { month, spend: 0, earnedRM: 0, byCard: {}, byCategory: {} };
      row.spend = round2(row.spend + pe.totalSpend);
      row.earnedRM = round2(row.earnedRM + pe.totalEarnedRM);
      row.byCard[userCard.id] = round2((row.byCard[userCard.id] ?? 0) + pe.totalEarnedRM);
      for (const e of pe.perTransaction) {
        const cat = byId.get(e.transactionId)!.category;
        row.byCategory[cat] = round2((row.byCategory[cat] ?? 0) + e.earnedRM);
      }
      rows.set(month, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function effectiveRate(row: MonthRow): number {
  return row.spend > 0 ? row.earnedRM / row.spend : 0;
}
