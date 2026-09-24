import { calculateEarnings, capKeysFor } from './earnings';
import { card, SEP, tx } from '../test/fixtures';

const at5 = card({ rules: [{ id: 'all', label: 'All spend', rate: 0.05 }] });

describe('calculateEarnings', () => {
  it('earns the base rate', () => {
    const t = tx({ amount: 100 });
    const e = calculateEarnings(at5, [t], SEP);
    expect(e.totalSpend).toBe(100);
    expect(e.totalEarnedRM).toBe(5);
    expect(e.perTransaction).toEqual([{ transactionId: t.id, ruleId: 'all', earnedRM: 5, cappedRM: 0 }]);
  });

  it('earns nothing when no rule matches', () => {
    const c = card({ rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'] }] });
    const e = calculateEarnings(c, [tx({ amount: 100, category: 'petrol' })], SEP);
    expect(e.totalEarnedRM).toBe(0);
    expect(e.perTransaction[0].ruleId).toBeNull();
  });

  it('uses the highest matching rule only', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.01 }, { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'] }] });
    const e = calculateEarnings(c, [tx({ amount: 100, category: 'dining' })], SEP);
    expect(e.totalEarnedRM).toBe(5);
    expect(e.perTransaction[0].ruleId).toBe('dine');
  });

  it('applies a rule cap, partially capping the transaction that crosses it', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.05, capPerPeriod: 10 }] });
    const e = calculateEarnings(c, [tx({ amount: 150, date: '2026-09-01' }), tx({ amount: 100, date: '2026-09-02' })], SEP);
    expect(e.totalEarnedRM).toBe(10);
    expect(e.perTransaction[1]).toMatchObject({ earnedRM: 2.5, cappedRM: 2.5 });
    expect(e.caps).toEqual([{ key: 'rule:all', label: 'All', usedRM: 10, limitRM: 10 }]);
  });

  it('shares a cap group between rules', () => {
    const c = card({
      capGroups: { g: 15 },
      rules: [
        { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capGroup: 'g' },
        { id: 'fuel', label: 'Petrol', rate: 0.05, categories: ['petrol'], capGroup: 'g' },
      ],
    });
    const e = calculateEarnings(c, [tx({ amount: 200, category: 'dining', date: '2026-09-01' }), tx({ amount: 200, category: 'petrol', date: '2026-09-02' })], SEP);
    expect(e.totalEarnedRM).toBe(15);
  });

  it('applies the card total cap', () => {
    const c = card({ totalCapPerPeriod: 8, rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
    expect(calculateEarnings(c, [tx({ amount: 200 })], SEP).totalEarnedRM).toBe(8);
  });

  describe('tiers (whole-period spend decides the tier)', () => {
    const tiered = card({ rules: [{ id: 't', label: 'Tiered', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] }] });
    it('applies the higher tier to all spend once crossed', () => {
      expect(calculateEarnings(tiered, [tx({ amount: 600 }), tx({ amount: 500 })], SEP).totalEarnedRM).toBe(55);
    });
    it('uses the lower tier below the threshold and reports the next tier', () => {
      const e = calculateEarnings(tiered, [tx({ amount: 600 })], SEP);
      expect(e.totalEarnedRM).toBe(1.2);
      expect(e.nextTier).toEqual({ ruleId: 't', spendNeeded: 400, nextRate: 0.05 });
    });
    it('treats spend exactly at the threshold as reaching the tier', () => {
      expect(calculateEarnings(tiered, [tx({ amount: 1000 })], SEP).totalEarnedRM).toBe(50);
    });
  });

  it('earns nothing and reports locked when minimum spend is not met', () => {
    const c = card({ minMonthlySpendToEarn: 500, rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
    const e = calculateEarnings(c, [tx({ amount: 300 })], SEP);
    expect(e.totalEarnedRM).toBe(0);
    expect(e.locked).toEqual({ spendNeeded: 200 });
    expect(e.perTransaction[0].earnedRM).toBe(0);
  });

  it('computes and caps points, then converts to RM', () => {
    const c = card({ rewardType: 'points', pointValueRM: 0.01, rules: [{ id: 'p', label: 'Points', rate: 5, capPerPeriod: 300 }] });
    const e = calculateEarnings(c, [tx({ amount: 100 })], SEP);
    expect(e.totalEarnedRM).toBe(3);
    expect(e.perTransaction[0]).toMatchObject({ earnedRM: 3, cappedRM: 2 });
    expect(e.caps[0]).toMatchObject({ usedRM: 3, limitRM: 3 });
  });

  it('reverses earnings for refunds and reduces spend', () => {
    const e = calculateEarnings(at5, [tx({ amount: 100, date: '2026-09-01' }), tx({ amount: -40, date: '2026-09-05' })], SEP);
    expect(e.totalSpend).toBe(60);
    expect(e.totalEarnedRM).toBe(3);
    expect(e.perTransaction[1].earnedRM).toBe(-2);
  });

  it('never reverses more than was earned', () => {
    const e = calculateEarnings(at5, [tx({ amount: -40 })], SEP);
    expect(e.totalSpend).toBe(0);
    expect(e.totalEarnedRM).toBe(0);
    expect(e.perTransaction[0].earnedRM).toBe(0);
  });

  it('ignores transactions outside the period', () => {
    expect(calculateEarnings(at5, [tx({ amount: 100, date: '2026-10-01' })], SEP).totalEarnedRM).toBe(0);
  });

  it('orders same-day transactions by createdAt when applying caps', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.05, capPerPeriod: 5 }] });
    const later = tx({ id: 'later', amount: 100, createdAt: 'b' });
    const earlier = tx({ id: 'earlier', amount: 100, createdAt: 'a' });
    const e = calculateEarnings(c, [later, earlier], SEP);
    expect(e.perTransaction.find((p) => p.transactionId === 'earlier')!.earnedRM).toBe(5);
    expect(e.perTransaction.find((p) => p.transactionId === 'later')!.earnedRM).toBe(0);
  });

  it('falls through to a catch-all rule when minCategorySpend is not met', () => {
    const c = card({
      rules: [
        { id: 'groc', label: 'Groceries', rate: 0.05, categories: ['groceries'], minCategorySpend: 250 },
        { id: 'other', label: 'Other', rate: 0.002 },
      ],
    });
    const e = calculateEarnings(c, [tx({ amount: 200, category: 'groceries' })], SEP);
    expect(e.totalEarnedRM).toBe(0.4);
    expect(e.perTransaction[0].ruleId).toBe('other');
  });

  it('makes a minCategorySpend rule eligible once the period total reaches it', () => {
    const c = card({
      rules: [
        { id: 'groc', label: 'Groceries', rate: 0.05, categories: ['groceries'], minCategorySpend: 250 },
        { id: 'other', label: 'Other', rate: 0.002 },
      ],
    });
    const e = calculateEarnings(
      c,
      [tx({ amount: 200, category: 'groceries', date: '2026-09-01' }), tx({ amount: 100, category: 'groceries', date: '2026-09-02' })],
      SEP,
    );
    expect(e.totalEarnedRM).toBe(15);
    expect(e.perTransaction.every((p) => p.ruleId === 'groc')).toBe(true);
  });

  it('earns points from a hybrid rule on a cashback card, sharing the total', () => {
    const c = card({
      rules: [
        { id: 'cb', label: 'Online', rate: 0.02, categories: ['online'] },
        { id: 'pts', label: 'Points', rate: 1, pointValueRM: 0.005, capPerPeriod: 5000 },
      ],
    });
    const e = calculateEarnings(
      c,
      [tx({ amount: 100, category: 'online', date: '2026-09-01' }), tx({ amount: 100, category: 'others', date: '2026-09-02' })],
      SEP,
    );
    expect(e.totalEarnedRM).toBe(2.5);
    expect(e.caps).toContainEqual({ key: 'rule:pts', label: 'Points', usedRM: 0.5, limitRM: 25 });
  });

  it('earns an overflow rate on spend beyond a rule cap', () => {
    const c = card({
      rewardType: 'points',
      pointValueRM: 0.01,
      rules: [{ id: 'ecom', label: 'eCommerce', rate: 8, categories: ['online'], capPerPeriod: 24000, overflowRate: 1 }],
    });
    const e = calculateEarnings(c, [tx({ amount: 3500, category: 'online' })], SEP);
    expect(e.totalEarnedRM).toBe(245);
    expect(e.perTransaction[0].cappedRM).toBe(35);
  });

  it('still limits overflow by the card total cap', () => {
    const c = card({
      rewardType: 'points',
      pointValueRM: 0.01,
      totalCapPerPeriod: 24200,
      rules: [{ id: 'ecom', label: 'eCommerce', rate: 8, categories: ['online'], capPerPeriod: 24000, overflowRate: 1 }],
    });
    const e = calculateEarnings(c, [tx({ amount: 3500, category: 'online' })], SEP);
    expect(e.totalEarnedRM).toBe(242);
  });

  it('excludes tierExcludedCategories from tier spend but not from total spend', () => {
    const c = card({
      tierExcludedCategories: ['utilities'],
      rules: [{ id: 'dine', label: 'Dining', rate: 0, categories: ['dining'], tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 800, rate: 0.1 }] }],
    });
    const e = calculateEarnings(
      c,
      [tx({ amount: 500, category: 'dining', date: '2026-09-01' }), tx({ amount: 400, category: 'utilities', date: '2026-09-02' })],
      SEP,
    );
    expect(e.totalSpend).toBe(900);
    expect(e.tierSpend).toBe(500);
    expect(e.totalEarnedRM).toBe(1);
    expect(e.nextTier).toEqual({ ruleId: 'dine', spendNeeded: 300, nextRate: 0.1 });
  });

  it('excludes tierExcludedCategories from the minimum-spend lock', () => {
    const c = card({
      minMonthlySpendToEarn: 500,
      tierExcludedCategories: ['utilities'],
      rules: [{ id: 'all', label: 'All', rate: 0.05 }],
    });
    const e = calculateEarnings(
      c,
      [tx({ amount: 300, category: 'dining', date: '2026-09-01' }), tx({ amount: 300, category: 'utilities', date: '2026-09-02' })],
      SEP,
    );
    expect(e.totalEarnedRM).toBe(0);
    expect(e.locked).toEqual({ spendNeeded: 200 });
  });
});

describe('capKeysFor', () => {
  it('derives rule, capGroup, and total keys', () => {
    expect(capKeysFor({ id: 'all', label: 'All', rate: 0.05 })).toEqual(['rule:all', 'total']);
    expect(capKeysFor({ id: 'dine', label: 'Dining', rate: 0.05, capGroup: 'g' })).toEqual(['rule:dine', 'group:g', 'total']);
  });
});
