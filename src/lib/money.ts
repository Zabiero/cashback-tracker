export function formatRM(n: number): string {
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${sign}RM${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

/** Accepts "12", "12.5", "RM1,234.50", ".5", "-20" (refund). Returns null if not a valid 2-dp amount. */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/,/g, '');
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1).trim();
  s = s.replace(/^rm\s*/i, '');
  if (!/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}
