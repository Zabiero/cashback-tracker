import { parseAmount, parseStatementDate } from '../logic';
import { AMOUNT, cleanLines, last4, valueNear } from './helpers';
import type { ReadCard, ReadResult } from '.';

const DATE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
/**
 * "VISA VIRTUAL CREDIT CARD XXXX XXXX XXXX 4445 640.00 50.00" — card name, card number, current
 * balance (a credit balance is printed negative), minimum payment[, payment amount].
 */
const CARD_ROW = new RegExp(String.raw`^.*?([\dX*]{4}(?: [\dX*]{4}){3})\s+(${AMOUNT})\s+(${AMOUNT})(?:\s+${AMOUNT})?$`, 'i');

/**
 * Alliance Bank card statement. The payment advice on page 1 holds both dates (dd/mm/yy on the
 * line after each label) and one row per card under the "Account No. Current Balance Minimum
 * Payment" header, followed by an unlabelled totals row.
 */
export function readAlliance(raw: string[]): ReadResult {
  const lines = cleanLines(raw);
  const header = lines.findIndex((l) => /^Account No\.\s+Current Balance\s+Minimum Payment/i.test(l));
  if (header < 0) return { cards: [] };

  const date = (s: string | undefined) => (s ? parseStatementDate(s) ?? undefined : undefined);
  const statementDate = date(valueNear(lines, /^Statement Date\b/i, DATE));
  const dueDate = date(valueNear(lines, /^Payment Due Date$/i, DATE));

  const cards: ReadCard[] = [];
  let skipped = 0; // the Malay header line sits between the header and the first card row
  for (const line of lines.slice(header + 1)) {
    const m = line.match(CARD_ROW);
    if (!m) {
      if (cards.length > 0 || ++skipped > 2) break;
      continue;
    }
    cards.push({
      last4: last4(m[1]),
      statementDate,
      dueDate,
      statementBalance: parseAmount(m[2]) ?? undefined,
      minimumDue: parseAmount(m[3]) ?? undefined,
    });
  }
  return { cards };
}
