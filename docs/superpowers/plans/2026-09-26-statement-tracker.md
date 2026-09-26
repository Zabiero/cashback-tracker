# Statement & Payment Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monthly statement tracking (statement balance, minimum due, due date) to the cashback tracker, with free in-browser PDF reading for Maybank, RHB, UOB and Alliance Bank, a Bills screen, payment status, calendar reminders and a Dashboard panel.

**Architecture:** New `Statement` records stored in a new Dexie table (schema v2) behind the existing `Repository`. Pure logic in `src/statements/` (parsing helpers, sanity checks, status, `.ics` builder, bank detection, per-bank readers, read orchestration). PDF text extraction uses Mozilla PDF.js (`pdfjs-dist`), loaded lazily. UI: new Bills screen (`/bills`), Cards additions (last 4 digits, forget PDF password), Dashboard "Upcoming payments" panel.

**Tech Stack:** Existing (Vite 8, React 19, TypeScript strict, Dexie 4, Vitest 5 + Testing Library + jsdom + fake-indexeddb, Playwright) + `pdfjs-dist` (runtime) + `pdfkit` / `@types/pdfkit` (dev, tests only).

**Spec:** `docs/superpowers/specs/2026-09-25-statement-tracker-design.md`

## Global Constraints

- **Free only:** no paid services, no AI, no API keys. New libraries must be free and open source.
- **Public repository:** never commit anything from `statements-samples/` (git-ignored) or any personal data: no names, addresses, IC numbers, account or full card numbers, real amounts, or real dates from the user's statements. Never write a PDF password into any file, commit, or report.
- Browser-only; data stays on the device. English UI; RM only; money formatted with `formatRM`.
- Dates are local ISO strings `YYYY-MM-DD`; "today" always comes from `useAppData().today` (tests: `FIXED_TODAY = '2026-09-24'`).
- Existing user data must survive the Dexie schema upgrade (v1 → v2).
- Backups never contain `pdfPassword`.
- Commits: end with `Co-Authored-By: <model name> <noreply@anthropic.com>` naming the model that authored the commit.
- Command-line deletes are blocked in this environment; report paths instead.
- Work on branch `feat/statement-tracker` (created by the controller).

## Review Focus

1. **Upgrading the user's existing database** (real data from v1) must keep every card, transaction, template and setting. Pinned in Task 1 (Dexie v1→v2 upgrade test).
2. **PII leaking into the public repo** through reader fixtures. Pinned in Task 6 (fixture PII-scan test) and reviewer checks in Tasks 6/7.
3. **Password retries** — PDF.js detaches the `ArrayBuffer` it is given, so a second attempt with another password on the same buffer fails silently. Pinned in Task 8 (retry test that detects a detached buffer).
4. **Credit or zero balance statements** (`1,234.56 CR`, `0.00`) must parse and pass checks (minimum due RM0). Pinned in Task 3.
5. **Duplicate upload of the same statement** must ask to replace rather than create two records. Pinned in Task 10.

---

## File Structure

```
src/engine/types.ts                 + BankId, BANK_IDS, PaymentStatus, PAYMENT_STATUSES, Statement; UserCard.last4/pdfPassword
src/data/repository.ts              + statements in AppSnapshot/Repository
src/data/dexieRepository.ts         + Dexie version(2) statements table
src/data/backup.ts                  schema v2, statements, strip pdfPassword
src/app/DataProvider.tsx            + statements in AppData
src/app/Layout.tsx                  + Bills nav/route
src/statements/
  logic.ts                          parseAmount, parseStatementDate, checkStatement, statementStatus, upcomingPayments, findDuplicate
  ics.ts                            makeIcs, icsStamp
  pdfText.ts                        itemsToLines, extractPdfText (lazy pdf.js)
  banks.ts                          BANK_LABELS, detectBank, bankIdForBankName
  readers/helpers.ts                valueNear, allMatches
  readers/index.ts                  READERS registry, ReadCard/ReadResult/BankReader types
  readers/maybank.ts, rhb.ts, uob.ts, alliance.ts
  fixtures/<bank>-1.txt ...         sanitized text fixtures
  readStatement.ts                  readStatement orchestration, matchCard
scripts/extract-statement-text.ts   dev-only: PDF → .txt next to the PDF (inside statements-samples/)
src/features/bills/
  BillsPage.tsx, StatementForm.tsx, MarkPaidForm.tsx, UploadStatement.tsx
src/features/dashboard/UpcomingPayments.tsx
src/features/cards/CardsPage.tsx    + Last4Form, forget password
src/lib/download.ts                 downloadText(filename, text, type?)
```

---

### Task 1: Data model, Dexie v2 and DataProvider

**Files:**
- Modify: `src/engine/types.ts`, `src/data/repository.ts`, `src/data/dexieRepository.ts`, `src/app/DataProvider.tsx`, `src/test/fixtures.ts`, any test or code that constructs an `AppSnapshot` (add `statements: []`)
- Test: `src/data/dexieRepository.test.ts`

**Interfaces:**
- Produces:
  - `BANK_IDS`, `type BankId = 'maybank'|'rhb'|'uob'|'alliance'|'pbb'|'aeon'`
  - `PAYMENT_STATUSES`, `type PaymentStatus = 'unpaid'|'paidFull'|'paidMin'|'paidPartial'`
  - `interface Statement { id; userCardId; statementDate; dueDate; statementBalance; minimumDue; source: 'reader'|'manual'; readerBank?: BankId; paymentStatus: PaymentStatus; paidAmount?: number; paidOn?: string; createdAt: string }`
  - `UserCard.last4?: string`, `UserCard.pdfPassword?: string`
  - `AppSnapshot.statements: Statement[]`; `Repository.listStatements()`, `saveStatement(s)`, `deleteStatement(id)`
  - `AppData.statements: Statement[]`
  - fixture `statement(partial?) → Statement`

- [ ] **Step 1: Add types** to `src/engine/types.ts` (append; also add the two optional fields to `UserCard`):

```ts
export const BANK_IDS = ['maybank', 'rhb', 'uob', 'alliance', 'pbb', 'aeon'] as const;
export type BankId = (typeof BANK_IDS)[number];

export const PAYMENT_STATUSES = ['unpaid', 'paidFull', 'paidMin', 'paidPartial'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Statement {
  id: string;
  userCardId: string;
  statementDate: string;
  dueDate: string;
  statementBalance: number; // RM; negative = credit balance
  minimumDue: number; // RM, >= 0
  source: 'reader' | 'manual';
  readerBank?: BankId;
  paymentStatus: PaymentStatus;
  paidAmount?: number;
  paidOn?: string;
  createdAt: string;
}
```

In `interface UserCard` add:
```ts
  last4?: string; // 4 digits; matches uploaded statements to this card
  pdfPassword?: string; // only when the user ticked "remember on this device"
```

- [ ] **Step 2: Add the fixture** to `src/test/fixtures.ts` (import `Statement`):

```ts
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
```

- [ ] **Step 3: Write failing tests** — add to `src/data/dexieRepository.test.ts`:

```ts
import Dexie from 'dexie';
import { statement } from '../test/fixtures';

describe('statements', () => {
  it('saves, lists and deletes statements', async () => {
    const r = repo();
    const s = statement({ id: 'a' });
    await r.saveStatement(s);
    expect(await r.listStatements()).toEqual([s]);
    await r.deleteStatement('a');
    expect(await r.listStatements()).toEqual([]);
  });

  it('includes statements in export and replace', async () => {
    const r = repo();
    await r.saveUserCard(uc);
    await r.saveStatement(statement({ id: 'a', userCardId: 'u1' }));
    const snap = await r.exportAll();
    expect(snap.statements).toHaveLength(1);
    const other = repo();
    await other.saveStatement(statement({ id: 'old' }));
    await other.replaceAll(snap);
    expect((await other.listStatements()).map((s) => s.id)).toEqual(['a']);
  });

  it('upgrades a version-1 database without losing data', async () => {
    const name = `upgrade-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ userCards: 'id', transactions: 'id, userCardId, date', templates: 'id', settings: 'key' });
    await v1.table('userCards').put(uc);
    await v1.table('transactions').put(tx({ id: 't1', userCardId: 'u1', amount: 10 }));
    await v1.table('settings').put({ key: 'app', schemaVersion: 1, lastBackupAt: '2026-09-01', pointValueOverrides: { x: 0.01 } });
    v1.close();

    const upgraded = new DexieRepository(name);
    expect(await upgraded.listUserCards()).toEqual([uc]);
    expect((await upgraded.listTransactions()).map((t) => t.id)).toEqual(['t1']);
    expect((await upgraded.getSettings()).lastBackupAt).toBe('2026-09-01');
    expect(await upgraded.listStatements()).toEqual([]);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/data/dexieRepository.test.ts`
Expected: FAIL — `saveStatement` / `listStatements` do not exist.

- [ ] **Step 5: Implement repository changes**

`src/data/repository.ts`: add `statements: Statement[]` to `AppSnapshot`; add to `Repository`:
```ts
  listStatements(): Promise<Statement[]>;
  saveStatement(s: Statement): Promise<void>;
  deleteStatement(id: string): Promise<void>;
```

`src/data/dexieRepository.ts`:
```ts
  statements!: Table<Statement, string>;
  // in the constructor, after version(1):
  this.version(2).stores({ statements: 'id, userCardId, dueDate' });
```
Methods:
```ts
  listStatements() {
    return this.db.statements.toArray();
  }
  async saveStatement(s: Statement) {
    await this.db.statements.put(s);
  }
  async deleteStatement(id: string) {
    await this.db.statements.delete(id);
  }
