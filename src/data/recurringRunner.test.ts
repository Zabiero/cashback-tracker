import type { RecurringTemplate } from '../engine/types';
import { runRecurring } from './recurringRunner';
import { DexieRepository } from './dexieRepository';
import { card } from '../test/fixtures';

async function setup() {
  const repo = new DexieRepository(`test-${Math.random()}`);
  await repo.saveUserCard({ id: 'u1', productId: null, nickname: 'Mine', overrides: card(), catalogVersionSeen: 1, archived: false });
  await repo.saveTemplate({ id: 't1', userCardId: 'u1', amount: 99, category: 'utilities', paymentMethod: 'online', dayOfPeriod: 'first', active: true, startDate: '2026-07-10' });
  return repo;
}

describe('runRecurring', () => {
  it('stores generated transactions once', async () => {
    const repo = await setup();
    expect(await runRecurring(repo, '2026-09-24')).toBe(3);
    expect(await runRecurring(repo, '2026-09-24')).toBe(0);
    expect(await repo.listTransactions()).toHaveLength(3);
  });
  it('does not bring back a generated transaction the user deleted', async () => {
    const repo = await setup();
    await runRecurring(repo, '2026-09-24');
    await repo.deleteTransaction('rec-t1-2026-09-01');
    await runRecurring(repo, '2026-09-24');
    expect((await repo.listTransactions()).map((t) => t.id).sort()).toEqual(['rec-t1-2026-07-01', 'rec-t1-2026-08-01']);
  });
  it('skips a malformed template without failing the others', async () => {
    const repo = await setup();
    const bad = { id: 'bad', userCardId: 'u1', amount: 5, category: 'utilities', paymentMethod: 'online', dayOfPeriod: 'first', active: true } as unknown as RecurringTemplate;
    await repo.saveTemplate(bad);
    expect(await runRecurring(repo, '2026-09-24')).toBe(3);
    expect((await repo.listTransactions()).every((t) => t.recurringId === 't1')).toBe(true);
  });
});
