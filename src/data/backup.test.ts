import { makeBackup, parseBackup } from './backup';
import { DEFAULT_SETTINGS, type AppSnapshot } from './repository';
import { card, statement, tx } from '../test/fixtures';

const snap = (): AppSnapshot => ({
  userCards: [{ id: 'u1', productId: 'rhb-shell-visa', nickname: '', catalogVersionSeen: 1, archived: false }],
  transactions: [tx({ id: 'a', userCardId: 'u1', amount: 10, date: '2026-08-02' }), tx({ id: 'b', userCardId: 'u1', amount: 20, date: '2026-09-05' })],
  templates: [],
  settings: DEFAULT_SETTINGS,
  statements: [],
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
  describe('structural validation', () => {
    const tplOk = { id: 'r1', userCardId: 'u1', amount: 50, category: 'utilities', paymentMethod: 'online', dayOfPeriod: 'first', active: true, startDate: '2026-09-01' };
    const withTemplates = (templates: unknown[]) => text({ ...makeBackup(snap(), 'x'), templates });
    const TPL_ERR = { ok: false, error: 'A recurring transaction in the backup is malformed.' };

    it('accepts a well-formed template, with or without a boolean overseas flag', () => {
      expect(parseBackup(withTemplates([tplOk, { ...tplOk, id: 'r2', overseas: true }])).ok).toBe(true);
    });
    it('rejects a template missing its start date', () => {
      const { startDate: _omit, ...noStart } = tplOk;
      expect(parseBackup(withTemplates([noStart]))).toEqual(TPL_ERR);
    });
    it.each([
      ['a non-numeric amount', { amount: '50' }],
      ['an unknown category', { category: 'shoes' }],
      ['an unknown payment method', { paymentMethod: 'cheque' }],
      ['a malformed start date', { startDate: '1/9/2026' }],
      ['a non-boolean active flag', { active: 'yes' }],
      ['a non-boolean overseas flag', { overseas: 'true' }],
      ['an unknown card', { userCardId: 'nope' }],
    ])('rejects a template with %s', (_name, patch) => {
      expect(parseBackup(withTemplates([{ ...tplOk, ...patch }]))).toEqual(TPL_ERR);
    });
    it('rejects duplicate transaction ids', () => {
      const s = snap();
      s.transactions[1] = { ...s.transactions[1], id: 'a' };
      expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Duplicate transaction id a.' });
    });
    it('rejects a backup missing its schema version', () => {
      const { schemaVersion: _omit, ...b } = makeBackup(snap(), 'x');
      expect(parseBackup(text(b))).toEqual({ ok: false, error: 'Backup is missing its schema version.' });
    });
    it('rejects a backup missing required sections', () => {
      const { templates: _omit, ...b } = makeBackup(snap(), 'x');
      expect(parseBackup(text(b))).toEqual({ ok: false, error: 'Backup is missing required sections.' });
    });
    it('rejects a malformed card', () => {
      const b = makeBackup(snap(), 'x');
      expect(parseBackup(text({ ...b, userCards: [{ ...b.userCards[0], archived: 'no' }] }))).toEqual({ ok: false, error: 'A card in the backup is malformed.' });
    });
    it('rejects malformed settings', () => {
      const b = makeBackup(snap(), 'x');
      expect(parseBackup(text({ ...b, settings: { ...b.settings, pointValueOverrides: null } }))).toEqual({ ok: false, error: 'Backup settings are malformed.' });
    });
    it('rejects a catalog card whose overrides are invalid', () => {
      const s = snap();
      s.userCards[0] = { ...s.userCards[0], nickname: 'My Shell', overrides: { rules: [] } };
      expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Card "My Shell" has invalid rule overrides: At least one rule is required' });
    });
    it('names a catalog card by id when it has no nickname', () => {
      const s = snap();
      s.userCards[0] = { ...s.userCards[0], overrides: { rules: [{ id: 'x', label: 'X', rate: -1 }] } };
      const r = parseBackup(text(makeBackup(s, 'x')));
      expect(r.ok === false && r.error.startsWith('Card "u1" has invalid rule overrides: ')).toBe(true);
    });
    it('accepts valid overrides and an unknown catalog product id', () => {
      const s = snap();
      s.userCards[0] = { ...s.userCards[0], cycleDay: 15, overrides: { totalCapPerPeriod: 30 } };
      s.userCards.push({ id: 'u2', productId: 'gone-card', nickname: 'Old', catalogVersionSeen: 1, archived: false, overrides: { rules: [] } });
      expect(parseBackup(text(makeBackup(s, 'x'))).ok).toBe(true);
    });
  });
});

describe('backup v2', () => {
  it('round-trips statements', () => {
    const base = { ...snap(), statements: [statement({ id: 'st1', userCardId: 'u1' })] };
    const r = parseBackup(JSON.stringify(makeBackup(base, 'x')));
    expect(r.ok && r.data.statements).toEqual(base.statements);
  });
  it('imports a version-1 backup with no statements', () => {
    const b = { ...makeBackup(snap(), 'x'), schemaVersion: 1 } as Record<string, unknown>;
    delete b.statements;
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.data.statements).toEqual([]);
  });
  it('never exports or imports saved PDF passwords', () => {
    const s = snap();
    s.userCards[0] = { ...s.userCards[0], pdfPassword: 'secret', last4: '1234' };
    const file = makeBackup(s, 'x');
    expect(JSON.stringify(file)).not.toContain('secret');
    expect(file.userCards[0].last4).toBe('1234');
    const tampered = { ...file, userCards: [{ ...file.userCards[0], pdfPassword: 'secret' }] };
    const r = parseBackup(JSON.stringify(tampered));
    expect(r.ok && r.data.userCards[0].pdfPassword).toBeUndefined();
  });
  it('rejects malformed statements and bad last4', () => {
    const bad = { ...snap(), statements: [statement({ id: 'st1', userCardId: 'u1', minimumDue: -1 })] };
    expect(parseBackup(JSON.stringify(makeBackup(bad, 'x')))).toEqual({ ok: false, error: 'Statement st1 is malformed.' });
    const orphan = { ...snap(), statements: [statement({ id: 'st2', userCardId: 'nope' })] };
    expect(parseBackup(JSON.stringify(makeBackup(orphan, 'x')))).toEqual({ ok: false, error: 'Statement st2 refers to a card that is not in the backup.' });
    const s = snap();
    s.userCards[0] = { ...s.userCards[0], last4: '12a4' };
    expect(parseBackup(JSON.stringify(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'A card in the backup is malformed.' });
  });
});
