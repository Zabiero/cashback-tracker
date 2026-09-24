import { makeBackup, parseBackup } from './backup';
import { DEFAULT_SETTINGS, type AppSnapshot } from './repository';
import { card, tx } from '../test/fixtures';

const snap = (): AppSnapshot => ({
  userCards: [{ id: 'u1', productId: 'rhb-shell-visa', nickname: '', catalogVersionSeen: 1, archived: false }],
  transactions: [tx({ id: 'a', userCardId: 'u1', amount: 10, date: '2026-08-02' }), tx({ id: 'b', userCardId: 'u1', amount: 20, date: '2026-09-05' })],
  templates: [],
  settings: DEFAULT_SETTINGS,
});
const text = (o: unknown) => JSON.stringify(o);

describe('backup', () => {
  it('round-trips and summarises', () => {
    const base = snap(); // tx() fixtures get fresh createdAt values per call, so compare against the same instance
    const r = parseBackup(text(makeBackup(base, '2026-09-24T10:00:00Z')));
    expect(r).toEqual({ ok: true, data: base, summary: { cards: 1, transactions: 2, from: '2026-08-02', to: '2026-09-05' } });
  });
  it('rejects non-JSON', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
  });
  it('rejects files from other apps', () => {
    expect(parseBackup(text({ hello: 1 }))).toEqual({ ok: false, error: 'This is not a Cashback Tracker backup file.' });
  });
  it('rejects backups from a newer app version', () => {
    const b = { ...makeBackup(snap(), 'x'), schemaVersion: 99 };
    expect(parseBackup(text(b))).toEqual({ ok: false, error: 'This backup was made by a newer version of the app. Update the app and try again.' });
  });
  it('rejects transactions that reference a missing card', () => {
    const b = makeBackup({ ...snap(), userCards: [] }, 'x');
    expect(parseBackup(text(b))).toEqual({ ok: false, error: 'Transaction a refers to a card that is not in the backup.' });
  });
  it('rejects malformed transactions', () => {
    const s = snap();
    s.transactions[0] = { ...s.transactions[0], amount: 'ten' as never };
    expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Transaction a is malformed.' });
  });
  it('rejects invalid custom cards', () => {
    const s = snap();
    s.userCards[0] = { ...s.userCards[0], productId: null, nickname: 'Mine', overrides: card({ rules: [] }) };
    expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Custom card "Mine" is invalid: At least one rule is required' });
  });
  it('accepts transactions with overseas field', () => {
    const s = snap();
    s.transactions[0] = { ...s.transactions[0], overseas: true };
    s.transactions[1] = { ...s.transactions[1], overseas: false };
    const b = makeBackup(s, 'x');
    const r = parseBackup(text(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.transactions[0].overseas).toBe(true);
      expect(r.data.transactions[1].overseas).toBe(false);
    }
  });
  it('rejects transactions with non-boolean overseas field', () => {
    const s = snap();
    s.transactions[0] = { ...s.transactions[0], overseas: 'true' as never };
    expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Transaction a is malformed.' });
  });
  it('handles custom cards with malformed rules gracefully', () => {
    const s = snap();
    s.userCards[0] = {
      ...s.userCards[0],
      productId: null,
      nickname: 'Mine',
      overrides: card({ rules: [{ id: 'r1', label: 'Test', rate: 0.01, categories: 'x' as never }] }),
    };
    expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Custom card "Mine" is invalid: malformed rules' });
  });
});
