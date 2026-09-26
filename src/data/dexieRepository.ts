import Dexie, { type Table } from 'dexie';
import type { RecurringTemplate, Settings, Statement, Transaction, UserCard } from '../engine/types';
import { DEFAULT_SETTINGS, type AppSnapshot, type Repository, type TransactionFilter } from './repository';

type SettingsRow = Settings & { key: 'app' };

class CashbackDB extends Dexie {
  userCards!: Table<UserCard, string>;
  transactions!: Table<Transaction, string>;
  templates!: Table<RecurringTemplate, string>;
  settings!: Table<SettingsRow, string>;
  statements!: Table<Statement, string>;

  constructor(name: string) {
    super(name);
    // Schema migrations: add this.version(3).stores({...}).upgrade(tx => ...) for the next shape change.
    this.version(1).stores({ userCards: 'id', transactions: 'id, userCardId, date', templates: 'id', settings: 'key' });
    this.version(2).stores({ statements: 'id, userCardId, dueDate' });
  }
}

export class DexieRepository implements Repository {
  private db: CashbackDB;

  constructor(name = 'cashback-tracker') {
    this.db = new CashbackDB(name);
  }

  listUserCards() {
    return this.db.userCards.toArray();
  }
  async saveUserCard(card: UserCard) {
    await this.db.userCards.put(card);
  }
  async listTransactions(f: TransactionFilter = {}) {
    let rows = f.userCardId
      ? await this.db.transactions.where('userCardId').equals(f.userCardId).toArray()
      : await this.db.transactions.toArray();
    if (f.from) rows = rows.filter((t) => t.date >= f.from!);
    if (f.to) rows = rows.filter((t) => t.date <= f.to!);
    return rows;
  }
  async saveTransaction(tx: Transaction) {
    await this.db.transactions.put(tx);
  }
  async saveTransactions(txs: Transaction[]) {
    await this.db.transactions.bulkPut(txs);
  }
  async deleteTransaction(id: string) {
    await this.db.transactions.delete(id);
  }
  listTemplates() {
    return this.db.templates.toArray();
  }
  async saveTemplate(t: RecurringTemplate) {
    await this.db.templates.put(t);
  }
  async getSettings(): Promise<Settings> {
    const row = await this.db.settings.get('app');
    if (!row) return { ...DEFAULT_SETTINGS, pointValueOverrides: {} };
    return { schemaVersion: row.schemaVersion, lastBackupAt: row.lastBackupAt, pointValueOverrides: row.pointValueOverrides };
  }
  async saveSettings(s: Settings) {
    await this.db.settings.put({ ...s, key: 'app' });
  }
  listStatements() {
    return this.db.statements.toArray();
  }
  async saveStatement(s: Statement) {
    await this.db.statements.put(s);
  }
  async deleteStatement(id: string) {
    await this.db.statements.delete(id);
  }
  async exportAll(): Promise<AppSnapshot> {
    return {
      userCards: await this.listUserCards(),
      transactions: await this.listTransactions(),
      templates: await this.listTemplates(),
      settings: await this.getSettings(),
      statements: await this.listStatements(),
    };
  }
  async replaceAll(s: AppSnapshot) {
    const { userCards, transactions, templates, settings, statements } = this.db;
    await this.db.transaction('rw', [userCards, transactions, templates, settings, statements], async () => {
      await Promise.all([userCards.clear(), transactions.clear(), templates.clear(), settings.clear(), statements.clear()]);
      await userCards.bulkPut(s.userCards);
      await transactions.bulkPut(s.transactions);
      await templates.bulkPut(s.templates);
      await settings.put({ ...s.settings, key: 'app' });
      await statements.bulkPut(s.statements ?? []);
    });
  }
}
