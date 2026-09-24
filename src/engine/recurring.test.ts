import { generateRecurring } from './recurring';
import type { RecurringTemplate } from './types';
import { card } from '../test/fixtures';

const tpl = (p: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
  id: 't1', userCardId: 'u1', amount: 99, category: 'utilities', merchant: 'Unifi', paymentMethod: 'online',
  dayOfPeriod: 'first', active: true, startDate: '2026-07-10', ...p,
});
const cards = { u1: card() };

describe('generateRecurring', () => {
  it('creates one transaction per period from the start date to today', () => {
    const r = generateRecurring([tpl()], cards, '2026-09-24');
    expect(r.transactions.map((t) => [t.id, t.date])).toEqual([
      ['rec-t1-2026-07-01', '2026-07-10'],
      ['rec-t1-2026-08-01', '2026-08-01'],
      ['rec-t1-2026-09-01', '2026-09-01'],
    ]);
    expect(r.transactions[0]).toMatchObject({ userCardId: 'u1', amount: 99, category: 'utilities', recurringId: 't1' });
    expect(r.templates).toEqual([tpl({ lastGeneratedPeriodStart: '2026-09-01' })]);
  });
  it('only generates periods after the last generated one', () => {
    const r = generateRecurring([tpl({ lastGeneratedPeriodStart: '2026-08-01' })], cards, '2026-09-24');
    expect(r.transactions.map((t) => t.id)).toEqual(['rec-t1-2026-09-01']);
  });
  it('is idempotent when fed its own output', () => {
    const first = generateRecurring([tpl()], cards, '2026-09-24');
    const second = generateRecurring(first.templates, cards, '2026-09-24');
    expect(second).toEqual({ transactions: [], templates: [] });
  });
  it('skips inactive templates and unknown cards', () => {
    expect(generateRecurring([tpl({ active: false }), tpl({ id: 't2', userCardId: 'nope' })], cards, '2026-09-24').transactions).toEqual([]);
  });
  it('follows statement cycles', () => {
    const r = generateRecurring([tpl({ startDate: '2026-09-01' })], { u1: card({ periodType: 'statement', defaultCycleDay: 15 }) }, '2026-09-24');
    expect(r.transactions.map((t) => t.date)).toEqual(['2026-09-01', '2026-09-15']);
  });
});
