import { validateCardProduct } from './validate';
import { card } from '../test/fixtures';

describe('validateCardProduct', () => {
  it('accepts a valid card', () => {
    expect(validateCardProduct(card())).toEqual([]);
  });
  it('requires a point value for points cards', () => {
    expect(validateCardProduct(card({ rewardType: 'points' }))).toContain('Points cards need pointValueRM > 0');
  });
  it('limits the statement cycle day to 1–28', () => {
    expect(validateCardProduct(card({ periodType: 'statement', defaultCycleDay: 29 }))).toContain('defaultCycleDay must be 1–28');
  });
  it('requires at least one rule', () => {
    expect(validateCardProduct(card({ rules: [] }))).toContain('At least one rule is required');
  });
  it('rejects negative or missing rates', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: -1 }] }))).toContain('Rule 1: rate must be ≥ 0');
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: NaN }] }))).toContain('Rule 1: rate must be ≥ 0');
  });
  it('rejects duplicate rule ids', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0 }, { id: 'a', label: 'B', rate: 0 }] }))).toContain('Rule 2: duplicate id a');
  });
  it('requires tiers in ascending order', () => {
    const c = card({ rules: [{ id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 1000, rate: 0.05 }, { minPeriodSpend: 0, rate: 0.01 }] }] });
    expect(validateCardProduct(c)).toContain('Rule 1: tiers must be in ascending order of spend');
  });
  it('requires cap groups to be defined', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, capGroup: 'g' }] }))).toContain('Rule 1: cap group "g" is not defined');
  });
  it('rejects unknown categories and bad weekdays', () => {
    const c = card({ rules: [{ id: 'a', label: 'A', rate: 0.01, categories: ['shoes' as never], days: [7 as never] }] });
    const errs = validateCardProduct(c);
    expect(errs).toContain('Rule 1: unknown category shoes');
    expect(errs).toContain('Rule 1: days must be 0–6');
  });
  it('checks verifiedOn format', () => {
    expect(validateCardProduct(card({ verifiedOn: '24/09/2026' }))).toContain('verifiedOn must be null or YYYY-MM-DD');
  });
  it('rejects non-objects', () => {
    expect(validateCardProduct(null)).toEqual(['Card must be an object']);
  });
  it('rejects a non-boolean overseas value', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, overseas: 'yes' as never }] }))).toContain(
      'Rule 1: overseas must be true or false',
    );
  });
  it('rejects a negative minimum transaction amount', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, minTxAmount: -1 }] }))).toContain(
      'Rule 1: minimum transaction amount must be ≥ 0',
    );
  });
  it('rejects a negative minimum category spend', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, minCategorySpend: -1 }] }))).toContain(
      'Rule 1: minimum category spend must be ≥ 0',
    );
  });
  it('rejects out-of-range days of month', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, daysOfMonth: [0] }] }))).toContain('Rule 1: days of month must be 1–31');
  });
  it('rejects a non-positive point value', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, pointValueRM: 0 }] }))).toContain('Rule 1: point value must be > 0');
  });
  it('rejects a negative overflow rate', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, overflowRate: -1 }] }))).toContain('Rule 1: overflow rate must be ≥ 0');
  });
  it('rejects unknown tierExcludedCategories', () => {
    expect(validateCardProduct(card({ tierExcludedCategories: ['shoes' as never] }))).toContain('Unknown excluded category shoes');
  });
});
