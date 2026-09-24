import { parseMoney } from './money';

describe('parseMoney', () => {
  it.each([
    ['12', 12], ['12.5', 12.5], ['RM1,234.50', 1234.5], ['rm 20', 20], ['1,234', 1234], ['.5', 0.5], [' 7.25 ', 7.25], ['-20', -20], ['-RM5', -5],
  ])('accepts %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
  it.each(['', 'abc', '12.345', '1.2.3', 'RM', '--5'])('rejects %s', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});
