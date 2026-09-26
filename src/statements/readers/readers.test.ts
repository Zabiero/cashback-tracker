import { READERS } from '.';
import { last4, valueNear } from './helpers';
import maybank1 from '../fixtures/maybank-1.txt?raw';
import rhb1 from '../fixtures/rhb-1.txt?raw';
import rhb2 from '../fixtures/rhb-2.txt?raw';
import uob1 from '../fixtures/uob-1.txt?raw';
import alliance1 from '../fixtures/alliance-1.txt?raw';

const lines = (text: string) => text.split('\n');

describe('valueNear', () => {
  const DATE = /\d{2}\/\d{2}\/\d{4}/;
  it('finds the value on the label line after the label', () => {
    expect(valueNear(['01/01/2026 Due Date: 05/02/2026'], /Due Date:/, DATE)).toBe('05/02/2026');
  });
  it('finds the value within the lookahead lines', () => {
    expect(valueNear(['Due Date', 'nothing', '05/02/2026'], /Due Date/, DATE)).toBe('05/02/2026');
    expect(valueNear(['Due Date', 'a', 'b', '05/02/2026'], /Due Date/, DATE)).toBeUndefined();
    expect(valueNear(['Due Date', 'a', 'b', '05/02/2026'], /Due Date/, DATE, 3)).toBe('05/02/2026');
  });
  it('returns undefined when the label is missing', () => {
    expect(valueNear(['05/02/2026'], /Due Date/, DATE)).toBeUndefined();
  });
});

describe('last4', () => {
  it.each([
    ['XXXX XXXXXX X1111', '1111'], ['XXXX-XXXX-XXXX-2222', '2222'], ['1234 567890 12345', '2345'],
  ])('reads %s', (raw, want) => expect(last4(raw)).toBe(want));
  it('returns undefined when the last four are masked', () => {
    expect(last4('1234-5678-XXXX-XXXX')).toBeUndefined();
  });
});

describe('maybank reader', () => {
  it('reads maybank-1', () => {
    expect(READERS.maybank!(lines(maybank1))).toEqual({
      cards: [{ last4: '1111', statementDate: '2026-08-12', dueDate: '2026-09-01', statementBalance: 2345.67, minimumDue: 117.28 }],
    });
  });
  it('reads a credit balance', () => {
    const text = maybank1.replace('2,345.67 117.28', '15.20CR 0.00');
    expect(READERS.maybank!(lines(text)).cards).toEqual([
      { last4: '1111', statementDate: '2026-08-12', dueDate: '2026-09-01', statementBalance: -15.2, minimumDue: 0 },
    ]);
  });
  it('handles Windows line endings', () => {
    expect(READERS.maybank!(lines(maybank1.replace(/\n/g, '\r\n'))).cards).toHaveLength(1);
  });
  it('returns no cards for unrelated text', () => {
    for (const other of [rhb1, uob1, alliance1]) expect(READERS.maybank!(lines(other))).toEqual({ cards: [] });
    expect(READERS.maybank!([])).toEqual({ cards: [] });
  });
});

describe('rhb reader', () => {
  it('reads rhb-1', () => {
    expect(READERS.rhb!(lines(rhb1))).toEqual({
      cards: [{ last4: '2222', statementDate: '2026-07-18', dueDate: '2026-08-07', statementBalance: 1876.45, minimumDue: 93.82 }],
    });
  });
  it('reads every card on a multi-card statement (rhb-2)', () => {
    expect(READERS.rhb!(lines(rhb2))).toEqual({
      cards: [
        { last4: '2222', statementDate: '2026-06-25', dueDate: '2026-07-15', statementBalance: 1024.6, minimumDue: 51.23 },
        { last4: '2223', statementDate: '2026-06-25', dueDate: '2026-07-15', statementBalance: 0, minimumDue: 0 },
      ],
    });
  });
  it('handles Windows line endings', () => {
    expect(READERS.rhb!(lines(rhb2.replace(/\n/g, '\r\n'))).cards).toHaveLength(2);
  });
  it('returns no cards for unrelated text', () => {
    for (const other of [maybank1, uob1, alliance1]) expect(READERS.rhb!(lines(other))).toEqual({ cards: [] });
    expect(READERS.rhb!([])).toEqual({ cards: [] });
  });
});

