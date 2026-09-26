import { parseAmount, parseStatementDate } from '../logic';
import { cleanLines, last4, valueNear } from './helpers';
import type { ReadCard, ReadResult } from '.';

/** UOB prints zero as ".00", so the leading digit is optional; credits carry a "CR" suffix. */
const UOB_AMOUNT = String.raw`(?:\d[\d,]*)?\.\d{2}(?:\s?CR)?`;
const DATE = /\b\d{1,2} [A-Za-z]{3} \d{2,4}\b/;
/** "ONE VISA CARD **XXXX-XXXX-XXXX-3333** MS JANE LIM" — starts one card's transaction section. */
const CARD_LINE = /\*\*([\dX*]{4}(?:-[\dX*]{4}){3})\*\*/i;
const SUB_TOTAL = new RegExp(String.raw`^SUB-TOTAL\s+(${UOB_AMOUNT})$`, 'i');
const MINIMUM = new RegExp(String.raw`^MINIMUM PAYMENT DUE\s+(${UOB_AMOUNT})$`, 'i');

/**
 * UOB card statement. The dates are shared ("Statement Date dd MMM yy" / "Payment Due Date dd MMM yy");
 * each card's transaction section starts with its "**card number**" line and ends with its own
 * "SUB-TOTAL" (the card's balance) and "MINIMUM PAYMENT DUE" lines.
 */
export function readUob(raw: string[]): ReadResult {
  const lines = cleanLines(raw);
  const date = (s: string | undefined) => (s ? parseStatementDate(s) ?? undefined : undefined);
  const statementDate = date(valueNear(lines, /^Statement Date\b/i, DATE, 0));
  const dueDate = date(valueNear(lines, /^Payment Due Date\b/i, DATE, 0));

  const cards: ReadCard[] = [];
  let card: ReadCard | undefined;
  for (const line of lines) {
    const start = line.match(CARD_LINE);
    if (start) {
      const digits = last4(start[1]);
      // The same card's header repeats at the top of a continuation page: keep filling that card.
      const existing = digits ? cards.find((c) => c.last4 === digits) : undefined;
      if (existing) {
        card = existing;
      } else {
        card = { last4: digits, statementDate, dueDate };
        cards.push(card);
      }
      continue;
    }
    if (!card) continue;
    const total = line.match(SUB_TOTAL);
    if (total && card.statementBalance === undefined) card.statementBalance = parseAmount(total[1]) ?? undefined;
    const min = line.match(MINIMUM);
    if (min && card.minimumDue === undefined) card.minimumDue = parseAmount(min[1]) ?? undefined;
  }
  return { cards };
}
