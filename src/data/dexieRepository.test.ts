import Dexie from 'dexie';
import { DexieRepository } from './dexieRepository';
import { DEFAULT_SETTINGS } from './repository';
import { checkStorage } from './storageCheck';
import type { UserCard } from '../engine/types';
import { statement, tx } from '../test/fixtures';

const repo = () => new DexieRepository(`test-${Math.random()}`);
const uc: UserCard = { id: 'u1', productId: 'rhb-shell-visa', nickname: '', catalogVersionSeen: 1, archived: false };

describe('DexieRepository', () => {
  it('saves and lists user cards', async () => {
    const r = repo();
    await r.saveUserCard(uc);
    expect(await r.listUserCards()).toEqual([uc]);
  });

  it('filters transactions by card and date range', async () => {
    const r = repo();
    await r.saveTransactions([
      tx({ id: 'a', userCardId: 'u1', amount: 1, date: '2026-08-31' }),
      tx({ id: 'b', userCardId: 'u1', amount: 1, date: '2026-09-01' }),
      tx({ id: 'c', userCardId: 'u2', amount: 1, date: '2026-09-02' }),
    ]);
    expect((await r.listTransactions({ userCardId: 'u1', from: '2026-09-01' })).map((t) => t.id)).toEqual(['b']);
    expect((await r.listTransactions({ to: '2026-09-01' })).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('updates and deletes transactions', async () => {
    const r = repo();
    const t = tx({ id: 'a', amount: 10 });
    await r.saveTransaction(t);
    await r.saveTransaction({ ...t, amount: 20 });
    expect((await r.listTransactions())[0].amount).toBe(20);
    await r.deleteTransaction('a');
    expect(await r.listTransactions()).toEqual([]);
  });

  it('returns default settings until saved', async () => {
    const r = repo();
    expect(await r.getSettings()).toEqual(DEFAULT_SETTINGS);
    await r.saveSettings({ ...DEFAULT_SETTINGS, lastBackupAt: '2026-09-24' });
    expect((await r.getSettings()).lastBackupAt).toBe('2026-09-24');
  });

  it('exports and replaces everything', async () => {
    const r = repo();
    await r.saveUserCard(uc);
    await r.saveTransaction(tx({ id: 'a', userCardId: 'u1', amount: 5 }));
    const snap = await r.exportAll();
    const other = repo();
    await other.saveUserCard({ ...uc, id: 'old' });
    await other.replaceAll(snap);
    expect((await other.listUserCards()).map((c) => c.id)).toEqual(['u1']);
    expect(await other.listTransactions()).toHaveLength(1);
  });
});

describe('checkStorage', () => {
  it('reports IndexedDB as available', async () => {
    expect(await checkStorage()).toBe(true);
  });
});

describe('statements', () => {
  it('saves, lists and deletes statements', async () => {
    const r = repo();
    const s = statement({ id: 'a' });
    await r.saveStatement(s);
    expect(await r.listStatements()).toEqual([s]);
    await r.deleteStatement('a');
    expect(await r.listStatements()).toEqual([]);
  });

  it('includes statements in export and replace', async () => {
    const r = repo();
    await r.saveUserCard(uc);
    await r.saveStatement(statement({ id: 'a', userCardId: 'u1' }));
    const snap = await r.exportAll();
    expect(snap.statements).toHaveLength(1);
    const other = repo();
    await other.saveStatement(statement({ id: 'old' }));
    await other.replaceAll(snap);
    expect((await other.listStatements()).map((s) => s.id)).toEqual(['a']);
  });

  it('upgrades a version-1 database without losing data', async () => {
    const name = `upgrade-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ userCards: 'id', transactions: 'id, userCardId, date', templates: 'id', settings: 'key' });
    await v1.table('userCards').put(uc);
    await v1.table('transactions').put(tx({ id: 't1', userCardId: 'u1', amount: 10 }));
    await v1.table('settings').put({ key: 'app', schemaVersion: 1, lastBackupAt: '2026-09-01', pointValueOverrides: { x: 0.01 } });
    v1.close();

    const upgraded = new DexieRepository(name);
    expect(await upgraded.listUserCards()).toEqual([uc]);
    expect((await upgraded.listTransactions()).map((t) => t.id)).toEqual(['t1']);
    expect((await upgraded.getSettings()).lastBackupAt).toBe('2026-09-01');
    expect(await upgraded.listStatements()).toEqual([]);
  });
});
