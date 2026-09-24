import type { Category, Transaction } from '../engine/types';

const key = (m: string) => m.trim().toLowerCase();
const newestFirst = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

export function knownMerchants(txs: Transaction[]): string[] {
  const seen = new Map<string, string>();
  for (const t of [...txs].sort(newestFirst)) {
    if (t.merchant?.trim() && !seen.has(key(t.merchant))) seen.set(key(t.merchant), t.merchant.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function lastCategoryFor(merchant: string, txs: Transaction[]): Category | undefined {
  const k = key(merchant);
  if (!k) return undefined;
  return [...txs].sort(newestFirst).find((t) => t.merchant && key(t.merchant) === k)?.category;
}
