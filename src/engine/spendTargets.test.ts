import { calculateEarnings } from './earnings';
import { spendPlan } from './spendTargets';
import type { CardProduct, Transaction } from './types';
import { card, SEP, tx } from '../test/fixtures';

const plan = (c: CardProduct, txs: Transaction[]) => spendPlan(c, txs, calculateEarnings(c, txs, SEP));
const dining = { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining' as const], capPerPeriod: 30 };
const tiers = [{ minPeriodSpend: 0, rate: 0.03 }, { minPeriodSpend: 1000, rate: 0.05 }, { minPeriodSpend: 2000, rate: 0.12 }];

describe('spendPlan', () => {
  it('shows spend so far against the spend that earns the full cap', () => {
    const p = plan(card({ rules: [dining] }), [tx({ amount: 200, category: 'dining' })]);
    expect(p.rows).toEqual([{ key: 'rule:dine', label: 'Dining', spent: 200, target: 600, more: 400, maxed: false, earnedRM: 10, capRM: 30 }]);
    expect(p.moreToMax).toBe(400);
  });

  it('marks a reached cap as maxed with nothing more to spend', () => {
    const p = plan(card({ rules: [dining] }), [tx({ amount: 700, category: 'dining' })]);
    expect(p.rows[0]).toMatchObject({ spent: 700, target: 600, more: 0, maxed: true, earnedRM: 30 });
    expect(p.moreToMax).toBe(0);
  });

  it('assumes the best tier rate for every category', () => {
    const c = card({ rules: [{ id: 'p', label: 'Petrol', rate: 0, categories: ['petrol'], capPerPeriod: 30, tiers }] });
    expect(plan(c, [tx({ amount: 150, category: 'petrol' })]).rows[0]).toMatchObject({ spent: 150, target: 250, more: 100 });
  });

  it('needs the whole-card spend that reaches the best tier, when that is more than the categories need', () => {
    const c = card({ rules: [{ id: 'p', label: 'Petrol', rate: 0, categories: ['petrol'], capPerPeriod: 30, tiers }] });
    expect(plan(c, [tx({ amount: 150, category: 'petrol' })]).moreToMax).toBe(1850); // tier 3 starts at RM2,000
  });

  it('needs the card minimum monthly spend before anything earns', () => {
    const c = card({ minMonthlySpendToEarn: 1000, rules: [dining] });
    expect(plan(c, [tx({ amount: 200, category: 'dining' })]).moreToMax).toBe(800);
  });

  it('adds up the categories for the whole card', () => {
    const c = card({ rules: [dining, { id: 'pet', label: 'Petrol', rate: 0.1, categories: ['petrol'], capPerPeriod: 20 }] });
    const p = plan(c, [tx({ amount: 100, category: 'dining' }), tx({ amount: 50, category: 'petrol' })]);
    expect(p.rows.map((r) => r.more)).toEqual([500, 150]);
    expect(p.moreToMax).toBe(650);
  });

  it('counts category spend that a better-earning rule does not claim', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.01 }, dining] });
    expect(plan(c, [tx({ amount: 200, category: 'dining' }), tx({ amount: 999, category: 'petrol' })]).rows[0]).toMatchObject({ key: 'rule:dine', spent: 200 });
  });

  it('counts category spend while no rule is earning yet (below the first tier)', () => {
    const t = [{ minPeriodSpend: 1000, rate: 0.03 }];
    const c = card({ rules: [{ id: 'other', label: 'Other', rate: 0, tiers: t }, { id: 'p', label: 'Petrol', rate: 0, categories: ['petrol'], capPerPeriod: 30, tiers: t }] });
    expect(plan(c, [tx({ amount: 400, category: 'petrol' })]).rows[0]).toMatchObject({ key: 'rule:p', spent: 400, target: 1000 });
  });

  it('counts category spend below the category minimum, and targets at least the minimum', () => {
    const c = card({ rules: [{ id: 'o', label: 'Other', rate: 0.002 }, { id: 'g', label: 'Groceries', rate: 0.05, categories: ['groceries'], capPerPeriod: 10, minCategorySpend: 250 }] });
    expect(plan(c, [tx({ amount: 80, category: 'groceries' })]).rows[0]).toMatchObject({ spent: 80, target: 250, more: 170 });
    const high = card({ rules: [{ id: 'g', label: 'Groceries', rate: 0.05, categories: ['groceries'], capPerPeriod: 10, minCategorySpend: 100 }] });
    expect(plan(high, []).rows[0]).toMatchObject({ target: 200 });
  });

  it('combines the rules of a shared cap group, using the best rate', () => {
    const c = card({
      capGroups: { g: 50 },
      rules: [
        { id: 'on', label: 'Online', rate: 0.08, categories: ['online'], capGroup: 'g' },
        { id: 'dn', label: 'Dining', rate: 0.05, categories: ['dining'], capGroup: 'g' },
      ],
    });
    const p = plan(c, [tx({ amount: 100, category: 'online' }), tx({ amount: 100, category: 'dining' })]);
    expect(p.rows[0]).toMatchObject({ key: 'group:g', label: 'Online + Dining', spent: 200, target: 625, more: 425, capRM: 50 });
  });

  it('lets a smaller card total cap limit the whole-card spend', () => {
    const c = card({ totalCapPerPeriod: 20, rules: [dining, { id: 'pet', label: 'Petrol', rate: 0.05, categories: ['petrol'], capPerPeriod: 30 }] });
    const p = plan(c, []);
    expect(p.rows.find((r) => r.key === 'total')).toMatchObject({ target: 400, more: 400 });
    expect(p.moreToMax).toBe(400); // not 600 + 600: the RM20 card cap is reached first
  });

  it('values points rules in RM', () => {
    const c = card({ rewardType: 'points', pointValueRM: 0.01, rules: [{ id: 'pt', label: 'Points', rate: 5, capPerPeriod: 1000 }] });
    expect(plan(c, []).rows[0]).toMatchObject({ target: 200, capRM: 10 });
  });

  it('has no rows and nothing to spend for a card without caps', () => {
    expect(plan(card(), [tx({ amount: 100 })])).toEqual({ rows: [], moreToMax: 0 });
  });
});
