import { addDays, daysBetween, toISODate, todayISO, weekdayOf } from './dates';

describe('dates', () => {
  it('normalises overflowing months and days', () => {
    expect(toISODate(2026, 13, 1)).toBe('2027-01-01');
    expect(toISODate(2026, 3, 0)).toBe('2026-02-28');
    expect(toISODate(2026, 0, 15)).toBe('2025-12-15');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
  it('gives weekdays with Sunday = 0', () => {
    expect(weekdayOf('2026-09-26')).toBe(6); // Saturday
    expect(weekdayOf('2026-09-27')).toBe(0); // Sunday
    expect(weekdayOf('2026-09-24')).toBe(4); // Thursday
  });
  it('uses the local date for today, not UTC (Malaysia is UTC+8)', () => {
    const earlyMorning = new Date(2026, 8, 24, 1, 30); // 01:30 local on 24 Sep
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-09-23'); // proves TZ is UTC+8 in tests
    expect(todayISO(earlyMorning)).toBe('2026-09-24');
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-08-25', '2026-09-24')).toBe(30);
  });
});
