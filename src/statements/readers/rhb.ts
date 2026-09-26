import { parseAmount, parseStatementDate } from '../logic';
import { AMOUNT, cleanLines, last4, valueNear } from './helpers';
import type { ReadCard, ReadResult } from '.';

/** "XXXX-XXXX-XXXX-2222 SHELL VISA CARD 1,876.45 0.00 93.82" — outstanding, past due, minimum. */
const CARD_ROW = new RegExp(String.raw`^([\dX*]{4}-[\dX*]{4}-[\dX*]{4}-[\dX*]{4})\s+.*?\s*(${AMOUNT})\s+(${AMOUNT})\s+(${AMOUNT})$`, 'i');

/**
 * RHB card statement. One row per card (principal and supplementary/replacement cards) in the
 * "YOUR ACCOUNT DETAILS" table, ended by a "Total / Jumlah" row; the dates are shared.
 */
export function readRhb(raw: string[]): ReadResult {
  const lines = cleanLines(raw);
  const header = lines.findIndex((l) => /^Account Number\s+Card Type/i.test(l));
  if (header < 0) return { cards: [] };

  const date = (s: string | undefined) => (s ? parseStatementDate(s) ?? undefined : undefined);
  const statementDate = date(valueNear(lines, /Statement Date \/ Tarikh Penyata\s*:?/i, /\d{1,2} [A-Za-z]{3,9} \d{4}/));
  const dueDate = date(valueNear(lines, /^Payment Due Date/i, /\b\d{1,2}\/\d{1,2}\/\d{4}\b/));

  const cards: ReadCard[] = [];
  for (const line of lines.slice(header + 1)) {
    if (/^Total\b/i.test(line)) break;
    const m = line.match(CARD_ROW);
    if (!m) continue;
    cards.push({
      last4: last4(m[1]),
      statementDate,
      dueDate,
      statementBalance: parseAmount(m[2]) ?? undefined,
      minimumDue: parseAmount(m[4]) ?? undefined,
    });
  }
  return { cards };
}
