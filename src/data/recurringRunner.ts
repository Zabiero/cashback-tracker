import type { CardProduct } from '../engine/types';
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
  const result = generateRecurring(templates, byId, today);
  if (result.transactions.length) await repo.saveTransactions(result.transactions);
  for (const t of result.templates) await repo.saveTemplate(t);
  return result.transactions.length;
}
