import { BANK_IDS, CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUSES, type Statement, type Transaction, type UserCard } from '../engine/types';
import { validateCardProduct } from '../engine/validate';
import { resolveCard } from '../engine/resolve';
import { getProduct } from '../catalog';
import type { AppSnapshot } from './repository';

export const BACKUP_SCHEMA_VERSION = 2;

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

function stripPassword(c: UserCard): UserCard {
  const { pdfPassword, ...rest } = c;
  void pdfPassword;
  return rest;
}

export function makeBackup(s: AppSnapshot, exportedAt: string): BackupFile {
  return { app: 'cashback-tracker', schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt, ...s, userCards: s.userCards.map(stripPassword) };
}

/** Upgrade older backup shapes to the current one. Add a case per schema bump. */
function migrateBackup(raw: Obj): Obj {
  if (raw.schemaVersion === 1) return { ...raw, statements: [] };
  return raw; // v2 is current
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
  if (
    !Array.isArray(b.userCards) ||
    !Array.isArray(b.transactions) ||
    !Array.isArray(b.templates) ||
    !isObj(b.settings) ||
    !Array.isArray(b.statements)
  ) {
    return fail('Backup is missing required sections.');
  }

  const cardIds = new Set<string>();
  for (const c of b.userCards as UserCard[]) {
    if (
      !isObj(c) ||
      typeof c.id !== 'string' ||
      !(typeof c.productId === 'string' || c.productId === null) ||
      typeof c.archived !== 'boolean' ||
      !(c.last4 === undefined || (typeof c.last4 === 'string' && /^\d{4}$/.test(c.last4)))
    ) {
      return fail('A card in the backup is malformed.');
    }
    if (c.productId === null) {
      try {
        const errs = validateCardProduct(c.overrides);
        if (errs.length) return fail(`Custom card "${c.nickname}" is invalid: ${errs[0]}`);
      } catch {
        return fail(`Custom card "${c.nickname}" is invalid: malformed rules`);
      }
    } else if (c.overrides !== undefined) {
      const product = getProduct(c.productId);
      if (product) {
        // Unknown product ids are allowed: DataProvider shows such cards as broken.
        const name = c.nickname || c.id;
        let errs: string[];
        try {
          errs = isObj(c.overrides) ? validateCardProduct(resolveCard(c, product)) : ['overrides must be an object'];
        } catch {
          errs = ['malformed rules'];
        }
        if (errs.length) return fail(`Card "${name}" has invalid rule overrides: ${errs[0]}`);
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
    const okTemplate =
      isObj(t) &&
      typeof t.id === 'string' &&
      typeof t.userCardId === 'string' &&
      cardIds.has(t.userCardId) &&
      typeof t.amount === 'number' &&
      Number.isFinite(t.amount) &&
      (CATEGORIES as readonly string[]).includes(t.category as string) &&
      (PAYMENT_METHODS as readonly string[]).includes(t.paymentMethod as string) &&
      typeof t.startDate === 'string' &&
      DATE_RE.test(t.startDate) &&
      typeof t.active === 'boolean' &&
      (t.overseas === undefined || typeof t.overseas === 'boolean');
    if (!okTemplate) return fail('A recurring transaction in the backup is malformed.');
  }

  const s = b.settings as Obj;
  if (!isObj(s.pointValueOverrides) || !(s.lastBackupAt === null || typeof s.lastBackupAt === 'string')) return fail('Backup settings are malformed.');

  const statementIds = new Set<string>();
  for (const st of b.statements as Statement[]) {
    const okShape =
      isObj(st) &&
      typeof st.id === 'string' &&
      typeof st.userCardId === 'string' &&
      typeof st.statementDate === 'string' &&
      DATE_RE.test(st.statementDate) &&
      typeof st.dueDate === 'string' &&
      DATE_RE.test(st.dueDate) &&
      typeof st.statementBalance === 'number' &&
      Number.isFinite(st.statementBalance) &&
      typeof st.minimumDue === 'number' &&
      Number.isFinite(st.minimumDue) &&
      st.minimumDue >= 0 &&
      (st.source === 'reader' || st.source === 'manual') &&
      (st.readerBank === undefined || (BANK_IDS as readonly string[]).includes(st.readerBank)) &&
      (PAYMENT_STATUSES as readonly string[]).includes(st.paymentStatus) &&
      (st.paidAmount === undefined || (typeof st.paidAmount === 'number' && Number.isFinite(st.paidAmount))) &&
      (st.paidOn === undefined || (typeof st.paidOn === 'string' && DATE_RE.test(st.paidOn))) &&
      typeof st.createdAt === 'string';
    if (!okShape) return fail(`Statement ${isObj(st) ? String(st.id) : '?'} is malformed.`);
    if (!cardIds.has(st.userCardId)) return fail(`Statement ${st.id} refers to a card that is not in the backup.`);
    if (statementIds.has(st.id)) return fail(`Duplicate statement id ${st.id}.`);
    statementIds.add(st.id);
  }

  const data = {
    userCards: (b.userCards as UserCard[]).map(stripPassword),
    transactions: b.transactions,
    templates: b.templates,
    settings: b.settings,
    statements: b.statements,
  } as unknown as AppSnapshot;
  const dates = data.transactions.map((t) => t.date).sort();
  return {
    ok: true,
    data,
    summary: { cards: data.userCards.length, transactions: data.transactions.length, from: dates[0] ?? null, to: dates.at(-1) ?? null },
  };
}
