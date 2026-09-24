import { CATALOG, getProduct } from './index';
import { SCENARIOS } from './scenarios';
import { resolveUserCard } from './resolveUserCard';
import { validateCardProduct } from '../engine/validate';
import { calculateEarnings } from '../engine/earnings';
import type { Transaction } from '../engine/types';

const EXPECTED_IDS = [
  'maybank-islamic-ikhwan-amex-platinum', 'rhb-shell-visa', 'uob-one-classic', 'alliance-visa-infinite',
  'alliance-visa-virtual', 'pbb-quantum-visa', 'pbb-quantum-mastercard', 'aeon-amp-visa-platinum',
];

describe('catalog', () => {
  it('contains exactly the expected cards', () => {
    expect(CATALOG.map((c) => c.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });
  it.each(CATALOG.map((c) => [c.id, c] as const))('%s is valid', (_id, c) => {
    expect(validateCardProduct(c)).toEqual([]);
  });
  it.each(CATALOG.map((c) => [c.id, c] as const))('%s records its source', (_id, c) => {
    expect(c.sourceUrl).toMatch(/^https:\/\//);
  });
  it.each(EXPECTED_IDS)('%s has at least one scenario', (id) => {
    expect(SCENARIOS.some((s) => s.productId === id)).toBe(true);
  });
  it.each(SCENARIOS.map((s) => [`${s.productId}: ${s.description}`, s] as const))('%s', (_name, s) => {
    const product = getProduct(s.productId)!;
    const txs: Transaction[] = s.transactions.map((t, i) => ({ ...t, id: `s${i}`, userCardId: 'u', createdAt: String(i).padStart(4, '0') }));
    expect(calculateEarnings(product, txs, s.period).totalEarnedRM).toBeCloseTo(s.expectedRM, 2);
  });
});

describe('resolveUserCard', () => {
  it('throws a helpful error for a removed catalog card', () => {
    expect(() => resolveUserCard({ id: 'u', productId: 'gone', nickname: '', catalogVersionSeen: 1, archived: false }, { pointValueOverrides: {} })).toThrow(
      'This card is no longer in the catalog. Recreate it as a custom card.',
    );
  });
});

describe('Maybank Ikhwan festive cap wording', () => {
  it('tells the user to raise the cap for Ramadhan and Syawal and set it back afterwards', () => {
    const rules = getProduct('maybank-islamic-ikhwan-amex-platinum')!.rules.filter((r) => r.capGroup === 'online-8pct');
    expect(rules).toHaveLength(2);
    for (const r of rules) {
      expect(r.label).toMatch(/cap is RM100 in Ramadhan and Syawal, so raise .* for those months and set it back/);
      expect(r.label).not.toMatch(/override the cap/);
    }
  });
});
