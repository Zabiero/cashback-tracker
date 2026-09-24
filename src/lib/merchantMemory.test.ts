import { knownMerchants, lastCategoryFor } from './merchantMemory';
import { tx } from '../test/fixtures';

const txs = [
  tx({ amount: 1, merchant: 'Shell Ampang', category: 'petrol', date: '2026-09-01' }),
  tx({ amount: 1, merchant: 'shell ampang', category: 'others', date: '2026-09-10' }),
  tx({ amount: 1, merchant: 'Aeon', category: 'groceries', date: '2026-09-05' }),
  tx({ amount: 1 }),
];

describe('merchant memory', () => {
  it('lists unique merchants case-insensitively, most recent spelling, sorted', () => {
    expect(knownMerchants(txs)).toEqual(['Aeon', 'shell ampang']);
  });
  it('returns the category most recently used for a merchant', () => {
    expect(lastCategoryFor(' SHELL AMPANG ', txs)).toBe('others');
    expect(lastCategoryFor('Unknown', txs)).toBeUndefined();
    expect(lastCategoryFor('', txs)).toBeUndefined();
  });
});
