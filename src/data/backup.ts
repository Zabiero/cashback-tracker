import { CATEGORIES, PAYMENT_METHODS, type Transaction, type UserCard } from '../engine/types';
import { validateCardProduct } from '../engine/validate';
import type { AppSnapshot } from './repository';

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupFile extends AppSnapshot {
  app: 'cashback-tracker';
  schemaVersion: number;
  exportedAt: string;
}

export interface BackupSummary {
  cards: number;
  transactions: number;
  from: string | null;
  to: string | null;
}

export type ParseResult = { ok: true; data: AppSnapshot; summary: BackupSummary } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (error: string): ParseResult => ({ ok: false, error });

export function makeBackup(s: AppSnapshot, exportedAt: string): BackupFile {
  return { app: 'cashback-tracker', schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt, ...s };
}

/** Upgrade older backup shapes to the current one. Add a case per schema bump. */
function migrateBackup(raw: Obj): Obj {
  return raw; // v1 is current
}

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('This file is not valid JSON.');
  }
  if (!isObj(raw) || raw.app !== 'cashback-tracker') return fail('This is not a Cashback Tracker backup file.');
  if (typeof raw.schemaVersion !== 'number') return fail('Backup is missing its schema version.');
  if (raw.schemaVersion > BACKUP_SCHEMA_VERSION) return fail('This backup was made by a newer version of the app. Update the app and try again.');

  const b = migrateBackup(raw);
  if (!Array.isArray(b.userCards) || !Array.isArray(b.transactions) || !Array.isArray(b.templates) || !isObj(b.settings)) {
    return fail('Backup is missing required sections.');
  }

  const cardIds = new Set<string>();
  for (const c of b.userCards as UserCard[]) {
    if (!isObj(c) || typeof c.id !== 'string' || !(typeof c.productId === 'string' || c.productId === null) || typeof c.archived !== 'boolean') {
      return fail('A card in the backup is malformed.');
    }
    if (c.productId === null) {
      try {
        const errs = validateCardProduct(c.overrides);
        if (errs.length) return fail(`Custom card "${c.nickname}" is invalid: ${errs[0]}`);
      } catch {
        return fail(`Custom card "${c.nickname}" is invalid: malformed rules`);
      }
    }
    cardIds.add(c.id);
  }

  const txIds = new Set<string>();
  for (const t of b.transactions as Transaction[]) {
    const okShape =
      isObj(t) &&
      typeof t.id === 'string' &&
      typeof t.userCardId === 'string' &&
      typeof t.date === 'string' &&
      DATE_RE.test(t.date) &&
      typeof t.amount === 'number' &&
      Number.isFinite(t.amount) &&
      (CATEGORIES as readonly string[]).includes(t.category) &&
      (PAYMENT_METHODS as readonly string[]).includes(t.paymentMethod) &&
      typeof t.createdAt === 'string' &&
      (t.overseas === undefined || typeof t.overseas === 'boolean');
    if (!okShape) return fail(`Transaction ${isObj(t) ? String(t.id) : '?'} is malformed.`);
    if (!cardIds.has(t.userCardId)) return fail(`Transaction ${t.id} refers to a card that is not in the backup.`);
    if (txIds.has(t.id)) return fail(`Duplicate transaction id ${t.id}.`);
    txIds.add(t.id);
  }

  for (const t of b.templates as Obj[]) {
    if (!isObj(t) || typeof t.id !== 'string' || !cardIds.has(t.userCardId as string)) return fail('A recurring transaction in the backup is malformed.');
  }

  const s = b.settings as Obj;
  if (!isObj(s.pointValueOverrides) || !(s.lastBackupAt === null || typeof s.lastBackupAt === 'string')) return fail('Backup settings are malformed.');

  const data = { userCards: b.userCards, transactions: b.transactions, templates: b.templates, settings: b.settings } as unknown as AppSnapshot;
  const dates = data.transactions.map((t) => t.date).sort();
  return {
    ok: true,
    data,
    summary: { cards: data.userCards.length, transactions: data.transactions.length, from: dates[0] ?? null, to: dates.at(-1) ?? null },
  };
}
