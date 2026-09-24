import { describeRule, formatRate } from './format';
import { formatRM } from '../lib/money';

describe('formatRate', () => {
  it('formats cashback as a percentage and points per RM', () => {
    expect(formatRate(0.05, 'cashback')).toBe('5%');
    expect(formatRate(0.002, 'cashback')).toBe('0.2%');
    expect(formatRate(8, 'points')).toBe('8 pts/RM');
  });
});

describe('describeRule', () => {
  it('summarises filters and caps', () => {
    expect(
      describeRule({ id: 'w', label: 'Weekend dining', rate: 0.05, categories: ['dining', 'groceries'], days: [0, 6], capPerPeriod: 30 }, 'cashback'),
    ).toBe('5% · Dining, Groceries · Sun, Sat · cap RM30.00');
  });
  it('summarises tiers, merchants and payment methods', () => {
    expect(
      describeRule({ id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }], merchants: ['Shell'], paymentMethods: ['contactless'] }, 'cashback'),
    ).toBe('0.2% → 5% from RM1,000.00 · at Shell · Contactless');
  });
  it('shows point caps in points', () => {
    expect(describeRule({ id: 'p', label: 'P', rate: 5, capPerPeriod: 5000 }, 'points')).toBe('5 pts/RM · cap 5000 pts');
  });
});

describe('formatRM', () => {
  it('formats with thousands separators and sign', () => {
    expect(formatRM(1234.5)).toBe('RM1,234.50');
    expect(formatRM(-5)).toBe('-RM5.00');
    expect(formatRM(0)).toBe('RM0.00');
  });
});
