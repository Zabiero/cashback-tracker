import { recommend, type CardInput, type Purchase } from './recommend';
import type { UserCard } from './types';
import { card, tx } from '../test/fixtures';

const uc = (id: string, archived = false): UserCard => ({ id, productId: null, nickname: id, catalogVersionSeen: 1, archived });
const dining = (amount: number): Purchase => ({ amount, category: 'dining', paymentMethod: 'contactless', date: '2026-09-24' });

const flat1: CardInput = { userCard: uc('A'), card: card({ rules: [{ id: 'all', label: 'All spend', rate: 0.01 }] }), transactions: [] };
const dine5 = (spentAlready: number): CardInput => ({
  userCard: uc('B'),
  card: card({ rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capPerPeriod: 30 }] }),
  transactions: spentAlready ? [tx({ userCardId: 'B', amount: spentAlready, category: 'dining', date: '2026-09-02' })] : [],
});

describe('recommend', () => {
  it('ranks by incremental RM after remaining caps', () => {
    const r = recommend([flat1, dine5(590)], dining(100)); // B has RM0.50 of cap left
    expect(r.map((x) => x.userCardId)).toEqual(['A', 'B']);
    expect(r[0].incrementalRM).toBe(1);
    expect(r[1].incrementalRM).toBe(0.5);
    expect(r[1].reason).toBe('5% Dining — RM0.00 cap left');
  });
  it('prefers the higher-rate card when cap room exists', () => {
    const r = recommend([flat1, dine5(0)], dining(100));
    expect(r[0]).toMatchObject({ userCardId: 'B', incrementalRM: 5, rate: 0.05, ruleLabel: 'Dining' });
    expect(r[0].reason).toBe('5% Dining — RM25.00 cap left');
  });
  it('explains a reached cap', () => {
    const r = recommend([dine5(600)], dining(100));
    expect(r[0]).toMatchObject({ incrementalRM: 0, reason: 'Cap reached — earns RM0.00' });
  });
  it('counts a tier crossing retroactively', () => {
    const tiered: CardInput = {
      userCard: uc('T'),
      card: card({ rules: [{ id: 't', label: 'Tiered', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] }] }),
      transactions: [tx({ userCardId: 'T', amount: 900, date: '2026-09-02' })],
    };
    expect(recommend([tiered], dining(200))[0].incrementalRM).toBe(53.2);
  });
  it('explains a minimum-spend lock', () => {
    const lockedCard: CardInput = {
      userCard: uc('L'),
      card: card({ minMonthlySpendToEarn: 500, rules: [{ id: 'all', label: 'All', rate: 0.05 }] }),
      transactions: [tx({ userCardId: 'L', amount: 100, date: '2026-09-02' })],
    };
    expect(recommend([lockedCard], dining(100))[0].reason).toBe('Spend RM300.00 more this period to unlock rewards');
  });
  it('explains when no rule matches', () => {
    const petrolOnly: CardInput = { userCard: uc('P'), card: card({ rules: [{ id: 'p', label: 'Petrol', rate: 0.05, categories: ['petrol'] }] }), transactions: [] };
    expect(recommend([petrolOnly], dining(100))[0]).toMatchObject({ incrementalRM: 0, rate: null, reason: 'No reward for this purchase' });
  });
  it('excludes archived cards', () => {
    expect(recommend([{ ...flat1, userCard: uc('A', true) }], dining(100))).toEqual([]);
  });
  it('only counts transactions in the purchase period', () => {
    const lastMonth = { ...dine5(0), transactions: [tx({ userCardId: 'B', amount: 600, category: 'dining', date: '2026-08-20' })] };
    expect(recommend([lastMonth], dining(100))[0].incrementalRM).toBe(5);
  });
});