describe('uob reader', () => {
  const card = { last4: '3333', statementDate: '2026-08-14', dueDate: '2026-09-03', statementBalance: 1728, minimumDue: 86.4 };
  it('reads uob-1', () => {
    expect(READERS.uob!(lines(uob1))).toEqual({ cards: [card] });
  });
  it('reads an unmasked card number', () => {
    const text = uob1.replace('XXXX-XXXX-XXXX-3333', '4000-1234-5678-3333');
    expect(READERS.uob!(lines(text)).cards).toEqual([card]);
  });
  it('reads a credit balance', () => {
    const text = uob1.replace('SUB-TOTAL 1,728.00', 'SUB-TOTAL 15.20 CR').replace('MINIMUM PAYMENT DUE 86.40', 'MINIMUM PAYMENT DUE .00');
    expect(READERS.uob!(lines(text)).cards).toEqual([{ ...card, statementBalance: -15.2, minimumDue: 0 }]);
  });
  it('merges a card section header repeated on a continuation page', () => {
    const continuation = ['--- page break ---', 'UOB CARD CENTRE', 'STATEMENT OF ACCOUNT', 'ONE VISA CARD **XXXX-XXXX-XXXX-3333** MS JANE LIM'].join('\n');
    const text = uob1.replace('10 AUG PETROL', `${continuation}\n10 AUG PETROL`);
    expect(READERS.uob!(lines(text)).cards).toEqual([card]);
  });
  it('reads every card section on a multi-card statement', () => {
    const second = [
      'ONE VISA CARD **XXXX-XXXX-XXXX-3334** MS JANE LIM', 'PREVIOUS BAL .00',
      '01 AUG BOOKSHOP KUALA LUMPUR MY 200.00', 'SUB-TOTAL 200.00', 'MINIMUM PAYMENT DUE 50.00',
    ].join('\n');
    const text = uob1.replace('** END OF STATEMENT**', `${second}\n** END OF STATEMENT**`);
    expect(READERS.uob!(lines(text)).cards).toEqual([
      card, { ...card, last4: '3334', statementBalance: 200, minimumDue: 50 },
    ]);
  });
  it('handles Windows line endings', () => {
    expect(READERS.uob!(lines(uob1.replace(/\n/g, '\r\n'))).cards).toEqual([card]);
  });
  it('returns no cards for unrelated text', () => {
    for (const other of [maybank1, rhb1, alliance1]) expect(READERS.uob!(lines(other))).toEqual({ cards: [] });
    expect(READERS.uob!([])).toEqual({ cards: [] });
  });
});

describe('alliance reader', () => {
  const shared = { statementDate: '2026-07-19', dueDate: '2026-08-08' };
  const cards = [
    { last4: '4444', ...shared, statementBalance: -42.1, minimumDue: 0 },
    { last4: '4445', ...shared, statementBalance: 640, minimumDue: 50 },
  ];
  it('reads every card on alliance-1', () => {
    expect(READERS.alliance!(lines(alliance1))).toEqual({ cards });
  });
  it('reads unmasked card numbers and a filled-in payment amount', () => {
    const text = alliance1
      .replace('XXXX XXXX XXXX 4444', '4000 1234 5678 4444')
      .replace('XXXX XXXX XXXX 4445 640.00 50.00', '4000 1234 5678 4445 640.00 50.00 640.00');
    expect(READERS.alliance!(lines(text)).cards).toEqual(cards);
  });
  it('handles Windows line endings', () => {
    expect(READERS.alliance!(lines(alliance1.replace(/\n/g, '\r\n'))).cards).toEqual(cards);
  });
  it('returns no cards for unrelated text', () => {
    for (const other of [maybank1, rhb1, uob1]) expect(READERS.alliance!(lines(other))).toEqual({ cards: [] });
    expect(READERS.alliance!([])).toEqual({ cards: [] });
  });
});
