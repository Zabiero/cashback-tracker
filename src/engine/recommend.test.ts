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

  it('unlocks a minCategorySpend rule once the purchase pushes the category over the threshold', () => {
    const input: CardInput = {
      userCard: uc('G'),
      card: card({
        rules: [
          { id: 'groc', label: 'Groceries', rate: 0.05, categories: ['groceries'], minCategorySpend: 250 },
          { id: 'other', label: 'Other', rate: 0.002 },
        ],
      }),
      transactions: [tx({ userCardId: 'G', amount: 200, category: 'groceries', date: '2026-09-02' })],
    };
    const purchase: Purchase = { amount: 100, category: 'groceries', paymentMethod: 'physical', date: '2026-09-24' };
    const r = recommend([input], purchase)[0];
    expect(r.incrementalRM).toBe(14.6);
    expect(r.ruleLabel).toBe('Groceries');
    expect(r.rate).toBe(0.05);
    expect(r.reason.startsWith('5% Groceries')).toBe(true);
  });

  it('matches an overseas-only rule based on the purchase flag', () => {
    const input: CardInput = {
      userCard: uc('O'),
      card: card({
        rules: [
          { id: 'os', label: 'Overseas', rate: 0.02, overseas: true, capPerPeriod: 20 },
          { id: 'dom', label: 'Domestic', rate: 0 },
        ],
      }),
      transactions: [],
    };
    const overseasPurchase: Purchase = { amount: 100, category: 'others', paymentMethod: 'physical', date: '2026-09-24', overseas: true };
    const domesticPurchase: Purchase = { amount: 100, category: 'others', paymentMethod: 'physical', date: '2026-09-24' };
    expect(recommend([input], overseasPurchase)[0].incrementalRM).toBe(2);
    expect(recommend([input], domesticPurchase)[0].incrementalRM).toBe(0);
  });
  describe('overflow-rate reasons', () => {
    const virtual = (spentAlready: number): CardInput => ({
      userCard: uc('V'),
      card: card({
        rewardType: 'points',
        pointValueRM: 0.01,
        rules: [{ id: 'ecom', label: 'eCommerce', rate: 8, categories: ['online'], capPerPeriod: 24000, overflowRate: 1 }],
      }),
      transactions: [tx({ userCardId: 'V', amount: spentAlready, category: 'online', date: '2026-09-02' })],
    });
    const online = (amount: number): Purchase => ({ amount, category: 'online', paymentMethod: 'online', date: '2026-09-24' });

    it('shows only the overflow rate when the cap was already used up', () => {
      const r = recommend([virtual(3000)], online(100))[0];
      expect(r.incrementalRM).toBe(1);
      expect(r.reason).toBe('1 pts/RM eCommerce (after cap)');
    });

    it('shows both rates when the purchase crosses the cap', () => {
      const r = recommend([virtual(2900)], online(200))[0];
      expect(r.incrementalRM).toBe(9);
      expect(r.reason).toBe('8 pts/RM then 1 pts/RM eCommerce');
    });
  });
});

