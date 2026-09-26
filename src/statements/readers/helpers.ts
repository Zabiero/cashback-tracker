/** First value matching `value` on the label's line (after the label) or within the next `lookahead` lines. */
export function valueNear(lines: string[], label: RegExp, value: RegExp, lookahead = 2): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const after = lines[i].slice((m.index ?? 0) + m[0].length).match(value);
    if (after) return after[0].trim();
    for (let j = 1; j <= lookahead && i + j < lines.length; j++) {
      const v = lines[i + j].match(value);
      if (v) return v[0].trim();
    }
  }
  return undefined;
}

/** Statement amount as printed: "1,234.56", "0.00", "15.20CR", "15.20 CR". */
export const AMOUNT = String.raw`-?\d[\d,]*\.\d{2}(?:\s?CR)?`;

/** Last four digits of a (possibly masked) card number, or undefined if they are not all digits. */
export function last4(cardNumber: string): string | undefined {
  const tail = cardNumber.replace(/[\s-]/g, '').slice(-4);
  return /^\d{4}$/.test(tail) ? tail : undefined;
}

/** Trims each line (including a trailing "\r" from Windows line endings). */
export function cleanLines(lines: string[]): string[] {
  return lines.map((l) => l.trim());
}
