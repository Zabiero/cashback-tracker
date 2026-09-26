import type { Statement } from '../engine/types';
import { daysBetween, parseISODate, toISODate } from '../engine/dates';
import { round2 } from '../engine/earnings';
import { formatRM } from '../lib/money';

export interface StatementValues {
  statementDate?: string;
  dueDate?: string;
  statementBalance?: number;
  minimumDue?: number;
}

export interface StatementIssue {
  field: keyof StatementValues;
  message: string;
  missing: boolean;
}

/** "1,234.56", "RM1,234.56", "1,234.56 CR" (credit → negative), "-50.10", "50.10 DR". */
export function parseAmount(raw: string): number | null {
  const m = raw.trim().match(/^(-)?\s*(?:RM\s*)?(-)?\s*(\d[\d,]*(?:\.\d{1,2})?|\.\d{1,2})\s*(CR|DR)?$/i);
  if (!m) return null;
  // Commas must be proper thousands separators ("1,234,567.89"), or absent altogether.
  if (m[3].includes(',') && !/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(m[3])) return null;
  const digits = m[3].replace(/,/g, '');
  if (!/^\d*(\.\d{1,2})?$/.test(digits)) return null;
  const n = Number(digits);
  const negative = Boolean(m[1] || m[2]) || m[4]?.toUpperCase() === 'CR';
  return round2(negative ? -n : n);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7,
  aug: 8, ogo: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};

function makeDate(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  const iso = toISODate(year, m, d);
  const p = parseISODate(iso);
  return p.y === year && p.m === m && p.d === d ? iso : null;
}

/** dd/mm/yyyy, d-m-yy, dd.mm.yyyy, dd MMM yyyy, ddMMMyy, dd-MMM-yyyy, MMM d, yyyy (English and Malay month names). */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return makeDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[ -]?([a-z]{3})[a-z]*[ -]?(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2]]) return makeDate(+m[3], MONTHS[m[2]], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$/);
  if (m && MONTHS[m[1]]) return makeDate(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

export function checkStatement(v: StatementValues, today: string): StatementIssue[] {
  const issues: StatementIssue[] = [];
  const missing = (field: keyof StatementValues, message: string) => issues.push({ field, message, missing: true });
  if (!v.statementDate) missing('statementDate', 'Statement date is missing');
  if (!v.dueDate) missing('dueDate', 'Due date is missing');
  if (v.statementBalance == null || !Number.isFinite(v.statementBalance)) missing('statementBalance', 'Statement balance is missing');
  if (v.minimumDue == null || !Number.isFinite(v.minimumDue)) missing('minimumDue', 'Minimum due is missing');

  if (v.statementDate && v.dueDate) {
    const gap = daysBetween(v.statementDate, v.dueDate);
    if (gap < 10 || gap > 35) issues.push({ field: 'dueDate', message: 'Due date must be 10–35 days after the statement date', missing: false });
  }
  if (v.statementBalance != null && v.minimumDue != null && Number.isFinite(v.statementBalance) && Number.isFinite(v.minimumDue)) {
    if (v.statementBalance > 0) {
      if (v.minimumDue < 0 || v.minimumDue > v.statementBalance) {
        issues.push({ field: 'minimumDue', message: 'Minimum due must be between RM0 and the statement balance', missing: false });
      }
    } else if (v.minimumDue !== 0) {
      issues.push({ field: 'minimumDue', message: 'Minimum due must be RM0 when the balance is zero or in credit', missing: false });
    }
  }
  if (v.statementDate && v.statementDate > today) {
    issues.push({ field: 'statementDate', message: 'Statement date cannot be in the future', missing: false });
  }
  return issues;
}

export interface StatusInfo {
  tone: 'overdue' | 'soon' | 'later' | 'paid';
  label: string;
  daysLeft: number | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function statementStatus(s: Statement, today: string): StatusInfo {
  if (s.paymentStatus === 'paidFull') return { tone: 'paid', label: 'Paid in full', daysLeft: null };
  if (s.paymentStatus === 'paidMin') return { tone: 'paid', label: 'Paid minimum', daysLeft: null };
  if (s.paymentStatus === 'paidPartial') return { tone: 'paid', label: `Paid ${formatRM(s.paidAmount ?? 0)}`, daysLeft: null };
  const days = daysBetween(today, s.dueDate);
  if (days < 0) return { tone: 'overdue', label: `Overdue by ${plural(-days, 'day')}`, daysLeft: days };
  if (days === 0) return { tone: 'soon', label: 'Due today', daysLeft: 0 };
  return { tone: days <= 7 ? 'soon' : 'later', label: `Due in ${plural(days, 'day')}`, daysLeft: days };
}

export function upcomingPayments(statements: Statement[], today: string, windowDays = 14): Statement[] {
  return statements
    .filter((s) => s.paymentStatus === 'unpaid' && daysBetween(today, s.dueDate) <= windowDays)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function findDuplicate(
  statements: Statement[],
  c: Pick<Statement, 'id' | 'userCardId' | 'statementDate'>,
): Statement | undefined {
  return statements.find((s) => s.id !== c.id && s.userCardId === c.userCardId && s.statementDate === c.statementDate);
}
