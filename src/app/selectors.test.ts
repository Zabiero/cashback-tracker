import { activeCards, cardInputs, currentEarnings, earningsByTransaction, nameOf } from './selectors';
import { card, tx } from '../test/fixtures';
import type { UserCard } from '../engine/types';

const at5 = card({ bank: 'RHB', name: 'Shell Visa', rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
const d = {
  today: '2026-09-24',
  userCards: [
    { id: 'A', productId: null, nickname: '', catalogVersionSeen: 1, archived: false },
    { id: 'B', productId: null, nickname: 'Old card', catalogVersionSeen: 1, archived: true },
    { id: 'C', productId: null, nickname: 'Broken', catalogVersionSeen: 1, archived: false },
  ] as UserCard[],
  resolved: { A: at5, B: at5 },
  transactions: [
    tx({ id: 'x', userCardId: 'A', amount: 100, date: '2026-09-02' }),
    tx({ id: 'y', userCardId: 'A', amount: 100, date: '2026-08-02' }),
    tx({ id: 'z', userCardId: 'B', amount: 40, date: '2026-09-02' }),
  ],
};

describe('selectors', () => {
  it('lists active, resolvable cards with display names', () => {
    expect(activeCards(d).map((c) => [c.userCard.id, c.name])).toEqual([['A', 'RHB Shell Visa']]);
  });
  it('names cards by nickname, falling back to bank + name', () => {
    expect(nameOf(d, 'B')).toBe('Old card');
    expect(nameOf(d, 'missing')).toBe('Unknown card');
  });
  it('builds recommend inputs, optionally including archived cards', () => {
    expect(cardInputs(d).map((i) => i.userCard.id)).toEqual(['A']);
    expect(cardInputs(d, true).map((i) => i.userCard.id)).toEqual(['A', 'B']);
    expect(cardInputs(d)[0].transactions.map((t) => t.id)).toEqual(['x', 'y']);
  });
  it('computes current-period earnings per active card', () => {
    expect(currentEarnings(d).map((c) => c.earnings.totalEarnedRM)).toEqual([5]);
  });
  it('maps every transaction to its earnings, including archived cards', () => {
    const m = earningsByTransaction(d);
    expect([m.get('x'), m.get('y'), m.get('z')]).toEqual([5, 5, 2]);
  });
});
