import { checkStatement, findDuplicate, parseAmount, parseStatementDate, statementStatus, upcomingPayments } from './logic';
import { statement } from '../test/fixtures';

const TODAY = '2026-09-24';

describe('parseAmount', () => {
  it.each([
    ['1,234.56', 1234.56], ['RM1,234.56', 1234.56], ['RM 20', 20], ['0.00', 0],
    ['1,234.56 CR', -1234.56], ['1,234.56CR', -1234.56], ['-50.10', -50.1], ['50.10 DR', 50.1],
    ['12,345,678.90', 12345678.9], ['1234567.89', 1234567.89], ['.50', 0.5],
  ])('parses %s', (s, n) => expect(parseAmount(s)).toBe(n));
  it.each(['', 'abc', '1.2.3', 'RM', '12,50', '12,34,56.78', '1,2345.00', '1234,567.00', ',123'])('rejects %s', (s) => expect(parseAmount(s)).toBeNull());
});

describe('parseStatementDate', () => {
  it.each([
    ['08/09/2026', '2026-09-08'], ['8-9-26', '2026-09-08'], ['08.09.2026', '2026-09-08'],
    ['08 SEP 2026', '2026-09-08'], ['08 Sep 26', '2026-09-08'], ['08SEP26', '2026-09-08'],
    ['8 September 2026', '2026-09-08'], ['08-Sep-2026', '2026-09-08'], ['Sep 8, 2026', '2026-09-08'],
    ['08 OGO 2026', '2026-08-08'], ['08 Dis 26', '2026-12-08'],
  ])('parses %s', (s, iso) => expect(parseStatementDate(s)).toBe(iso));
  it.each(['31/02/2026', '2026-09-08x', 'hello', '08 XYZ 2026'])('rejects %s', (s) => expect(parseStatementDate(s)).toBeNull());
});

describe('checkStatement', () => {
  const ok = { statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 1000, minimumDue: 50 };
  it('accepts a normal statement', () => expect(checkStatement(ok, TODAY)).toEqual([]));
  it('accepts a credit balance with zero minimum', () =>
    expect(checkStatement({ ...ok, statementBalance: -20, minimumDue: 0 }, TODAY)).toEqual([]));
  it('reports missing values', () =>
    expect(checkStatement({}, TODAY).map((i) => [i.field, i.missing])).toEqual([
      ['statementDate', true], ['dueDate', true], ['statementBalance', true], ['minimumDue', true],
    ]));
  it('checks the due date gap', () =>
    expect(checkStatement({ ...ok, dueDate: '2026-09-12' }, TODAY)).toEqual([
      { field: 'dueDate', message: 'Due date must be 10–35 days after the statement date', missing: false },
    ]));
  it('checks the minimum due', () => {
    expect(checkStatement({ ...ok, minimumDue: 2000 }, TODAY)[0].message).toBe('Minimum due must be between RM0 and the statement balance');
    expect(checkStatement({ ...ok, statementBalance: 0, minimumDue: 5 }, TODAY)[0].message).toBe('Minimum due must be RM0 when the balance is zero or in credit');
  });
  it('rejects a future statement date', () =>
    expect(checkStatement({ ...ok, statementDate: '2026-09-30', dueDate: '2026-10-20' }, TODAY)[0]).toEqual({
      field: 'statementDate', message: 'Statement date cannot be in the future', missing: false,
    }));
});

describe('statementStatus', () => {
  it.each([
    ['2026-09-20', 'overdue', 'Overdue by 4 days'],
    ['2026-09-23', 'overdue', 'Overdue by 1 day'],
    ['2026-09-24', 'soon', 'Due today'],
    ['2026-09-25', 'soon', 'Due in 1 day'],
    ['2026-10-01', 'soon', 'Due in 7 days'],
    ['2026-10-02', 'later', 'Due in 8 days'],
  ])('due %s → %s %s', (dueDate, tone, label) =>
    expect(statementStatus(statement({ dueDate }), TODAY)).toMatchObject({ tone, label }));
  it('labels paid statements', () => {
    expect(statementStatus(statement({ paymentStatus: 'paidFull' }), TODAY)).toEqual({ tone: 'paid', label: 'Paid in full', daysLeft: null });
    expect(statementStatus(statement({ paymentStatus: 'paidMin' }), TODAY).label).toBe('Paid minimum');
    expect(statementStatus(statement({ paymentStatus: 'paidPartial', paidAmount: 300 }), TODAY).label).toBe('Paid RM300.00');
  });
});

describe('upcomingPayments / findDuplicate', () => {
  it('lists unpaid statements due within the window, soonest (incl. overdue) first', () => {
    const a = statement({ id: 'a', dueDate: '2026-10-05' });
    const b = statement({ id: 'b', dueDate: '2026-09-20' });
    const c = statement({ id: 'c', dueDate: '2026-10-09' }); // 15 days away
    const d = statement({ id: 'd', dueDate: '2026-09-26', paymentStatus: 'paidFull' });
    expect(upcomingPayments([a, b, c, d], TODAY).map((s) => s.id)).toEqual(['b', 'a']);
  });
  it('finds another statement for the same card and date', () => {
    const a = statement({ id: 'a' });
    expect(findDuplicate([a], { id: 'new', userCardId: a.userCardId, statementDate: a.statementDate })).toBe(a);
    expect(findDuplicate([a], { id: 'a', userCardId: a.userCardId, statementDate: a.statementDate })).toBeUndefined();
    expect(findDuplicate([a], { id: 'new', userCardId: 'other', statementDate: a.statementDate })).toBeUndefined();
  });
});