```
`exportAll` adds `statements: await this.listStatements()`. `replaceAll` adds the `statements` table to the transaction, clears it and `bulkPut(s.statements ?? [])`.

- [ ] **Step 6: DataProvider** — `Loaded` and `AppData` gain `statements: Statement[]`; `refresh` also calls `repo.listStatements()`.

- [ ] **Step 7: Fix compile errors** — run `npm run build`; add `statements: []` wherever a test or code builds an `AppSnapshot` (e.g. `src/data/backup.test.ts`, `src/features/settings/SettingsPage.test.tsx`). Do not change behaviour elsewhere.

- [ ] **Step 8: Run tests** — `npm test` and `npm run build`. Expected: all pass.

- [ ] **Step 9: Commit** — `feat(data): statements table (Dexie v2) and card last4/pdfPassword fields`

---

### Task 2: Backup schema v2

**Files:**
- Modify: `src/data/backup.ts`
- Test: `src/data/backup.test.ts`

**Interfaces:**
- Consumes: `Statement`, `BANK_IDS`, `PAYMENT_STATUSES` (Task 1)
- Produces: `BACKUP_SCHEMA_VERSION = 2`; `makeBackup` strips `pdfPassword` from every user card; `parseBackup` accepts v1 (adds `statements: []`) and v2, validates statements, validates optional `last4` (`/^\d{4}$/`), and strips any `pdfPassword`.

- [ ] **Step 1: Write failing tests** (add to `src/data/backup.test.ts`; `snap()` already has `statements: []` from Task 1):

```ts
import { statement } from '../test/fixtures';

