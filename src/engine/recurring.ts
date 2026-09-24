import type { CardProduct, RecurringTemplate, Transaction } from './types';
import { getPeriod, nextPeriod } from './periods';

const MAX_PERIODS_PER_RUN = 60;

export function generateRecurring(
  templates: RecurringTemplate[],
  cardsById: Record<string, CardProduct>,
  today: string,
): { transactions: Transaction[]; templates: RecurringTemplate[] } {
  const transactions: Transaction[] = [];
  const updated: RecurringTemplate[] = [];

  for (const t of templates) {
    const card = cardsById[t.userCardId];
    if (!t.active || !card) continue;
    let p = t.lastGeneratedPeriodStart ? nextPeriod(card, getPeriod(card, t.lastGeneratedPeriodStart)) : getPeriod(card, t.startDate);
    let last = t.lastGeneratedPeriodStart;
    for (let n = 0; n < MAX_PERIODS_PER_RUN && p.start <= today; n++) {
      const date = p.start < t.startDate ? t.startDate : p.start;
      transactions.push({
        id: `rec-${t.id}-${p.start}`,
        userCardId: t.userCardId,
        date,
        amount: t.amount,
        category: t.category,
        merchant: t.merchant,
        paymentMethod: t.paymentMethod,
        recurringId: t.id,
        createdAt: `${date}T00:00:00.000Z`,
      });
      last = p.start;
      p = nextPeriod(card, p);
    }
    if (last !== t.lastGeneratedPeriodStart) updated.push({ ...t, lastGeneratedPeriodStart: last });
  }
  return { transactions, templates: updated };
}
