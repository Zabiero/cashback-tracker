# Cashback Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based Malaysian credit card cashback tracker (Finory-style) with a tested rules engine, local IndexedDB storage, and screens for dashboard, best-card recommendation, transactions, cards, reports, and settings.

**Architecture:** A React + TypeScript single-page app built with Vite. All cashback math lives in a pure-TypeScript `src/engine/` module with no React or storage imports. Storage goes through a `Repository` interface (Dexie/IndexedDB implementation in v1) so cloud sync can be swapped in later. UI reads everything through one `DataProvider` context and derives earnings on the fly — earnings are never stored.

**Tech Stack:** Vite, React 18+, TypeScript (strict), react-router-dom (HashRouter), Dexie, Recharts, vite-plugin-pwa, Vitest + Testing Library + jsdom + fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-cashback-tracker-design.md`

## Global Constraints

- Platform: Windows 11, Node.js LTS; run commands from the project root `C:\Users\weiho\OneDrive\Desktop\My Project\Finory`.
- English UI, RM currency only; format money with `formatRM` (e.g. `RM1,234.50`).
- Dates are local ISO date strings `YYYY-MM-DD`; never derive "today" from `toISOString()`.
- Statement cycle day must be 1–28.
- Engine functions are pure: "now"/"today" is always passed in.
- Disclaimer text shown wherever cashback totals appear: `Estimates only — check your bank statement`.
- No paywall or card limit.
- Catalog rules must come from official bank sources; anything unconfirmed ships with `verifiedOn: null` (UI shows "Unverified — please check").
- Out of scope for v1: login/cloud sync, CSV/AI import, missed-savings report, multi-currency, notifications, native builds.
- Commits: end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If `git commit` fails with "Author identity unknown", stop and ask the user to configure `git config --global user.name/user.email` — do not set it yourself.
- Deleting files via command line is blocked in this environment; if a file must be removed, tell the user the full path.

## Review Focus

1. Entering a transaction between midnight and 8am Malaysia time (UTC+8) — "today" must be the local date, not the UTC date. Pinned in Task 2 (`todayISO` test under `TZ=Asia/Kuala_Lumpur`).
2. Amounts typed as `RM1,234.50`, `1,234`, `.5`, `12.345`, `abc`, `-20` — the first three accepted, `12.345`/`abc` rejected with a message, `-20` accepted as a refund. Pinned in Task 12 (`parseMoney` tests).
3. The user deletes an auto-generated recurring transaction — it must not reappear on the next app open. Pinned in Task 10 (`runRecurring` test).
4. Importing a non-JSON file, a newer-schema backup, or a backup whose transactions reference a missing card — rejected with a clear message and existing data untouched. Pinned in Task 9 (`parseBackup` tests).
5. One broken card (catalog entry removed, or invalid custom rules) — that card shows an error; dashboard and recommendations still work for all other cards. Pinned in Task 11 (`DataProvider` test).

---

## File Structure

```
index.html
package.json, tsconfig.json, vite.config.ts, playwright.config.ts, .gitignore
public/icon.svg
e2e/smoke.spec.ts
src/
  main.tsx                     entry; mounts <App repo={new DexieRepository()} />
  App.tsx                      DataProvider + HashRouter + Layout
  styles.css
  engine/
    types.ts                   domain types + CATEGORIES/PAYMENT_METHODS
    dates.ts                   ISO date helpers, todayISO, daysBetween
    periods.ts                 getPeriod, inPeriod, nextPeriod
    rules.ts                   ruleMatches, rateFor, selectRule, nextTierFor
    earnings.ts                calculateEarnings, round2
    resolve.ts                 resolveCard
    recommend.ts               recommend
    format.ts                  formatRate, describeRule
    validate.ts                validateCardProduct
    report.ts                  allPeriodEarnings, monthlyReport, effectiveRate
    recurring.ts               generateRecurring
  catalog/
    cards.json                 researched card products
    index.ts                   CATALOG, getProduct
    resolveUserCard.ts         resolveUserCard (catalog + engine)
    scenarios.ts               per-card T&C scenario data
  data/
    repository.ts              Repository interface, AppSnapshot, DEFAULT_SETTINGS
    dexieRepository.ts         Dexie implementation
    backup.ts                  makeBackup, parseBackup
    recurringRunner.ts         runRecurring
    storageCheck.ts            checkStorage
  lib/
    id.ts, money.ts, labels.ts, merchantMemory.ts, download.ts
  app/
    DataProvider.tsx           AppData context
    selectors.ts               activeCards, cardInputs, currentEarnings, earningsByTransaction, nameOf
    backupReminder.ts          needsBackupReminder
    Layout.tsx                 nav + routes + banners
  components/
    CapMeter.tsx, PurchaseFields.tsx
  features/
    dashboard/DashboardPage.tsx
    recommend/WhichCardPage.tsx
    transactions/TransactionsPage.tsx, TransactionForm.tsx
    cards/CardsPage.tsx, AddCardDialog.tsx, RuleEditor.tsx, customCard.ts
    reports/ReportsPage.tsx
    settings/SettingsPage.tsx
  test/
    setup.ts, fixtures.ts, renderWithData.tsx
```

Tests sit next to the file they test as `*.test.ts(x)`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test/setup.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` (Vitest, jsdom, globals, fake-indexeddb auto-loaded, TZ `Asia/Kuala_Lumpur`), `npm run dev`, `npm run build`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "cashback-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```
npm install react react-dom react-router-dom dexie recharts
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb vite-plugin-pwa @playwright/test
```
Expected: installs without errors; `package.json` now lists them.

- [ ] **Step 3: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

`src/test/setup.ts`:
```ts
process.env.TZ = 'Asia/Kuala_Lumpur';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

`.gitignore`:
```
node_modules
dist
dev-dist
test-results
playwright-report
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cashback Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/styles.css`:
```css
:root {
  --bg: #f7f7f5; --surface: #fff; --text: #1c1c1c; --muted: #666;
  --accent: #0f766e; --warn: #b45309; --danger: #b91c1c; --border: #e3e3e0;
  font-family: system-ui, sans-serif; color: var(--text); background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #141414; --surface: #1e1e1e; --text: #eee; --muted: #aaa; --border: #333; }
}
body { margin: 0; }
.shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
.nav { display: flex; flex-direction: column; gap: 4px; padding: 16px; background: var(--surface); border-right: 1px solid var(--border); }
.nav a { padding: 8px 12px; border-radius: 8px; color: inherit; text-decoration: none; white-space: nowrap; }
.nav a.active { background: var(--accent); color: #fff; }
.main { padding: 24px; max-width: 960px; }
@media (max-width: 700px) {
  .shell { grid-template-columns: 1fr; }
  .nav { position: fixed; bottom: 0; left: 0; right: 0; flex-direction: row; overflow-x: auto; border-right: 0; border-top: 1px solid var(--border); z-index: 10; }
  .main { padding: 16px 16px 80px; }
}
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.fields { display: grid; gap: 12px; }
label { display: grid; gap: 4px; font-size: 14px; }
label.inline { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; }
input, select, button { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: inherit; }
button { cursor: pointer; }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.cap { margin: 8px 0; }
.cap-label { display: flex; justify-content: space-between; font-size: 13px; }
.cap-track { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.cap-fill { height: 100%; background: var(--accent); }
.cap-warn .cap-fill { background: var(--warn); }
.cap-full .cap-fill { background: var(--danger); }
.banner { background: #fef3c7; color: #78350f; padding: 8px 12px; border-radius: 8px; }
.error { color: var(--danger); }
.muted { color: var(--muted); font-size: 13px; }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--border); }
.badge.warn { background: #fef3c7; color: #78350f; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); font-size: 14px; }
.results { list-style: none; padding: 0; display: grid; gap: 8px; }
```

- [ ] **Step 4: Write the failing test** — `src/App.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

it('renders the app title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Cashback Tracker' })).toBeInTheDocument();
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — cannot resolve `./App`.

- [ ] **Step 6: Write `src/App.tsx`**

```tsx
export default function App() {
  return <h1>Cashback Tracker</h1>;
}
```

- [ ] **Step 7: Run tests and build**

Run: `npm test` then `npm run build`
Expected: 1 test passes; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore src
git commit -m "chore: scaffold Vite React TypeScript app with Vitest"
```

---

### Task 2: Engine types, dates, and periods

