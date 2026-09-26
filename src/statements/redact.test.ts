import { redact } from './redact';

describe('redact', () => {
  it('keeps only the last 4 digits of card numbers, masked or not', () => {
    expect(redact('Card 4000 1234 5678 3333 end')).toBe('Card •••• •••• •••• 3333 end');
    expect(redact('Card 4000-1234-5678-3333')).toBe('Card ••••-••••-••••-3333');
    expect(redact('Card 4000123456783333')).toBe('Card ••••••••••••3333');
    expect(redact('ONE VISA CARD **XXXX-XXXX-XXXX-3333**')).toBe('ONE VISA CARD **XXXX-XXXX-XXXX-3333**');
    expect(redact('AMEX 3712 345678 90123')).toBe('AMEX •••• •••••• •0123');
  });
  it('masks IC numbers and email addresses', () => {
    expect(redact('IC 900101-14-5678')).toBe('IC ••••••-••-••••');
    expect(redact('IC 900101145678')).toBe('IC ••••••••••••');
    expect(redact('Email jane.lim+cards@example.com.my here')).toBe('Email •••@••• here');
  });
  it('masks every other run of 4 or more digits', () => {
    expect(redact('Account 1234567890')).toBe('Account ••••••••••');
    expect(redact('Due 28/09/2026')).toBe('Due 28/09/••••');
  });
  it('leaves amounts and short numbers alone', () => {
    const text = 'Balance 1,234.56 Minimum 86.40 Page 1 of 5 Date 14 AUG 26';
    expect(redact(text)).toBe(text);
  });
});
