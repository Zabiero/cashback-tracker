import type { CardProduct, Statement, Transaction } from '../engine/types';
import type { Period } from '../engine/periods';

let seq = 0;

export function tx(p: Partial<Transaction> & { amount: number }): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    userCardId: 'c1',
    date: '2026-09-10',
    category: 'others',
    paymentMethod: 'physical',
    createdAt: `c${String(seq).padStart(8, '0')}`,
    ...p,
  };
}

export function card(p: Partial<CardProduct> = {}): CardProduct {
  return {
    id: 'test-card',
    bank: 'Test Bank',
    name: 'Test Card',
    rewardType: 'cashback',
    periodType: 'calendar',
    rules: [{ id: 'all', label: 'All spend', rate: 0.01 }],
    sourceUrl: '',
    verifiedOn: null,
    catalogVersion: 1,
    ...p,
  };
}

export const SEP: Period = { start: '2026-09-01', end: '2026-09-30' };

export function statement(p: Partial<Statement> = {}): Statement {
  seq += 1;
  return {
    id: `s${seq}`,
    userCardId: 'uc1',
    statementDate: '2026-09-08',
    dueDate: '2026-09-28',
    statementBalance: 1234.5,
    minimumDue: 61.73,
    source: 'manual',
    paymentStatus: 'unpaid',
    createdAt: `c${String(seq).padStart(8, '0')}`,
    ...p,
  };
}
