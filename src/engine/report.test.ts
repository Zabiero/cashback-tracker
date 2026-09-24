import { allPeriodEarnings, effectiveRate, monthlyReport } from './report';
import { card, tx } from '../test/fixtures';
import type { UserCard } from './types';

const uc = (id: string): UserCard => ({ id, productId: null, nickname: id, catalogVersionSeen: 1, archived: false });
const at5 = card({ rules: [{ id: 'all', label: 'All', rate: 0.05 }] });

describe('allPeriodEarnings', () => {
  it('computes each period that has transactions', () => {
    const r = allPeriodEarnings(at5, [tx({ amount: 100, date: '2026-08-10' }), tx({ amount: 200, date: '2026-09-10' })]);
    expect(r.map((p) => [p.period.start, p.totalEarnedRM])).toEqual([['2026-08-01', 5], ['2026-09-01', 10]]);
  });
});

describe('monthlyReport', () => {
  it('aggregates by month, card and category', () => {
    const rows = monthlyReport([
      { userCard: uc('A'), card: at5, transactions: [tx({ userCardId: 'A', amount: 100, category: 'dining', date: '2026-09-02' })] },
      { userCard: uc('B'), card: at5, transactions: [tx({ userCardId: 'B', amount: 200, category: 'petrol', date: '2026-09-03' })] },
    ]);
    expect(rows).toEqual([{ month: '2026-09', spend: 300, earnedRM: 15, byCard: { A: 5, B: 10 }, byCategory: { dining: 5, petrol: 10 } }]);
    expect(effectiveRate(rows[0])).toBeCloseTo(0.05);
  });
  it('attributes a statement period to the month it ends in', () => {
    const c = card({ periodType: 'statement', defaultCycleDay: 15, rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
    const rows = monthlyReport([{ userCard: uc('A'), card: c, transactions: [tx({ userCardId: 'A', amount: 100, date: '2026-09-20' })] }]);
    expect(rows[0].month).toBe('2026-10');
  });
});
