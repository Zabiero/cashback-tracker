import type { CardProduct, Transaction, UserCard } from '../engine/types';
import type { AppData } from './DataProvider';
import type { CardInput } from '../engine/recommend';
import { calculateEarnings, type PeriodEarnings } from '../engine/earnings';
import { getPeriod } from '../engine/periods';
import { allPeriodEarnings } from '../engine/report';

export type SelectorData = Pick<AppData, 'userCards' | 'resolved' | 'transactions' | 'today'>;

export interface ActiveCard {
  userCard: UserCard;
  card: CardProduct;
  name: string;
}

export interface CardNow extends ActiveCard {
  earnings: PeriodEarnings;
}

export function nameOf(d: Pick<SelectorData, 'userCards' | 'resolved'>, userCardId: string): string {
  const uc = d.userCards.find((c) => c.id === userCardId);
  if (!uc) return 'Unknown card';
  const card = d.resolved[uc.id];
  return uc.nickname || (card ? `${card.bank} ${card.name}` : 'Unknown card');
}

export function activeCards(d: Pick<SelectorData, 'userCards' | 'resolved'>): ActiveCard[] {
  return d.userCards
    .filter((uc) => !uc.archived && d.resolved[uc.id])
    .map((uc) => ({ userCard: uc, card: d.resolved[uc.id], name: nameOf(d, uc.id) }));
}

export function txnsFor(transactions: Transaction[], userCardId: string): Transaction[] {
  return transactions.filter((t) => t.userCardId === userCardId);
}

export function cardInputs(d: SelectorData, includeArchived = false): CardInput[] {
  return d.userCards
    .filter((uc) => d.resolved[uc.id] && (includeArchived || !uc.archived))
    .map((uc) => ({ userCard: uc, card: d.resolved[uc.id], transactions: txnsFor(d.transactions, uc.id) }));
}

export function currentEarnings(d: SelectorData): CardNow[] {
  return activeCards(d).map((a) => ({
    ...a,
    earnings: calculateEarnings(a.card, txnsFor(d.transactions, a.userCard.id), getPeriod(a.card, d.today)),
  }));
}

export function earningsByTransaction(d: SelectorData): Map<string, number> {
  const out = new Map<string, number>();
  for (const { card, transactions } of cardInputs(d, true)) {
    for (const pe of allPeriodEarnings(card, transactions)) {
      for (const e of pe.perTransaction) out.set(e.transactionId, e.earnedRM);
    }
  }
  return out;
}
