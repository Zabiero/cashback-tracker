import { resolveCard } from './resolve';
import type { UserCard } from './types';
import { card } from '../test/fixtures';

const uc = (p: Partial<UserCard> = {}): UserCard => ({ id: 'u1', productId: 'test-card', nickname: '', catalogVersionSeen: 1, archived: false, ...p });

describe('resolveCard', () => {
  it('returns the catalog product unchanged when there are no overrides', () => {
    expect(resolveCard(uc(), card())).toEqual(card());
  });
  it('merges overrides and the user cycle day', () => {
    const r = resolveCard(uc({ cycleDay: 20, overrides: { totalCapPerPeriod: 50 } }), card({ periodType: 'statement', defaultCycleDay: 15 }));
    expect(r.totalCapPerPeriod).toBe(50);
    expect(r.defaultCycleDay).toBe(20);
  });
  it('applies a settings point value unless the card overrides it', () => {
    const p = card({ rewardType: 'points', pointValueRM: 0.01 });
    expect(resolveCard(uc(), p, { 'test-card': 0.02 }).pointValueRM).toBe(0.02);
    expect(resolveCard(uc({ overrides: { pointValueRM: 0.03 } }), p, { 'test-card': 0.02 }).pointValueRM).toBe(0.03);
  });
  it('applies a settings point value to hybrid rules without mutating the product', () => {
    const p = card({ rules: [{ id: 'cb', label: 'Cashback', rate: 0.01 }, { id: 'pts', label: 'Points', rate: 1, pointValueRM: 0.002 }] });
    const r = resolveCard(uc(), p, { 'test-card': 0.004 });
    expect(r.rules.find((x) => x.id === 'pts')!.pointValueRM).toBe(0.004);
    expect(r.rules.find((x) => x.id === 'cb')!.pointValueRM).toBeUndefined();
    expect(p.rules[1].pointValueRM).toBe(0.002);
  });
  it('leaves hybrid rule point values alone without a settings override', () => {
    const p = card({ rules: [{ id: 'pts', label: 'Points', rate: 1, pointValueRM: 0.002 }] });
    expect(resolveCard(uc(), p).rules[0].pointValueRM).toBe(0.002);
  });
  it('uses overrides as the full definition for custom cards', () => {
    expect(resolveCard(uc({ productId: null, overrides: card({ name: 'Mine' }) }), null).name).toBe('Mine');
  });
  it('throws for a custom card without a definition', () => {
    expect(() => resolveCard(uc({ productId: null }), null)).toThrow();
  });
});
