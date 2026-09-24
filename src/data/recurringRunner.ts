import type { CardProduct, RecurringTemplate, Transaction } from '../engine/types';
import { generateRecurring } from '../engine/recurring';
import { resolveUserCard } from '../catalog/resolveUserCard';
import type { Repository } from './repository';

export async function runRecurring(repo: Repository, today: string): Promise<number> {
  const [cards, templates, settings] = await Promise.all([repo.listUserCards(), repo.listTemplates(), repo.getSettings()]);
  const byId: Record<string, CardProduct> = {};
  for (const uc of cards) {
    if (uc.archived) continue;
    try {
      byId[uc.id] = resolveUserCard(uc, settings);
    } catch {
      // broken card: surfaced by the UI; its templates are skipped
    }
  }
  const transactions: Transaction[] = [];
  const updated: RecurringTemplate[] = [];
  for (const template of templates) {
    try {
      const r = generateRecurring([template], byId, today);
      transactions.push(...r.transactions);
      updated.push(...r.templates);
    } catch {
      // malformed template: skip it so one bad template cannot fail the app load
    }
  }
  if (transactions.length) await repo.saveTransactions(transactions);
  for (const t of updated) await repo.saveTemplate(t);
  return transactions.length;
}
