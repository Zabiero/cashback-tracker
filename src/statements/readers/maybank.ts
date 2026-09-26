import { parseAmount, parseStatementDate } from '../logic';
import { AMOUNT, cleanLines, last4, valueNear } from './helpers';
import type { ReadCard, ReadResult } from '.';

const DATE = String.raw`\d{1,2} [A-Za-z]{3} \d{2,4}`;
const DATE_PAIR = new RegExp(String.raw`(${DATE})\s+(${DATE})`);
/** "XXXX XXXXXX X1111 2,345.67 117.28" — card number, current balance, minimum payment[, amount to be paid]. */
const CARD_ROW = new RegExp(String.raw`^([\dX*]{4}(?:[ -][\dX*]{4,6}){2,3})\s+(${AMOUNT})\s+(${AMOUNT})(?:\s+${AMOUNT})?$`, 'i');

/**
 * Maybank / Maybank Islamic card statement. The two dates sit on one line a few lines below the
 * "Statement Date/ Payment Due Date/" label (address lines interleave), and each card is a row
 * under the "Account Number/ Nombor Akaun ... Minimum Payment" header.
 */
export function readMaybank(raw: string[]): ReadResult {
  const lines = cleanLines(raw);
  const header = lines.findIndex((l) => /^Account Number\/\s*Nombor Akaun/i.test(l));
  if (header < 0) return { cards: [] };

  const pair = valueNear(lines, /Statement Date\/\s*Payment Due Date\//i, DATE_PAIR, 8)?.match(DATE_PAIR);
  const statementDate = pair ? parseStatementDate(pair[1]) ?? undefined : undefined;
  const dueDate = pair ? parseStatementDate(pair[2]) ?? undefined : undefined;

  const cards: ReadCard[] = [];
  for (const line of lines.slice(header + 1)) {
    const m = line.match(CARD_ROW);
    if (!m) break;
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
