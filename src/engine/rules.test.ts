import { nextTierFor, rateFor, ruleMatches, selectRule } from './rules';
import type { Rule } from './types';
import { tx } from '../test/fixtures';

describe('ruleMatches', () => {
  it('matches everything when no filters are set', () => {
    expect(ruleMatches({ id: 'a', label: 'A', rate: 0.01 }, tx({ amount: 10 }))).toBe(true);
  });
  it('filters by category', () => {
    const r: Rule = { id: 'd', label: 'Dining', rate: 0.05, categories: ['dining'] };
    expect(ruleMatches(r, tx({ amount: 10, category: 'dining' }))).toBe(true);
    expect(ruleMatches(r, tx({ amount: 10, category: 'petrol' }))).toBe(false);
  });
  it('matches merchants case-insensitively by substring', () => {
    const r: Rule = { id: 's', label: 'Shell', rate: 0.08, merchants: ['shell'] };
    expect(ruleMatches(r, tx({ amount: 10, merchant: 'SHELL Jalan Ampang' }))).toBe(true);
    expect(ruleMatches(r, tx({ amount: 10, merchant: 'Petronas' }))).toBe(false);
    expect(ruleMatches(r, tx({ amount: 10 }))).toBe(false);
  });
  it('filters by payment method, with "any" matching all', () => {
    const r: Rule = { id: 'c', label: 'Contactless', rate: 0.05, paymentMethods: ['contactless'] };
    expect(ruleMatches(r, tx({ amount: 10, paymentMethod: 'contactless' }))).toBe(true);
    expect(ruleMatches(r, tx({ amount: 10, paymentMethod: 'physical' }))).toBe(false);
    expect(ruleMatches({ ...r, paymentMethods: ['any'] }, tx({ amount: 10, paymentMethod: 'physical' }))).toBe(true);
  });
  it('filters by weekday', () => {
    const r: Rule = { id: 'w', label: 'Weekend', rate: 0.05, days: [0, 6] };
    expect(ruleMatches(r, tx({ amount: 10, date: '2026-09-26' }))).toBe(true); // Sat
    expect(ruleMatches(r, tx({ amount: 10, date: '2026-09-24' }))).toBe(false); // Thu
  });
});

describe('rateFor', () => {
  const tiered: Rule = { id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] };
  it('uses base rate without tiers', () => {
    expect(rateFor({ id: 'a', label: 'A', rate: 0.03 }, 5000)).toBe(0.03);
  });
  it('picks the highest tier reached, inclusive of the threshold', () => {
    expect(rateFor(tiered, 999.99)).toBe(0.002);
    expect(rateFor(tiered, 1000)).toBe(0.05);
  });
  it('returns 0 below the first tier', () => {
    expect(rateFor({ ...tiered, tiers: [{ minPeriodSpend: 500, rate: 0.05 }] }, 100)).toBe(0);
  });
});

describe('selectRule', () => {
  const rules: Rule[] = [
    { id: 'all', label: 'All', rate: 0.01 },
    { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'] },
    { id: 'dine2', label: 'Dining again', rate: 0.05, categories: ['dining'] },
  ];
  it('picks the highest-rate matching rule, ties going to the earlier rule', () => {
    expect(selectRule(rules, tx({ amount: 10, category: 'dining' }), 0)).toEqual({ rule: rules[1], rate: 0.05 });
  });
  it('returns null when nothing matches', () => {
    expect(selectRule([rules[1]], tx({ amount: 10, category: 'petrol' }), 0)).toBeNull();
  });
});

describe('nextTierFor', () => {
  const tiered: Rule = { id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] };
  it('reports spend needed for the next tier', () => {
    expect(nextTierFor(tiered, 600)).toEqual({ spendNeeded: 400, nextRate: 0.05 });
  });
  it('returns null at the top tier or without tiers', () => {
    expect(nextTierFor(tiered, 1200)).toBeNull();
    expect(nextTierFor({ id: 'a', label: 'A', rate: 0.01 }, 0)).toBeNull();
  });
});