**Files:**
- Create: `src/engine/types.ts`, `src/engine/dates.ts`, `src/engine/periods.ts`
- Test: `src/engine/dates.test.ts`, `src/engine/periods.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - types: `Category`, `CATEGORIES`, `PaymentMethod`, `PAYMENT_METHODS`, `RewardType`, `Weekday`, `Tier`, `Rule`, `CardProduct`, `UserCard`, `Transaction`, `RecurringTemplate`, `Settings`
  - `parseISODate(s) → {y,m,d}`, `toISODate(y,m,d) → string` (normalises overflow), `addDays(date,n)`, `weekdayOf(date) → Weekday`, `todayISO(now?: Date) → string`, `daysBetween(a,b) → number`
  - `interface Period { start: string; end: string }`, `getPeriod(card: Pick<CardProduct,'periodType'|'defaultCycleDay'>, date) → Period`, `inPeriod(date, p) → boolean`, `nextPeriod(card, p) → Period`

- [ ] **Step 1: Write `src/engine/types.ts`** (types only; no test of its own)

```ts
export const CATEGORIES = [
  'petrol', 'groceries', 'dining', 'online', 'ewallet', 'utilities', 'travel', 'insurance', 'others',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PAYMENT_METHODS = ['contactless', 'online', 'physical', 'ewallet_reload', 'any'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type RewardType = 'cashback' | 'points';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Tier {
  minPeriodSpend: number; // RM, total spend on the card in the period
  rate: number; // cashback: fraction (0.05 = 5%); points: points per RM1
}

export interface Rule {
  id: string;
  label: string;
  rate: number;
  tiers?: Tier[]; // ascending by minPeriodSpend; replaces rate when present
  categories?: Category[];
  merchants?: string[]; // case-insensitive substring match on merchant name
  paymentMethods?: PaymentMethod[];
  days?: Weekday[];
  capPerPeriod?: number; // in reward units (RM or points)
  capGroup?: string;
}

export interface CardProduct {
  id: string;
  bank: string;
  name: string;
  rewardType: RewardType;
  pointValueRM?: number; // RM value of ONE point
  periodType: 'statement' | 'calendar';
  defaultCycleDay?: number; // 1–28
  capGroups?: Record<string, number>;
  totalCapPerPeriod?: number;
  minMonthlySpendToEarn?: number;
  rules: Rule[];
  sourceUrl: string;
  verifiedOn: string | null;
  catalogVersion: number;
}

export interface UserCard {
  id: string;
  productId: string | null; // null = custom card; overrides then holds the full CardProduct
  nickname: string;
  cycleDay?: number;
  overrides?: Partial<CardProduct>;
  catalogVersionSeen: number;
  archived: boolean;
}

export interface Transaction {
  id: string;
  userCardId: string;
  date: string;
  amount: number; // negative = refund
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  note?: string;
  recurringId?: string;
  createdAt: string; // ordering tiebreak for same-date transactions
}

export interface RecurringTemplate {
  id: string;
  userCardId: string;
  amount: number;
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  dayOfPeriod: 'first';
  active: boolean;
  startDate: string;
  lastGeneratedPeriodStart?: string;
}

export interface Settings {
  schemaVersion: number;
  lastBackupAt: string | null;
  pointValueOverrides: Record<string, number>; // productId -> RM per point
}
```

Note: `Transaction.createdAt`, `RecurringTemplate.startDate` and `lastGeneratedPeriodStart` are additions to the spec's types, needed for deterministic ordering and for not regenerating deleted recurring transactions.

- [ ] **Step 2: Write failing tests** — `src/engine/dates.test.ts`

```ts
import { addDays, daysBetween, toISODate, todayISO, weekdayOf } from './dates';

describe('dates', () => {
  it('normalises overflowing months and days', () => {
    expect(toISODate(2026, 13, 1)).toBe('2027-01-01');
    expect(toISODate(2026, 3, 0)).toBe('2026-02-28');
    expect(toISODate(2026, 0, 15)).toBe('2025-12-15');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
  it('gives weekdays with Sunday = 0', () => {
    expect(weekdayOf('2026-09-26')).toBe(6); // Saturday
    expect(weekdayOf('2026-09-27')).toBe(0); // Sunday
    expect(weekdayOf('2026-09-24')).toBe(4); // Thursday
  });
  it('uses the local date for today, not UTC (Malaysia is UTC+8)', () => {
    const earlyMorning = new Date(2026, 8, 24, 1, 30); // 01:30 local on 24 Sep
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-09-23'); // proves TZ is UTC+8 in tests
    expect(todayISO(earlyMorning)).toBe('2026-09-24');
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-08-25', '2026-09-24')).toBe(30);
  });
});
```

`src/engine/periods.test.ts`:
```ts
import { getPeriod, inPeriod, nextPeriod } from './periods';

const calendar = { periodType: 'calendar' as const };
const cycle15 = { periodType: 'statement' as const, defaultCycleDay: 15 };

describe('getPeriod', () => {
  it('returns the calendar month', () => {
    expect(getPeriod(calendar, '2026-09-24')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(getPeriod(calendar, '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
  it('returns the statement cycle on and after the cycle day', () => {
    expect(getPeriod(cycle15, '2026-09-15')).toEqual({ start: '2026-09-15', end: '2026-10-14' });
  });
  it('returns the previous cycle before the cycle day', () => {
    expect(getPeriod(cycle15, '2026-09-14')).toEqual({ start: '2026-08-15', end: '2026-09-14' });
  });
  it('wraps across years', () => {
    expect(getPeriod(cycle15, '2026-01-10')).toEqual({ start: '2025-12-15', end: '2026-01-14' });
    expect(getPeriod(cycle15, '2026-12-20')).toEqual({ start: '2026-12-15', end: '2027-01-14' });
  });
  it('treats cycle day 1 as the calendar month', () => {
    expect(getPeriod({ periodType: 'statement', defaultCycleDay: 1 }, '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('inPeriod / nextPeriod', () => {
  it('includes both ends', () => {
    const p = { start: '2026-09-15', end: '2026-10-14' };
    expect(inPeriod('2026-09-15', p)).toBe(true);
    expect(inPeriod('2026-10-14', p)).toBe(true);
    expect(inPeriod('2026-10-15', p)).toBe(false);
  });
  it('moves to the following period', () => {
    expect(nextPeriod(cycle15, { start: '2026-09-15', end: '2026-10-14' })).toEqual({ start: '2026-10-15', end: '2026-11-14' });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/engine`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/engine/dates.ts`**

```ts
import type { Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function parseISODate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** m is 1–12; out-of-range months/days roll over (day 0 = last day of previous month). */
export function toISODate(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseISODate(date);
  return toISODate(y, m, d + n);
}

export function weekdayOf(date: string): Weekday {
  const { y, m, d } = parseISODate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

/** Local calendar date. Never use toISOString() for this — it is UTC. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => {
    const { y, m, d } = parseISODate(s);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}
```

- [ ] **Step 5: Implement `src/engine/periods.ts`**

```ts
import type { CardProduct } from './types';
import { addDays, parseISODate, toISODate } from './dates';

export interface Period {
  start: string;
  end: string;
}

type PeriodCard = Pick<CardProduct, 'periodType' | 'defaultCycleDay'>;

export function getPeriod(card: PeriodCard, date: string): Period {
  const { y, m, d } = parseISODate(date);
  const c = card.defaultCycleDay;
  if (card.periodType === 'calendar' || !c || c === 1) {
    return { start: toISODate(y, m, 1), end: toISODate(y, m + 1, 0) };
  }
  if (d >= c) return { start: toISODate(y, m, c), end: toISODate(y, m + 1, c - 1) };
  return { start: toISODate(y, m - 1, c), end: toISODate(y, m, c - 1) };
}

export function inPeriod(date: string, p: Period): boolean {
  return date >= p.start && date <= p.end;
}

export function nextPeriod(card: PeriodCard, p: Period): Period {
  return getPeriod(card, addDays(p.end, 1));
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/engine`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine
git commit -m "feat(engine): domain types, date helpers and period calculation"
```

---

### Task 3: Rule matching and selection

**Files:**
- Create: `src/engine/rules.ts`, `src/test/fixtures.ts`
- Test: `src/engine/rules.test.ts`

**Interfaces:**
- Consumes: `Rule`, `Transaction`, `weekdayOf` (Task 2)
- Produces:
  - `type MatchableTx = Pick<Transaction, 'category' | 'merchant' | 'paymentMethod' | 'date'>`
  - `ruleMatches(rule, tx: MatchableTx) → boolean`
  - `rateFor(rule, periodSpend) → number`
  - `selectRule(rules, tx: MatchableTx, periodSpend) → { rule: Rule; rate: number } | null` (highest rate; ties → earlier rule)
  - `nextTierFor(rule, periodSpend) → { spendNeeded: number; nextRate: number } | null`
  - test fixtures: `tx(partial)`, `card(partial)`, `SEP: Period`

- [ ] **Step 1: Write `src/test/fixtures.ts`**

```ts
import type { CardProduct, Transaction } from '../engine/types';
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
```

- [ ] **Step 2: Write failing tests** — `src/engine/rules.test.ts`

```ts
import { nextTierFor, rateFor, ruleMatches, selectRule } from './rules';
import type { Rule } from './types';
import { tx } from '../test/fixtures';

describe('ruleMatches', () => {
  it('matches everything when no filters are set', () => {
    expect(ruleMatches({ id: 'a', label: 'A', rate: 0.01 }, tx({ amount: 10 }))).toBe(true);
  });
  it('filters by category', () => {
    const r: Rule = { id: 'd', label: 'Dining', rate: 0.05, categories: ['dining'] };
    expect(ruleMatches(r, tx({ amount: 10, category: 'dining' }))).toBe(true);
    expect(ruleMatches(r, tx({ amount: 10, category: 'petrol' }))).toBe(false);
  });
  it('matches merchants case-insensitively by substring', () => {
    const r: Rule = { id: 's', label: 'Shell', rate: 0.08, merchants: ['shell'] };
    expect(ruleMatches(r, tx({ amount: 10, merchant: 'SHELL Jalan Ampang' }))).toBe(true);
    expect(ruleMatches(r, tx({ amount: 10, merchant: 'Petronas' }))).toBe(false);
    expect(ruleMatches(r, tx({ amount: 10 }))).toBe(false);
  });
  it('filters by payment method, with "any" matching all', () => {
    const r: Rule = { id: 'c', label: 'Contactless', rate: 0.05, paymentMethods: ['contactless'] };
    expect(ruleMatches(r, tx({ amount: 10, paymentMethod: 'contactless' }))).toBe(true);
    expect(ruleMatches(r, tx({ amount: 10, paymentMethod: 'physical' }))).toBe(false);
    expect(ruleMatches({ ...r, paymentMethods: ['any'] }, tx({ amount: 10, paymentMethod: 'physical' }))).toBe(true);
  });
  it('filters by weekday', () => {
    const r: Rule = { id: 'w', label: 'Weekend', rate: 0.05, days: [0, 6] };
    expect(ruleMatches(r, tx({ amount: 10, date: '2026-09-26' }))).toBe(true); // Sat
    expect(ruleMatches(r, tx({ amount: 10, date: '2026-09-24' }))).toBe(false); // Thu
  });
});

describe('rateFor', () => {
  const tiered: Rule = { id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] };
  it('uses base rate without tiers', () => {
    expect(rateFor({ id: 'a', label: 'A', rate: 0.03 }, 5000)).toBe(0.03);
  });
  it('picks the highest tier reached, inclusive of the threshold', () => {
    expect(rateFor(tiered, 999.99)).toBe(0.002);
    expect(rateFor(tiered, 1000)).toBe(0.05);
  });
  it('returns 0 below the first tier', () => {
    expect(rateFor({ ...tiered, tiers: [{ minPeriodSpend: 500, rate: 0.05 }] }, 100)).toBe(0);
  });
});

describe('selectRule', () => {
  const rules: Rule[] = [
    { id: 'all', label: 'All', rate: 0.01 },
    { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'] },
    { id: 'dine2', label: 'Dining again', rate: 0.05, categories: ['dining'] },
  ];
  it('picks the highest-rate matching rule, ties going to the earlier rule', () => {
    expect(selectRule(rules, tx({ amount: 10, category: 'dining' }), 0)).toEqual({ rule: rules[1], rate: 0.05 });
  });
  it('returns null when nothing matches', () => {
    expect(selectRule([rules[1]], tx({ amount: 10, category: 'petrol' }), 0)).toBeNull();
  });
});

describe('nextTierFor', () => {
  const tiered: Rule = { id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] };
  it('reports spend needed for the next tier', () => {
    expect(nextTierFor(tiered, 600)).toEqual({ spendNeeded: 400, nextRate: 0.05 });
  });
  it('returns null at the top tier or without tiers', () => {
    expect(nextTierFor(tiered, 1200)).toBeNull();
    expect(nextTierFor({ id: 'a', label: 'A', rate: 0.01 }, 0)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/engine/rules.test.ts`
Expected: FAIL — `./rules` not found.

- [ ] **Step 4: Implement `src/engine/rules.ts`**

```ts
import type { Rule, Transaction } from './types';
import { weekdayOf } from './dates';

export type MatchableTx = Pick<Transaction, 'category' | 'merchant' | 'paymentMethod' | 'date'>;

export function ruleMatches(rule: Rule, tx: MatchableTx): boolean {
  if (rule.categories?.length && !rule.categories.includes(tx.category)) return false;
  if (
    rule.paymentMethods?.length &&
    !rule.paymentMethods.includes('any') &&
    !rule.paymentMethods.includes(tx.paymentMethod)
  ) {
    return false;
  }
  if (rule.days?.length && !rule.days.includes(weekdayOf(tx.date))) return false;
  if (rule.merchants?.length) {
    const m = (tx.merchant ?? '').trim().toLowerCase();
    if (!m || !rule.merchants.some((x) => m.includes(x.trim().toLowerCase()))) return false;
  }
  return true;
}

export function rateFor(rule: Rule, periodSpend: number): number {
  if (!rule.tiers?.length) return rule.rate;
  let rate = 0;
  for (const t of rule.tiers) if (periodSpend >= t.minPeriodSpend) rate = t.rate;
  return rate;
}

export function selectRule(rules: Rule[], tx: MatchableTx, periodSpend: number): { rule: Rule; rate: number } | null {
  let best: { rule: Rule; rate: number } | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, tx)) continue;
    const rate = rateFor(rule, periodSpend);
    if (!best || rate > best.rate) best = { rule, rate };
  }
  return best;
}

export function nextTierFor(rule: Rule, periodSpend: number): { spendNeeded: number; nextRate: number } | null {
  const next = rule.tiers?.find((t) => t.minPeriodSpend > periodSpend);
  return next ? { spendNeeded: next.minPeriodSpend - periodSpend, nextRate: next.rate } : null;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/engine/rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/rules.ts src/engine/rules.test.ts src/test/fixtures.ts
git commit -m "feat(engine): rule matching, tier rates and rule selection"
```

---

### Task 4: Earnings calculation

**Files:**
- Create: `src/engine/earnings.ts`
- Test: `src/engine/earnings.test.ts`

**Interfaces:**
- Consumes: `selectRule`, `nextTierFor` (Task 3); `Period`, `inPeriod` (Task 2)
- Produces:
  - `round2(n) → number` (2 dp, never returns `-0`)
  - `interface CapStatus { key: string; label: string; usedRM: number; limitRM: number }` — keys `rule:<id>`, `group:<name>`, `total`
  - `interface TxEarning { transactionId: string; ruleId: string | null; earnedRM: number; cappedRM: number }`
  - `interface PeriodEarnings { period; totalSpend; totalEarnedRM; perTransaction: TxEarning[]; caps: CapStatus[]; nextTier?: { ruleId; spendNeeded; nextRate }; locked?: { spendNeeded } }`
  - `calculateEarnings(card: CardProduct, transactions: Transaction[], period: Period) → PeriodEarnings` — caller passes only this card's transactions; ones outside `period` are ignored.

- [ ] **Step 1: Write failing tests** — `src/engine/earnings.test.ts`

```ts
import { calculateEarnings } from './earnings';
import { card, SEP, tx } from '../test/fixtures';

const at5 = card({ rules: [{ id: 'all', label: 'All spend', rate: 0.05 }] });

describe('calculateEarnings', () => {
  it('earns the base rate', () => {
    const t = tx({ amount: 100 });
    const e = calculateEarnings(at5, [t], SEP);
    expect(e.totalSpend).toBe(100);
    expect(e.totalEarnedRM).toBe(5);
    expect(e.perTransaction).toEqual([{ transactionId: t.id, ruleId: 'all', earnedRM: 5, cappedRM: 0 }]);
  });

  it('earns nothing when no rule matches', () => {
    const c = card({ rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'] }] });
    const e = calculateEarnings(c, [tx({ amount: 100, category: 'petrol' })], SEP);
    expect(e.totalEarnedRM).toBe(0);
    expect(e.perTransaction[0].ruleId).toBeNull();
  });

  it('uses the highest matching rule only', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.01 }, { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'] }] });
    const e = calculateEarnings(c, [tx({ amount: 100, category: 'dining' })], SEP);
    expect(e.totalEarnedRM).toBe(5);
    expect(e.perTransaction[0].ruleId).toBe('dine');
  });

  it('applies a rule cap, partially capping the transaction that crosses it', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.05, capPerPeriod: 10 }] });
    const e = calculateEarnings(c, [tx({ amount: 150, date: '2026-09-01' }), tx({ amount: 100, date: '2026-09-02' })], SEP);
    expect(e.totalEarnedRM).toBe(10);
    expect(e.perTransaction[1]).toMatchObject({ earnedRM: 2.5, cappedRM: 2.5 });
    expect(e.caps).toEqual([{ key: 'rule:all', label: 'All', usedRM: 10, limitRM: 10 }]);
  });

  it('shares a cap group between rules', () => {
    const c = card({
      capGroups: { g: 15 },
      rules: [
        { id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capGroup: 'g' },
        { id: 'fuel', label: 'Petrol', rate: 0.05, categories: ['petrol'], capGroup: 'g' },
      ],
    });
    const e = calculateEarnings(c, [tx({ amount: 200, category: 'dining', date: '2026-09-01' }), tx({ amount: 200, category: 'petrol', date: '2026-09-02' })], SEP);
    expect(e.totalEarnedRM).toBe(15);
  });

  it('applies the card total cap', () => {
    const c = card({ totalCapPerPeriod: 8, rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
    expect(calculateEarnings(c, [tx({ amount: 200 })], SEP).totalEarnedRM).toBe(8);
  });

  describe('tiers (whole-period spend decides the tier)', () => {
    const tiered = card({ rules: [{ id: 't', label: 'Tiered', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] }] });
    it('applies the higher tier to all spend once crossed', () => {
      expect(calculateEarnings(tiered, [tx({ amount: 600 }), tx({ amount: 500 })], SEP).totalEarnedRM).toBe(55);
    });
    it('uses the lower tier below the threshold and reports the next tier', () => {
      const e = calculateEarnings(tiered, [tx({ amount: 600 })], SEP);
      expect(e.totalEarnedRM).toBe(1.2);
      expect(e.nextTier).toEqual({ ruleId: 't', spendNeeded: 400, nextRate: 0.05 });
    });
    it('treats spend exactly at the threshold as reaching the tier', () => {
      expect(calculateEarnings(tiered, [tx({ amount: 1000 })], SEP).totalEarnedRM).toBe(50);
    });
  });

  it('earns nothing and reports locked when minimum spend is not met', () => {
    const c = card({ minMonthlySpendToEarn: 500, rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
    const e = calculateEarnings(c, [tx({ amount: 300 })], SEP);
    expect(e.totalEarnedRM).toBe(0);
    expect(e.locked).toEqual({ spendNeeded: 200 });
    expect(e.perTransaction[0].earnedRM).toBe(0);
  });

  it('computes and caps points, then converts to RM', () => {
    const c = card({ rewardType: 'points', pointValueRM: 0.01, rules: [{ id: 'p', label: 'Points', rate: 5, capPerPeriod: 300 }] });
    const e = calculateEarnings(c, [tx({ amount: 100 })], SEP);
    expect(e.totalEarnedRM).toBe(3);
    expect(e.perTransaction[0]).toMatchObject({ earnedRM: 3, cappedRM: 2 });
    expect(e.caps[0]).toMatchObject({ usedRM: 3, limitRM: 3 });
  });

  it('reverses earnings for refunds and reduces spend', () => {
    const e = calculateEarnings(at5, [tx({ amount: 100, date: '2026-09-01' }), tx({ amount: -40, date: '2026-09-05' })], SEP);
    expect(e.totalSpend).toBe(60);
    expect(e.totalEarnedRM).toBe(3);
    expect(e.perTransaction[1].earnedRM).toBe(-2);
  });

  it('never reverses more than was earned', () => {
    const e = calculateEarnings(at5, [tx({ amount: -40 })], SEP);
    expect(e.totalSpend).toBe(0);
    expect(e.totalEarnedRM).toBe(0);
    expect(e.perTransaction[0].earnedRM).toBe(0);
  });

  it('ignores transactions outside the period', () => {
    expect(calculateEarnings(at5, [tx({ amount: 100, date: '2026-10-01' })], SEP).totalEarnedRM).toBe(0);
  });

  it('orders same-day transactions by createdAt when applying caps', () => {
    const c = card({ rules: [{ id: 'all', label: 'All', rate: 0.05, capPerPeriod: 5 }] });
    const later = tx({ id: 'later', amount: 100, createdAt: 'b' });
    const earlier = tx({ id: 'earlier', amount: 100, createdAt: 'a' });
    const e = calculateEarnings(c, [later, earlier], SEP);
    expect(e.perTransaction.find((p) => p.transactionId === 'earlier')!.earnedRM).toBe(5);
    expect(e.perTransaction.find((p) => p.transactionId === 'later')!.earnedRM).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/earnings.test.ts`
Expected: FAIL — `./earnings` not found.

- [ ] **Step 3: Implement `src/engine/earnings.ts`**

```ts
import type { CardProduct, Transaction } from './types';
import { inPeriod, type Period } from './periods';
import { nextTierFor, selectRule } from './rules';

export interface CapStatus {
  key: string;
  label: string;
  usedRM: number;
  limitRM: number;
}

export interface TxEarning {
  transactionId: string;
  ruleId: string | null;
  earnedRM: number;
  cappedRM: number;
}

export interface PeriodEarnings {
  period: Period;
  totalSpend: number;
  totalEarnedRM: number;
  perTransaction: TxEarning[];
  caps: CapStatus[];
  nextTier?: { ruleId: string; spendNeeded: number; nextRate: number };
  locked?: { spendNeeded: number };
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100 || 0;

export function calculateEarnings(card: CardProduct, transactions: Transaction[], period: Period): PeriodEarnings {
  const txs = transactions
    .filter((t) => inPeriod(t.date, period))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const totalSpend = round2(Math.max(0, txs.reduce((s, t) => s + t.amount, 0)));
  const factor = card.rewardType === 'points' ? card.pointValueRM ?? 0 : 1;
  const locked =
    card.minMonthlySpendToEarn != null && totalSpend < card.minMonthlySpendToEarn
      ? { spendNeeded: round2(card.minMonthlySpendToEarn - totalSpend) }
      : undefined;

  const limits: { key: string; label: string; limit: number }[] = [];
  for (const r of card.rules) if (r.capPerPeriod != null) limits.push({ key: `rule:${r.id}`, label: r.label, limit: r.capPerPeriod });
  for (const [g, limit] of Object.entries(card.capGroups ?? {})) limits.push({ key: `group:${g}`, label: g, limit });
  if (card.totalCapPerPeriod != null) limits.push({ key: 'total', label: 'Card total', limit: card.totalCapPerPeriod });
  const limitOf = new Map(limits.map((l) => [l.key, l.limit]));

  const used = new Map<string, number>(); // reward units per cap key
  const earnedByRule = new Map<string, number>(); // reward units per rule
  const perTransaction: TxEarning[] = [];
  let totalUnits = 0;

  for (const t of txs) {
    const sel = selectRule(card.rules, t, totalSpend);
    if (!sel || locked) {
      perTransaction.push({ transactionId: t.id, ruleId: sel?.rule.id ?? null, earnedRM: 0, cappedRM: 0 });
      continue;
    }
    const keys = [`rule:${sel.rule.id}`, ...(sel.rule.capGroup ? [`group:${sel.rule.capGroup}`] : []), 'total'].filter((k) =>
      limitOf.has(k),
    );
    const raw = t.amount * sel.rate;
    let units: number;
    if (raw >= 0) {
      units = Math.max(0, Math.min(raw, ...keys.map((k) => limitOf.get(k)! - (used.get(k) ?? 0))));
    } else {
      const back = Math.min(-raw, earnedByRule.get(sel.rule.id) ?? 0);
      units = back === 0 ? 0 : -back;
    }
    for (const k of keys) used.set(k, Math.max(0, (used.get(k) ?? 0) + units));
    earnedByRule.set(sel.rule.id, (earnedByRule.get(sel.rule.id) ?? 0) + units);
    totalUnits += units;
    perTransaction.push({
      transactionId: t.id,
      ruleId: sel.rule.id,
      earnedRM: round2(units * factor),
      cappedRM: raw > 0 ? round2((raw - units) * factor) : 0,
    });
  }

  let nextTier: PeriodEarnings['nextTier'];
  for (const r of card.rules) {
    const n = nextTierFor(r, totalSpend);
    if (n && (!nextTier || n.spendNeeded < nextTier.spendNeeded)) {
      nextTier = { ruleId: r.id, spendNeeded: round2(n.spendNeeded), nextRate: n.nextRate };
    }
  }

  return {
    period,
    totalSpend,
    totalEarnedRM: round2(totalUnits * factor),
    perTransaction,
    caps: limits.map((l) => ({
      key: l.key,
      label: l.label,
      usedRM: round2((used.get(l.key) ?? 0) * factor),
      limitRM: round2(l.limit * factor),
    })),
    ...(nextTier ? { nextTier } : {}),
    ...(locked ? { locked } : {}),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/earnings.test.ts`
Expected: PASS (all 15).

- [ ] **Step 5: Commit**

```bash
git add src/engine/earnings.ts src/engine/earnings.test.ts
git commit -m "feat(engine): period earnings with tiers, caps, min spend, points and refunds"
```

---

### Task 5: Card resolution, formatting, and recommendation

**Files:**
- Create: `src/engine/resolve.ts`, `src/engine/format.ts`, `src/engine/recommend.ts`
- Test: `src/engine/resolve.test.ts`, `src/engine/format.test.ts`, `src/engine/recommend.test.ts`

**Interfaces:**
- Consumes: `calculateEarnings`, `round2` (Task 4); `getPeriod` (Task 2); `selectRule` (Task 3)
- Produces:
  - `resolveCard(userCard: UserCard, product: CardProduct | null, pointValueOverrides?: Record<string, number>) → CardProduct` (throws if custom card has no definition)
  - `formatRate(rate, rewardType) → string` (`"5%"`, `"8 pts/RM"`); `describeRule(rule, rewardType) → string`
  - `interface Purchase { amount; category; merchant?; paymentMethod; date }`
  - `interface CardInput { userCard: UserCard; card: CardProduct; transactions: Transaction[] }`
  - `interface Recommendation { userCardId; incrementalRM; rate: number | null; ruleLabel: string | null; reason: string; capUtilisation: number }`
  - `recommend(inputs: CardInput[], purchase: Purchase) → Recommendation[]` (archived cards excluded; sorted by incrementalRM desc then capUtilisation asc)

Note: `formatRM` is needed by the engine's reason strings, so it lives in `src/lib/money.ts` and is created here (its parsing counterpart comes in Task 12).

- [ ] **Step 1: Write failing tests**

`src/engine/resolve.test.ts`:
```ts
import { resolveCard } from './resolve';
import type { UserCard } from './types';
import { card } from '../test/fixtures';

const uc = (p: Partial<UserCard> = {}): UserCard => ({ id: 'u1', productId: 'test-card', nickname: '', catalogVersionSeen: 1, archived: false, ...p });

describe('resolveCard', () => {
  it('returns the catalog product unchanged when there are no overrides', () => {
    expect(resolveCard(uc(), card())).toEqual(card());
  });
  it('merges overrides and the user cycle day', () => {
    const r = resolveCard(uc({ cycleDay: 20, overrides: { totalCapPerPeriod: 50 } }), card({ periodType: 'statement', defaultCycleDay: 15 }));
    expect(r.totalCapPerPeriod).toBe(50);
    expect(r.defaultCycleDay).toBe(20);
  });
  it('applies a settings point value unless the card overrides it', () => {
    const p = card({ rewardType: 'points', pointValueRM: 0.01 });
    expect(resolveCard(uc(), p, { 'test-card': 0.02 }).pointValueRM).toBe(0.02);
    expect(resolveCard(uc({ overrides: { pointValueRM: 0.03 } }), p, { 'test-card': 0.02 }).pointValueRM).toBe(0.03);
  });
  it('uses overrides as the full definition for custom cards', () => {
    expect(resolveCard(uc({ productId: null, overrides: card({ name: 'Mine' }) }), null).name).toBe('Mine');
  });
  it('throws for a custom card without a definition', () => {
    expect(() => resolveCard(uc({ productId: null }), null)).toThrow();
  });
});
```

`src/engine/format.test.ts`:
```ts
import { describeRule, formatRate } from './format';
import { formatRM } from '../lib/money';

describe('formatRate', () => {
  it('formats cashback as a percentage and points per RM', () => {
    expect(formatRate(0.05, 'cashback')).toBe('5%');
    expect(formatRate(0.002, 'cashback')).toBe('0.2%');
    expect(formatRate(8, 'points')).toBe('8 pts/RM');
  });
});

describe('describeRule', () => {
  it('summarises filters and caps', () => {
    expect(
      describeRule({ id: 'w', label: 'Weekend dining', rate: 0.05, categories: ['dining', 'groceries'], days: [0, 6], capPerPeriod: 30 }, 'cashback'),
    ).toBe('5% · Dining, Groceries · Sun, Sat · cap RM30.00');
  });
  it('summarises tiers, merchants and payment methods', () => {
    expect(
      describeRule({ id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }], merchants: ['Shell'], paymentMethods: ['contactless'] }, 'cashback'),
    ).toBe('0.2% → 5% from RM1,000.00 · at Shell · Contactless');
  });
  it('shows point caps in points', () => {
    expect(describeRule({ id: 'p', label: 'P', rate: 5, capPerPeriod: 5000 }, 'points')).toBe('5 pts/RM · cap 5000 pts');
  });
});

describe('formatRM', () => {
  it('formats with thousands separators and sign', () => {
    expect(formatRM(1234.5)).toBe('RM1,234.50');
    expect(formatRM(-5)).toBe('-RM5.00');
    expect(formatRM(0)).toBe('RM0.00');
  });
});
```

`src/engine/recommend.test.ts`:
```ts
import { recommend, type CardInput, type Purchase } from './recommend';
import type { UserCard } from './types';
import { card, tx } from '../test/fixtures';

const uc = (id: string, archived = false): UserCard => ({ id, productId: null, nickname: id, catalogVersionSeen: 1, archived });
const dining = (amount: number): Purchase => ({ amount, category: 'dining', paymentMethod: 'contactless', date: '2026-09-24' });

const flat1: CardInput = { userCard: uc('A'), card: card({ rules: [{ id: 'all', label: 'All spend', rate: 0.01 }] }), transactions: [] };
const dine5 = (spentAlready: number): CardInput => ({
  userCard: uc('B'),
  card: card({ rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capPerPeriod: 30 }] }),
  transactions: spentAlready ? [tx({ userCardId: 'B', amount: spentAlready, category: 'dining', date: '2026-09-02' })] : [],
});

describe('recommend', () => {
  it('ranks by incremental RM after remaining caps', () => {
    const r = recommend([flat1, dine5(590)], dining(100)); // B has RM0.50 of cap left
    expect(r.map((x) => x.userCardId)).toEqual(['A', 'B']);
    expect(r[0].incrementalRM).toBe(1);
    expect(r[1].incrementalRM).toBe(0.5);
    expect(r[1].reason).toBe('5% Dining — RM0.00 cap left');
  });
  it('prefers the higher-rate card when cap room exists', () => {
    const r = recommend([flat1, dine5(0)], dining(100));
    expect(r[0]).toMatchObject({ userCardId: 'B', incrementalRM: 5, rate: 0.05, ruleLabel: 'Dining' });
    expect(r[0].reason).toBe('5% Dining — RM25.00 cap left');
  });
  it('explains a reached cap', () => {
    const r = recommend([dine5(600)], dining(100));
    expect(r[0]).toMatchObject({ incrementalRM: 0, reason: 'Cap reached — earns RM0.00' });
  });
  it('counts a tier crossing retroactively', () => {
    const tiered: CardInput = {
      userCard: uc('T'),
      card: card({ rules: [{ id: 't', label: 'Tiered', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] }] }),
      transactions: [tx({ userCardId: 'T', amount: 900, date: '2026-09-02' })],
    };
    expect(recommend([tiered], dining(200))[0].incrementalRM).toBe(53.2);
  });
  it('explains a minimum-spend lock', () => {
    const lockedCard: CardInput = {
      userCard: uc('L'),
      card: card({ minMonthlySpendToEarn: 500, rules: [{ id: 'all', label: 'All', rate: 0.05 }] }),
      transactions: [tx({ userCardId: 'L', amount: 100, date: '2026-09-02' })],
    };
    expect(recommend([lockedCard], dining(100))[0].reason).toBe('Spend RM300.00 more this period to unlock rewards');
  });
  it('explains when no rule matches', () => {
    const petrolOnly: CardInput = { userCard: uc('P'), card: card({ rules: [{ id: 'p', label: 'Petrol', rate: 0.05, categories: ['petrol'] }] }), transactions: [] };
    expect(recommend([petrolOnly], dining(100))[0]).toMatchObject({ incrementalRM: 0, rate: null, reason: 'No reward for this purchase' });
  });
  it('excludes archived cards', () => {
    expect(recommend([{ ...flat1, userCard: uc('A', true) }], dining(100))).toEqual([]);
  });
  it('only counts transactions in the purchase period', () => {
    const lastMonth = { ...dine5(0), transactions: [tx({ userCardId: 'B', amount: 600, category: 'dining', date: '2026-08-20' })] };
    expect(recommend([lastMonth], dining(100))[0].incrementalRM).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine`
Expected: FAIL — `./resolve`, `./format`, `./recommend`, `../lib/money` not found.

- [ ] **Step 3: Implement `src/lib/money.ts` (format only for now)**

```ts
export function formatRM(n: number): string {
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${sign}RM${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}
```

- [ ] **Step 4: Implement `src/lib/labels.ts`**

```ts
import type { Category, PaymentMethod } from '../engine/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  petrol: 'Petrol', groceries: 'Groceries', dining: 'Dining', online: 'Online', ewallet: 'E-wallet',
  utilities: 'Utilities', travel: 'Travel', insurance: 'Insurance', others: 'Others',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  contactless: 'Contactless', online: 'Online', physical: 'Chip/PIN', ewallet_reload: 'E-wallet reload', any: 'Any',
};

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
```

- [ ] **Step 5: Implement `src/engine/resolve.ts`**

```ts
import type { CardProduct, UserCard } from './types';

export function resolveCard(
  userCard: UserCard,
  product: CardProduct | null,
  pointValueOverrides: Record<string, number> = {},
): CardProduct {
  let merged: CardProduct;
  if (product) {
    merged = { ...product, ...userCard.overrides };
    if (userCard.overrides?.pointValueRM == null && pointValueOverrides[product.id] != null) {
      merged.pointValueRM = pointValueOverrides[product.id];
    }
  } else {
    if (!userCard.overrides) throw new Error(`Custom card "${userCard.nickname}" has no definition`);
    merged = { ...(userCard.overrides as CardProduct) };
  }
  if (userCard.cycleDay) merged.defaultCycleDay = userCard.cycleDay;
  return merged;
}
```

- [ ] **Step 6: Implement `src/engine/format.ts`**

```ts
import type { RewardType, Rule } from './types';
import { formatRM } from '../lib/money';
import { CATEGORY_LABELS, DAY_LABELS, PAYMENT_LABELS } from '../lib/labels';

export function formatRate(rate: number, rewardType: RewardType): string {
  return rewardType === 'points' ? `${rate} pts/RM` : `${Number((rate * 100).toFixed(2))}%`;
}

export function describeRule(rule: Rule, rewardType: RewardType): string {
  const parts: string[] = [];
  if (rule.tiers?.length) {
    parts.push(
      rule.tiers
        .map((t, i) => (i === 0 && t.minPeriodSpend === 0 ? formatRate(t.rate, rewardType) : `${formatRate(t.rate, rewardType)} from ${formatRM(t.minPeriodSpend)}`))
        .join(' → '),
    );
  } else {
    parts.push(formatRate(rule.rate, rewardType));
  }
  if (rule.categories?.length) parts.push(rule.categories.map((c) => CATEGORY_LABELS[c]).join(', '));
  if (rule.merchants?.length) parts.push(`at ${rule.merchants.join(', ')}`);
  if (rule.paymentMethods?.length) parts.push(rule.paymentMethods.map((p) => PAYMENT_LABELS[p]).join(', '));
  if (rule.days?.length) parts.push(rule.days.map((d) => DAY_LABELS[d]).join(', '));
  if (rule.capPerPeriod != null) parts.push(rewardType === 'points' ? `cap ${rule.capPerPeriod} pts` : `cap ${formatRM(rule.capPerPeriod)}`);
  return parts.join(' · ');
}
```

- [ ] **Step 7: Implement `src/engine/recommend.ts`**

```ts
import type { CardProduct, Category, PaymentMethod, Transaction, UserCard } from './types';
import { calculateEarnings, round2 } from './earnings';
import { getPeriod } from './periods';
import { selectRule } from './rules';
import { formatRate } from './format';
import { formatRM } from '../lib/money';

export interface Purchase {
  amount: number;
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  date: string;
}

export interface CardInput {
  userCard: UserCard;
  card: CardProduct;
  transactions: Transaction[]; // this card's transactions only
}

export interface Recommendation {
  userCardId: string;
  incrementalRM: number;
  rate: number | null;
  ruleLabel: string | null;
  reason: string;
  capUtilisation: number; // 0–1, highest across the card's caps after the purchase
}

const HYPOTHETICAL_ID = '__purchase__';

export function recommend(inputs: CardInput[], purchase: Purchase): Recommendation[] {
  return inputs
    .filter((i) => !i.userCard.archived)
    .map(({ userCard, card, transactions }) => {
      const period = getPeriod(card, purchase.date);
      const hypo: Transaction = { ...purchase, id: HYPOTHETICAL_ID, userCardId: userCard.id, createdAt: '\uffff' };
      const before = calculateEarnings(card, transactions, period);
      const after = calculateEarnings(card, [...transactions, hypo], period);
      const incrementalRM = round2(after.totalEarnedRM - before.totalEarnedRM);
      const sel = selectRule(card.rules, hypo, after.totalSpend);
      const capUtilisation = Math.max(0, ...after.caps.map((c) => (c.limitRM > 0 ? c.usedRM / c.limitRM : 1)));

      let reason: string;
      if (after.locked) {
        reason = `Spend ${formatRM(after.locked.spendNeeded)} more this period to unlock rewards`;
      } else if (!sel) {
        reason = 'No reward for this purchase';
      } else if (incrementalRM === 0) {
        reason = `Cap reached — earns ${formatRM(0)}`;
      } else {
        const keys = [`rule:${sel.rule.id}`, ...(sel.rule.capGroup ? [`group:${sel.rule.capGroup}`] : []), 'total'];
        const relevant = after.caps.filter((c) => keys.includes(c.key));
        const left = relevant.length ? Math.min(...relevant.map((c) => c.limitRM - c.usedRM)) : null;
        reason = `${formatRate(sel.rate, card.rewardType)} ${sel.rule.label}${left != null ? ` — ${formatRM(round2(left))} cap left` : ''}`;
      }

      return { userCardId: userCard.id, incrementalRM, rate: sel?.rate ?? null, ruleLabel: sel?.rule.label ?? null, reason, capUtilisation };
    })
    .sort((a, b) => b.incrementalRM - a.incrementalRM || a.capUtilisation - b.capUtilisation);
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/engine`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/engine src/lib
git commit -m "feat(engine): card resolution, rate formatting and best-card recommendation"
```

---

### Task 6: Card product validation

**Files:**
- Create: `src/engine/validate.ts`
- Test: `src/engine/validate.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `PAYMENT_METHODS`, `CardProduct`, `Rule` (Task 2)
- Produces: `validateCardProduct(input: unknown) → string[]` (empty = valid). Used by catalog tests, the rule editor, backup import, and `DataProvider`.

- [ ] **Step 1: Write failing tests** — `src/engine/validate.test.ts`

```ts
import { validateCardProduct } from './validate';
import { card } from '../test/fixtures';

describe('validateCardProduct', () => {
  it('accepts a valid card', () => {
    expect(validateCardProduct(card())).toEqual([]);
  });
  it('requires a point value for points cards', () => {
    expect(validateCardProduct(card({ rewardType: 'points' }))).toContain('Points cards need pointValueRM > 0');
  });
  it('limits the statement cycle day to 1–28', () => {
    expect(validateCardProduct(card({ periodType: 'statement', defaultCycleDay: 29 }))).toContain('defaultCycleDay must be 1–28');
  });
  it('requires at least one rule', () => {
    expect(validateCardProduct(card({ rules: [] }))).toContain('At least one rule is required');
  });
  it('rejects negative or missing rates', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: -1 }] }))).toContain('Rule 1: rate must be ≥ 0');
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: NaN }] }))).toContain('Rule 1: rate must be ≥ 0');
  });
  it('rejects duplicate rule ids', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0 }, { id: 'a', label: 'B', rate: 0 }] }))).toContain('Rule 2: duplicate id a');
  });
  it('requires tiers in ascending order', () => {
    const c = card({ rules: [{ id: 't', label: 'T', rate: 0, tiers: [{ minPeriodSpend: 1000, rate: 0.05 }, { minPeriodSpend: 0, rate: 0.01 }] }] });
    expect(validateCardProduct(c)).toContain('Rule 1: tiers must be in ascending order of spend');
  });
  it('requires cap groups to be defined', () => {
    expect(validateCardProduct(card({ rules: [{ id: 'a', label: 'A', rate: 0.01, capGroup: 'g' }] }))).toContain('Rule 1: cap group "g" is not defined');
  });
  it('rejects unknown categories and bad weekdays', () => {
    const c = card({ rules: [{ id: 'a', label: 'A', rate: 0.01, categories: ['shoes' as never], days: [7 as never] }] });
    const errs = validateCardProduct(c);
    expect(errs).toContain('Rule 1: unknown category shoes');
    expect(errs).toContain('Rule 1: days must be 0–6');
  });
  it('checks verifiedOn format', () => {
    expect(validateCardProduct(card({ verifiedOn: '24/09/2026' }))).toContain('verifiedOn must be null or YYYY-MM-DD');
  });
  it('rejects non-objects', () => {
    expect(validateCardProduct(null)).toEqual(['Card must be an object']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/validate.test.ts`
Expected: FAIL — `./validate` not found.

- [ ] **Step 3: Implement `src/engine/validate.ts`**

```ts
import { CATEGORIES, PAYMENT_METHODS, type CardProduct, type Rule } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const nonNeg = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const intIn = (n: unknown, lo: number, hi: number): boolean => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;

export function validateCardProduct(input: unknown): string[] {
  if (!input || typeof input !== 'object') return ['Card must be an object'];
  const p = input as Partial<CardProduct>;
  const e: string[] = [];

  for (const k of ['id', 'bank', 'name'] as const) if (typeof p[k] !== 'string' || !p[k]) e.push(`${k} is required`);
  if (p.rewardType !== 'cashback' && p.rewardType !== 'points') e.push('rewardType must be cashback or points');
  if (p.rewardType === 'points' && !(nonNeg(p.pointValueRM) && (p.pointValueRM as number) > 0)) e.push('Points cards need pointValueRM > 0');
  if (p.periodType !== 'calendar' && p.periodType !== 'statement') e.push('periodType must be calendar or statement');
  if (p.periodType === 'statement' && !intIn(p.defaultCycleDay, 1, 28)) e.push('defaultCycleDay must be 1–28');
  if (p.totalCapPerPeriod != null && !nonNeg(p.totalCapPerPeriod)) e.push('totalCapPerPeriod must be ≥ 0');
  if (p.minMonthlySpendToEarn != null && !nonNeg(p.minMonthlySpendToEarn)) e.push('minMonthlySpendToEarn must be ≥ 0');

  const groups = p.capGroups ?? {};
  for (const [g, v] of Object.entries(groups)) if (!nonNeg(v)) e.push(`Cap group ${g} must be ≥ 0`);

  if (!Array.isArray(p.rules) || p.rules.length === 0) {
    e.push('At least one rule is required');
  } else {
    const ids = new Set<string>();
    p.rules.forEach((r, i) => validateRule(r, `Rule ${i + 1}`, ids, groups, e));
  }

  if (typeof p.sourceUrl !== 'string') e.push('sourceUrl must be a string');
  if (p.verifiedOn !== null && !(typeof p.verifiedOn === 'string' && DATE_RE.test(p.verifiedOn))) e.push('verifiedOn must be null or YYYY-MM-DD');
  if (!intIn(p.catalogVersion, 1, Number.MAX_SAFE_INTEGER)) e.push('catalogVersion must be a positive integer');
  return e;
}

function validateRule(r: Rule, at: string, ids: Set<string>, groups: Record<string, number>, e: string[]): void {
  if (!r.id) e.push(`${at}: id is required`);
  else if (ids.has(r.id)) e.push(`${at}: duplicate id ${r.id}`);
  else ids.add(r.id);
  if (!r.label) e.push(`${at}: label is required`);
  if (!nonNeg(r.rate)) e.push(`${at}: rate must be ≥ 0`);
  r.tiers?.forEach((t, j) => {
    if (!nonNeg(t.rate) || !nonNeg(t.minPeriodSpend)) e.push(`${at}: tier ${j + 1} values must be ≥ 0`);
    if (j > 0 && t.minPeriodSpend <= r.tiers![j - 1].minPeriodSpend) e.push(`${at}: tiers must be in ascending order of spend`);
  });
  if (r.capPerPeriod != null && !nonNeg(r.capPerPeriod)) e.push(`${at}: cap must be ≥ 0`);
  if (r.capGroup && !(r.capGroup in groups)) e.push(`${at}: cap group "${r.capGroup}" is not defined`);
  r.categories?.forEach((c) => {
    if (!(CATEGORIES as readonly string[]).includes(c)) e.push(`${at}: unknown category ${c}`);
  });
  r.paymentMethods?.forEach((m) => {
    if (!(PAYMENT_METHODS as readonly string[]).includes(m)) e.push(`${at}: unknown payment method ${m}`);
  });
  if (r.days?.some((d) => !intIn(d, 0, 6))) e.push(`${at}: days must be 0–6`);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/validate.ts src/engine/validate.test.ts
git commit -m "feat(engine): card product validation"
```

---

### Task 7: Card catalog (research + data)

This task is data research. Its correctness depends on official bank sources, not on code.

**Files:**
- Create: `src/catalog/cards.json`, `src/catalog/index.ts`, `src/catalog/scenarios.ts`, `src/catalog/resolveUserCard.ts`
- Test: `src/catalog/catalog.test.ts`

**Interfaces:**
- Consumes: `validateCardProduct` (Task 6), `calculateEarnings` (Task 4), `resolveCard` (Task 5)
- Produces:
  - `CATALOG: CardProduct[]`, `getProduct(id) → CardProduct | undefined`
  - `resolveUserCard(uc: UserCard, settings: Pick<Settings, 'pointValueOverrides'>) → CardProduct` (throws `This card is no longer in the catalog. Recreate it as a custom card.` if the product id is unknown)
  - `interface CatalogScenario`, `SCENARIOS: CatalogScenario[]`

**Product ids (fixed — other tasks and tests may reference them):**

| id | Card |
|---|---|
| `maybank-islamic-ikhwan-amex-platinum` | Maybank Islamic Ikhwan American Express Platinum |
| `rhb-shell-visa` | RHB Shell Visa |
| `uob-one-classic` | UOB One Classic |
| `alliance-visa-infinite` | Alliance Bank Visa Infinite |
| `alliance-visa-virtual` | Alliance Bank Visa Virtual Credit Card |
| `pbb-quantum-visa` | Public Bank Quantum Visa |
| `pbb-quantum-mastercard` | Public Bank Quantum Mastercard |
| `aeon-amp-visa-platinum` | AEON AMP Visa Platinum |

- [ ] **Step 1: Write `src/catalog/index.ts`, `src/catalog/resolveUserCard.ts`, and `src/catalog/scenarios.ts` skeleton types**

`src/catalog/index.ts`:
```ts
import type { CardProduct } from '../engine/types';
import cards from './cards.json';

export const CATALOG: CardProduct[] = cards as unknown as CardProduct[]; // shape enforced by catalog.test.ts

export function getProduct(id: string): CardProduct | undefined {
  return CATALOG.find((c) => c.id === id);
}
```

`src/catalog/resolveUserCard.ts`:
```ts
import type { CardProduct, Settings, UserCard } from '../engine/types';
import { resolveCard } from '../engine/resolve';
import { getProduct } from './index';

export function resolveUserCard(uc: UserCard, settings: Pick<Settings, 'pointValueOverrides'>): CardProduct {
  if (uc.productId) {
    const product = getProduct(uc.productId);
    if (!product) throw new Error('This card is no longer in the catalog. Recreate it as a custom card.');
    return resolveCard(uc, product, settings.pointValueOverrides);
  }
  return resolveCard(uc, null, settings.pointValueOverrides);
}
```

`src/catalog/scenarios.ts` (the `SCENARIOS` array is filled in Step 4):
```ts
import type { Category, PaymentMethod } from '../engine/types';

export interface CatalogScenario {
  productId: string;
  description: string;
  period: { start: string; end: string };
  transactions: { date: string; amount: number; category: Category; paymentMethod: PaymentMethod; merchant?: string }[];
  expectedRM: number;
  source: string; // URL + clause/example the expected value comes from
}

export const SCENARIOS: CatalogScenario[] = [
  // one or more entries per catalog card — see Task 7 Step 4
];
```

- [ ] **Step 2: Write the catalog test** — `src/catalog/catalog.test.ts`

```ts
import { CATALOG, getProduct } from './index';
import { SCENARIOS } from './scenarios';
import { resolveUserCard } from './resolveUserCard';
import { validateCardProduct } from '../engine/validate';
import { calculateEarnings } from '../engine/earnings';
import type { Transaction } from '../engine/types';

const EXPECTED_IDS = [
  'maybank-islamic-ikhwan-amex-platinum', 'rhb-shell-visa', 'uob-one-classic', 'alliance-visa-infinite',
  'alliance-visa-virtual', 'pbb-quantum-visa', 'pbb-quantum-mastercard', 'aeon-amp-visa-platinum',
];

describe('catalog', () => {
  it('contains exactly the expected cards', () => {
    expect(CATALOG.map((c) => c.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });
  it.each(CATALOG.map((c) => [c.id, c] as const))('%s is valid', (_id, c) => {
    expect(validateCardProduct(c)).toEqual([]);
  });
  it.each(CATALOG.map((c) => [c.id, c] as const))('%s records its source', (_id, c) => {
    expect(c.sourceUrl).toMatch(/^https:\/\//);
  });
  it.each(EXPECTED_IDS)('%s has at least one scenario', (id) => {
    expect(SCENARIOS.some((s) => s.productId === id)).toBe(true);
  });
  it.each(SCENARIOS.map((s) => [`${s.productId}: ${s.description}`, s] as const))('%s', (_name, s) => {
    const product = getProduct(s.productId)!;
    const txs: Transaction[] = s.transactions.map((t, i) => ({ ...t, id: `s${i}`, userCardId: 'u', createdAt: String(i).padStart(4, '0') }));
    expect(calculateEarnings(product, txs, s.period).totalEarnedRM).toBeCloseTo(s.expectedRM, 2);
  });
});

describe('resolveUserCard', () => {
  it('throws a helpful error for a removed catalog card', () => {
    expect(() => resolveUserCard({ id: 'u', productId: 'gone', nickname: '', catalogVersionSeen: 1, archived: false }, { pointValueOverrides: {} })).toThrow(
      'This card is no longer in the catalog. Recreate it as a custom card.',
    );
  });
});
```

- [ ] **Step 3: Research each card**

For each of the 8 cards, in order:
1. Use Firecrawl (`firecrawl_search` then `firecrawl_scrape`) to find the bank's **official** product page and the latest cashback/rewards T&C PDF (use `parsers: ["pdf"]` for PDFs). Do not use blogs or comparison sites as the source of truth; they may be used only to find the official link.
2. Extract: reward type (cashback vs points); every earning rate and its conditions (category, merchant, payment method, day of week); tier thresholds; per-category caps and which categories share a cap; overall cap; minimum monthly spend; whether the period is the statement cycle or the calendar month; for points cards, the best cash-equivalent redemption (RM value of one point).
3. Check whether tier thresholds apply to the **whole** period spend (the engine's model) or only to spend above the threshold. If a card's rules need a condition the engine cannot express (e.g. a minimum number of transactions, marginal tiers, per-transaction caps), **stop and report to the user** with the exact T&C clause — do not approximate silently.
4. If the card name cannot be found as a current product (e.g. "AEON AMP Visa Platinum" may have a different official name), stop and ask the user which card they hold.

- [ ] **Step 4: Encode results in `src/catalog/cards.json` and `src/catalog/scenarios.ts`**

Each entry follows `CardProduct`. Example of the encoding pattern (illustrative values — the real values must come from Step 3):
```json
{
  "id": "rhb-shell-visa",
  "bank": "RHB",
  "name": "Shell Visa",
  "rewardType": "cashback",
  "periodType": "statement",
  "defaultCycleDay": 15,
  "capGroups": { "weekend": 50 },
  "rules": [
    { "id": "shell", "label": "Shell petrol", "rate": 0, "merchants": ["shell"], "categories": ["petrol"],
      "tiers": [{ "minPeriodSpend": 0, "rate": 0.02 }, { "minPeriodSpend": 2000, "rate": 0.08 }], "capPerPeriod": 50 },
    { "id": "weekend-dining", "label": "Weekend dining", "rate": 0.05, "categories": ["dining"], "days": [0, 6], "capGroup": "weekend" },
    { "id": "other", "label": "Other spend", "rate": 0 }
  ],
  "sourceUrl": "https://www.rhbgroup.com/...",
  "verifiedOn": "2026-09-24",
  "catalogVersion": 1
}
```
Rules:
- `verifiedOn` = today's date only when every rule in the entry was confirmed from the official source; otherwise `null`.
- If the statement cycle day varies per customer, set `defaultCycleDay` to the most common value found in the T&C (or 1 if none) — users override it in the UI.
- Add at least one `SCENARIOS` entry per card, preferring worked examples given in the T&C itself; put the URL and clause/page in `source`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/catalog`
Expected: PASS. If a scenario fails, re-read the T&C — fix the data, not the engine. If the engine truly can't model the clause, stop and report (Step 3.3).

- [ ] **Step 6: Commit**

```bash
git add src/catalog
git commit -m "feat(catalog): researched rules for the user's 8 Malaysian cards"
```

---

### Task 8: Repository and Dexie storage

**Files:**
- Create: `src/data/repository.ts`, `src/data/dexieRepository.ts`, `src/data/storageCheck.ts`, `src/lib/id.ts`
- Test: `src/data/dexieRepository.test.ts`

**Interfaces:**
- Consumes: domain types (Task 2)
- Produces:
  - `interface TransactionFilter { userCardId?: string; from?: string; to?: string }`
  - `interface AppSnapshot { userCards: UserCard[]; transactions: Transaction[]; templates: RecurringTemplate[]; settings: Settings }`
  - `interface Repository { listUserCards(); saveUserCard(c); listTransactions(f?); saveTransaction(t); saveTransactions(ts); deleteTransaction(id); listTemplates(); saveTemplate(t); getSettings(); saveSettings(s); exportAll(): Promise<AppSnapshot>; replaceAll(s: AppSnapshot) }` — all return Promises
  - `DEFAULT_SETTINGS: Settings`
  - `class DexieRepository implements Repository` — `new DexieRepository(dbName = 'cashback-tracker')`
  - `checkStorage() → Promise<boolean>`
  - `newId() → string`

- [ ] **Step 1: Write failing tests** — `src/data/dexieRepository.test.ts`

```ts
import { DexieRepository } from './dexieRepository';
import { DEFAULT_SETTINGS } from './repository';
import { checkStorage } from './storageCheck';
import type { UserCard } from '../engine/types';
import { tx } from '../test/fixtures';

const repo = () => new DexieRepository(`test-${Math.random()}`);
const uc: UserCard = { id: 'u1', productId: 'rhb-shell-visa', nickname: '', catalogVersionSeen: 1, archived: false };

describe('DexieRepository', () => {
  it('saves and lists user cards', async () => {
    const r = repo();
    await r.saveUserCard(uc);
    expect(await r.listUserCards()).toEqual([uc]);
  });

  it('filters transactions by card and date range', async () => {
    const r = repo();
    await r.saveTransactions([
      tx({ id: 'a', userCardId: 'u1', amount: 1, date: '2026-08-31' }),
      tx({ id: 'b', userCardId: 'u1', amount: 1, date: '2026-09-01' }),
      tx({ id: 'c', userCardId: 'u2', amount: 1, date: '2026-09-02' }),
    ]);
    expect((await r.listTransactions({ userCardId: 'u1', from: '2026-09-01' })).map((t) => t.id)).toEqual(['b']);
    expect((await r.listTransactions({ to: '2026-09-01' })).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('updates and deletes transactions', async () => {
    const r = repo();
    const t = tx({ id: 'a', amount: 10 });
    await r.saveTransaction(t);
    await r.saveTransaction({ ...t, amount: 20 });
    expect((await r.listTransactions())[0].amount).toBe(20);
    await r.deleteTransaction('a');
    expect(await r.listTransactions()).toEqual([]);
  });

  it('returns default settings until saved', async () => {
    const r = repo();
    expect(await r.getSettings()).toEqual(DEFAULT_SETTINGS);
    await r.saveSettings({ ...DEFAULT_SETTINGS, lastBackupAt: '2026-09-24' });
    expect((await r.getSettings()).lastBackupAt).toBe('2026-09-24');
  });

  it('exports and replaces everything', async () => {
    const r = repo();
    await r.saveUserCard(uc);
    await r.saveTransaction(tx({ id: 'a', userCardId: 'u1', amount: 5 }));
    const snap = await r.exportAll();
    const other = repo();
    await other.saveUserCard({ ...uc, id: 'old' });
    await other.replaceAll(snap);
    expect((await other.listUserCards()).map((c) => c.id)).toEqual(['u1']);
    expect(await other.listTransactions()).toHaveLength(1);
  });
});

describe('checkStorage', () => {
  it('reports IndexedDB as available', async () => {
    expect(await checkStorage()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/id.ts`**

```ts
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
```

- [ ] **Step 4: Implement `src/data/repository.ts`**

```ts
import type { RecurringTemplate, Settings, Transaction, UserCard } from '../engine/types';

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
  exportAll(): Promise<AppSnapshot>;
  replaceAll(snapshot: AppSnapshot): Promise<void>;
}
```

- [ ] **Step 5: Implement `src/data/dexieRepository.ts`**

```ts
import Dexie, { type Table } from 'dexie';
import type { RecurringTemplate, Settings, Transaction, UserCard } from '../engine/types';
import { DEFAULT_SETTINGS, type AppSnapshot, type Repository, type TransactionFilter } from './repository';

type SettingsRow = Settings & { key: 'app' };

class CashbackDB extends Dexie {
  userCards!: Table<UserCard, string>;
  transactions!: Table<Transaction, string>;
  templates!: Table<RecurringTemplate, string>;
  settings!: Table<SettingsRow, string>;

  constructor(name: string) {
    super(name);
    // Schema migrations: add this.version(2).stores({...}).upgrade(tx => ...) when the shape changes.
    this.version(1).stores({ userCards: 'id', transactions: 'id, userCardId, date', templates: 'id', settings: 'key' });
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
  async exportAll(): Promise<AppSnapshot> {
    return {
      userCards: await this.listUserCards(),
      transactions: await this.listTransactions(),
      templates: await this.listTemplates(),
      settings: await this.getSettings(),
    };
  }
  async replaceAll(s: AppSnapshot) {
    const { userCards, transactions, templates, settings } = this.db;
    await this.db.transaction('rw', [userCards, transactions, templates, settings], async () => {
      await Promise.all([userCards.clear(), transactions.clear(), templates.clear(), settings.clear()]);
      await userCards.bulkPut(s.userCards);
      await transactions.bulkPut(s.transactions);
      await templates.bulkPut(s.templates);
      await settings.put({ ...s.settings, key: 'app' });
    });
  }
}
```

- [ ] **Step 6: Implement `src/data/storageCheck.ts`**

```ts
export async function checkStorage(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('__storage_check__');
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/data`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/data src/lib/id.ts
git commit -m "feat(data): repository interface with Dexie IndexedDB implementation"
```

---

### Task 9: Backup export/import

**Files:**
- Create: `src/data/backup.ts`
- Test: `src/data/backup.test.ts`

**Interfaces:**
- Consumes: `AppSnapshot` (Task 8), `validateCardProduct` (Task 6), `CATEGORIES`, `PAYMENT_METHODS`
- Produces:
  - `BACKUP_SCHEMA_VERSION = 1`
  - `interface BackupFile extends AppSnapshot { app: 'cashback-tracker'; schemaVersion: number; exportedAt: string }`
  - `makeBackup(snapshot, exportedAt: string) → BackupFile`
  - `interface BackupSummary { cards: number; transactions: number; from: string | null; to: string | null }`
  - `parseBackup(text: string) → { ok: true; data: AppSnapshot; summary: BackupSummary } | { ok: false; error: string }`

- [ ] **Step 1: Write failing tests** — `src/data/backup.test.ts`

```ts
import { makeBackup, parseBackup } from './backup';
import { DEFAULT_SETTINGS, type AppSnapshot } from './repository';
import { card, tx } from '../test/fixtures';

const snap = (): AppSnapshot => ({
  userCards: [{ id: 'u1', productId: 'rhb-shell-visa', nickname: '', catalogVersionSeen: 1, archived: false }],
  transactions: [tx({ id: 'a', userCardId: 'u1', amount: 10, date: '2026-08-02' }), tx({ id: 'b', userCardId: 'u1', amount: 20, date: '2026-09-05' })],
  templates: [],
  settings: DEFAULT_SETTINGS,
});
const text = (o: unknown) => JSON.stringify(o);

describe('backup', () => {
  it('round-trips and summarises', () => {
    const base = snap(); // tx() fixtures get fresh createdAt values per call, so compare against the same instance
    const r = parseBackup(text(makeBackup(base, '2026-09-24T10:00:00Z')));
    expect(r).toEqual({ ok: true, data: base, summary: { cards: 1, transactions: 2, from: '2026-08-02', to: '2026-09-05' } });
  });
  it('rejects non-JSON', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
  });
  it('rejects files from other apps', () => {
    expect(parseBackup(text({ hello: 1 }))).toEqual({ ok: false, error: 'This is not a Cashback Tracker backup file.' });
  });
  it('rejects backups from a newer app version', () => {
    const b = { ...makeBackup(snap(), 'x'), schemaVersion: 99 };
    expect(parseBackup(text(b))).toEqual({ ok: false, error: 'This backup was made by a newer version of the app. Update the app and try again.' });
  });
  it('rejects transactions that reference a missing card', () => {
    const b = makeBackup({ ...snap(), userCards: [] }, 'x');
    expect(parseBackup(text(b))).toEqual({ ok: false, error: 'Transaction a refers to a card that is not in the backup.' });
  });
  it('rejects malformed transactions', () => {
    const s = snap();
    s.transactions[0] = { ...s.transactions[0], amount: 'ten' as never };
    expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Transaction a is malformed.' });
  });
  it('rejects invalid custom cards', () => {
    const s = snap();
    s.userCards[0] = { ...s.userCards[0], productId: null, nickname: 'Mine', overrides: card({ rules: [] }) };
    expect(parseBackup(text(makeBackup(s, 'x')))).toEqual({ ok: false, error: 'Custom card "Mine" is invalid: At least one rule is required' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/backup.test.ts`
Expected: FAIL — `./backup` not found.

- [ ] **Step 3: Implement `src/data/backup.ts`**

```ts
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
      const errs = validateCardProduct(c.overrides);
      if (errs.length) return fail(`Custom card "${c.nickname}" is invalid: ${errs[0]}`);
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
      typeof t.createdAt === 'string';
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

  const data = { userCards: b.userCards, transactions: b.transactions, templates: b.templates, settings: b.settings } as AppSnapshot;
  const dates = data.transactions.map((t) => t.date).sort();
  return {
    ok: true,
    data,
    summary: { cards: data.userCards.length, transactions: data.transactions.length, from: dates[0] ?? null, to: dates.at(-1) ?? null },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/data/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/backup.ts src/data/backup.test.ts
git commit -m "feat(data): validated JSON backup export and import"
```

---

### Task 10: Recurring transactions

**Files:**
- Create: `src/engine/recurring.ts`, `src/data/recurringRunner.ts`
- Test: `src/engine/recurring.test.ts`, `src/data/recurringRunner.test.ts`

**Interfaces:**
- Consumes: `getPeriod`, `nextPeriod` (Task 2); `Repository` (Task 8); `resolveUserCard` (Task 7)
- Produces:
  - `generateRecurring(templates, cardsById: Record<string, CardProduct>, today) → { transactions: Transaction[]; templates: RecurringTemplate[] }` — returned templates are only the ones whose `lastGeneratedPeriodStart` changed. Generated ids are `rec-<templateId>-<periodStart>`; date is the later of period start and template `startDate`.
  - `runRecurring(repo: Repository, today: string) → Promise<number>` (count generated)

- [ ] **Step 1: Write failing tests**

`src/engine/recurring.test.ts`:
```ts
import { generateRecurring } from './recurring';
import type { RecurringTemplate } from './types';
import { card } from '../test/fixtures';

const tpl = (p: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
  id: 't1', userCardId: 'u1', amount: 99, category: 'utilities', merchant: 'Unifi', paymentMethod: 'online',
  dayOfPeriod: 'first', active: true, startDate: '2026-07-10', ...p,
});
const cards = { u1: card() };

describe('generateRecurring', () => {
  it('creates one transaction per period from the start date to today', () => {
    const r = generateRecurring([tpl()], cards, '2026-09-24');
    expect(r.transactions.map((t) => [t.id, t.date])).toEqual([
      ['rec-t1-2026-07-01', '2026-07-10'],
      ['rec-t1-2026-08-01', '2026-08-01'],
      ['rec-t1-2026-09-01', '2026-09-01'],
    ]);
    expect(r.transactions[0]).toMatchObject({ userCardId: 'u1', amount: 99, category: 'utilities', recurringId: 't1' });
    expect(r.templates).toEqual([tpl({ lastGeneratedPeriodStart: '2026-09-01' })]);
  });
  it('only generates periods after the last generated one', () => {
    const r = generateRecurring([tpl({ lastGeneratedPeriodStart: '2026-08-01' })], cards, '2026-09-24');
    expect(r.transactions.map((t) => t.id)).toEqual(['rec-t1-2026-09-01']);
  });
  it('is idempotent when fed its own output', () => {
    const first = generateRecurring([tpl()], cards, '2026-09-24');
    const second = generateRecurring(first.templates, cards, '2026-09-24');
    expect(second).toEqual({ transactions: [], templates: [] });
  });
  it('skips inactive templates and unknown cards', () => {
    expect(generateRecurring([tpl({ active: false }), tpl({ id: 't2', userCardId: 'nope' })], cards, '2026-09-24').transactions).toEqual([]);
  });
  it('follows statement cycles', () => {
    const r = generateRecurring([tpl({ startDate: '2026-09-01' })], { u1: card({ periodType: 'statement', defaultCycleDay: 15 }) }, '2026-09-24');
    expect(r.transactions.map((t) => t.date)).toEqual(['2026-09-01', '2026-09-15']);
  });
});
```

`src/data/recurringRunner.test.ts`:
```ts
import { runRecurring } from './recurringRunner';
import { DexieRepository } from './dexieRepository';
import { card } from '../test/fixtures';

async function setup() {
  const repo = new DexieRepository(`test-${Math.random()}`);
  await repo.saveUserCard({ id: 'u1', productId: null, nickname: 'Mine', overrides: card(), catalogVersionSeen: 1, archived: false });
  await repo.saveTemplate({ id: 't1', userCardId: 'u1', amount: 99, category: 'utilities', paymentMethod: 'online', dayOfPeriod: 'first', active: true, startDate: '2026-07-10' });
  return repo;
}

describe('runRecurring', () => {
  it('stores generated transactions once', async () => {
    const repo = await setup();
    expect(await runRecurring(repo, '2026-09-24')).toBe(3);
    expect(await runRecurring(repo, '2026-09-24')).toBe(0);
    expect(await repo.listTransactions()).toHaveLength(3);
  });
  it('does not bring back a generated transaction the user deleted', async () => {
    const repo = await setup();
    await runRecurring(repo, '2026-09-24');
    await repo.deleteTransaction('rec-t1-2026-09-01');
    await runRecurring(repo, '2026-09-24');
    expect((await repo.listTransactions()).map((t) => t.id).sort()).toEqual(['rec-t1-2026-07-01', 'rec-t1-2026-08-01']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/recurring.test.ts src/data/recurringRunner.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/engine/recurring.ts`**

```ts
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
```

- [ ] **Step 4: Implement `src/data/recurringRunner.ts`**

```ts
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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/engine/recurring.test.ts src/data/recurringRunner.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/recurring.ts src/engine/recurring.test.ts src/data/recurringRunner.ts src/data/recurringRunner.test.ts
git commit -m "feat: recurring transactions generated once per period"
```

---

### Task 11: App shell, data context, and selectors

**Files:**
- Create: `src/app/DataProvider.tsx`, `src/app/selectors.ts`, `src/app/backupReminder.ts`, `src/app/Layout.tsx`, `src/engine/report.ts`, `src/test/renderWithData.tsx`, and page stubs `src/features/dashboard/DashboardPage.tsx`, `src/features/recommend/WhichCardPage.tsx`, `src/features/transactions/TransactionsPage.tsx`, `src/features/cards/CardsPage.tsx`, `src/features/reports/ReportsPage.tsx`, `src/features/settings/SettingsPage.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`
- Test: `src/app/selectors.test.ts`, `src/app/backupReminder.test.ts`, `src/app/DataProvider.test.tsx`, `src/engine/report.test.ts`

**Interfaces:**
- Consumes: `Repository`, `DexieRepository`, `checkStorage` (Task 8); `runRecurring` (Task 10); `resolveUserCard` (Task 7); `validateCardProduct` (Task 6); `calculateEarnings` (Task 4); `CardInput` (Task 5)
- Produces:
  - `interface AppData { repo; userCards; transactions; templates; settings; resolved: Record<string, CardProduct>; cardErrors: Record<string, string>; storageOk: boolean; today: string; refresh(): Promise<void> }`
  - `DataProvider({ repo, today?: () => string, children })`, `useAppData() → AppData`
  - selectors: `type SelectorData = Pick<AppData, 'userCards' | 'resolved' | 'transactions' | 'today'>`; `interface ActiveCard { userCard; card; name }`; `activeCards(d) → ActiveCard[]`; `nameOf(d, userCardId) → string`; `txnsFor(transactions, userCardId)`; `cardInputs(d, includeArchived = false) → CardInput[]`; `interface CardNow extends ActiveCard { earnings: PeriodEarnings }`; `currentEarnings(d) → CardNow[]`; `earningsByTransaction(d) → Map<string, number>`
  - report: `allPeriodEarnings(card, txs) → PeriodEarnings[]`; `interface MonthRow { month; spend; earnedRM; byCard: Record<string, number>; byCategory: Partial<Record<Category, number>> }`; `monthlyReport(inputs: CardInput[]) → MonthRow[]` (period attributed to the month of its **end** date); `effectiveRate(row) → number`
  - `needsBackupReminder(settings, transactionCount, today) → boolean`
  - `Layout` with routes `/`, `/which`, `/transactions`, `/cards`, `/reports`, `/settings`
  - test helpers: `renderWithData(ui, { route?, seed? }) → Promise<{ repo }>`, `seedCard(repo, product?, id?, nickname?) → Promise<UserCard>`, `FIXED_TODAY = '2026-09-24'`

- [ ] **Step 1: Write failing tests**

`src/engine/report.test.ts`:
```ts
import { allPeriodEarnings, effectiveRate, monthlyReport } from './report';
import { card, tx } from '../test/fixtures';
import type { UserCard } from './types';

const uc = (id: string): UserCard => ({ id, productId: null, nickname: id, catalogVersionSeen: 1, archived: false });
const at5 = card({ rules: [{ id: 'all', label: 'All', rate: 0.05 }] });

describe('allPeriodEarnings', () => {
  it('computes each period that has transactions', () => {
    const r = allPeriodEarnings(at5, [tx({ amount: 100, date: '2026-08-10' }), tx({ amount: 200, date: '2026-09-10' })]);
    expect(r.map((p) => [p.period.start, p.totalEarnedRM])).toEqual([['2026-08-01', 5], ['2026-09-01', 10]]);
  });
});

describe('monthlyReport', () => {
  it('aggregates by month, card and category', () => {
    const rows = monthlyReport([
      { userCard: uc('A'), card: at5, transactions: [tx({ userCardId: 'A', amount: 100, category: 'dining', date: '2026-09-02' })] },
      { userCard: uc('B'), card: at5, transactions: [tx({ userCardId: 'B', amount: 200, category: 'petrol', date: '2026-09-03' })] },
    ]);
    expect(rows).toEqual([{ month: '2026-09', spend: 300, earnedRM: 15, byCard: { A: 5, B: 10 }, byCategory: { dining: 5, petrol: 10 } }]);
    expect(effectiveRate(rows[0])).toBeCloseTo(0.05);
  });
  it('attributes a statement period to the month it ends in', () => {
    const c = card({ periodType: 'statement', defaultCycleDay: 15, rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
    const rows = monthlyReport([{ userCard: uc('A'), card: c, transactions: [tx({ userCardId: 'A', amount: 100, date: '2026-09-20' })] }]);
    expect(rows[0].month).toBe('2026-10');
  });
});
```

`src/app/backupReminder.test.ts`:
```ts
import { needsBackupReminder } from './backupReminder';
import { DEFAULT_SETTINGS } from '../data/repository';

describe('needsBackupReminder', () => {
  it('stays quiet with no data', () => {
    expect(needsBackupReminder(DEFAULT_SETTINGS, 0, '2026-09-24')).toBe(false);
  });
  it('reminds when never backed up', () => {
    expect(needsBackupReminder(DEFAULT_SETTINGS, 3, '2026-09-24')).toBe(true);
  });
  it('reminds only after more than 30 days', () => {
    expect(needsBackupReminder({ ...DEFAULT_SETTINGS, lastBackupAt: '2026-08-25' }, 3, '2026-09-24')).toBe(false);
    expect(needsBackupReminder({ ...DEFAULT_SETTINGS, lastBackupAt: '2026-08-24' }, 3, '2026-09-24')).toBe(true);
  });
});
```

`src/app/selectors.test.ts`:
```ts
import { activeCards, cardInputs, currentEarnings, earningsByTransaction, nameOf } from './selectors';
import { card, tx } from '../test/fixtures';
import type { UserCard } from '../engine/types';

const at5 = card({ bank: 'RHB', name: 'Shell Visa', rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
const d = {
  today: '2026-09-24',
  userCards: [
    { id: 'A', productId: null, nickname: '', catalogVersionSeen: 1, archived: false },
    { id: 'B', productId: null, nickname: 'Old card', catalogVersionSeen: 1, archived: true },
    { id: 'C', productId: null, nickname: 'Broken', catalogVersionSeen: 1, archived: false },
  ] as UserCard[],
  resolved: { A: at5, B: at5 },
  transactions: [
    tx({ id: 'x', userCardId: 'A', amount: 100, date: '2026-09-02' }),
    tx({ id: 'y', userCardId: 'A', amount: 100, date: '2026-08-02' }),
    tx({ id: 'z', userCardId: 'B', amount: 40, date: '2026-09-02' }),
  ],
};

describe('selectors', () => {
  it('lists active, resolvable cards with display names', () => {
    expect(activeCards(d).map((c) => [c.userCard.id, c.name])).toEqual([['A', 'RHB Shell Visa']]);
  });
  it('names cards by nickname, falling back to bank + name', () => {
    expect(nameOf(d, 'B')).toBe('Old card');
    expect(nameOf(d, 'missing')).toBe('Unknown card');
  });
  it('builds recommend inputs, optionally including archived cards', () => {
    expect(cardInputs(d).map((i) => i.userCard.id)).toEqual(['A']);
    expect(cardInputs(d, true).map((i) => i.userCard.id)).toEqual(['A', 'B']);
    expect(cardInputs(d)[0].transactions.map((t) => t.id)).toEqual(['x', 'y']);
  });
  it('computes current-period earnings per active card', () => {
    expect(currentEarnings(d).map((c) => c.earnings.totalEarnedRM)).toEqual([5]);
  });
  it('maps every transaction to its earnings, including archived cards', () => {
    const m = earningsByTransaction(d);
    expect([m.get('x'), m.get('y'), m.get('z')]).toEqual([5, 5, 2]);
  });
});
```

`src/test/renderWithData.tsx`:
```tsx
import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataProvider } from '../app/DataProvider';
import { DexieRepository } from '../data/dexieRepository';
import type { Repository } from '../data/repository';
import type { CardProduct, UserCard } from '../engine/types';
import { card } from './fixtures';

export const FIXED_TODAY = '2026-09-24';
const today = () => FIXED_TODAY;

export async function seedCard(repo: Repository, product: Partial<CardProduct> = {}, id = 'uc1', nickname = 'Test Card'): Promise<UserCard> {
  const uc: UserCard = { id, productId: null, nickname, overrides: card(product), catalogVersionSeen: 1, archived: false };
  await repo.saveUserCard(uc);
  return uc;
}

export async function renderWithData(
  ui: ReactElement,
  opts: { route?: string; seed?: (repo: Repository) => Promise<void> } = {},
): Promise<{ repo: Repository }> {
  const repo = new DexieRepository(`test-${Math.random()}`);
  if (opts.seed) await opts.seed(repo);
  render(
    <DataProvider repo={repo} today={today}>
      <MemoryRouter initialEntries={[opts.route ?? '/']}>{ui}</MemoryRouter>
    </DataProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return { repo };
}
```

`src/app/DataProvider.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { useAppData } from './DataProvider';
import { renderWithData, seedCard } from '../test/renderWithData';

function Probe() {
  const d = useAppData();
  return (
    <div>
      <p>resolved: {Object.keys(d.resolved).sort().join(',')}</p>
      <p>errors: {Object.entries(d.cardErrors).map(([k, v]) => `${k}=${v}`).join(';')}</p>
    </div>
  );
}

describe('DataProvider', () => {
  it('isolates a broken card and still resolves the others', async () => {
    await renderWithData(<Probe />, {
      seed: async (repo) => {
        await seedCard(repo, {}, 'good');
        await seedCard(repo, { rules: [] }, 'bad');
        await repo.saveUserCard({ id: 'gone', productId: 'removed-card', nickname: '', catalogVersionSeen: 1, archived: false });
      },
    });
    expect(screen.getByText('resolved: good')).toBeInTheDocument();
    expect(screen.getByText(/bad=At least one rule is required/)).toBeInTheDocument();
    expect(screen.getByText(/gone=This card is no longer in the catalog/)).toBeInTheDocument();
  });
});
```

Replace `src/App.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { Layout } from './app/Layout';
import { renderWithData } from './test/renderWithData';

it('renders navigation for every screen', async () => {
  await renderWithData(<Layout />);
  for (const name of ['Dashboard', 'Which card?', 'Transactions', 'Cards', 'Reports', 'Settings']) {
    expect(screen.getByRole('link', { name })).toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — new modules not found.

- [ ] **Step 3: Implement `src/engine/report.ts`**

```ts
import type { CardProduct, Category, Transaction } from './types';
import { calculateEarnings, round2, type PeriodEarnings } from './earnings';
import { getPeriod, type Period } from './periods';
import type { CardInput } from './recommend';

export function allPeriodEarnings(card: CardProduct, txs: Transaction[]): PeriodEarnings[] {
  const groups = new Map<string, { period: Period; txs: Transaction[] }>();
  for (const t of txs) {
    const period = getPeriod(card, t.date);
    const g = groups.get(period.start) ?? { period, txs: [] };
    g.txs.push(t);
    groups.set(period.start, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.period.start.localeCompare(b.period.start))
    .map((g) => calculateEarnings(card, g.txs, g.period));
}

export interface MonthRow {
  month: string; // YYYY-MM of the period's end date
  spend: number;
  earnedRM: number;
  byCard: Record<string, number>;
  byCategory: Partial<Record<Category, number>>;
}

export function monthlyReport(inputs: CardInput[]): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  for (const { userCard, card, transactions } of inputs) {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    for (const pe of allPeriodEarnings(card, transactions)) {
      const month = pe.period.end.slice(0, 7);
      const row = rows.get(month) ?? { month, spend: 0, earnedRM: 0, byCard: {}, byCategory: {} };
      row.spend = round2(row.spend + pe.totalSpend);
      row.earnedRM = round2(row.earnedRM + pe.totalEarnedRM);
      row.byCard[userCard.id] = round2((row.byCard[userCard.id] ?? 0) + pe.totalEarnedRM);
      for (const e of pe.perTransaction) {
        const cat = byId.get(e.transactionId)!.category;
        row.byCategory[cat] = round2((row.byCategory[cat] ?? 0) + e.earnedRM);
      }
      rows.set(month, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function effectiveRate(row: MonthRow): number {
  return row.spend > 0 ? row.earnedRM / row.spend : 0;
}
```

- [ ] **Step 4: Implement `src/app/backupReminder.ts`**

```ts
import type { Settings } from '../engine/types';
import { daysBetween } from '../engine/dates';

export function needsBackupReminder(settings: Settings, transactionCount: number, today: string): boolean {
  if (transactionCount === 0) return false;
  return settings.lastBackupAt === null || daysBetween(settings.lastBackupAt.slice(0, 10), today) > 30;
}
```

- [ ] **Step 5: Implement `src/app/DataProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CardProduct, RecurringTemplate, Settings, Transaction, UserCard } from '../engine/types';
import type { Repository } from '../data/repository';
import { checkStorage } from '../data/storageCheck';
import { runRecurring } from '../data/recurringRunner';
import { resolveUserCard } from '../catalog/resolveUserCard';
import { validateCardProduct } from '../engine/validate';
import { todayISO } from '../engine/dates';

export interface AppData {
  repo: Repository;
  userCards: UserCard[];
  transactions: Transaction[];
  templates: RecurringTemplate[];
  settings: Settings;
  resolved: Record<string, CardProduct>;
  cardErrors: Record<string, string>;
  storageOk: boolean;
  today: string;
  refresh(): Promise<void>;
}

interface Loaded {
  userCards: UserCard[];
  transactions: Transaction[];
  templates: RecurringTemplate[];
  settings: Settings;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used inside <DataProvider>');
  return v;
}

export function DataProvider({ repo, today = todayISO, children }: { repo: Repository; today?: () => string; children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [userCards, transactions, templates, settings] = await Promise.all([
      repo.listUserCards(),
      repo.listTransactions(),
      repo.listTemplates(),
      repo.getSettings(),
    ]);
    setLoaded({ userCards, transactions, templates, settings });
  }, [repo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkStorage();
      if (cancelled) return;
      setStorageOk(ok);
      try {
        await runRecurring(repo, today());
        await refresh();
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    const onFocus = () => {
      void runRecurring(repo, today()).then(refresh);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [repo, refresh, today]);

  const value = useMemo<AppData | null>(() => {
    if (!loaded) return null;
    const resolved: Record<string, CardProduct> = {};
    const cardErrors: Record<string, string> = {};
    for (const uc of loaded.userCards) {
      try {
        const card = resolveUserCard(uc, loaded.settings);
        const errs = validateCardProduct(card);
        if (errs.length) cardErrors[uc.id] = errs[0];
        else resolved[uc.id] = card;
      } catch (e) {
        cardErrors[uc.id] = e instanceof Error ? e.message : String(e);
      }
    }
    return { repo, ...loaded, resolved, cardErrors, storageOk, today: today(), refresh };
  }, [loaded, repo, storageOk, today, refresh]);

  if (loadError) return <p className="error" role="alert">Could not load your data: {loadError}</p>;
  if (!value) return <p>Loading…</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 6: Implement `src/app/selectors.ts`**

```ts
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
```

- [ ] **Step 7: Create page stubs** (each replaced by its own task later)

`src/features/dashboard/DashboardPage.tsx`:
```tsx
export function DashboardPage() {
  return <h1>Dashboard</h1>;
}
```
`src/features/recommend/WhichCardPage.tsx`:
```tsx
export function WhichCardPage() {
  return <h1>Which card?</h1>;
}
```
`src/features/transactions/TransactionsPage.tsx`:
```tsx
export function TransactionsPage() {
  return <h1>Transactions</h1>;
}
```
`src/features/cards/CardsPage.tsx`:
```tsx
export function CardsPage() {
  return <h1>Cards</h1>;
}
```
`src/features/reports/ReportsPage.tsx`:
```tsx
export function ReportsPage() {
  return <h1>Reports</h1>;
}
```
`src/features/settings/SettingsPage.tsx`:
```tsx
export function SettingsPage() {
  return <h1>Settings</h1>;
}
```

- [ ] **Step 8: Implement `src/app/Layout.tsx`**

```tsx
import { useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useAppData } from './DataProvider';
import { needsBackupReminder } from './backupReminder';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { WhichCardPage } from '../features/recommend/WhichCardPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { CardsPage } from '../features/cards/CardsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/which', label: 'Which card?' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/cards', label: 'Cards' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { storageOk, settings, transactions, today } = useAppData();
  const [continueWithoutStorage, setContinue] = useState(false);

  if (!storageOk && !continueWithoutStorage) {
    return (
      <main className="main" role="alert">
        <h1>Your data can't be saved in this browser</h1>
        <p>Storage is blocked (for example in a private window). Anything you enter will be lost when you close the tab.</p>
        <button type="button" onClick={() => setContinue(true)}>Continue anyway</button>
      </main>
    );
  }

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        {needsBackupReminder(settings, transactions.length, today) && (
          <p className="banner" role="status">
            You haven't backed up in over 30 days. <Link to="/settings">Export a backup</Link>
          </p>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/which" element={<WhichCardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 9: Replace `src/App.tsx` and `src/main.tsx`**

`src/App.tsx`:
```tsx
import { HashRouter } from 'react-router-dom';
import { DataProvider } from './app/DataProvider';
import { Layout } from './app/Layout';
import type { Repository } from './data/repository';

export default function App({ repo }: { repo: Repository }) {
  return (
    <DataProvider repo={repo}>
      <HashRouter>
        <Layout />
      </HashRouter>
    </DataProvider>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DexieRepository } from './data/dexieRepository';
import './styles.css';

const repo = new DexieRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App repo={repo} />
  </StrictMode>,
);
```

- [ ] **Step 10: Run tests and build**

Run: `npm test` then `npm run build`
Expected: all PASS; build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src
git commit -m "feat(app): data context, selectors, monthly report and navigation shell"
```

---

### Task 12: Transactions screen

**Files:**
- Create: `src/lib/merchantMemory.ts`, `src/components/PurchaseFields.tsx`, `src/features/transactions/TransactionForm.tsx`
- Modify: `src/lib/money.ts` (add `parseMoney`), `src/features/transactions/TransactionsPage.tsx` (replace stub)
- Test: `src/lib/money.test.ts`, `src/lib/merchantMemory.test.ts`, `src/features/transactions/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `useAppData`, `activeCards`, `nameOf`, `earningsByTransaction`, `ActiveCard` (Task 11); `getPeriod`; `newId`
- Produces:
  - `parseMoney(input: string) → number | null`
  - `knownMerchants(txs) → string[]`, `lastCategoryFor(merchant, txs) → Category | undefined`
  - `type TxPaymentMethod = Exclude<PaymentMethod, 'any'>`, `TX_PAYMENT_METHODS`, `interface PurchaseDraft { amount: string; category; merchant: string; paymentMethod: TxPaymentMethod; date }`, `emptyDraft(today) → PurchaseDraft`, `PurchaseFields({ value, onChange, merchants, categoryFor })` — renders labelled "Amount (RM)" input, a "Category" button group, "Merchant (optional)", "Payment method", "Date"
  - `TransactionForm({ cards, transactions, today, initial?, onSubmit(tx, makeRecurring), onCancel? })` — submit button "Save transaction"; recurring checkbox "Repeat every period"

- [ ] **Step 1: Write failing tests**

`src/lib/money.test.ts`:
```ts
import { parseMoney } from './money';

describe('parseMoney', () => {
  it.each([
    ['12', 12], ['12.5', 12.5], ['RM1,234.50', 1234.5], ['rm 20', 20], ['1,234', 1234], ['.5', 0.5], [' 7.25 ', 7.25], ['-20', -20], ['-RM5', -5],
  ])('accepts %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
  it.each(['', 'abc', '12.345', '1.2.3', 'RM', '--5'])('rejects %s', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});
```

`src/lib/merchantMemory.test.ts`:
```ts
import { knownMerchants, lastCategoryFor } from './merchantMemory';
import { tx } from '../test/fixtures';

const txs = [
  tx({ amount: 1, merchant: 'Shell Ampang', category: 'petrol', date: '2026-09-01' }),
  tx({ amount: 1, merchant: 'shell ampang', category: 'others', date: '2026-09-10' }),
  tx({ amount: 1, merchant: 'Aeon', category: 'groceries', date: '2026-09-05' }),
  tx({ amount: 1 }),
];

describe('merchant memory', () => {
  it('lists unique merchants case-insensitively, most recent spelling, sorted', () => {
    expect(knownMerchants(txs)).toEqual(['Aeon', 'shell ampang']);
  });
  it('returns the category most recently used for a merchant', () => {
    expect(lastCategoryFor(' SHELL AMPANG ', txs)).toBe('others');
    expect(lastCategoryFor('Unknown', txs)).toBeUndefined();
    expect(lastCategoryFor('', txs)).toBeUndefined();
  });
});
```

`src/features/transactions/TransactionsPage.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionsPage } from './TransactionsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import type { Repository } from '../../data/repository';

const seed = async (repo: Repository) => {
  await seedCard(repo, { rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
};

describe('TransactionsPage', () => {
  it('adds a transaction typed with RM and commas and shows its cashback', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), 'RM1,234.00');
    await userEvent.click(screen.getByRole('button', { name: 'Dining' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(await screen.findByText('RM1,234.00')).toBeInTheDocument();
    expect(screen.getByText('RM61.70')).toBeInTheDocument();
    expect((await repo.listTransactions())[0]).toMatchObject({ amount: 1234, category: 'dining', date: '2026-09-24' });
  });

  it('rejects an invalid amount', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount like 12.50');
    expect(await repo.listTransactions()).toEqual([]);
  });

  it('creates a recurring template when asked', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '99');
    await userEvent.click(screen.getByLabelText('Repeat every period'));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    const [tpl] = await repo.listTemplates();
    expect(tpl).toMatchObject({ amount: 99, active: true, startDate: '2026-09-24', lastGeneratedPeriodStart: '2026-09-01' });
    expect((await repo.listTransactions())[0].recurringId).toBe(tpl.id);
  });

  it('remembers the category for a known merchant', async () => {
    await renderWithData(<TransactionsPage />, {
      seed: async (repo) => {
        await seed(repo);
        await repo.saveTransaction({ id: 'old', userCardId: 'uc1', date: '2026-09-01', amount: 50, category: 'petrol', merchant: 'Shell', paymentMethod: 'physical', createdAt: 'a' });
      },
    });
    await userEvent.type(screen.getByLabelText('Merchant (optional)'), 'shell');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Petrol' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('deletes a transaction after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<TransactionsPage />, {
      seed: async (r) => {
        await seed(r);
        await r.saveTransaction({ id: 'x', userCardId: 'uc1', date: '2026-09-02', amount: 10, category: 'others', paymentMethod: 'physical', createdAt: 'a' });
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await repo.listTransactions()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib src/features/transactions`
Expected: FAIL — `parseMoney`, `merchantMemory`, and page behaviour missing.

- [ ] **Step 3: Add `parseMoney` to `src/lib/money.ts`**

Append:
```ts
/** Accepts "12", "12.5", "RM1,234.50", ".5", "-20" (refund). Returns null if not a valid 2-dp amount. */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/,/g, '');
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1).trim();
  s = s.replace(/^rm\s*/i, '');
  if (!/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}
```

- [ ] **Step 4: Implement `src/lib/merchantMemory.ts`**

```ts
import type { Category, Transaction } from '../engine/types';

const key = (m: string) => m.trim().toLowerCase();
const newestFirst = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

export function knownMerchants(txs: Transaction[]): string[] {
  const seen = new Map<string, string>();
  for (const t of [...txs].sort(newestFirst)) {
    if (t.merchant?.trim() && !seen.has(key(t.merchant))) seen.set(key(t.merchant), t.merchant.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function lastCategoryFor(merchant: string, txs: Transaction[]): Category | undefined {
  const k = key(merchant);
  if (!k) return undefined;
  return [...txs].sort(newestFirst).find((t) => t.merchant && key(t.merchant) === k)?.category;
}
```

- [ ] **Step 5: Implement `src/components/PurchaseFields.tsx`**

```tsx
import { CATEGORIES, PAYMENT_METHODS, type Category, type PaymentMethod } from '../engine/types';
import { CATEGORY_LABELS, PAYMENT_LABELS } from '../lib/labels';

export type TxPaymentMethod = Exclude<PaymentMethod, 'any'>;
export const TX_PAYMENT_METHODS = PAYMENT_METHODS.filter((m): m is TxPaymentMethod => m !== 'any');

export interface PurchaseDraft {
  amount: string;
  category: Category;
  merchant: string;
  paymentMethod: TxPaymentMethod;
  date: string;
}

export function emptyDraft(today: string): PurchaseDraft {
  return { amount: '', category: 'others', merchant: '', paymentMethod: 'contactless', date: today };
}

interface Props {
  value: PurchaseDraft;
  onChange(v: PurchaseDraft): void;
  merchants: string[];
  categoryFor(merchant: string): Category | undefined;
}

export function PurchaseFields({ value, onChange, merchants, categoryFor }: Props) {
  const set = (patch: Partial<PurchaseDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="fields">
      <label>
        Amount (RM)
        <input inputMode="decimal" value={value.amount} onChange={(e) => set({ amount: e.target.value })} />
      </label>
      <div role="group" aria-label="Category" className="chips">
        {CATEGORIES.map((c) => (
          <button type="button" key={c} aria-pressed={value.category === c} onClick={() => set({ category: c })}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <label>
        Merchant (optional)
        <input
          list="merchant-options"
          value={value.merchant}
          onChange={(e) => set({ merchant: e.target.value })}
          onBlur={() => {
            const c = categoryFor(value.merchant);
            if (c) set({ category: c });
          }}
        />
      </label>
      <datalist id="merchant-options">
        {merchants.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <label>
        Payment method
        <select value={value.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as TxPaymentMethod })}>
          {TX_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} />
      </label>
    </div>
  );
}
```

- [ ] **Step 6: Implement `src/features/transactions/TransactionForm.tsx`**

```tsx
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Transaction } from '../../engine/types';
import type { ActiveCard } from '../../app/selectors';
import { PurchaseFields, emptyDraft, type PurchaseDraft } from '../../components/PurchaseFields';
import { knownMerchants, lastCategoryFor } from '../../lib/merchantMemory';
import { parseMoney } from '../../lib/money';
import { newId } from '../../lib/id';

interface Props {
  cards: ActiveCard[];
  transactions: Transaction[];
  today: string;
  initial?: Transaction;
  onSubmit(tx: Transaction, makeRecurring: boolean): Promise<void>;
  onCancel?(): void;
}

export function TransactionForm({ cards, transactions, today, initial, onSubmit, onCancel }: Props) {
  const [cardId, setCardId] = useState(initial?.userCardId ?? cards[0]?.userCard.id ?? '');
  const [draft, setDraft] = useState<PurchaseDraft>(() =>
    initial
      ? {
          amount: String(initial.amount),
          category: initial.category,
          merchant: initial.merchant ?? '',
          paymentMethod: initial.paymentMethod === 'any' ? 'physical' : initial.paymentMethod,
          date: initial.date,
        }
      : emptyDraft(today),
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState('');
  const merchants = useMemo(() => knownMerchants(transactions), [transactions]);

  if (!cards.length) {
    return (
      <p>
        <Link to="/cards">Add a card</Link> before logging transactions.
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoney(draft.amount);
    if (!cardId) return setError('Choose a card.');
    if (amount === null || amount === 0) return setError('Enter an amount like 12.50 (use a minus sign for refunds).');
    if (!draft.date) return setError('Choose a date.');
    setError('');
    await onSubmit(
      {
        id: initial?.id ?? newId(),
        userCardId: cardId,
        date: draft.date,
        amount,
        category: draft.category,
        merchant: draft.merchant.trim() || undefined,
        paymentMethod: draft.paymentMethod,
        note: note.trim() || undefined,
        recurringId: initial?.recurringId,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      },
      recurring,
    );
    if (!initial) {
      setDraft((d) => ({ ...emptyDraft(today), date: d.date, paymentMethod: d.paymentMethod }));
      setNote('');
      setRecurring(false);
    }
  }

  return (
    <form className="panel fields" onSubmit={submit} aria-label={initial ? 'Edit transaction' : 'New transaction'}>
      <label>
        Card
        <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
          {cards.map((c) => (
            <option key={c.userCard.id} value={c.userCard.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <PurchaseFields value={draft} onChange={setDraft} merchants={merchants} categoryFor={(m) => lastCategoryFor(m, transactions)} />
      <label>
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {!initial && (
        <label className="inline">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Repeat every period
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="primary">
          Save transaction
        </button>{' '}
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 7: Replace `src/features/transactions/TransactionsPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { CATEGORIES, type RecurringTemplate, type Transaction } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { activeCards, earningsByTransaction, nameOf } from '../../app/selectors';
import { getPeriod } from '../../engine/periods';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';
import { newId } from '../../lib/id';
import { TransactionForm } from './TransactionForm';

export function TransactionsPage() {
  const data = useAppData();
  const { repo, transactions, templates, resolved, refresh, today } = data;
  const cards = activeCards(data);
  const earned = useMemo(() => earningsByTransaction(data), [data]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [cardFilter, setCardFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const rows = transactions
    .filter((t) => (!month || t.date.startsWith(month)) && (!cardFilter || t.userCardId === cardFilter) && (!categoryFilter || t.category === categoryFilter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  async function submit(tx: Transaction, makeRecurring: boolean) {
    let toSave = tx;
    if (makeRecurring && resolved[tx.userCardId]) {
      const tpl: RecurringTemplate = {
        id: newId(),
        userCardId: tx.userCardId,
        amount: tx.amount,
        category: tx.category,
        merchant: tx.merchant,
        paymentMethod: tx.paymentMethod,
        dayOfPeriod: 'first',
        active: true,
        startDate: tx.date,
        lastGeneratedPeriodStart: getPeriod(resolved[tx.userCardId], tx.date).start,
      };
      await repo.saveTemplate(tpl);
      toSave = { ...tx, recurringId: tpl.id };
    }
    await repo.saveTransaction(toSave);
    setEditing(null);
    await refresh();
  }

  async function remove(t: Transaction) {
    if (!window.confirm(`Delete ${formatRM(t.amount)} on ${t.date}?`)) return;
    await repo.deleteTransaction(t.id);
    await refresh();
  }

  async function toggleTemplate(t: RecurringTemplate) {
    const card = resolved[t.userCardId];
    // Resuming does not backfill missed periods: mark the current period as already handled.
    const next = t.active ? { ...t, active: false } : { ...t, active: true, lastGeneratedPeriodStart: card ? getPeriod(card, today).start : t.lastGeneratedPeriodStart };
    await repo.saveTemplate(next);
    await refresh();
  }

  return (
    <>
      <h1>Transactions</h1>
      <TransactionForm
        key={editing?.id ?? 'new'}
        cards={cards}
        transactions={transactions}
        today={today}
        initial={editing ?? undefined}
        onSubmit={submit}
        onCancel={editing ? () => setEditing(null) : undefined}
      />

      <section className="panel" aria-label="Filters">
        <label className="inline">
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="inline">
          Card
          <select value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}>
            <option value="">All cards</option>
            {data.userCards.map((uc) => (
              <option key={uc.id} value={uc.id}>
                {nameOf(data, uc.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {rows.length === 0 ? (
        <p className="muted">No transactions match.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Card</th><th>Merchant</th><th>Category</th><th>Amount</th><th>Cashback</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{nameOf(data, t.userCardId)}</td>
                <td>{t.merchant ?? ''}</td>
                <td>{CATEGORY_LABELS[t.category]}</td>
                <td>{formatRM(t.amount)}</td>
                <td>{formatRM(earned.get(t.id) ?? 0)}</td>
                <td>
                  <button type="button" onClick={() => setEditing(t)}>Edit</button>{' '}
                  <button type="button" onClick={() => remove(t)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">Estimates only — check your bank statement</p>

      {templates.length > 0 && (
        <section className="panel" aria-label="Recurring transactions">
          <h2>Recurring</h2>
          <ul>
            {templates.map((t) => (
              <li key={t.id}>
                {nameOf(data, t.userCardId)} · {t.merchant ?? CATEGORY_LABELS[t.category]} · {formatRM(t.amount)} {t.active ? '' : '(stopped)'}{' '}
                <button type="button" onClick={() => toggleTemplate(t)}>{t.active ? 'Stop' : 'Resume'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/lib src/features/transactions`
Expected: PASS. (RM1,234.00 × 5% = RM61.70.)

- [ ] **Step 9: Commit**

```bash
git add src/lib src/components src/features/transactions
git commit -m "feat(transactions): add, edit, delete, filter, merchant memory and recurring"
```

---

### Task 13: "Which card?" screen

**Files:**
- Modify: `src/features/recommend/WhichCardPage.tsx` (replace stub)
- Test: `src/features/recommend/WhichCardPage.test.tsx`

**Interfaces:**
- Consumes: `recommend`, `Recommendation` (Task 5); `cardInputs`, `nameOf` (Task 11); `PurchaseFields`, `emptyDraft`, `PurchaseDraft` (Task 12); `parseMoney`, `formatRM`; `knownMerchants`, `lastCategoryFor`
- Produces: page at `/which`; result items with a "Log it to <card name>" button; status message `Logged <RM> to <card name>`

- [ ] **Step 1: Write failing test** — `src/features/recommend/WhichCardPage.test.tsx`

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhichCardPage } from './WhichCardPage';
import { renderWithData, seedCard } from '../../test/renderWithData';

async function setup() {
  return renderWithData(<WhichCardPage />, {
    seed: async (repo) => {
      await seedCard(repo, { rules: [{ id: 'all', label: 'All spend', rate: 0.01 }] }, 'A', 'Card A');
      await seedCard(repo, { rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capPerPeriod: 30 }] }, 'B', 'Card B');
    },
  });
}

describe('WhichCardPage', () => {
  it('prompts for an amount before ranking', async () => {
    await setup();
    expect(screen.getByText('Enter an amount to compare your cards.')).toBeInTheDocument();
  });

  it('ranks cards for the purchase', async () => {
    await setup();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Dining' }));
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Card B')).toBeInTheDocument();
    expect(within(items[0]).getByText('RM5.00')).toBeInTheDocument();
    expect(within(items[0]).getByText('5% Dining — RM25.00 cap left')).toBeInTheDocument();
    expect(within(items[1]).getByText('Card A')).toBeInTheDocument();
  });

  it('logs the purchase to the chosen card', async () => {
    const { repo } = await setup();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Dining' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log it to Card B' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Logged RM100.00 to Card B');
    expect(await repo.listTransactions()).toEqual([expect.objectContaining({ userCardId: 'B', amount: 100, category: 'dining' })]);
    expect(screen.getByLabelText('Amount (RM)')).toHaveDisplayValue('');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/recommend`
Expected: FAIL — stub page has no form.

- [ ] **Step 3: Replace `src/features/recommend/WhichCardPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { cardInputs, nameOf } from '../../app/selectors';
import { recommend, type Recommendation } from '../../engine/recommend';
import { PurchaseFields, emptyDraft, type PurchaseDraft } from '../../components/PurchaseFields';
import { knownMerchants, lastCategoryFor } from '../../lib/merchantMemory';
import { formatRM, parseMoney } from '../../lib/money';
import { newId } from '../../lib/id';

export function WhichCardPage() {
  const data = useAppData();
  const { repo, transactions, refresh, today } = data;
  const [draft, setDraft] = useState<PurchaseDraft>(() => emptyDraft(today));
  const [message, setMessage] = useState('');
  const amount = parseMoney(draft.amount);
  const merchants = useMemo(() => knownMerchants(transactions), [transactions]);
  const inputs = useMemo(() => cardInputs(data), [data]);

  const results = useMemo(
    () =>
      amount !== null && amount > 0
        ? recommend(inputs, { amount, category: draft.category, merchant: draft.merchant.trim() || undefined, paymentMethod: draft.paymentMethod, date: draft.date })
        : [],
    [inputs, draft, amount],
  );

  async function log(r: Recommendation) {
    if (amount === null) return;
    const name = nameOf(data, r.userCardId);
    await repo.saveTransaction({
      id: newId(),
      userCardId: r.userCardId,
      date: draft.date,
      amount,
      category: draft.category,
      merchant: draft.merchant.trim() || undefined,
      paymentMethod: draft.paymentMethod,
      createdAt: new Date().toISOString(),
    });
    setMessage(`Logged ${formatRM(amount)} to ${name}`);
    setDraft((d) => ({ ...d, amount: '', merchant: '' }));
    await refresh();
  }

  if (!inputs.length) {
    return (
      <>
        <h1>Which card?</h1>
        <p>
          <Link to="/cards">Add your cards</Link> to get recommendations.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Which card?</h1>
      <section className="panel">
        <PurchaseFields value={draft} onChange={setDraft} merchants={merchants} categoryFor={(m) => lastCategoryFor(m, transactions)} />
      </section>
      {message && <p role="status">{message}</p>}
      {amount === null || amount <= 0 ? (
        <p className="muted">Enter an amount to compare your cards.</p>
      ) : (
        <ol className="results">
          {results.map((r, i) => (
            <li key={r.userCardId} className="panel">
              <strong>
                {i === 0 && r.incrementalRM > 0 ? '🥇 ' : ''}
                <span>{nameOf(data, r.userCardId)}</span>
              </strong>
              <div>
                <span>{formatRM(r.incrementalRM)}</span>
              </div>
              <div className="muted">{r.reason}</div>
              <button type="button" onClick={() => log(r)} aria-label={`Log it to ${nameOf(data, r.userCardId)}`}>
                Log it
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">Estimates only — check your bank statement</p>
    </>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/recommend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/recommend
git commit -m "feat(recommend): Which card? screen with one-tap logging"
```

---

### Task 14: Dashboard

**Files:**
- Create: `src/components/CapMeter.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx` (replace stub)
- Test: `src/components/CapMeter.test.tsx`, `src/features/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `currentEarnings`, `nameOf` (Task 11); `formatRate` (Task 5); `round2`; `formatRM`
- Produces: `capLevel(used, limit) → 'ok' | 'warn' | 'full'`; `CapMeter({ label, usedRM, limitRM })` rendering a `progressbar` named `<label> cap`; dashboard `data-testid="recent"` list

- [ ] **Step 1: Write failing tests**

`src/components/CapMeter.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { CapMeter, capLevel } from './CapMeter';

describe('capLevel', () => {
  it('is ok below 80%, warn from 80%, full at 100%', () => {
    expect(capLevel(23.99, 30)).toBe('ok');
    expect(capLevel(24, 30)).toBe('warn');
    expect(capLevel(30, 30)).toBe('full');
    expect(capLevel(0, 0)).toBe('full');
  });
});

describe('CapMeter', () => {
  it('shows usage and exposes a progressbar', () => {
    render(<CapMeter label="Dining" usedRM={25} limitRM={30} />);
    expect(screen.getByText('RM25.00 / RM30.00')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Dining cap' })).toHaveAttribute('aria-valuenow', '25');
  });
});
```

`src/features/dashboard/DashboardPage.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
import { renderWithData, seedCard } from '../../test/renderWithData';

describe('DashboardPage', () => {
  it('invites the user to add a card when there are none', async () => {
    await renderWithData(<DashboardPage />);
    expect(screen.getByRole('link', { name: 'Add your first card' })).toBeInTheDocument();
  });

  it('shows period totals, cap meters, tier nudges and recent transactions', async () => {
    await renderWithData(<DashboardPage />, {
      seed: async (repo) => {
        await seedCard(repo, { rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capPerPeriod: 30 }] }, 'A', 'Card A');
        await seedCard(repo, { rules: [{ id: 't', label: 'Tiered', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] }] }, 'B', 'Card B');
        await repo.saveTransaction({ id: 'x', userCardId: 'A', date: '2026-09-10', amount: 500, category: 'dining', paymentMethod: 'physical', merchant: 'Nando', createdAt: 'a' });
        await repo.saveTransaction({ id: 'y', userCardId: 'B', date: '2026-09-11', amount: 600, category: 'others', paymentMethod: 'physical', createdAt: 'b' });
      },
    });
    expect(screen.getByTestId('period-total')).toHaveTextContent('RM26.20'); // 25 + 1.20
    expect(screen.getByRole('progressbar', { name: 'Dining cap' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('Spend RM400.00 more on Card B to reach 5%')).toBeInTheDocument();
    expect(screen.getByTestId('recent')).toHaveTextContent('Nando');
    expect(screen.getByText('Estimates only — check your bank statement')).toBeInTheDocument();
  });

  it('shows broken cards without hiding the rest', async () => {
    await renderWithData(<DashboardPage />, {
      seed: async (repo) => {
        await seedCard(repo, {}, 'A', 'Card A');
        await seedCard(repo, { rules: [] }, 'B', 'Card B');
      },
    });
    expect(screen.getByRole('heading', { name: 'Card A' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Card B: At least one rule is required');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components src/features/dashboard`
Expected: FAIL.

- [ ] **Step 3: Implement `src/components/CapMeter.tsx`**

```tsx
import { formatRM } from '../lib/money';

export function capLevel(used: number, limit: number): 'ok' | 'warn' | 'full' {
  if (limit <= 0) return 'full';
  const r = used / limit;
  return r >= 1 ? 'full' : r >= 0.8 ? 'warn' : 'ok';
}

export function CapMeter({ label, usedRM, limitRM }: { label: string; usedRM: number; limitRM: number }) {
  const pct = limitRM > 0 ? Math.min(100, (usedRM / limitRM) * 100) : 100;
  return (
    <div className={`cap cap-${capLevel(usedRM, limitRM)}`}>
      <div className="cap-label">
        <span>{label}</span>
        <span>
          {formatRM(usedRM)} / {formatRM(limitRM)}
        </span>
      </div>
      <div role="progressbar" aria-label={`${label} cap`} aria-valuemin={0} aria-valuemax={limitRM} aria-valuenow={usedRM} className="cap-track">
        <div className="cap-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/features/dashboard/DashboardPage.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { currentEarnings, nameOf } from '../../app/selectors';
import { CapMeter } from '../../components/CapMeter';
import { round2 } from '../../engine/earnings';
import { formatRate } from '../../engine/format';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';

export function DashboardPage() {
  const data = useAppData();
  const rows = currentEarnings(data);
  const total = round2(rows.reduce((s, r) => s + r.earnings.totalEarnedRM, 0));
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const errors = Object.entries(data.cardErrors);

  return (
    <>
      <h1>Dashboard</h1>
      {errors.length > 0 && (
        <div className="panel error" role="alert">
          {errors.map(([id, msg]) => (
            <p key={id}>
              {nameOf(data, id)}: {msg}
            </p>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p>
          <Link to="/cards">Add your first card</Link> to start tracking cashback.
        </p>
      ) : (
        <>
          <section className="panel">
            <div className="muted">Earned this period (all cards)</div>
            <div data-testid="period-total" style={{ fontSize: 32, fontWeight: 700 }}>
              {formatRM(total)}
            </div>
            <p className="muted">Estimates only — check your bank statement</p>
          </section>

          {rows.map(({ userCard, card, name, earnings }) => (
            <section key={userCard.id} className="panel" aria-label={name}>
              <h2>{name}</h2>
              <div className="muted">
                {earnings.period.start} – {earnings.period.end} · spent {formatRM(earnings.totalSpend)} · earned {formatRM(earnings.totalEarnedRM)}
              </div>
              {earnings.caps.map((c) => (
                <CapMeter key={c.key} label={c.label} usedRM={c.usedRM} limitRM={c.limitRM} />
              ))}
              {earnings.locked && <p className="banner">Spend {formatRM(earnings.locked.spendNeeded)} more this period to unlock rewards</p>}
              {earnings.nextTier && (
                <p>
                  Spend {formatRM(earnings.nextTier.spendNeeded)} more on {name} to reach {formatRate(earnings.nextTier.nextRate, card.rewardType)}
                </p>
              )}
            </section>
          ))}
        </>
      )}

      <section className="panel">
        <h2>Recent transactions</h2>
        <ul data-testid="recent">
          {recent.map((t) => (
            <li key={t.id}>
              {t.date} · {nameOf(data, t.userCardId)} · {t.merchant ?? CATEGORY_LABELS[t.category]} · {formatRM(t.amount)}
            </li>
          ))}
        </ul>
        <Link to="/transactions">All transactions</Link>
      </section>
    </>
  );
}
```

Note: the heading-level test (`getByRole('heading', { name: 'Card A' })`) relies on `<h2>{name}</h2>`; the tier nudge text must match exactly `Spend RM400.00 more on Card B to reach 5%`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components src/features/dashboard`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CapMeter.tsx src/components/CapMeter.test.tsx src/features/dashboard
git commit -m "feat(dashboard): period totals, cap meters, tier nudges and recent activity"
```

---

### Task 15: Cards screen and rule editor

**Files:**
- Create: `src/features/cards/AddCardDialog.tsx`, `src/features/cards/RuleEditor.tsx`, `src/features/cards/customCard.ts`
- Modify: `src/features/cards/CardsPage.tsx` (replace stub)
- Test: `src/features/cards/RuleEditor.test.tsx`, `src/features/cards/CardsPage.test.tsx`

**Interfaces:**
- Consumes: `CATALOG`, `getProduct` (Task 7); `validateCardProduct` (Task 6); `describeRule` (Task 5); `useAppData`, `nameOf` (Task 11); `newId`
- Produces:
  - `newCustomProduct() → CardProduct`; `pickEditable(draft: CardProduct) → Partial<CardProduct>` (fields: `periodType`, `rules`, `capGroups`, `totalCapPerPeriod`, `minMonthlySpendToEarn`, `pointValueRM`)
  - `AddCardDialog({ onAdd(product), onCustom(), onClose() })` — catalog buttons labelled `Add <bank> <name>`
  - `RuleEditor({ initial, custom?, onSave(draft), onCancel(), onReset? })` — region "Edit rules"; save button "Save rules"

- [ ] **Step 1: Write failing tests**

`src/features/cards/RuleEditor.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleEditor } from './RuleEditor';
import { card } from '../../test/fixtures';

describe('RuleEditor', () => {
  it('converts percentages and saves a valid card', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    const rate = screen.getByLabelText('Rate (%)');
    await userEvent.clear(rate);
    await userEvent.type(rate, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].rules[0].rate).toBeCloseTo(0.05);
  });

  it('shows validation errors and does not save', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    const rate = screen.getByLabelText('Rate (%)');
    await userEvent.clear(rate);
    await userEvent.type(rate, '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Rule 1: rate must be ≥ 0');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('adds a category filter and a tier', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    await userEvent.click(screen.getByLabelText('Dining'));
    await userEvent.click(screen.getByRole('button', { name: 'Add tier' }));
    await userEvent.type(screen.getByLabelText('Tier 1 min spend (RM)'), '0');
    await userEvent.type(screen.getByLabelText('Tier 1 rate (%)'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave.mock.calls[0][0].rules[0]).toMatchObject({ categories: ['dining'], tiers: [{ minPeriodSpend: 0, rate: 0.02 }] });
  });
});
```

`src/features/cards/CardsPage.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardsPage } from './CardsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { CATALOG } from '../../catalog';

describe('CardsPage', () => {
  it('adds a card from the catalog', async () => {
    const { repo } = await renderWithData(<CardsPage />);
    const p = CATALOG[0];
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    await userEvent.type(screen.getByLabelText('Search cards'), p.name);
    await userEvent.click(screen.getByRole('button', { name: `Add ${p.bank} ${p.name}` }));
    expect(await screen.findByRole('heading', { name: `${p.bank} ${p.name}` })).toBeInTheDocument();
    expect((await repo.listUserCards())[0]).toMatchObject({ productId: p.id, catalogVersionSeen: p.catalogVersion });
  });

  it('creates a custom card and opens the editor', async () => {
    await renderWithData(<CardsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create custom card' }));
    expect(await screen.findByRole('region', { name: 'Edit rules' })).toBeInTheDocument();
  });

  it('marks unverified cards', async () => {
    await renderWithData(<CardsPage />, { seed: (repo) => seedCard(repo).then(() => undefined) });
    expect(screen.getByText('Unverified — please check')).toBeInTheDocument();
  });

  it('archives a card after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<CardsPage />, { seed: (r) => seedCard(r).then(() => undefined) });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect((await repo.listUserCards())[0].archived).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Test Card' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/cards`
Expected: FAIL.

- [ ] **Step 3: Implement `src/features/cards/customCard.ts`**

```ts
import type { CardProduct } from '../../engine/types';
import { newId } from '../../lib/id';

export function newCustomProduct(): CardProduct {
  return {
    id: `custom-${newId()}`,
    bank: 'Custom',
    name: 'My card',
    rewardType: 'cashback',
    periodType: 'calendar',
    rules: [{ id: newId(), label: 'All spend', rate: 0.01 }],
    sourceUrl: '',
    verifiedOn: null,
    catalogVersion: 1,
  };
}

/** Fields a user may override on a catalog card. */
export function pickEditable(d: CardProduct): Partial<CardProduct> {
  return {
    periodType: d.periodType,
    rules: d.rules,
    capGroups: d.capGroups,
    totalCapPerPeriod: d.totalCapPerPeriod,
    minMonthlySpendToEarn: d.minMonthlySpendToEarn,
    pointValueRM: d.pointValueRM,
  };
}
```

- [ ] **Step 4: Implement `src/features/cards/AddCardDialog.tsx`**

```tsx
import { useState } from 'react';
import type { CardProduct } from '../../engine/types';
import { CATALOG } from '../../catalog';

interface Props {
  onAdd(product: CardProduct): void;
  onCustom(): void;
  onClose(): void;
}

export function AddCardDialog({ onAdd, onCustom, onClose }: Props) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = CATALOG.filter((p) => `${p.bank} ${p.name}`.toLowerCase().includes(needle));
  return (
    <section className="panel" aria-label="Add a card">
      <label>
        Search cards
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <ul>
        {list.map((p) => (
          <li key={p.id}>
            {p.bank} {p.name}{' '}
            <button type="button" aria-label={`Add ${p.bank} ${p.name}`} onClick={() => onAdd(p)}>
              Add
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="muted">No catalog card matches. You can create a custom card.</p>}
      <button type="button" onClick={onCustom}>Create custom card</button>{' '}
      <button type="button" onClick={onClose}>Cancel</button>
    </section>
  );
}
```

- [ ] **Step 5: Implement `src/features/cards/RuleEditor.tsx`**

```tsx
import { useState } from 'react';
import { CATEGORIES, type CardProduct, type Rule, type Weekday } from '../../engine/types';
import { TX_PAYMENT_METHODS } from '../../components/PurchaseFields';
import { validateCardProduct } from '../../engine/validate';
import { CATEGORY_LABELS, DAY_LABELS, PAYMENT_LABELS } from '../../lib/labels';
import { newId } from '../../lib/id';

interface Props {
  initial: CardProduct;
  custom?: boolean;
  onSave(draft: CardProduct): void;
  onCancel(): void;
  onReset?(): void;
}

const optNum = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));

function NumField({ label, value, onChange }: { label: string; value: number | undefined; onChange(v: number | undefined): void }) {
  return (
    <label>
      {label}
      <input inputMode="decimal" defaultValue={value == null || Number.isNaN(value) ? '' : value} onChange={(e) => onChange(optNum(e.target.value))} />
    </label>
  );
}

function toggle<T>(list: T[] | undefined, v: T): T[] | undefined {
  const s = new Set(list ?? []);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return s.size ? [...s] : undefined;
}

export function RuleEditor({ initial, custom = false, onSave, onCancel, onReset }: Props) {
  const [draft, setDraft] = useState<CardProduct>(() => JSON.parse(JSON.stringify(initial)) as CardProduct);
  const [groups, setGroups] = useState<[string, string][]>(() => Object.entries(initial.capGroups ?? {}).map(([k, v]) => [k, String(v)]));
  const [errors, setErrors] = useState<string[]>([]);
  const isPct = draft.rewardType === 'cashback';
  const rateLabel = isPct ? '(%)' : '(pts/RM)';
  const toUi = (r: number | undefined) => (r == null || Number.isNaN(r) ? undefined : isPct ? Number((r * 100).toFixed(4)) : r);
  const fromUi = (v: number | undefined) => (v === undefined ? NaN : isPct ? v / 100 : v);
  const patch = (p: Partial<CardProduct>) => setDraft((d) => ({ ...d, ...p }));
  const setRule = (i: number, p: Partial<Rule>) => setDraft((d) => ({ ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) }));

  function save() {
    const capGroups = Object.fromEntries(groups.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), Number(v)]));
    const next: CardProduct = { ...draft, capGroups: Object.keys(capGroups).length ? capGroups : undefined };
    const errs = validateCardProduct(next);
    setErrors(errs);
    if (!errs.length) onSave(next);
  }

  return (
    <section className="panel fields" aria-label="Edit rules">
      {custom && (
        <>
          <label>
            Bank
            <input value={draft.bank} onChange={(e) => patch({ bank: e.target.value })} />
          </label>
          <label>
            Card name
            <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <label>
            Reward type
            <select value={draft.rewardType} onChange={(e) => patch({ rewardType: e.target.value as CardProduct['rewardType'] })}>
              <option value="cashback">Cashback</option>
              <option value="points">Points</option>
            </select>
          </label>
        </>
      )}
      <label>
        Period
        <select value={draft.periodType} onChange={(e) => patch({ periodType: e.target.value as CardProduct['periodType'] })}>
          <option value="calendar">Calendar month</option>
          <option value="statement">Statement cycle</option>
        </select>
      </label>
      {draft.periodType === 'statement' && <NumField label="Statement cycle day (1–28)" value={draft.defaultCycleDay} onChange={(v) => patch({ defaultCycleDay: v })} />}
      {draft.rewardType === 'points' && <NumField label="RM value of 1 point" value={draft.pointValueRM} onChange={(v) => patch({ pointValueRM: v })} />}
      <NumField label={`Card total cap per period ${isPct ? '(RM)' : '(pts)'}`} value={draft.totalCapPerPeriod} onChange={(v) => patch({ totalCapPerPeriod: v })} />
      <NumField label="Minimum spend to earn (RM)" value={draft.minMonthlySpendToEarn} onChange={(v) => patch({ minMonthlySpendToEarn: v })} />

      <fieldset>
        <legend>Shared cap groups</legend>
        {groups.map(([name, amount], i) => (
          <div key={i}>
            <label className="inline">
              Group name
              <input defaultValue={name} onChange={(e) => setGroups((g) => g.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
            </label>
            <label className="inline">
              Cap
              <input inputMode="decimal" defaultValue={amount} onChange={(e) => setGroups((g) => g.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
            </label>
            <button type="button" onClick={() => setGroups((g) => g.filter((_, j) => j !== i))}>Remove group</button>
          </div>
        ))}
        <button type="button" onClick={() => setGroups((g) => [...g, ['', '0']])}>Add cap group</button>
      </fieldset>

      {draft.rules.map((rule, i) => (
        <fieldset key={rule.id}>
          <legend>{rule.label || `Rule ${i + 1}`}</legend>
          <label>
            Label
            <input defaultValue={rule.label} onChange={(e) => setRule(i, { label: e.target.value })} />
          </label>
          <NumField label={`Rate ${rateLabel}`} value={toUi(rule.rate)} onChange={(v) => setRule(i, { rate: fromUi(v) })} />
          <NumField label={`Cap per period ${isPct ? '(RM)' : '(pts)'}`} value={rule.capPerPeriod} onChange={(v) => setRule(i, { capPerPeriod: v })} />
          <label>
            Shared cap group (optional)
            <input defaultValue={rule.capGroup ?? ''} onChange={(e) => setRule(i, { capGroup: e.target.value.trim() || undefined })} />
          </label>
          <label>
            Merchants (comma-separated, optional)
            <input
              defaultValue={rule.merchants?.join(', ') ?? ''}
              onChange={(e) => {
                const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                setRule(i, { merchants: list.length ? list : undefined });
              }}
            />
          </label>
          <div role="group" aria-label="Categories">
            {CATEGORIES.map((c) => (
              <label key={c} className="inline">
                <input type="checkbox" checked={rule.categories?.includes(c) ?? false} onChange={() => setRule(i, { categories: toggle(rule.categories, c) })} />
                {CATEGORY_LABELS[c]}
              </label>
            ))}
          </div>
          <div role="group" aria-label="Payment methods">
            {TX_PAYMENT_METHODS.map((m) => (
              <label key={m} className="inline">
                <input type="checkbox" checked={rule.paymentMethods?.includes(m) ?? false} onChange={() => setRule(i, { paymentMethods: toggle(rule.paymentMethods, m) })} />
                {PAYMENT_LABELS[m]}
              </label>
            ))}
          </div>
          <div role="group" aria-label="Days">
            {DAY_LABELS.map((d, n) => (
              <label key={d} className="inline">
                <input type="checkbox" checked={rule.days?.includes(n as Weekday) ?? false} onChange={() => setRule(i, { days: toggle(rule.days, n as Weekday) })} />
                {d}
              </label>
            ))}
          </div>
          <div role="group" aria-label="Tiers">
            {(rule.tiers ?? []).map((t, j) => (
              <div key={`${rule.id}-${j}-${rule.tiers!.length}`}>
                <NumField
                  label={`Tier ${j + 1} min spend (RM)`}
                  value={t.minPeriodSpend}
                  onChange={(v) => setRule(i, { tiers: rule.tiers!.map((x, k) => (k === j ? { ...x, minPeriodSpend: v ?? NaN } : x)) })}
                />
                <NumField
                  label={`Tier ${j + 1} rate ${rateLabel}`}
                  value={toUi(t.rate)}
                  onChange={(v) => setRule(i, { tiers: rule.tiers!.map((x, k) => (k === j ? { ...x, rate: fromUi(v) } : x)) })}
                />
                <button type="button" onClick={() => setRule(i, { tiers: rule.tiers!.filter((_, k) => k !== j).length ? rule.tiers!.filter((_, k) => k !== j) : undefined })}>
                  Remove tier
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setRule(i, { tiers: [...(rule.tiers ?? []), { minPeriodSpend: NaN, rate: NaN }] })}>Add tier</button>
            {rule.tiers?.length ? <p className="muted">With tiers, the rate above is ignored.</p> : null}
          </div>
          <button type="button" onClick={() => setDraft((d) => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }))}>Remove rule</button>
        </fieldset>
      ))}
      <button type="button" onClick={() => setDraft((d) => ({ ...d, rules: [...d.rules, { id: newId(), label: 'New rule', rate: 0 }] }))}>Add rule</button>

      {errors.length > 0 && (
        <ul className="error" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="primary" onClick={save}>Save rules</button>{' '}
        <button type="button" onClick={onCancel}>Cancel</button>{' '}
        {onReset && <button type="button" onClick={onReset}>Reset to catalog default</button>}
      </div>
    </section>
  );
}
```

A rule with no payment methods selected matches any payment method, so `any` is not offered as a checkbox.

Note: the test's `getByLabelText('Dining')` must resolve to the Dining checkbox — it's the only element labelled "Dining" inside `RuleEditor` rendered on its own.

- [ ] **Step 6: Replace `src/features/cards/CardsPage.tsx`**

```tsx
import { useState } from 'react';
import type { CardProduct, UserCard } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { nameOf } from '../../app/selectors';
import { getProduct } from '../../catalog';
import { describeRule } from '../../engine/format';
import { newId } from '../../lib/id';
import { AddCardDialog } from './AddCardDialog';
import { RuleEditor } from './RuleEditor';
import { newCustomProduct, pickEditable } from './customCard';

export function CardsPage() {
  const data = useAppData();
  const { repo, userCards, resolved, cardErrors, refresh } = data;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const visible = userCards.filter((c) => !c.archived);

  async function save(uc: UserCard) {
    await repo.saveUserCard(uc);
    await refresh();
  }
  async function addFromCatalog(p: CardProduct) {
    await save({ id: newId(), productId: p.id, nickname: '', catalogVersionSeen: p.catalogVersion, archived: false });
    setAdding(false);
  }
  async function addCustom() {
    const id = newId();
    await save({ id, productId: null, nickname: '', overrides: newCustomProduct(), catalogVersionSeen: 1, archived: false });
    setAdding(false);
    setEditingId(id);
  }
  async function saveRules(uc: UserCard, draft: CardProduct) {
    await save(uc.productId ? { ...uc, cycleDay: draft.defaultCycleDay, overrides: pickEditable(draft) } : { ...uc, overrides: draft });
    setEditingId(null);
  }
  async function reset(uc: UserCard) {
    await save({ ...uc, overrides: undefined, cycleDay: undefined });
    setEditingId(null);
  }
  async function rename(uc: UserCard) {
    const nickname = window.prompt('Nickname (leave empty to use the card name)', uc.nickname);
    if (nickname !== null) await save({ ...uc, nickname: nickname.trim() });
  }
  async function archive(uc: UserCard) {
    if (window.confirm(`Archive ${nameOf(data, uc.id)}? Its past transactions stay in your reports.`)) await save({ ...uc, archived: true });
  }

  return (
    <>
      <h1>Cards</h1>
      {adding ? (
        <AddCardDialog onAdd={addFromCatalog} onCustom={addCustom} onClose={() => setAdding(false)} />
      ) : (
        <button type="button" className="primary" onClick={() => setAdding(true)}>Add card</button>
      )}

      {visible.map((uc) => {
        const card = resolved[uc.id];
        const product = uc.productId ? getProduct(uc.productId) : undefined;
        const name = nameOf(data, uc.id);
        return (
          <section key={uc.id} className="panel" aria-label={name}>
            <h2>{name}</h2>
            {cardErrors[uc.id] && <p className="error" role="alert">{cardErrors[uc.id]}</p>}
            {card && (
              <>
                <p>
                  {card.verifiedOn ? <span className="badge">Verified {card.verifiedOn}</span> : <span className="badge warn">Unverified — please check</span>}{' '}
                  {product && product.catalogVersion > uc.catalogVersionSeen && (
                    <>
                      <span className="badge warn">Catalog updated — review changes</span>{' '}
                      <button type="button" onClick={() => save({ ...uc, catalogVersionSeen: product.catalogVersion })}>Mark reviewed</button>
                    </>
                  )}
                </p>
                <ul>
                  {card.rules.map((r) => (
                    <li key={r.id}>
                      <strong>{r.label}</strong>: {describeRule(r, card.rewardType)}
                    </li>
                  ))}
                </ul>
                {card.sourceUrl && (
                  <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                    Bank terms
                  </a>
                )}
              </>
            )}
            {editingId === uc.id && card ? (
              <RuleEditor
                initial={card}
                custom={!uc.productId}
                onSave={(d) => saveRules(uc, d)}
                onCancel={() => setEditingId(null)}
                onReset={uc.productId ? () => reset(uc) : undefined}
              />
            ) : (
              <div>
                {card && <button type="button" onClick={() => setEditingId(uc.id)}>Edit rules</button>}{' '}
                <button type="button" onClick={() => rename(uc)}>Rename</button>{' '}
                <button type="button" onClick={() => archive(uc)}>Archive</button>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
```

Heading note: a catalog card with no nickname is named `${bank} ${name}` by `nameOf`, which the CardsPage test asserts.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/features/cards`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/cards
git commit -m "feat(cards): add from catalog, custom cards, rule editor, archive and catalog update badge"
```

---

### Task 16: Reports

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx` (replace stub), `src/test/setup.ts` (ResizeObserver stub for Recharts)
- Test: `src/features/reports/ReportsPage.test.tsx`

**Interfaces:**
- Consumes: `monthlyReport`, `effectiveRate` (Task 11); `cardInputs`, `nameOf`; `CATEGORY_LABELS`; `formatRM`
- Produces: page at `/reports` with a stacked bar chart (last 12 months, by card), a monthly table (`Month | Spend | Cashback | Effective rate`), and a category breakdown for a selectable month

- [ ] **Step 1: Add a ResizeObserver stub to `src/test/setup.ts`**

Append:
```ts
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
```

- [ ] **Step 2: Write failing test** — `src/features/reports/ReportsPage.test.tsx`

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from './ReportsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';

describe('ReportsPage', () => {
  it('shows an empty state', async () => {
    await renderWithData(<ReportsPage />);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('lists monthly totals, effective rate and category breakdown', async () => {
    await renderWithData(<ReportsPage />, {
      seed: async (repo) => {
        await seedCard(repo, { rules: [{ id: 'all', label: 'All', rate: 0.05 }] }, 'A', 'Card A');
        await repo.saveTransactions([
          { id: 'x', userCardId: 'A', date: '2026-08-10', amount: 100, category: 'dining', paymentMethod: 'physical', createdAt: 'a' },
          { id: 'y', userCardId: 'A', date: '2026-09-10', amount: 200, category: 'petrol', paymentMethod: 'physical', createdAt: 'b' },
        ]);
      },
    });
    const table = screen.getByRole('table', { name: 'Monthly cashback' });
    const sep = within(table).getByRole('row', { name: /2026-09/ });
    expect(sep).toHaveTextContent('RM200.00');
    expect(sep).toHaveTextContent('RM10.00');
    expect(sep).toHaveTextContent('5.00%');
    expect(screen.getByRole('list', { name: 'By category' })).toHaveTextContent('Petrol: RM10.00');
    await userEvent.selectOptions(screen.getByLabelText('Breakdown month'), '2026-08');
    expect(screen.getByRole('list', { name: 'By category' })).toHaveTextContent('Dining: RM5.00');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/features/reports`
Expected: FAIL.

- [ ] **Step 4: Replace `src/features/reports/ReportsPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppData } from '../../app/DataProvider';
import { cardInputs, nameOf } from '../../app/selectors';
import { effectiveRate, monthlyReport } from '../../engine/report';
import type { Category } from '../../engine/types';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';

const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777'];

export function ReportsPage() {
  const data = useAppData();
  const inputs = useMemo(() => cardInputs(data, true), [data]);
  const rows = useMemo(() => monthlyReport(inputs), [inputs]);
  const [picked, setPicked] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <>
        <h1>Reports</h1>
        <p>No transactions yet.</p>
      </>
    );
  }

  const month = picked ?? rows[rows.length - 1].month;
  const selected = rows.find((r) => r.month === month) ?? rows[rows.length - 1];
  const chartData = rows.slice(-12).map((r) => ({ month: r.month, ...r.byCard }));
  const cardIds = inputs.map((i) => i.userCard.id);

  return (
    <>
      <h1>Reports</h1>
      <section className="panel" aria-label="Cashback by month chart">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(v) => formatRM(Number(v))} />
            <Legend />
            {cardIds.map((id, i) => (
              <Bar key={id} dataKey={id} name={nameOf(data, id)} stackId="cards" fill={PALETTE[i % PALETTE.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      <table aria-label="Monthly cashback">
        <thead>
          <tr>
            <th>Month</th><th>Spend</th><th>Cashback</th><th>Effective rate</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.month}>
              <td>{r.month}</td>
              <td>{formatRM(r.spend)}</td>
              <td>{formatRM(r.earnedRM)}</td>
              <td>{(effectiveRate(r) * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Months follow each card's period end date. Estimates only — check your bank statement</p>

      <section className="panel">
        <label>
          Breakdown month
          <select value={month} onChange={(e) => setPicked(e.target.value)}>
            {rows.map((r) => (
              <option key={r.month} value={r.month}>
                {r.month}
              </option>
            ))}
          </select>
        </label>
        <ul aria-label="By category">
          {(Object.entries(selected.byCategory) as [Category, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([c, v]) => (
              <li key={c}>
                {CATEGORY_LABELS[c]}: {formatRM(v)}
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/features/reports`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports src/test/setup.ts
git commit -m "feat(reports): monthly cashback chart, effective rate and category breakdown"
```

---

### Task 17: Settings (backup, import, point values)

**Files:**
- Create: `src/lib/download.ts`
- Modify: `src/features/settings/SettingsPage.tsx` (replace stub)
- Test: `src/features/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `makeBackup`, `parseBackup`, `BackupSummary` (Task 9); `useAppData`, `activeCards`; `getProduct`; `AppSnapshot`
- Produces: `downloadText(filename, text)`, `readFileText(file) → Promise<string>`; page with "Export backup" button, file input labelled "Import backup file", preview + "Replace my data" button, and per-points-card "RM value of 1,000 points" inputs with "Save point values"

- [ ] **Step 1: Write failing test** — `src/features/settings/SettingsPage.test.tsx`

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { makeBackup } from '../../data/backup';
import { DEFAULT_SETTINGS } from '../../data/repository';
import { card } from '../../test/fixtures';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:backup');
  URL.revokeObjectURL = vi.fn();
});

describe('SettingsPage', () => {
  it('exports a backup and records the date', async () => {
    const { repo } = await renderWithData(<SettingsPage />, { seed: (r) => seedCard(r).then(() => undefined) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(click).toHaveBeenCalled();
    expect((await repo.getSettings()).lastBackupAt).toBe('2026-09-24');
  });

  it('previews then imports a backup', async () => {
    const { repo } = await renderWithData(<SettingsPage />);
    const backup = makeBackup(
      {
        userCards: [{ id: 'u1', productId: null, nickname: 'Imported', overrides: card(), catalogVersionSeen: 1, archived: false }],
        transactions: [{ id: 't', userCardId: 'u1', date: '2026-09-01', amount: 10, category: 'others', paymentMethod: 'physical', createdAt: 'a' }],
        templates: [],
        settings: DEFAULT_SETTINGS,
      },
      '2026-09-24T00:00:00Z',
    );
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Import backup file'), file);
    expect(await screen.findByText('1 card, 1 transaction (2026-09-01 to 2026-09-01). This replaces all current data.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByText('Backup imported.')).toBeInTheDocument();
    expect((await repo.listUserCards()).map((c) => c.nickname)).toEqual(['Imported']);
  });

  it('shows why an import was rejected and keeps existing data', async () => {
    const { repo } = await renderWithData(<SettingsPage />, { seed: (r) => seedCard(r).then(() => undefined) });
    await userEvent.upload(screen.getByLabelText('Import backup file'), new File(['nope'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is not valid JSON.');
    expect(await repo.listUserCards()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/settings`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/download.ts`**

```ts
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
```

- [ ] **Step 4: Replace `src/features/settings/SettingsPage.tsx`**

```tsx
import { useState, type ChangeEvent } from 'react';
import { useAppData } from '../../app/DataProvider';
import { activeCards } from '../../app/selectors';
import { makeBackup, parseBackup, type BackupSummary } from '../../data/backup';
import type { AppSnapshot } from '../../data/repository';
import { getProduct } from '../../catalog';
import { downloadText, readFileText } from '../../lib/download';

export function SettingsPage() {
  const data = useAppData();
  const { repo, settings, refresh, today } = data;
  const [pending, setPending] = useState<{ data: AppSnapshot; summary: BackupSummary } | null>(null);
  const [importError, setImportError] = useState('');
  const [message, setMessage] = useState('');
  const pointProducts = [...new Map(activeCards(data).filter((c) => c.card.rewardType === 'points' && c.userCard.productId).map((c) => [c.userCard.productId!, c])).values()];
  const [pointValues, setPointValues] = useState<Record<string, string>>({});

  async function exportBackup() {
    const snapshot = await repo.exportAll();
    downloadText(`cashback-backup-${today}.json`, JSON.stringify(makeBackup(snapshot, new Date().toISOString()), null, 2));
    await repo.saveSettings({ ...settings, lastBackupAt: today });
    await refresh();
    setMessage('Backup exported.');
  }

  async function chooseFile(e: ChangeEvent<HTMLInputElement>) {
    setMessage('');
    setPending(null);
    setImportError('');
    const file = e.target.files?.[0];
    if (!file) return;
    const result = parseBackup(await readFileText(file));
    if (result.ok) setPending({ data: result.data, summary: result.summary });
    else setImportError(result.error);
    e.target.value = '';
  }

  async function confirmImport() {
    if (!pending) return;
    await repo.replaceAll(pending.data);
    setPending(null);
    await refresh();
    setMessage('Backup imported.');
  }

  async function savePointValues() {
    const next = { ...settings.pointValueOverrides };
    for (const [pid, v] of Object.entries(pointValues)) {
      const n = Number(v);
      if (v.trim() === '') delete next[pid];
      else if (Number.isFinite(n) && n > 0) next[pid] = n / 1000;
    }
    await repo.saveSettings({ ...settings, pointValueOverrides: next });
    await refresh();
    setMessage('Point values saved.');
  }

  const s = pending?.summary;
  return (
    <>
      <h1>Settings</h1>
      {message && <p role="status">{message}</p>}

      <section className="panel fields">
        <h2>Backup</h2>
        <p className="muted">Your data lives only in this browser. Last backup: {settings.lastBackupAt ?? 'never'}.</p>
        <div>
          <button type="button" className="primary" onClick={exportBackup}>Export backup</button>
        </div>
        <label>
          Import backup file
          <input type="file" accept="application/json,.json" onChange={chooseFile} />
        </label>
        {importError && <p className="error" role="alert">{importError}</p>}
        {s && (
          <div className="banner">
            <p>
              {s.cards} card{s.cards === 1 ? '' : 's'}, {s.transactions} transaction{s.transactions === 1 ? '' : 's'}
              {s.from ? ` (${s.from} to ${s.to})` : ''}. This replaces all current data.
            </p>
            <button type="button" onClick={confirmImport}>Replace my data</button>{' '}
            <button type="button" onClick={() => setPending(null)}>Cancel</button>
          </div>
        )}
      </section>

      {pointProducts.length > 0 && (
        <section className="panel fields">
          <h2>Points value</h2>
          {pointProducts.map(({ userCard, name }) => {
            const pid = userCard.productId!;
            const current = settings.pointValueOverrides[pid] ?? getProduct(pid)?.pointValueRM ?? 0;
            return (
              <label key={pid}>
                {name}: RM value of 1,000 points
                <input inputMode="decimal" defaultValue={String(Number((current * 1000).toFixed(4)))} onChange={(e) => setPointValues((p) => ({ ...p, [pid]: e.target.value }))} />
              </label>
            );
          })}
          <div>
            <button type="button" onClick={savePointValues}>Save point values</button>
          </div>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 5: Run the whole suite and build**

Run: `npm test` then `npm run build`
Expected: all PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/download.ts src/features/settings
git commit -m "feat(settings): JSON backup export/import with preview and points valuation"
```

---

### Task 18: PWA install and end-to-end smoke tests

**Files:**
- Create: `public/icon.svg`, `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `vite.config.ts` (add `VitePWA`), `tsconfig.json` (include `e2e`, `playwright.config.ts`)
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: the whole app
- Produces: installable PWA build; `npm run e2e`

- [ ] **Step 1: Add the icon** — `public/icon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f766e"/>
  <rect x="12" y="20" width="40" height="26" rx="4" fill="#fff"/>
  <rect x="12" y="26" width="40" height="5" fill="#0f766e"/>
  <text x="32" y="43" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle" fill="#0f766e">RM</text>
</svg>
```

- [ ] **Step 2: Enable the PWA in `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cashback Tracker',
        short_name: 'Cashback',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

Update `tsconfig.json` `"include"` to `["src", "e2e", "vite.config.ts", "playwright.config.ts"]`.

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173', acceptDownloads: true },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 4: Write the e2e tests** — `e2e/smoke.spec.ts`

```ts
import { expect, test } from '@playwright/test';

async function addFirstCatalogCard(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Cards', exact: true }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await page.getByRole('button', { name: /^Add \S/ }).first().click();
}

test('add a card, log spend, see it on the dashboard', async ({ page }) => {
  await page.goto('/');
  await addFirstCatalogCard(page);
  await page.getByRole('link', { name: 'Transactions' }).click();
  await page.getByLabel('Amount (RM)').fill('100');
  await page.getByRole('button', { name: 'Petrol' }).click();
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByTestId('recent')).toContainText('RM100.00');
  await expect(page.getByTestId('period-total')).toBeVisible();
});

test('a backup restores data in a fresh browser', async ({ page, browser }) => {
  await page.goto('/');
  await addFirstCatalogCard(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const path = await download.path();

  const fresh = await browser.newContext();
  const page2 = await fresh.newPage();
  await page2.goto('http://localhost:4173/#/settings');
  await page2.getByLabel('Import backup file').setInputFiles(path!);
  await page2.getByRole('button', { name: 'Replace my data' }).click();
  await expect(page2.getByText('Backup imported.')).toBeVisible();
  await page2.getByRole('link', { name: 'Cards', exact: true }).click();
  await expect(page2.getByRole('heading', { level: 2 })).toHaveCount(1);
  await fresh.close();
});
```

- [ ] **Step 5: Install the browser and run**

Run:
```
npx playwright install chromium
npm run e2e
```
Expected: 2 passed.

- [ ] **Step 6: Final full check**

Run: `npm test` then `npm run build`
Expected: all unit tests pass; build succeeds and `dist/` contains `manifest.webmanifest` and `sw.js`.

- [ ] **Step 7: Commit**

```bash
git add public playwright.config.ts e2e vite.config.ts tsconfig.json
git commit -m "feat: installable PWA and end-to-end smoke tests"
```

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §1 success criteria 1 (add 8 cards) | 7, 15 |
| §1 criterion 2 (earnings/caps/tiers) | 4, 14 |
| §1 criterion 3 (recommend) | 5, 13 |
| §1 criterion 4 (persist + backup) | 8, 9, 17 |
| §1 criterion 5 (engine + scenario tests) | 2–7 |
| §3 architecture / Repository | 8, 11 |
| §4 data model | 2 (with `createdAt`, `startDate`, `lastGeneratedPeriodStart` additions) |
| §5 catalog, unverified badge, update notice | 7, 15 |
| §6 engine (periods, earnings, recommend, resolve) | 2–5 |
| §7 screens | 11–17 |
| §8 rollover + recurring | 10, 12 |
| §9 validation, storage warning, backup, migrations, per-card errors | 6, 8, 9, 11, 14 |
| §10 testing | every task; e2e in 18 |
| PWA install | 18 |