describe('backup v2', () => {
  it('round-trips statements', () => {
    const base = { ...snap(), statements: [statement({ id: 'st1', userCardId: 'u1' })] };
    const r = parseBackup(JSON.stringify(makeBackup(base, 'x')));
    expect(r.ok && r.data.statements).toEqual(base.statements);
  });
  it('imports a version-1 backup with no statements', () => {
    const b = { ...makeBackup(snap(), 'x'), schemaVersion: 1 } as Record<string, unknown>;
    delete b.statements;
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.data.statements).toEqual([]);
  });
  it('never exports or imports saved PDF passwords', () => {
    const s = snap();
    s.userCards[0] = { ...s.userCards[0], pdfPassword: 'secret', last4: '1234' };
    const file = makeBackup(s, 'x');
    expect(JSON.stringify(file)).not.toContain('secret');
    expect(file.userCards[0].last4).toBe('1234');
    const tampered = { ...file, userCards: [{ ...file.userCards[0], pdfPassword: 'secret' }] };
    const r = parseBackup(JSON.stringify(tampered));
    expect(r.ok && r.data.userCards[0].pdfPassword).toBeUndefined();
  });
  it('rejects malformed statements and bad last4', () => {
    const bad = { ...snap(), statements: [statement({ id: 'st1', userCardId: 'u1', minimumDue: -1 })] };
    expect(parseBackup(JSON.stringify(makeBackup(bad, 'x')))).toEqual({ ok: false, error: 'Statement st1 is malformed.' });
    const orphan = { ...snap(), statements: [statement({ id: 'st2', userCardId: 'nope' })] };
    expect(parseBackup(JSON.stringify(makeBackup(orphan, 'x')))).toEqual({ ok: false, error: 'Statement st2 refers to a card that is not in the backup.' });
    const s = snap();
    s.userCards[0] = { ...s.userCards[0], last4: '12a4' };
    expect(parseBackup(JSON.stringify(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'A card in the backup is malformed.' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/data/backup.test.ts` → FAIL.

- [ ] **Step 3: Implement**
  - `BACKUP_SCHEMA_VERSION = 2`.
  - `makeBackup`: `userCards: s.userCards.map(stripPassword)` where
    ```ts
    function stripPassword(c: UserCard): UserCard {
      const { pdfPassword, ...rest } = c;
      void pdfPassword;
      return rest;
    }
    ```
  - `migrateBackup`: `if (raw.schemaVersion === 1) return { ...raw, statements: [] };` (comment: add a case per schema bump).
  - Section check also requires `Array.isArray(b.statements)`.
  - Card check adds `(c.last4 === undefined || (typeof c.last4 === 'string' && /^\d{4}$/.test(c.last4)))`.
  - After templates, validate statements: `id` string; `userCardId` in `cardIds` (else `Statement <id> refers to a card that is not in the backup.`); `statementDate`/`dueDate` match `DATE_RE`; `statementBalance` finite; `minimumDue` finite and `>= 0`; `source` is `'reader'|'manual'`; `readerBank` undefined or in `BANK_IDS`; `paymentStatus` in `PAYMENT_STATUSES`; `paidAmount` undefined or finite; `paidOn` undefined or `DATE_RE`; `createdAt` string. Shape failure → `Statement <id> is malformed.`; duplicate id → `Duplicate statement id <id>.`
  - Returned `data.userCards` are passed through `stripPassword`; `data.statements = b.statements`.

- [ ] **Step 4: Run tests** — `npx vitest run src/data`, then `npm test`, `npm run build`. Expected: PASS (update the existing "newer version" test only if it used schemaVersion 2).

- [ ] **Step 5: Commit** — `feat(data): backup schema v2 with statements; never store PDF passwords in backups`

---

### Task 3: Statement logic

**Files:**
- Create: `src/statements/logic.ts`
- Test: `src/statements/logic.test.ts`

**Interfaces:**
- Consumes: `Statement` (Task 1); `daysBetween`, `toISODate`, `parseISODate` (`src/engine/dates.ts`); `round2`; `formatRM`
- Produces:
  - `interface StatementValues { statementDate?: string; dueDate?: string; statementBalance?: number; minimumDue?: number }`
  - `interface StatementIssue { field: keyof StatementValues; message: string; missing: boolean }`
  - `parseAmount(s) → number | null`, `parseStatementDate(s) → string | null`
  - `checkStatement(v, today) → StatementIssue[]`
  - `interface StatusInfo { tone: 'overdue'|'soon'|'later'|'paid'; label: string; daysLeft: number | null }`, `statementStatus(s, today) → StatusInfo`
  - `upcomingPayments(statements, today, windowDays = 14) → Statement[]`
  - `findDuplicate(statements, { id, userCardId, statementDate }) → Statement | undefined`

- [ ] **Step 1: Write failing tests** — `src/statements/logic.test.ts`:

```ts
import { checkStatement, findDuplicate, parseAmount, parseStatementDate, statementStatus, upcomingPayments } from './logic';
import { statement } from '../test/fixtures';

const TODAY = '2026-09-24';

describe('parseAmount', () => {
  it.each([
    ['1,234.56', 1234.56], ['RM1,234.56', 1234.56], ['RM 20', 20], ['0.00', 0],
    ['1,234.56 CR', -1234.56], ['1,234.56CR', -1234.56], ['-50.10', -50.1], ['50.10 DR', 50.1],
  ])('parses %s', (s, n) => expect(parseAmount(s)).toBe(n));
  it.each(['', 'abc', '1.2.3', 'RM'])('rejects %s', (s) => expect(parseAmount(s)).toBeNull());
});

describe('parseStatementDate', () => {
  it.each([
    ['08/09/2026', '2026-09-08'], ['8-9-26', '2026-09-08'], ['08.09.2026', '2026-09-08'],
    ['08 SEP 2026', '2026-09-08'], ['08 Sep 26', '2026-09-08'], ['08SEP26', '2026-09-08'],
    ['8 September 2026', '2026-09-08'], ['08-Sep-2026', '2026-09-08'], ['Sep 8, 2026', '2026-09-08'],
    ['08 OGO 2026', '2026-08-08'], ['08 Dis 26', '2026-12-08'],
  ])('parses %s', (s, iso) => expect(parseStatementDate(s)).toBe(iso));
  it.each(['31/02/2026', '2026-09-08x', 'hello', '08 XYZ 2026'])('rejects %s', (s) => expect(parseStatementDate(s)).toBeNull());
});

describe('checkStatement', () => {
  const ok = { statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 1000, minimumDue: 50 };
  it('accepts a normal statement', () => expect(checkStatement(ok, TODAY)).toEqual([]));
  it('accepts a credit balance with zero minimum', () =>
    expect(checkStatement({ ...ok, statementBalance: -20, minimumDue: 0 }, TODAY)).toEqual([]));
  it('reports missing values', () =>
    expect(checkStatement({}, TODAY).map((i) => [i.field, i.missing])).toEqual([
      ['statementDate', true], ['dueDate', true], ['statementBalance', true], ['minimumDue', true],
    ]));
  it('checks the due date gap', () =>
    expect(checkStatement({ ...ok, dueDate: '2026-09-12' }, TODAY)).toEqual([
      { field: 'dueDate', message: 'Due date must be 10–35 days after the statement date', missing: false },
    ]));
  it('checks the minimum due', () => {
    expect(checkStatement({ ...ok, minimumDue: 2000 }, TODAY)[0].message).toBe('Minimum due must be between RM0 and the statement balance');
    expect(checkStatement({ ...ok, statementBalance: 0, minimumDue: 5 }, TODAY)[0].message).toBe('Minimum due must be RM0 when the balance is zero or in credit');
  });
  it('rejects a future statement date', () =>
    expect(checkStatement({ ...ok, statementDate: '2026-09-30', dueDate: '2026-10-20' }, TODAY)[0]).toEqual({
      field: 'statementDate', message: 'Statement date cannot be in the future', missing: false,
    }));
});

describe('statementStatus', () => {
  it.each([
    ['2026-09-20', 'overdue', 'Overdue by 4 days'],
    ['2026-09-23', 'overdue', 'Overdue by 1 day'],
    ['2026-09-24', 'soon', 'Due today'],
    ['2026-09-25', 'soon', 'Due in 1 day'],
    ['2026-10-01', 'soon', 'Due in 7 days'],
    ['2026-10-02', 'later', 'Due in 8 days'],
  ])('due %s → %s %s', (dueDate, tone, label) =>
    expect(statementStatus(statement({ dueDate }), TODAY)).toMatchObject({ tone, label }));
  it('labels paid statements', () => {
    expect(statementStatus(statement({ paymentStatus: 'paidFull' }), TODAY)).toEqual({ tone: 'paid', label: 'Paid in full', daysLeft: null });
    expect(statementStatus(statement({ paymentStatus: 'paidMin' }), TODAY).label).toBe('Paid minimum');
    expect(statementStatus(statement({ paymentStatus: 'paidPartial', paidAmount: 300 }), TODAY).label).toBe('Paid RM300.00');
  });
});

describe('upcomingPayments / findDuplicate', () => {
  it('lists unpaid statements due within the window, soonest (incl. overdue) first', () => {
    const a = statement({ id: 'a', dueDate: '2026-10-05' });
    const b = statement({ id: 'b', dueDate: '2026-09-20' });
    const c = statement({ id: 'c', dueDate: '2026-10-09' }); // 15 days away
    const d = statement({ id: 'd', dueDate: '2026-09-26', paymentStatus: 'paidFull' });
    expect(upcomingPayments([a, b, c, d], TODAY).map((s) => s.id)).toEqual(['b', 'a']);
  });
  it('finds another statement for the same card and date', () => {
    const a = statement({ id: 'a' });
    expect(findDuplicate([a], { id: 'new', userCardId: a.userCardId, statementDate: a.statementDate })).toBe(a);
    expect(findDuplicate([a], { id: 'a', userCardId: a.userCardId, statementDate: a.statementDate })).toBeUndefined();
    expect(findDuplicate([a], { id: 'new', userCardId: 'other', statementDate: a.statementDate })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/statements` → FAIL (module missing).

- [ ] **Step 3: Implement `src/statements/logic.ts`**

```ts
import type { Statement } from '../engine/types';
import { daysBetween, parseISODate, toISODate } from '../engine/dates';
import { round2 } from '../engine/earnings';
import { formatRM } from '../lib/money';

export interface StatementValues {
  statementDate?: string;
  dueDate?: string;
  statementBalance?: number;
  minimumDue?: number;
}

export interface StatementIssue {
  field: keyof StatementValues;
  message: string;
  missing: boolean;
}

/** "1,234.56", "RM1,234.56", "1,234.56 CR" (credit → negative), "-50.10", "50.10 DR". */
export function parseAmount(raw: string): number | null {
  const m = raw.trim().match(/^(-)?\s*(?:RM\s*)?(-)?\s*(\d[\d,]*(?:\.\d{1,2})?|\.\d{1,2})\s*(CR|DR)?$/i);
  if (!m) return null;
  const digits = m[3].replace(/,/g, '');
  if (!/^\d*(\.\d{1,2})?$/.test(digits)) return null;
  const n = Number(digits);
  const negative = Boolean(m[1] || m[2]) || m[4]?.toUpperCase() === 'CR';
  return round2(negative ? -n : n);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7,
  aug: 8, ogo: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};

function makeDate(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  const iso = toISODate(year, m, d);
  const p = parseISODate(iso);
  return p.y === year && p.m === m && p.d === d ? iso : null;
}

/** dd/mm/yyyy, d-m-yy, dd.mm.yyyy, dd MMM yyyy, ddMMMyy, dd-MMM-yyyy, MMM d, yyyy (English and Malay month names). */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return makeDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[ -]?([a-z]{3})[a-z]*[ -]?(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2]]) return makeDate(+m[3], MONTHS[m[2]], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$/);
  if (m && MONTHS[m[1]]) return makeDate(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

export function checkStatement(v: StatementValues, today: string): StatementIssue[] {
  const issues: StatementIssue[] = [];
  const missing = (field: keyof StatementValues, message: string) => issues.push({ field, message, missing: true });
  if (!v.statementDate) missing('statementDate', 'Statement date is missing');
  if (!v.dueDate) missing('dueDate', 'Due date is missing');
  if (v.statementBalance == null || !Number.isFinite(v.statementBalance)) missing('statementBalance', 'Statement balance is missing');
  if (v.minimumDue == null || !Number.isFinite(v.minimumDue)) missing('minimumDue', 'Minimum due is missing');

  if (v.statementDate && v.dueDate) {
    const gap = daysBetween(v.statementDate, v.dueDate);
    if (gap < 10 || gap > 35) issues.push({ field: 'dueDate', message: 'Due date must be 10–35 days after the statement date', missing: false });
  }
  if (v.statementBalance != null && v.minimumDue != null && Number.isFinite(v.statementBalance) && Number.isFinite(v.minimumDue)) {
    if (v.statementBalance > 0) {
      if (v.minimumDue < 0 || v.minimumDue > v.statementBalance) {
        issues.push({ field: 'minimumDue', message: 'Minimum due must be between RM0 and the statement balance', missing: false });
      }
    } else if (v.minimumDue !== 0) {
      issues.push({ field: 'minimumDue', message: 'Minimum due must be RM0 when the balance is zero or in credit', missing: false });
    }
  }
  if (v.statementDate && v.statementDate > today) {
    issues.push({ field: 'statementDate', message: 'Statement date cannot be in the future', missing: false });
  }
  return issues;
}

export interface StatusInfo {
  tone: 'overdue' | 'soon' | 'later' | 'paid';
  label: string;
  daysLeft: number | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function statementStatus(s: Statement, today: string): StatusInfo {
  if (s.paymentStatus === 'paidFull') return { tone: 'paid', label: 'Paid in full', daysLeft: null };
  if (s.paymentStatus === 'paidMin') return { tone: 'paid', label: 'Paid minimum', daysLeft: null };
  if (s.paymentStatus === 'paidPartial') return { tone: 'paid', label: `Paid ${formatRM(s.paidAmount ?? 0)}`, daysLeft: null };
  const days = daysBetween(today, s.dueDate);
  if (days < 0) return { tone: 'overdue', label: `Overdue by ${plural(-days, 'day')}`, daysLeft: days };
  if (days === 0) return { tone: 'soon', label: 'Due today', daysLeft: 0 };
  return { tone: days <= 7 ? 'soon' : 'later', label: `Due in ${plural(days, 'day')}`, daysLeft: days };
}

export function upcomingPayments(statements: Statement[], today: string, windowDays = 14): Statement[] {
  return statements
    .filter((s) => s.paymentStatus === 'unpaid' && daysBetween(today, s.dueDate) <= windowDays)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function findDuplicate(
  statements: Statement[],
  c: Pick<Statement, 'id' | 'userCardId' | 'statementDate'>,
): Statement | undefined {
  return statements.find((s) => s.id !== c.id && s.userCardId === c.userCardId && s.statementDate === c.statementDate);
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/statements` → PASS; `npm test`, `npm run build`.

- [ ] **Step 5: Commit** — `feat(statements): amount/date parsing, sanity checks, payment status`

---

### Task 4: Calendar file

**Files:**
- Create: `src/statements/ics.ts`
- Modify: `src/lib/download.ts` (optional MIME type)
- Test: `src/statements/ics.test.ts`

**Interfaces:**
- Produces: `makeIcs(statement, cardName, stamp) → string`; `icsStamp(now: Date) → string` (e.g. `20260926T101500Z`); `downloadText(filename, text, type = 'application/json')`

- [ ] **Step 1: Write failing tests** — `src/statements/ics.test.ts`:

```ts
import { icsStamp, makeIcs } from './ics';
import { statement } from '../test/fixtures';

describe('makeIcs', () => {
  it('builds an all-day event with 9am alerts 3 days and 1 day before', () => {
    const ics = makeIcs(statement({ id: 'st1', dueDate: '2026-09-28', statementBalance: 1234.5, minimumDue: 50 }), 'UOB One', '20260926T101500Z');
    expect(ics).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Cashback Tracker//Bills//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        'UID:st1@cashback-tracker',
        'DTSTAMP:20260926T101500Z',
        'DTSTART;VALUE=DATE:20260928',
        'DTEND;VALUE=DATE:20260929',
        'SUMMARY:Pay UOB One: RM1\\,234.50 (min RM50.00)',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Pay UOB One: RM1\\,234.50 (min RM50.00)',
        'TRIGGER:-P2DT15H',
        'END:VALARM',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Pay UOB One: RM1\\,234.50 (min RM50.00)',
        'TRIGGER:-PT15H',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });
  it('escapes special characters and folds long lines at 75 characters', () => {
    const ics = makeIcs(statement({ id: 'x' }), 'My; very, long\\card name that goes on and on and on and on', '20260926T101500Z');
    const summary = ics.split('\r\n').filter((l) => l.startsWith('SUMMARY') || l.startsWith(' '));
    expect(summary[0].length).toBeLessThanOrEqual(75);
    expect(summary.join('\r\n').replace(/\r\n /g, '')).toContain('My\\; very\\, long\\\\card name');
  });
  it('formats the stamp in UTC', () => {
    expect(icsStamp(new Date(Date.UTC(2026, 8, 26, 10, 15, 0)))).toBe('20260926T101500Z');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/statements/ics.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/statements/ics.ts`**

```ts
import type { Statement } from '../engine/types';
import { addDays } from '../engine/dates';
import { formatRM } from '../lib/money';

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 line folding: max 75 octets per line, continuation lines start with a space. */
function fold(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out;
}

export function icsStamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

/** All-day event on the due date; alerts at 09:00 three days and one day before. */
export function makeIcs(s: Statement, cardName: string, stamp: string): string {
  const day = (iso: string) => iso.replace(/-/g, '');
  const summary = escapeText(`Pay ${cardName}: ${formatRM(s.statementBalance)} (min ${formatRM(s.minimumDue)})`);
  const alarm = (trigger: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, `TRIGGER:${trigger}`, 'END:VALARM'];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cashback Tracker//Bills//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${s.id}@cashback-tracker`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(s.dueDate)}`,
    `DTEND;VALUE=DATE:${day(addDays(s.dueDate, 1))}`,
    `SUMMARY:${summary}`,
    ...alarm('-P2DT15H'),
    ...alarm('-PT15H'),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
```

`src/lib/download.ts`: `export function downloadText(filename: string, text: string, type = 'application/json')` and use `type` in the Blob.

- [ ] **Step 4: Run tests** — `npx vitest run src/statements`, `npm test`, `npm run build` → PASS.

- [ ] **Step 5: Commit** — `feat(statements): calendar (.ics) reminder file`

---

### Task 5: PDF text extraction

**Files:**
- Create: `src/statements/pdfText.ts`, `scripts/extract-statement-text.ts`
- Modify: `package.json` (deps + `extract-statement` script)
- Test: `src/statements/pdfText.test.ts`

**Interfaces:**
- Produces:
  - `interface PdfTextItem { str: string; x: number; y: number }`
  - `itemsToLines(items) → string[]` (pure)
  - `type PdfTextResult = { ok: true; pages: string[] } | { ok: false; reason: 'needsPassword' | 'wrongPassword' | 'notPdf' | 'noText' }` — each page is its lines joined with `\n`
  - `extractPdfText(data: ArrayBuffer | Uint8Array, password?: string) → Promise<PdfTextResult>` — lazily imports PDF.js; never throws for these four cases.
  - npm script `extract-statement` — dev only: `npm run extract-statement -- "statements-samples/<file>.pdf" [password]` writes `<file>.txt` next to the PDF.

- [ ] **Step 1: Install**

```
npm install pdfjs-dist
npm install -D pdfkit @types/pdfkit
```
If a TypeScript runner is needed for the dev script, use `npx vite-node` if available with this Vitest version; otherwise `npm install -D tsx` and run with `tsx`. Record which in the report.

- [ ] **Step 2: Write failing tests** — `src/statements/pdfText.test.ts` (runs in Node, where PDF.js and pdfkit work):

```ts
// @vitest-environment node
import PDFDocument from 'pdfkit';
import { extractPdfText, itemsToLines } from './pdfText';

function makePdf(lines: Array<[string, number, number]>, userPassword?: string): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const doc = new PDFDocument(userPassword ? { userPassword, ownerPassword: 'owner-pw', pdfVersion: '1.7' } : {});
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    for (const [text, x, y] of lines) doc.text(text, x, y, { lineBreak: false });
    doc.end();
  });
}

describe('itemsToLines', () => {
  it('groups items into lines top to bottom, left to right', () => {
    expect(
      itemsToLines([
        { str: 'Due', x: 300, y: 700 },
        { str: 'Payment', x: 100, y: 701 },
        { str: '28/09/2026', x: 100, y: 680 },
        { str: '  ', x: 50, y: 680 },
      ]),
    ).toEqual(['Payment Due', '28/09/2026']);
  });
});

describe('extractPdfText', () => {
  it('extracts lines from a text PDF', async () => {
    const pdf = await makePdf([['Payment Due Date', 72, 100], ['28/09/2026', 300, 100], ['Minimum Payment 50.00', 72, 140]]);
    const r = await extractPdfText(pdf);
    expect(r.ok && r.pages[0].split('\n')).toEqual(['Payment Due Date 28/09/2026', 'Minimum Payment 50.00']);
  });
  it('reports password problems', async () => {
    const pdf = await makePdf([['Secret', 72, 100]], 'pw123');
    expect(await extractPdfText(pdf.slice())).toEqual({ ok: false, reason: 'needsPassword' });
    expect(await extractPdfText(pdf.slice(), 'wrong')).toEqual({ ok: false, reason: 'wrongPassword' });
    const r = await extractPdfText(pdf.slice(), 'pw123');
    expect(r.ok && r.pages[0]).toBe('Secret');
  });
  it('rejects non-PDF data and PDFs without text', async () => {
    expect(await extractPdfText(new TextEncoder().encode('not a pdf'))).toEqual({ ok: false, reason: 'notPdf' });
    expect(await extractPdfText(await makePdf([]))).toEqual({ ok: false, reason: 'noText' });
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/statements/pdfText.test.ts` → FAIL.

- [ ] **Step 4: Implement `src/statements/pdfText.ts`**

```ts
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

export type PdfTextResult =
  | { ok: true; pages: string[] }
  | { ok: false; reason: 'needsPassword' | 'wrongPassword' | 'notPdf' | 'noText' };

/** Group positioned text items into lines (same y within 2pt), top to bottom, left to right. */
export function itemsToLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
}
```

`extractPdfText` requirements (verify every PDF.js API against the installed `pdfjs-dist` version; adapt names, not behaviour):
- Load PDF.js lazily with dynamic `import()` so it is a separate chunk. In the browser use the standard build and set `GlobalWorkerOptions.workerSrc` to the bundled worker URL (e.g. `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`). Under Node/Vitest use the build that works there (typically `pdfjs-dist/legacy/build/pdf.mjs`). Keep that choice in one small loader function.
- Pass a **copy** of the bytes to `getDocument({ data, password })` (PDF.js may detach the buffer).
- Map errors: password exception "need password" → `needsPassword`; "incorrect password" → `wrongPassword`; invalid/corrupt PDF → `notPdf`. Any other error is rethrown.
- For each page: `getTextContent()`; map items to `{ str, x: transform[4], y: transform[5] }`; `itemsToLines`; join with `\n`.
- If all pages together contain no non-whitespace characters → `noText`.
- Destroy the document/loading task when done.

- [ ] **Step 5: Dev script** `scripts/extract-statement-text.ts` — reads a PDF path and optional password from argv, calls `extractPdfText`, writes pages joined with `\n\n--- page break ---\n\n` to the same path with `.txt` appended, prints only `Wrote <path>` or the failure reason. It must refuse to write outside `statements-samples/`. Add `"extract-statement": "<runner> scripts/extract-statement-text.ts"` to `package.json` scripts. Include `scripts` in `tsconfig.json` `include` if the runner needs types.

- [ ] **Step 6: Verify the production bundle** — `npm run build`: PDF.js must be in its own chunk (not in the main `index-*.js`) and the worker file must be emitted. Report chunk names and sizes.

- [ ] **Step 7: Run tests** — `npx vitest run src/statements`, `npm test` → PASS.

- [ ] **Step 8: Commit** — `feat(statements): in-browser PDF text extraction with password handling`

---

### Task 6: Bank detection, reader framework, Maybank and RHB readers (research task)

Correctness depends on the user's sample statements, not on code written in advance.

**Files:**
- Create: `src/statements/banks.ts`, `src/statements/readers/helpers.ts`, `src/statements/readers/index.ts`, `src/statements/readers/maybank.ts`, `src/statements/readers/rhb.ts`, `src/statements/fixtures/maybank-1.txt`, `src/statements/fixtures/rhb-1.txt`
- Test: `src/statements/banks.test.ts`, `src/statements/readers/readers.test.ts`, `src/statements/fixtures/fixtures-pii.test.ts`

**Interfaces:**
- Consumes: `extract-statement` script (Task 5), `parseAmount`, `parseStatementDate`, `StatementValues` (Task 3), `BankId`, catalog `CATALOG`
- Produces:
  - `BANK_LABELS: Record<BankId, string>` (`Maybank`, `RHB`, `UOB`, `Alliance Bank`, `Public Bank`, `AEON`)
  - `detectBank(text) → BankId | null`
  - `bankIdForBankName(bank: string) → BankId | null` — maps a catalog product's `bank` field
  - `interface ReadCard extends StatementValues { last4?: string }`, `interface ReadResult { cards: ReadCard[] }`, `type BankReader = (lines: string[]) => ReadResult`
  - `READERS: Partial<Record<BankId, BankReader>>` (this task registers `maybank`, `rhb`)
  - helpers `valueNear(lines, label: RegExp, value: RegExp, lookahead = 2) → string | undefined`

**Procedure:**

- [ ] **Step 1: Extract sample text (local only)**

```
npm run extract-statement -- "statements-samples/<Maybank sample>.pdf"
npm run extract-statement -- "statements-samples/<RHB file>.pdf"
```
The Maybank sample is encrypted. If it opens without a password (owner-password only), continue. If it needs a user password, **stop and report NEEDS_CONTEXT** asking the controller to get it from the user. Never write the password anywhere. The `.txt` outputs stay in `statements-samples/` (git-ignored).

- [ ] **Step 2: Framework** — implement `banks.ts` (markers chosen from the sample text: legal entity names or header strings, never personal data), `readers/helpers.ts`:

```ts
/** First value matching `value` on the label's line (after the label) or within the next `lookahead` lines. */
export function valueNear(lines: string[], label: RegExp, value: RegExp, lookahead = 2): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const after = lines[i].slice((m.index ?? 0) + m[0].length).match(value);
    if (after) return after[0].trim();
    for (let j = 1; j <= lookahead && i + j < lines.length; j++) {
      const v = lines[i + j].match(value);
      if (v) return v[0].trim();
    }
  }
  return undefined;
}
```
and `readers/index.ts` (types + `READERS`). Add helpers of your own if a bank's layout needs them (e.g. column-aligned label rows), each with a unit test.

- [ ] **Step 3: Sanitized fixtures** — create `src/statements/fixtures/maybank-1.txt` and `rhb-1.txt` from the extracted text, keeping **only** the lines needed for detection and the four values plus the card number line, with the layout (line breaks, spacing, labels, date and amount formats) preserved. Replace: names, addresses, IC/passport numbers, account numbers and full card numbers (use a fake masked card number ending in `1111` for Maybank and `2222` for RHB); change every amount and date to different made-up values (keep formats and keep them internally consistent: due date 10–35 days after statement date; minimum due ≤ balance). Also add a second fixture per bank variant you observe (e.g. multiple cards on one statement, credit balance) if the sample shows it.

- [ ] **Step 4: PII scan test** — `src/statements/fixtures/fixtures-pii.test.ts`: read every `*.txt` under `src/statements/fixtures/` (via `import.meta.glob('./*.txt', { query: '?raw', import: 'default', eager: true })`) and assert none contains a 16-digit card number (`/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/`), a Malaysian IC number (`/\b\d{6}-?\d{2}-?\d{4}\b/`) or an email address.

- [ ] **Step 5: Reader tests first** — `readers.test.ts`: for each fixture, `READERS.<bank>(text.split('\n'))` returns exactly the expected `cards` (all four values + `last4`); `detectBank` returns the right bank for each fixture and `null` for unrelated text; `bankIdForBankName` maps every catalog product's `bank` value (assert against `CATALOG`, e.g. all 8 products map to a non-null id and Maybank/RHB/UOB/Alliance/Public Bank/AEON map correctly). Run → FAIL.

- [ ] **Step 6: Implement the two readers** using `parseAmount`/`parseStatementDate` (extend those only with tests in `logic.test.ts` if a format is not covered). A reader returns `{ cards: [] }` when it cannot find the values; it never throws.

- [ ] **Step 7: Verify against the real samples (local)** — temporarily run each reader on the full extracted `.txt` of the real sample (e.g. a scratch test file outside `src/` or a one-off script) and confirm the four values match the real PDF. Do not commit that check or its output. Report "real sample verified" per bank without quoting values.

- [ ] **Step 8: Run tests** — `npm test`, `npm run build` → PASS. `git status` must show nothing under `statements-samples/`.

- [ ] **Step 9: Commit** — `feat(statements): bank detection and Maybank/RHB statement readers`

---

### Task 7: UOB and Alliance Bank readers (research task)

**Files:**
- Create: `src/statements/readers/uob.ts`, `src/statements/readers/alliance.ts`, `src/statements/fixtures/uob-1.txt`, `src/statements/fixtures/alliance-1.txt`
- Modify: `src/statements/readers/index.ts`, `src/statements/banks.ts` (markers), `src/statements/readers/readers.test.ts`

**Interfaces:**
- Consumes/produces: same as Task 6; registers `uob` and `alliance` in `READERS`.

- [ ] **Step 1:** Extract text from the two remaining PDFs in `statements-samples/` (Task 5 script). Identify which is UOB and which is Alliance from the text. Same password rule as Task 6.
- [ ] **Step 2:** Sanitized fixtures exactly as Task 6 Step 3 (fake card numbers ending `3333` for UOB, `4444` for Alliance). The PII scan test from Task 6 covers them automatically.
- [ ] **Step 3:** Reader + detection tests first (same pattern as Task 6 Step 5) → FAIL.
- [ ] **Step 4:** Implement both readers; register them; add detection markers.
- [ ] **Step 5:** Verify against the real samples locally (Task 6 Step 7 rules).
- [ ] **Step 6:** `npm test`, `npm run build` → PASS; nothing from `statements-samples/` staged.
- [ ] **Step 7: Commit** — `feat(statements): UOB and Alliance Bank statement readers`

---

### Task 8: Read orchestration

**Files:**
- Create: `src/statements/readStatement.ts`
- Test: `src/statements/readStatement.test.ts`

**Interfaces:**
- Consumes: `extractPdfText`/`PdfTextResult` (Task 5), `detectBank`, `bankIdForBankName`, `READERS`, `ReadCard` (Task 6), `checkStatement`, `StatementValues`, `StatementIssue` (Task 3), `UserCard`, `CardProduct`
- Produces:

```ts
export interface StatementCandidate {
  last4?: string;
  userCardId?: string; // pre-selected card, if matched
  values: StatementValues;
  issues: StatementIssue[];
  readerUsed: boolean; // a bank reader produced these values
}
export type ReadOutcome =
  | { ok: true; text: string; bank: BankId | null; hasReader: boolean; candidates: StatementCandidate[] }
  | { ok: false; reason: 'needsPassword' | 'wrongPassword' | 'notPdf' | 'noText' };
export interface ReadOptions {
  password?: string; // typed by the user for this attempt
  userCards: UserCard[];
  resolved: Record<string, CardProduct>;
  today: string;
  extract?: (data: Uint8Array, password?: string) => Promise<PdfTextResult>; // injectable for tests
}
export function matchCard(last4: string | undefined, bank: BankId | null, userCards: UserCard[], resolved: Record<string, CardProduct>): string | undefined;
export async function readStatement(data: ArrayBuffer | Uint8Array, opts: ReadOptions): Promise<ReadOutcome>;
```

- [ ] **Step 1: Write failing tests** — `src/statements/readStatement.test.ts`:

```ts
import { matchCard, readStatement } from './readStatement';
import { card } from '../test/fixtures';
import type { PdfTextResult } from './pdfText';
import type { UserCard } from '../engine/types';
import uobText from './fixtures/uob-1.txt?raw';

const uob = card({ id: 'uob-one-classic', bank: 'UOB', name: 'One' });
const may = card({ id: 'maybank-x', bank: 'Maybank', name: 'X' });
const uc = (id: string, p: Partial<UserCard> = {}): UserCard => ({ id, productId: null, nickname: id, catalogVersionSeen: 1, archived: false, ...p });
const cards = [uc('U', { last4: '3333' }), uc('M')];
const resolved = { U: uob, M: may };
const base = { userCards: cards, resolved, today: '2026-09-24' };

describe('matchCard', () => {
  it('matches by last 4 digits first', () => expect(matchCard('3333', 'maybank', cards, resolved)).toBe('U'));
  it('falls back to the only active card of the detected bank', () => expect(matchCard('9999', 'maybank', cards, resolved)).toBe('M'));
  it('returns undefined when ambiguous or unknown', () => {
    expect(matchCard(undefined, null, cards, resolved)).toBeUndefined();
    const two = [...cards, uc('M2')];
    expect(matchCard(undefined, 'maybank', two, { ...resolved, M2: may })).toBeUndefined();
  });
  it('ignores archived cards', () => expect(matchCard('3333', null, [uc('U', { last4: '3333', archived: true })], resolved)).toBeUndefined());
});

describe('readStatement', () => {
  it('reads a known bank and pre-selects the card', async () => {
    const extract = async (): Promise<PdfTextResult> => ({ ok: true, pages: [uobText] });
    const r = await readStatement(new Uint8Array([1]), { ...base, extract });
    expect(r.ok && r.bank).toBe('uob');
    expect(r.ok && r.hasReader).toBe(true);
    expect(r.ok && r.candidates[0]).toMatchObject({ userCardId: 'U', readerUsed: true, issues: [] });
  });
  it('returns an empty manual candidate for a bank without a reader', async () => {
    const extract = async (): Promise<PdfTextResult> => ({ ok: true, pages: ['PUBLIC BANK BERHAD statement'] });
    const r = await readStatement(new Uint8Array([1]), { ...base, extract });
    // detectBank must recognise Public Bank text once its marker is known; until then bank may be null.
    expect(r.ok && r.candidates).toEqual([{ values: {}, issues: expect.any(Array), readerUsed: false, userCardId: undefined, last4: undefined }]);
  });
  it('tries saved card passwords before asking, with a fresh copy of the bytes each time', async () => {
    const seen: string[] = [];
    const extract = async (data: Uint8Array, pw?: string): Promise<PdfTextResult> => {
      if (data.byteLength === 0) throw new Error('detached buffer reused');
      // Simulate PDF.js detaching the buffer it was given (ArrayBuffer.transfer exists on current Node).
      (data.buffer as ArrayBuffer & { transfer?: () => ArrayBuffer }).transfer?.();
      seen.push(pw ?? '(none)');
      if (pw === 'right') return { ok: true, pages: [uobText] };
      return { ok: false, reason: pw ? 'wrongPassword' : 'needsPassword' };
    };
    const withPw = [uc('U', { last4: '3333', pdfPassword: 'old' }), uc('M', { pdfPassword: 'right' })];
    const r = await readStatement(new Uint8Array([1, 2, 3]), { ...base, userCards: withPw, extract });
    expect(r.ok).toBe(true);
    expect(seen).toEqual(['(none)', 'old', 'right']);
  });
  it('asks for a password when none of the saved ones work', async () => {
    const extract = async (_d: Uint8Array, pw?: string): Promise<PdfTextResult> => ({ ok: false, reason: pw ? 'wrongPassword' : 'needsPassword' });
    expect(await readStatement(new Uint8Array([1]), { ...base, extract })).toEqual({ ok: false, reason: 'needsPassword' });
    expect(await readStatement(new Uint8Array([1]), { ...base, password: 'typed', extract })).toEqual({ ok: false, reason: 'wrongPassword' });
  });
  it('passes through notPdf and noText', async () => {
    for (const reason of ['notPdf', 'noText'] as const) {
      const extract = async (): Promise<PdfTextResult> => ({ ok: false, reason });
      expect(await readStatement(new Uint8Array([1]), { ...base, extract })).toEqual({ ok: false, reason });
    }
  });
});
```
The UOB fixture comes from Task 7. Adjust the Public Bank expectation only in what `bank` is (detectBank may return `null` for that short text until a Public Bank marker exists); the candidate shape must stay as asserted.

- [ ] **Step 2: Run to verify failure** — FAIL (module missing).

- [ ] **Step 3: Implement `readStatement.ts`**
  - Password attempts, in order: if `opts.password` given → only that one; else no password, then each distinct saved `pdfPassword` from `userCards` (non-archived first). Each attempt gets `new Uint8Array(bytes)` copied from a private copy made once at the start (`const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)).slice()`).
  - Stop at the first `ok`. If an attempt returns `notPdf`/`noText`, return it. If all fail: `wrongPassword` when `opts.password` was given, else `needsPassword`.
  - `text = pages.join('\n')`, `lines = text.split('\n')`, `bank = detectBank(text)`, `reader = bank ? READERS[bank] : undefined`.
  - `cards = reader?.(lines).cards ?? []`; if empty → one candidate `{ values: {}, readerUsed: false }`.
  - Each candidate: `values` = the four fields; `issues = checkStatement(values, today)`; `readerUsed = Boolean(reader) && cards.length > 0 && issues.every((i) => !i.missing)`; `userCardId = matchCard(last4, bank, userCards, resolved)`.
  - `matchCard`: non-archived cards with `last4 === last4` → first id; else non-archived cards whose `bankIdForBankName(resolved[id].bank) === bank` → the id if exactly one; else `undefined`.

- [ ] **Step 4: Run tests** — `npx vitest run src/statements`, `npm test`, `npm run build` → PASS.

- [ ] **Step 5: Commit** — `feat(statements): read orchestration with saved-password retries and card matching`

---

### Task 9: Cards — last 4 digits and forget PDF password

**Files:**
- Modify: `src/features/cards/CardsPage.tsx`
- Test: `src/features/cards/CardsPage.test.tsx`

**Interfaces:**
- Consumes: `UserCard.last4`, `UserCard.pdfPassword` (Task 1)
- Produces: per card panel, a `Last4Form` (input labelled `Last 4 digits`, button `Save last 4 digits`, error `Enter exactly 4 digits.` for anything but 4 digits or empty; empty clears it) and, when `pdfPassword` is set, a `Forget saved PDF password` button.

- [ ] **Step 1: Write failing tests** (add to `CardsPage.test.tsx`):

```tsx
it('saves and clears the last 4 digits', async () => {
  const { repo } = await renderWithData(<CardsPage />, { seed: (r) => seedCard(r).then(() => undefined) });
  const input = screen.getByLabelText('Last 4 digits');
  await userEvent.type(input, '12a4');
  await userEvent.click(screen.getByRole('button', { name: 'Save last 4 digits' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter exactly 4 digits.');
  await userEvent.clear(input);
  await userEvent.type(input, '1234');
  await userEvent.click(screen.getByRole('button', { name: 'Save last 4 digits' }));
  expect((await repo.listUserCards())[0].last4).toBe('1234');
});

it('forgets a saved PDF password', async () => {
  const { repo } = await renderWithData(<CardsPage />, {
    seed: async (r) => {
      const uc = await seedCard(r);
      await r.saveUserCard({ ...uc, pdfPassword: 'secret' });
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Forget saved PDF password' }));
  expect((await repo.listUserCards())[0].pdfPassword).toBeUndefined();
  expect(screen.queryByRole('button', { name: 'Forget saved PDF password' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** — a `Last4Form` component next to `StatementDayForm` (same pattern: local state initialised from `userCard.last4 ?? ''`, validation `/^\d{4}$/` or empty, saves `{ ...userCard, last4: value || undefined }` via the page's `save`). A button `Forget saved PDF password` rendered only when `uc.pdfPassword` is set, saving `{ ...uc, pdfPassword: undefined }`.

- [ ] **Step 4: Run tests** — `npx vitest run src/features/cards`, `npm test`, `npm run build` → PASS.

- [ ] **Step 5: Commit** — `feat(cards): last 4 digits and forget saved PDF password`

---

### Task 10: Bills screen (list, manual entry, payments, calendar)

**Files:**
- Create: `src/features/bills/BillsPage.tsx`, `src/features/bills/StatementForm.tsx`, `src/features/bills/MarkPaidForm.tsx`
- Modify: `src/app/Layout.tsx` (nav + route), `src/App.test.tsx` (nav list), `src/styles.css` (chips)
- Test: `src/features/bills/BillsPage.test.tsx`

**Interfaces:**
- Consumes: `useAppData` (incl. `statements`), `activeCards`, `nameOf`, `statementStatus`, `findDuplicate`, `checkStatement`, `parseAmount` (Task 3), `makeIcs`, `icsStamp` (Task 4), `downloadText` (Task 4), `newId`, `formatRM`
- Produces:
  - `StatementForm({ cards, initial, note?, issues?, submitLabel?, onSubmit(values: StatementInput), onCancel })` where `interface StatementInput { userCardId; statementDate; dueDate; statementBalance: number; minimumDue: number }` and `interface StatementDraft` = same with string amounts; `draftFrom(values?: Partial<StatementValues> & { userCardId?: string }) → StatementDraft`
  - `MarkPaidForm({ statement, today, onSave({ paymentStatus, paidAmount, paidOn }), onCancel })`
  - `BillsPage`; exported `type SaveMeta = { source: 'reader' | 'manual'; readerBank?: BankId }`; `saveStatement(input, meta, existing?) → Promise<boolean>` (inside the page; passed to Task 11's upload component)
  - Nav order: Dashboard, Which card?, **Bills**, Transactions, Cards, Reports, Settings; route `/bills`

- [ ] **Step 1: Write failing tests** — `src/features/bills/BillsPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillsPage } from './BillsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { statement } from '../../test/fixtures';
import { downloadText } from '../../lib/download';

vi.mock('../../lib/download', () => ({ downloadText: vi.fn(), readFileText: vi.fn() }));

const seed = (extra?: Parameters<typeof statement>[0]) => async (r: import('../../data/repository').Repository) => {
  await seedCard(r, {}, 'uc1', 'UOB One');
  if (extra) await r.saveStatement(statement({ userCardId: 'uc1', ...extra }));
};

describe('BillsPage', () => {
  it('adds a statement manually', async () => {
    const { repo } = await renderWithData(<BillsPage />, { seed: seed() });
    await userEvent.click(screen.getByRole('button', { name: 'Add manually' }));
    await userEvent.selectOptions(screen.getByLabelText('Card'), 'uc1');
    await userEvent.type(screen.getByLabelText('Statement date'), '2026-09-08');
    await userEvent.type(screen.getByLabelText('Payment due date'), '2026-09-28');
    await userEvent.type(screen.getByLabelText('Statement balance (RM)'), '1,234.50');
    await userEvent.type(screen.getByLabelText('Minimum due (RM)'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    const row = await screen.findByRole('listitem', { name: 'UOB One statement 2026-09-08' });
    expect(within(row).getByText('Due in 4 days')).toBeInTheDocument();
    expect(within(row).getByText(/RM1,234.50/)).toBeInTheDocument();
    expect((await repo.listStatements())[0]).toMatchObject({ statementBalance: 1234.5, minimumDue: 50, source: 'manual', paymentStatus: 'unpaid' });
  });

  it('blocks saving with missing values', async () => {
    const { repo } = await renderWithData(<BillsPage />, { seed: seed() });
    await userEvent.click(screen.getByRole('button', { name: 'Add manually' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a card.');
    expect(await repo.listStatements()).toEqual([]);
  });

  it('shows overdue statements first', async () => {
    await renderWithData(<BillsPage />, {
      seed: async (r) => {
        await seed({ id: 'late', statementDate: '2026-08-08', dueDate: '2026-08-28' })(r);
        await r.saveStatement(statement({ id: 'soon', userCardId: 'uc1', statementDate: '2026-09-08', dueDate: '2026-09-28' }));
      },
    });
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('Overdue by 27 days')).toBeInTheDocument();
  });

  it('marks a statement paid in full, by other amount, and back to unpaid', async () => {
    const { repo } = await renderWithData(<BillsPage />, { seed: seed({ id: 'st' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    await userEvent.click(screen.getByLabelText(/Full/));
    await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('Paid in full')).toBeInTheDocument();
    expect((await repo.listStatements())[0]).toMatchObject({ paymentStatus: 'paidFull', paidAmount: 1234.5, paidOn: '2026-09-24' });
    await userEvent.click(screen.getByRole('button', { name: 'Mark unpaid' }));
    expect(await screen.findByText('Due in 4 days')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    await userEvent.click(screen.getByLabelText('Other amount'));
    await userEvent.type(screen.getByLabelText('Amount paid (RM)'), '300');
    await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('Paid RM300.00')).toBeInTheDocument();
  });

  it('downloads a calendar file', async () => {
    await renderWithData(<BillsPage />, { seed: seed({ id: 'st' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));
    expect(vi.mocked(downloadText)).toHaveBeenCalledWith('uob-one-due-2026-09-28.ics', expect.stringContaining('BEGIN:VCALENDAR'), 'text/calendar');
  });

  it('asks before replacing a statement with the same card and date', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<BillsPage />, { seed: seed({ id: 'old', statementDate: '2026-09-08' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Add manually' }));
    await userEvent.selectOptions(screen.getByLabelText('Card'), 'uc1');
    await userEvent.type(screen.getByLabelText('Statement date'), '2026-09-08');
    await userEvent.type(screen.getByLabelText('Payment due date'), '2026-09-28');
    await userEvent.type(screen.getByLabelText('Statement balance (RM)'), '99');
    await userEvent.type(screen.getByLabelText('Minimum due (RM)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(confirm).toHaveBeenCalled();
    const all = await repo.listStatements();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'old', statementBalance: 99 });
  });

  it('deletes after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<BillsPage />, { seed: seed({ id: 'st' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await repo.listStatements()).toEqual([]);
  });
});
```

Update `src/App.test.tsx` nav list to include `'Bills'`.

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `StatementForm.tsx`**

```tsx
import { useRef, useState, type FormEvent } from 'react';
import type { ActiveCard } from '../../app/selectors';
import { checkStatement, parseAmount, type StatementIssue, type StatementValues } from '../../statements/logic';

export interface StatementInput {
  userCardId: string;
  statementDate: string;
  dueDate: string;
  statementBalance: number;
  minimumDue: number;
}

export interface StatementDraft {
  userCardId: string;
  statementDate: string;
  dueDate: string;
  statementBalance: string;
  minimumDue: string;
}

export function draftFrom(v: Partial<StatementValues> & { userCardId?: string } = {}): StatementDraft {
  return {
    userCardId: v.userCardId ?? '',
    statementDate: v.statementDate ?? '',
    dueDate: v.dueDate ?? '',
    statementBalance: v.statementBalance != null ? v.statementBalance.toFixed(2) : '',
    minimumDue: v.minimumDue != null ? v.minimumDue.toFixed(2) : '',
  };
}

interface Props {
  cards: ActiveCard[];
  initial: StatementDraft;
  today: string;
  note?: string;
  issues?: StatementIssue[];
  submitLabel?: string;
  onSubmit(values: StatementInput): Promise<void>;
  onCancel(): void;
}

export function StatementForm({ cards, initial, today, note, issues = [], submitLabel = 'Save statement', onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const set = (p: Partial<StatementDraft>) => setDraft((d) => ({ ...d, ...p }));
  const flagged = new Set(issues.map((i) => i.field));
  const balance = parseAmount(draft.statementBalance);
  const minimum = parseAmount(draft.minimumDue);
  const warnings = checkStatement(
    {
      statementDate: draft.statementDate || undefined,
      dueDate: draft.dueDate || undefined,
      statementBalance: balance ?? undefined,
      minimumDue: minimum ?? undefined,
    },
    today,
  ).filter((i) => !i.missing);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    if (!draft.userCardId) return setError('Choose a card.');
    if (!draft.statementDate || !draft.dueDate) return setError('Enter the statement date and due date.');
    if (balance === null) return setError('Enter the statement balance (e.g. 1234.50, or 20.00 CR for a credit).');
    if (minimum === null || minimum < 0) return setError('Enter the minimum due (e.g. 50.00).');
    setError('');
    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit({ userCardId: draft.userCardId, statementDate: draft.statementDate, dueDate: draft.dueDate, statementBalance: balance, minimumDue: minimum });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const cls = (f: keyof StatementValues) => (flagged.has(f) ? 'field-issue' : undefined);
  return (
    <form className="panel fields" onSubmit={submit} aria-label="Statement">
      {note && <p className="muted">{note}</p>}
      <label>
        Card
        <select value={draft.userCardId} onChange={(e) => set({ userCardId: e.target.value })}>
          <option value="">Choose a card</option>
          {cards.map((c) => (
            <option key={c.userCard.id} value={c.userCard.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={cls('statementDate')}>
        Statement date
        <input type="date" value={draft.statementDate} onChange={(e) => set({ statementDate: e.target.value })} />
      </label>
      <label className={cls('dueDate')}>
        Payment due date
        <input type="date" value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
      </label>
      <label className={cls('statementBalance')}>
        Statement balance (RM)
        <input inputMode="decimal" value={draft.statementBalance} onChange={(e) => set({ statementBalance: e.target.value })} />
      </label>
      <label className={cls('minimumDue')}>
        Minimum due (RM)
        <input inputMode="decimal" value={draft.minimumDue} onChange={(e) => set({ minimumDue: e.target.value })} />
      </label>
      {warnings.length > 0 && (
        <div role="status" className="banner">
          Please double-check:
          <ul>
            {warnings.map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="primary" disabled={saving}>
          {submitLabel}
        </button>{' '}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Implement `MarkPaidForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import type { PaymentStatus, Statement } from '../../engine/types';
import { formatRM } from '../../lib/money';
import { parseAmount } from '../../statements/logic';

type Choice = Exclude<PaymentStatus, 'unpaid'>;

interface Props {
  statement: Statement;
  today: string;
  onSave(p: { paymentStatus: Choice; paidAmount: number; paidOn: string }): Promise<void>;
  onCancel(): void;
}

export function MarkPaidForm({ statement, today, onSave, onCancel }: Props) {
  const [choice, setChoice] = useState<Choice>('paidFull');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    let paidAmount = choice === 'paidFull' ? statement.statementBalance : statement.minimumDue;
    if (choice === 'paidPartial') {
      const n = parseAmount(amount);
      if (n === null || n <= 0) return setError('Enter the amount you paid.');
      paidAmount = n;
    }
    if (!paidOn) return setError('Choose the date you paid.');
    setError('');
    await onSave({ paymentStatus: choice, paidAmount, paidOn });
  }

  const option = (value: Choice, label: string) => (
    <label className="inline">
      <input type="radio" name="payment" checked={choice === value} onChange={() => setChoice(value)} />
      {label}
    </label>
  );

  return (
    <form className="panel fields" onSubmit={submit} aria-label="Mark paid">
      <div role="radiogroup" aria-label="Payment">
        {option('paidFull', `Full (${formatRM(statement.statementBalance)})`)}
        {option('paidMin', `Minimum (${formatRM(statement.minimumDue)})`)}
        {option('paidPartial', 'Other amount')}
      </div>
      {choice === 'paidPartial' && (
        <label>
          Amount paid (RM)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      )}
      <label>
        Paid on
        <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="primary">
          Save payment
        </button>{' '}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Implement `BillsPage.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BankId, Statement } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { activeCards, nameOf } from '../../app/selectors';
import { findDuplicate, statementStatus } from '../../statements/logic';
import { icsStamp, makeIcs } from '../../statements/ics';
import { downloadText } from '../../lib/download';
import { formatRM } from '../../lib/money';
import { newId } from '../../lib/id';
import { StatementForm, draftFrom, type StatementInput } from './StatementForm';
import { MarkPaidForm } from './MarkPaidForm';

export interface SaveMeta {
  source: 'reader' | 'manual';
  readerBank?: BankId;
}

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; s: Statement } | { kind: 'pay'; s: Statement };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function BillsPage() {
  const data = useAppData();
  const { repo, statements, refresh, today } = data;
  const cards = activeCards(data);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [error, setError] = useState('');

  async function saveStatement(v: StatementInput, meta: SaveMeta, existing?: Statement): Promise<boolean> {
    const dup = findDuplicate(statements, { id: existing?.id ?? '', userCardId: v.userCardId, statementDate: v.statementDate });
    if (dup && !window.confirm(`A ${nameOf(data, v.userCardId)} statement dated ${v.statementDate} already exists. Replace it?`)) return false;
    const base = existing ?? dup;
    const s: Statement = {
      id: base?.id ?? newId(),
      ...v,
      source: meta.source,
      readerBank: meta.readerBank,
      paymentStatus: base?.paymentStatus ?? 'unpaid',
      paidAmount: base?.paidAmount,
      paidOn: base?.paidOn,
      createdAt: base?.createdAt ?? new Date().toISOString(),
    };
    await repo.saveStatement(s);
    if (dup && existing && dup.id !== existing.id) await repo.deleteStatement(dup.id);
    await refresh();
    return true;
  }

  async function run(action: () => Promise<void>) {
    try {
      setError('');
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const unpaid = statements.filter((s) => s.paymentStatus === 'unpaid').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = statements.filter((s) => s.paymentStatus !== 'unpaid').sort((a, b) => b.statementDate.localeCompare(a.statementDate));

  function row(s: Statement) {
    const name = nameOf(data, s.userCardId);
    const st = statementStatus(s, today);
    return (
      <li key={s.id} className="panel" aria-label={`${name} statement ${s.statementDate}`}>
        <strong>{name}</strong> <span className={`chip chip-${st.tone}`}>{st.label}</span>
        <div className="muted">
          Statement {s.statementDate} · Due {s.dueDate}
        </div>
        <div>
          Balance {formatRM(s.statementBalance)} · Minimum {formatRM(s.minimumDue)}
        </div>
        <div>
          {s.paymentStatus === 'unpaid' ? (
            <button type="button" onClick={() => setMode({ kind: 'pay', s })}>Mark paid</button>
          ) : (
            <button
              type="button"
              onClick={() => run(async () => {
                await repo.saveStatement({ ...s, paymentStatus: 'unpaid', paidAmount: undefined, paidOn: undefined });
                await refresh();
              })}
            >
              Mark unpaid
            </button>
          )}{' '}
          <button type="button" onClick={() => downloadText(`${slug(name)}-due-${s.dueDate}.ics`, makeIcs(s, name, icsStamp(new Date())), 'text/calendar')}>
            Add to calendar
          </button>{' '}
          <button type="button" onClick={() => setMode({ kind: 'edit', s })}>Edit</button>{' '}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete this ${name} statement?`)) return;
              void run(async () => {
                await repo.deleteStatement(s.id);
                await refresh();
              });
            }}
          >
            Delete
          </button>
        </div>
      </li>
    );
  }

  if (mode.kind === 'new' || mode.kind === 'edit') {
    const existing = mode.kind === 'edit' ? mode.s : undefined;
    return (
      <>
        <h1>{existing ? 'Edit statement' : 'Add statement'}</h1>
        <StatementForm
          cards={cards}
          today={today}
          initial={draftFrom(existing ?? {})}
          onCancel={() => setMode({ kind: 'list' })}
          onSubmit={async (v) => {
            if (await saveStatement(v, { source: existing?.source ?? 'manual', readerBank: existing?.readerBank }, existing)) setMode({ kind: 'list' });
          }}
        />
      </>
    );
  }

  if (mode.kind === 'pay') {
    return (
      <>
        <h1>Mark paid — {nameOf(data, mode.s.userCardId)}</h1>
        <MarkPaidForm
          statement={mode.s}
          today={today}
          onCancel={() => setMode({ kind: 'list' })}
          onSave={async (p) => {
            await repo.saveStatement({ ...mode.s, ...p });
            await refresh();
            setMode({ kind: 'list' });
          }}
        />
      </>
    );
  }

  return (
    <>
      <h1>Bills</h1>
      {cards.length === 0 ? (
        <p>
          <Link to="/cards">Add your cards</Link> first.
        </p>
      ) : (
        <p>
          <button type="button" className="primary" onClick={() => setMode({ kind: 'new' })}>Add manually</button>
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {statements.length === 0 && <p className="muted">No statements yet.</p>}
      {unpaid.length > 0 && (
        <section aria-label="Unpaid">
          <h2>Unpaid</h2>
          <ul className="results">{unpaid.map(row)}</ul>
        </section>
      )}
      {paid.length > 0 && (
        <section aria-label="Paid">
          <h2>Paid</h2>
          <ul className="results">{paid.map(row)}</ul>
        </section>
      )}
    </>
  );
}
```
Export `saveStatement`'s behaviour for Task 11 by keeping it inside the component and passing it as a prop to the upload component (Task 11 adds the "Upload statement" button next to "Add manually").

- [ ] **Step 6: Nav, route, styles** — `Layout.tsx`: add `{ to: '/bills', label: 'Bills' }` after "Which card?" and `<Route path="/bills" element={<BillsPage />} />`. Append to `src/styles.css`:

```css
.chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--border); }
.chip-overdue { background: #fee2e2; color: #991b1b; }
.chip-soon { background: #fef3c7; color: #78350f; }
.chip-paid { background: #dcfce7; color: #166534; }
.field-issue input, .field-issue select { border-color: var(--danger); }
```

- [ ] **Step 7: Run tests** — `npx vitest run src/features/bills src/App.test.tsx`, `npm test`, `npm run build` → PASS.

- [ ] **Step 8: Commit** — `feat(bills): Bills screen with manual entry, payments, calendar and delete`

---

### Task 11: Upload statement flow

**Files:**
- Create: `src/features/bills/UploadStatement.tsx`
- Modify: `src/features/bills/BillsPage.tsx` (Upload button + mode)
- Test: `src/features/bills/UploadStatement.test.tsx`

**Interfaces:**
- Consumes: `readStatement`, `ReadOutcome` (Task 8), `BANK_LABELS`, `READERS` (Task 6), `StatementForm`, `draftFrom` (Task 10), `SaveMeta`, `useAppData`
- Produces: `UploadStatement({ onSave(v: StatementInput, meta: SaveMeta): Promise<boolean>; onDone(): void })`; Bills button `Upload statement` → mode `upload`.

Flow (states): **pick** (file input labelled `Statement PDF`, accept `.pdf,application/pdf`) → **reading** ("Reading…") → one of:
- `needsPassword` / `wrongPassword` → **password**: input labelled `PDF password`, checkbox `Remember for this card on this device`, helper text "Saved only in this browser. Anyone using this browser profile could see it.", button `Open`; `wrongPassword` shows "Password incorrect." (role alert).
- `notPdf` → message "This file isn't a readable PDF." with `Choose another file`.
- `noText` → message "This PDF has no text (it may be a scan). Please enter the values manually." then an empty `StatementForm`.
- ok → **review**: one `StatementForm` per candidate, in order (heading `Statement 1 of N` when N > 1), initial `draftFrom({ ...values, userCardId })`, `issues`, and note:
  - `readerUsed` → `Read by: <BANK_LABELS[bank]> reader. Please check before saving.`
  - `bank` known but no reader → `No reader for <BANK_LABELS[bank]> yet — please fill in.`
  - otherwise → `Couldn't read this statement — please fill in.`
  A `<details>` element with summary `Show extracted text` containing the text in a `<pre>`.
- On each save: `onSave(v, { source: readerUsed ? 'reader' : 'manual', readerBank: readerUsed ? bank : undefined })`; if it returns true, update the chosen user card when needed: set `last4` from the candidate if the card has none; if the password step was used and "Remember" was ticked, set `pdfPassword` to the typed password. Then show the next candidate or call `onDone()`.

- [ ] **Step 1: Write failing tests** — `src/features/bills/UploadStatement.test.tsx` (mock the reader module so no PDF is needed):

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillsPage } from './BillsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { readStatement } from '../../statements/readStatement';

vi.mock('../../statements/readStatement', async (orig) => ({ ...(await orig<object>()), readStatement: vi.fn() }));
const mockRead = vi.mocked(readStatement);
const file = () => new File([new Uint8Array([37, 80, 68, 70])], 'st.pdf', { type: 'application/pdf' });
const seed = async (r: import('../../data/repository').Repository) => {
  await seedCard(r, { bank: 'UOB' }, 'uc1', 'UOB One');
};
const good = {
  ok: true as const,
  text: 'UOB statement text',
  bank: 'uob' as const,
  hasReader: true,
  candidates: [
    {
      last4: '3333',
      userCardId: 'uc1',
      readerUsed: true,
      issues: [],
      values: { statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 812.4, minimumDue: 50 },
    },
  ],
};

async function upload() {
  await userEvent.click(screen.getByRole('button', { name: 'Upload statement' }));
  await userEvent.upload(screen.getByLabelText('Statement PDF'), file());
}

describe('Upload statement', () => {
  beforeEach(() => mockRead.mockReset());

  it('reads, reviews and saves a statement, storing last 4 digits on the card', async () => {
    mockRead.mockResolvedValue(good);
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('Read by: UOB reader. Please check before saving.')).toBeInTheDocument();
    expect(screen.getByLabelText('Statement balance (RM)')).toHaveValue('812.40');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(await screen.findByRole('heading', { name: 'Bills' })).toBeInTheDocument();
    expect((await repo.listStatements())[0]).toMatchObject({ source: 'reader', readerBank: 'uob', statementBalance: 812.4 });
    expect((await repo.listUserCards())[0].last4).toBe('3333');
  });

  it('asks for a password, remembers it when ticked', async () => {
    mockRead.mockResolvedValueOnce({ ok: false, reason: 'needsPassword' }).mockResolvedValueOnce({ ok: false, reason: 'wrongPassword' }).mockResolvedValueOnce(good);
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    await userEvent.type(await screen.findByLabelText('PDF password'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Password incorrect.');
    await userEvent.clear(screen.getByLabelText('PDF password'));
    await userEvent.type(screen.getByLabelText('PDF password'), 'good');
    await userEvent.click(screen.getByLabelText('Remember for this card on this device'));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(mockRead.mock.calls[2][1]).toMatchObject({ password: 'good' });
    await userEvent.click(await screen.findByRole('button', { name: 'Save statement' }));
    await screen.findByRole('heading', { name: 'Bills' });
    expect((await repo.listUserCards())[0].pdfPassword).toBe('good');
  });

  it('falls back to manual entry for scanned PDFs and unknown layouts', async () => {
    mockRead.mockResolvedValueOnce({ ok: false, reason: 'noText' });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('This PDF has no text (it may be a scan). Please enter the values manually.')).toBeInTheDocument();
    expect(screen.getByLabelText('Statement date')).toHaveValue('');
  });

  it('says when a bank has no reader yet', async () => {
    mockRead.mockResolvedValue({ ok: true, text: 'x', bank: 'pbb', hasReader: false, candidates: [{ readerUsed: false, issues: [], values: {} }] });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('No reader for Public Bank yet — please fill in.')).toBeInTheDocument();
  });

  it('rejects non-PDF files', async () => {
    mockRead.mockResolvedValue({ ok: false, reason: 'notPdf' });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText("This file isn't a readable PDF.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `UploadStatement.tsx`** per the flow above. Read the file with `await file.arrayBuffer()` once and keep the bytes in state for password retries. Call `readStatement(bytes, { password, userCards: data.userCards, resolved: data.resolved, today: data.today })`. Keep the typed password only in component state; it is written to the card only when "Remember" is ticked and the statement is saved.

- [ ] **Step 4: Wire into BillsPage** — add mode `{ kind: 'upload' }`, an `Upload statement` button before `Add manually`, and render `<UploadStatement onSave={(v, meta) => saveStatement(v, meta)} onDone={() => setMode({ kind: 'list' })} />` under heading `Upload statement`.

- [ ] **Step 5: Run tests** — `npx vitest run src/features/bills`, `npm test`, `npm run build` → PASS.

- [ ] **Step 6: Commit** — `feat(bills): upload statement PDF with password prompt and review`

---

### Task 12: Dashboard panel, Settings note, end-to-end test

**Files:**
- Create: `src/features/dashboard/UpcomingPayments.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx`, `src/features/settings/SettingsPage.tsx`, `e2e/smoke.spec.ts`
- Test: `src/features/dashboard/DashboardPage.test.tsx`, `src/features/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `upcomingPayments`, `statementStatus` (Task 3), `nameOf`, `formatRM`, `useAppData`
- Produces: `UpcomingPayments` — section named `Upcoming payments` (heading `Upcoming payments`), rendered right under the Dashboard `<h1>`, hidden when empty; each item `<card name> — <status label> — <balance> (min <minimum>)` linking to `/bills`.

- [ ] **Step 1: Write failing tests**

`DashboardPage.test.tsx`:
```tsx
it('shows upcoming and overdue payments, soonest first', async () => {
  await renderWithData(<DashboardPage />, {
    seed: async (r) => {
      await seedCard(r, {}, 'A', 'Card A');
      await r.saveStatement(statement({ id: 'x', userCardId: 'A', statementDate: '2026-09-01', dueDate: '2026-09-21', statementBalance: 100, minimumDue: 10 }));
      await r.saveStatement(statement({ id: 'y', userCardId: 'A', statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 200, minimumDue: 20 }));
      await r.saveStatement(statement({ id: 'z', userCardId: 'A', statementDate: '2026-09-15', dueDate: '2026-10-20', statementBalance: 300, minimumDue: 30 }));
    },
  });
  const panel = screen.getByRole('region', { name: 'Upcoming payments' });
  const items = within(panel).getAllByRole('listitem');
  expect(items.map((i) => i.textContent)).toEqual([
    'Card A — Overdue by 3 days — RM100.00 (min RM10.00)',
    'Card A — Due in 4 days — RM200.00 (min RM20.00)',
  ]);
});

it('hides the panel when nothing is due soon', async () => {
  await renderWithData(<DashboardPage />);
  expect(screen.queryByRole('region', { name: 'Upcoming payments' })).not.toBeInTheDocument();
});
```
`SettingsPage.test.tsx`: assert the text `Saved PDF passwords are not included in backups.` is shown.

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { nameOf } from '../../app/selectors';
import { statementStatus, upcomingPayments } from '../../statements/logic';
import { formatRM } from '../../lib/money';

export function UpcomingPayments() {
  const data = useAppData();
  const items = upcomingPayments(data.statements, data.today);
  if (items.length === 0) return null;
  return (
    <section className="panel" aria-label="Upcoming payments">
      <h2>Upcoming payments</h2>
      <ul>
        {items.map((s) => {
          const st = statementStatus(s, data.today);
          return (
            <li key={s.id}>
              <Link to="/bills">{nameOf(data, s.userCardId)}</Link> — <span className={`chip chip-${st.tone}`}>{st.label}</span> —{' '}
              {formatRM(s.statementBalance)} (min {formatRM(s.minimumDue)})
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```
Render `<UpcomingPayments />` directly after `<h1>Dashboard</h1>`. In SettingsPage's backup section add `<p className="muted">Saved PDF passwords are not included in backups.</p>`.

- [ ] **Step 4: E2E** — add to `e2e/smoke.spec.ts`:

```ts
test('add a bill manually, see it on the dashboard, mark it paid', async ({ page }) => {
  await page.goto('/');
  await addFirstCatalogCard(page);
  await page.getByRole('link', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByLabel('Card').selectOption({ index: 1 });
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const stmt = new Date(today); stmt.setDate(stmt.getDate() - 15);
  const due = new Date(today); due.setDate(due.getDate() + 5);
  await page.getByLabel('Statement date').fill(iso(stmt));
  await page.getByLabel('Payment due date').fill(iso(due));
  await page.getByLabel('Statement balance (RM)').fill('500');
  await page.getByLabel('Minimum due (RM)').fill('25');
  await page.getByRole('button', { name: 'Save statement' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('region', { name: 'Upcoming payments' })).toContainText('Due in 5 days');
  await page.getByRole('link', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await page.getByRole('button', { name: 'Save payment' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('region', { name: 'Upcoming payments' })).toHaveCount(0);
});
```

- [ ] **Step 5: Run everything** — `npm test`, `npm run build`, `npm run e2e` → all pass.

- [ ] **Step 6: Commit** — `feat(dashboard): upcoming payments panel; e2e for bills`

---

## After all tasks

Publishing is outward-facing: the controller asks the user before running `git push` and `npm run deploy`.

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §1 criteria 1 (upload + prefill, 4 banks) | 5, 6, 7, 8, 11 |
| §1 criteria 2 (Bills, statuses, mark paid) | 3, 10 |
| §1 criteria 3 (calendar file) | 4, 10 |
| §1 criteria 4 (Dashboard panel) | 12 |
| §1 criteria 5 (persist + backups without passwords) | 1, 2 |
| §3 data model, Dexie v2, backup v2 | 1, 2 |
| §4 pipeline: extract, detect, match, readers, checks, review, "show extracted text" | 5, 6, 7, 8, 11 |
| §5 screens: Bills, Dashboard, Cards (last4, forget password), Settings note | 9, 10, 11, 12 |
| §6 calendar (9am alerts, UID, folding) | 4 |
| §7 error handling | 5, 8, 10, 11 |
| §8 testing incl. PII-safe fixtures | every task; PII scan in 6 |
| §9 privacy (PDF not stored, password opt-in, not in backups) | 2, 9, 11 |
| §10 PBB/AEON: manual until samples | 8, 11 |
