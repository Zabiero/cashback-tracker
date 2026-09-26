import type { RecurringTemplate, Settings, Statement, Transaction, UserCard } from '../engine/types';

export interface TransactionFilter {
  userCardId?: string;
  from?: string;
  to?: string;
}

export interface AppSnapshot {
  userCards: UserCard[];
  transactions: Transaction[];
  templates: RecurringTemplate[];
  settings: Settings;
  statements: Statement[];
}

export const DEFAULT_SETTINGS: Settings = { schemaVersion: 1, lastBackupAt: null, pointValueOverrides: {} };

/** The only storage API the UI uses. v1: Dexie. Later: a cloud-sync implementation. */
export interface Repository {
  listUserCards(): Promise<UserCard[]>;
  saveUserCard(card: UserCard): Promise<void>;
  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>;
  saveTransaction(tx: Transaction): Promise<void>;
  saveTransactions(txs: Transaction[]): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  listTemplates(): Promise<RecurringTemplate[]>;
  saveTemplate(t: RecurringTemplate): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  listStatements(): Promise<Statement[]>;
  saveStatement(s: Statement): Promise<void>;
  deleteStatement(id: string): Promise<void>;
  exportAll(): Promise<AppSnapshot>;
  replaceAll(snapshot: AppSnapshot): Promise<void>;
}
