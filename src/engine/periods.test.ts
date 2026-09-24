import { getPeriod, inPeriod, nextPeriod } from './periods';

const calendar = { periodType: 'calendar' as const };
const cycle15 = { periodType: 'statement' as const, defaultCycleDay: 15 };

describe('getPeriod', () => {
  it('returns the calendar month', () => {
    expect(getPeriod(calendar, '2026-09-24')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(getPeriod(calendar, '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
  it('returns the statement cycle on and after the cycle day', () => {
    expect(getPeriod(cycle15, '2026-09-15')).toEqual({ start: '2026-09-15', end: '2026-10-14' });
  });
  it('returns the previous cycle before the cycle day', () => {
    expect(getPeriod(cycle15, '2026-09-14')).toEqual({ start: '2026-08-15', end: '2026-09-14' });
  });
  it('wraps across years', () => {
    expect(getPeriod(cycle15, '2026-01-10')).toEqual({ start: '2025-12-15', end: '2026-01-14' });
    expect(getPeriod(cycle15, '2026-12-20')).toEqual({ start: '2026-12-15', end: '2027-01-14' });
  });
  it('treats cycle day 1 as the calendar month', () => {
    expect(getPeriod({ periodType: 'statement', defaultCycleDay: 1 }, '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('inPeriod / nextPeriod', () => {
  it('includes both ends', () => {
    const p = { start: '2026-09-15', end: '2026-10-14' };
    expect(inPeriod('2026-09-15', p)).toBe(true);
    expect(inPeriod('2026-10-14', p)).toBe(true);
    expect(inPeriod('2026-10-15', p)).toBe(false);
  });
  it('moves to the following period', () => {
    expect(nextPeriod(cycle15, { start: '2026-09-15', end: '2026-10-14' })).toEqual({ start: '2026-10-15', end: '2026-11-14' });
  });
});
