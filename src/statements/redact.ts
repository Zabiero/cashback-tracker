/** Personal-data patterns, shared by `redact()` and the fixture PII check (fixtures-pii.test.ts). */
export const CARD_16 = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/;
export const CARD_15 = /\b\d{4}[ -]?\d{6}[ -]?\d{5}\b/;
export const IC_NUMBER = /\b\d{6}-?\d{2}-?\d{4}\b/;
export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export const PII_PATTERNS: [string, RegExp][] = [
  ['16-digit card number', CARD_16],
  ['15-digit AMEX card number', CARD_15],
  ['Malaysian IC number', IC_NUMBER],
  ['email address', EMAIL],
];

/** Card-number-like groups: the card patterns above, also accepting bank masking ("XXXX-XXXX-XXXX-3333"). */
const CARD_LIKE = [
  String.raw`(?<![\dX])(?:[\dX]{4}[ -]?){3}\d{4}(?!\d)`,
  String.raw`(?<![\dX])[\dX]{4}[ -]?[\dX]{6}[ -]?\d{5}(?!\d)`,
];

const PATTERN = new RegExp(
  [`(${EMAIL.source})`, `(${CARD_LIKE.join('|')})`, `(${IC_NUMBER.source})`, String.raw`(\d{4,})`].join('|'),
  'g',
);

const maskDigits = (s: string) => s.replace(/\d/g, '•');

/** Keeps the last 4 digits of a card number, masking the others. */
function maskCard(s: string): string {
  let keep = 4;
  const out = [...s].reverse().map((ch) => {
    if (!/\d/.test(ch)) return ch;
    if (keep > 0) {
      keep -= 1;
      return ch;
    }
    return '•';
  });
  return out.reverse().join('');
}

/**
 * Hides personal details in extracted statement text before it is shown: emails, IC numbers and
 * every run of 4+ digits are masked, except the last 4 digits of card-number-like groups.
 */
export function redact(text: string): string {
  return text.replace(PATTERN, (match, email?: string, card?: string) => {
    if (email) return '•••@•••';
    if (card) return maskCard(match);
    return maskDigits(match);
  });
}
