import { calculateEarnings } from './earnings';
import { spendTargets } from './spendTargets';
import type { CardProduct, Transaction } from './types';
import { card, SEP, tx } from '../test/fixtures';

const targets = (c: CardProduct, txs: Transaction[]) => spendTargets(c, txs, calculateEarnings(c, txs, SEP));
const dining = { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining' as const], capPerPeriod: 30 };

describe('spendTargets', () => {
  it('shows spend so far against the spend that earns the full cap', () => {
    const c = card({ rules: [dining] });
    expect(targets(c, [tx({ amount: 200, category: 'dining' })])).toEqual([
      { key: 'rule:dine', label: 'Dining', spent: 200, target: 600, kind: 'max', maxed: false, earnedRM: 10, capRM: 30 },
    ]);
  });

  it('has a target before any spend', () => {
    const [t] = targets(card({ rules: [dining] }), []);
    expect(t).toMatchObject({ spent: 0, target: 600, maxed: false });
  });

  it('marks a cap that has been reached as maxed', () => {
    const [t] = targets(card({ rules: [dining] }), [tx({ amount: 700, category: 'dining' })]);
    expect(t).toMatchObject({ spent: 700, target: 600, maxed: true, earnedRM: 30 });
  });

  it('only counts spend that earns under the capped rule', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.01 }, dining] });
    const [t] = targets(c, [tx({ amount: 200, category: 'dining' }), tx({ amount: 999, category: 'petrol' })]);
    expect(t).toMatchObject({ key: 'rule:dine', spent: 200 });
  });

  it('uses the rate of the tier the period spend has reached', () => {
    const c = card({ rules: [{ id: 'p', label: 'Petrol', rate: 0, categories: ['petrol'], capPerPeriod: 30, tiers: [{ minPeriodSpend: 0, rate: 0.03 }, { minPeriodSpend: 1000, rate: 0.05 }] }] });
    expect(targets(c, [tx({ amount: 500, category: 'petrol' })])[0].target).toBe(1000);
    expect(targets(c, [tx({ amount: 1200, category: 'petrol' })])[0].target).toBe(600);
  });

  it('has no target while the current tier earns nothing', () => {
    const c = card({ rules: [{ id: 'p', label: 'Petrol', rate: 0, capPerPeriod: 30, tiers: [{ minPeriodSpend: 500, rate: 0.05 }] }] });
    expect(targets(c, [tx({ amount: 100 })])[0]).toMatchObject({ spent: 100, target: null });
  });

  it('counts category spend while no rule is earning yet (below the first tier)', () => {
    const tiers = [{ minPeriodSpend: 1000, rate: 0.03 }];
    const c = card({
      rules: [
        { id: 'other', label: 'Other spend', rate: 0, tiers },
        { id: 'p', label: 'Petrol', rate: 0, categories: ['petrol'], capPerPeriod: 30, tiers },
      ],
    });
    expect(targets(c, [tx({ amount: 400, category: 'petrol' })])[0]).toMatchObject({ key: 'rule:p', spent: 400, target: null });
  });

  it('combines the rules of a shared cap group, using the best rate', () => {
    const c = card({
      capGroups: { g: 50 },
      rules: [
        { id: 'on', label: 'Online', rate: 0.08, categories: ['online'], capGroup: 'g' },
        { id: 'dn', label: 'Dining', rate: 0.05, categories: ['dining'], capGroup: 'g' },
      ],
    });
    const [t] = targets(c, [tx({ amount: 100, category: 'online' }), tx({ amount: 100, category: 'dining' })]);
    expect(t).toMatchObject({ key: 'group:g', label: 'Online + Dining', spent: 200, target: 625, capRM: 50 });
  });

  it('targets the category minimum until it is reached', () => {
    const c = card({ rules: [{ id: 'g', label: 'Groceries', rate: 0.05, categories: ['groceries'], capPerPeriod: 10, minCategorySpend: 250 }] });
    expect(targets(c, [tx({ amount: 80, category: 'groceries' })])[0]).toMatchObject({ kind: 'unlock', spent: 80, target: 250, earnedRM: 0 });
    expect(targets(c, [tx({ amount: 300, category: 'groceries' })])[0]).toMatchObject({ kind: 'max', spent: 300, target: 200 });
  });

  it('projects the card total cap at the rate actually earned so far', () => {
    const c = card({ totalCapPerPeriod: 20, rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
    expect(targets(c, [tx({ amount: 100 })])).toEqual([
      { key: 'total', label: 'Card total', spent: 100, target: 400, kind: 'max', maxed: false, earnedRM: 5, capRM: 20 },
    ]);
  });

  it('values points rules in RM', () => {
    const c = card({ rewardType: 'points', pointValueRM: 0.01, rules: [{ id: 'pt', label: 'Points', rate: 5, capPerPeriod: 1000 }] });
    // 1,000 pts × RM0.01 = RM10 cap; 5 pts/RM × RM0.01 = 5% → RM200 to max
    expect(targets(c, [])[0]).toMatchObject({ target: 200, capRM: 10 });
  });
});
