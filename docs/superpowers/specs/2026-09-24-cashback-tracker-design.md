# Cashback Tracker — Design Spec

**Date:** 2026-09-24
**Status:** Draft — awaiting user review
**Reference product:** Finory: Cashback Tracker (iOS, Keennovation Sdn Bhd) — https://www.finory.tech/cashback-tracker-app

## 1. Purpose and success criteria

A browser-based credit card cashback tracker for Malaysian cards, modelled on Finory: Cashback Tracker.

- **Primary user:** the owner, for personal use. A public product is a possible later phase, so the architecture must not block it (cloud sync, app-store wrapping).
- **Core promise:** before paying, the user enters a purchase (amount, category, merchant, payment method) and the app says which of their cards earns the most *right now*, accounting for caps already used, minimum-spend tiers, and day/merchant/payment-method conditions.
- **Differentiator vs Finory:** no paywall or card limit — all cards are free to track.

**v1 is done when:**
1. The user can add all 8 of their cards from the built-in catalog (Section 5).
2. Logging a transaction updates cashback, cap usage, and tier progress correctly per the card's rules.
3. The "Which card?" screen ranks the user's cards by actual incremental RM earned for a given purchase.
4. Data survives browser restarts and can be exported/imported as a JSON backup.
5. The rules engine test suite passes, including scenario tests for every catalog card.

## 2. Scope

**In v1:**
- Card wallet (catalog pick + rule overrides + custom cards)
- Best-card recommendation
- Cap tracker with warnings and tier nudges
- Manual transaction entry, merchant memory, recurring transactions
- Automatic period rollover (statement cycle or calendar month)
- Monthly reports (cashback by month/card/category, effective rate)
- Points cards valued in RM via an editable conversion rate
- JSON export/import backup
- Installable as a PWA

**Out of v1 (later phases):**
- Login and cloud sync (e.g. Supabase)
- CSV import; AI (PDF) statement parsing
- "Missed savings" report
- Multi-currency, push notifications
- Native app-store builds (e.g. Capacitor wrap)

**Constraints:** English UI, RM currency only. Runs on Windows 11 in a modern browser; no Mac required.

## 3. Architecture

**Stack:** React + TypeScript, built with Vite. IndexedDB via Dexie for storage. Recharts for charts. Vitest for unit/component tests, Playwright for end-to-end smoke tests. `vite-plugin-pwa` for installability.

**Layers (each independently testable):**

```
src/
  engine/        Pure TypeScript rules engine — no React, no storage imports
  catalog/       cards.json + loader/validator
  data/          Repository interface + Dexie implementation + migrations + backup
  features/      UI per screen (dashboard, recommend, transactions, cards, reports, settings)
  components/    Shared UI pieces (CapMeter, CategoryChips, MoneyInput, ...)
```

- **engine/** depends on nothing but its own types. All cashback math lives here.
- **data/** exposes a `Repository` interface (`getCards`, `saveTransaction`, `listTransactions(period)`, etc.). The UI only talks to the interface; v1 implements it with Dexie. A future cloud-sync implementation swaps in behind the same interface.
- **features/** call the repository for data and the engine for calculations.

## 4. Data model

```ts
type RewardType = 'cashback' | 'points';
type PaymentMethod = 'contactless' | 'online' | 'physical' | 'ewallet_reload' | 'any';
type Category = 'petrol' | 'groceries' | 'dining' | 'online' | 'ewallet' | 'utilities'
              | 'travel' | 'insurance' | 'others';   // fixed list in v1
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;           // 0 = Sunday

interface Tier {
  minPeriodSpend: number;   // RM, total eligible spend on the card in the period
  rate: number;             // cashback: fraction (0.05 = 5%); points: points per RM1
}

interface Rule {
  id: string;
  label: string;                    // e.g. "Shell petrol"
  rate: number;                     // base rate; used if no tiers
  tiers?: Tier[];                   // sorted ascending by minPeriodSpend; replaces rate
  categories?: Category[];          // omitted = any category
  merchants?: string[];             // case-insensitive match on merchant name; omitted = any
  paymentMethods?: PaymentMethod[]; // omitted = any
  days?: Weekday[];                 // omitted = any day
  capPerPeriod?: number;            // RM (or points) cap for this rule alone
  capGroup?: string;                // rules sharing a capGroup share the card's group cap
}

interface CardProduct {
  id: string;                       // e.g. "rhb-shell-visa"
  bank: string;
  name: string;
  rewardType: RewardType;
  pointValueRM?: number;            // RM value of ONE point (points cards only)
  periodType: 'statement' | 'calendar';
  defaultCycleDay?: number;         // 1–28, statement cards
  capGroups?: Record<string, number>; // capGroup id -> cap per period
  totalCapPerPeriod?: number;       // overall card cap across all rules
  minMonthlySpendToEarn?: number;   // below this, card earns nothing (if applicable)
  rules: Rule[];                    // evaluated for best match; unmatched spend earns 0 unless a catch-all rule exists
  sourceUrl: string;
  verifiedOn: string | null;        // ISO date; null = unverified
  catalogVersion: number;
}

interface UserCard {
  id: string;
  productId: string | null;         // null = fully custom card
  nickname: string;
  cycleDay?: number;                // overrides product default
  overrides?: Partial<CardProduct>; // user's edits; merged over catalog product
  catalogVersionSeen: number;
  archived: boolean;
}

interface Transaction {
  id: string;
  userCardId: string;
  date: string;                     // ISO date (local)
  amount: number;                   // RM; negative = refund
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  note?: string;
  recurringId?: string;             // set if generated by a recurring template
}

interface RecurringTemplate {
  id: string;
  userCardId: string;
  amount: number;
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  dayOfPeriod: 'first';             // v1: inserted on the first day of each new period
  active: boolean;
}

interface Settings {
  schemaVersion: number;
  lastBackupAt: string | null;
  pointValueOverrides: Record<string, number>; // productId -> RM per point
}
```

## 5. Card catalog

Initial catalog covers the user's cards:

1. Maybank Islamic Ikhwan American Express Platinum
2. RHB Shell Visa
3. UOB One Classic
4. Alliance Bank Visa Infinite
5. Alliance Bank Visa Virtual Credit Card
6. Public Bank Quantum Visa
7. Public Bank Quantum Mastercard
8. AEON AMP Visa Platinum

- Stored as `src/catalog/cards.json`, validated against the `CardProduct` type at load and in tests.
- Rules are researched from each bank's official T&C / product page during implementation. Each entry records `sourceUrl` and `verifiedOn`. Rules that cannot be confirmed from an official source are kept with `verifiedOn: null`, and the UI shows an "Unverified — please check" badge rather than presenting guessed values as fact.
- Points cards (expected: Alliance cards — to be confirmed during research) carry a default `pointValueRM`, editable in Settings.
- When a catalog entry's `catalogVersion` exceeds the user card's `catalogVersionSeen`, the Cards screen shows "Catalog updated — review changes". User overrides are preserved.

## 6. Rules engine

All functions are pure and deterministic; "now" is passed in, never read from the clock.

### 6.1 Periods
`getPeriod(card, date) -> { start, end }`
- `calendar`: 1st to last day of the month.
- `statement`: from `cycleDay` of one month to the day before `cycleDay` of the next month (e.g. 15 Sep – 14 Oct).

### 6.2 Earnings
`calculateEarnings(card, transactions, period) -> PeriodEarnings`

Process the period's transactions for that card in chronological order (ties by insertion order):
1. **Eligibility of rules:** a rule matches a transaction if every filter present (categories, merchants, paymentMethods, days) matches.
2. **Rule selection:** among matching rules, pick the highest effective rate. One transaction earns from at most one rule.
3. **Rate with tiers:** the tier is chosen from the card's **total eligible spend for the whole period** (all transactions in the period, not a running total). Crossing a tier therefore applies the higher rate to every transaction in the period. This is the default assumption and must be confirmed per card during catalog research; if a card uses a different method (e.g. only spend above the threshold earns the higher rate), add a `tierMode: 'marginal'` field to `Rule`, implement it, and cover it with a test.
4. **Minimum spend:** if `minMonthlySpendToEarn` is set and period spend is below it, earnings are 0 (reported as "locked" with amount remaining).
5. **Caps, applied in order:** rule `capPerPeriod` → `capGroup` cap → `totalCapPerPeriod`. A transaction that partially exceeds a cap earns only the remainder.
6. **Points:** raw points are computed and capped in points; RM value = points × `pointValueRM`.
7. **Refunds (negative amounts):** reduce eligible spend and reverse earnings on the matched rule, never taking a rule's earned amount below 0.

Output per card:
```ts
interface PeriodEarnings {
  period: { start: string; end: string };
  totalSpend: number;
  totalEarnedRM: number;
  perTransaction: { transactionId: string; ruleId: string | null; earnedRM: number; cappedRM: number }[];
  caps: { key: string; label: string; used: number; limit: number }[];   // rule, group, total
  nextTier?: { ruleId: string; spendNeeded: number; nextRate: number };
  locked?: { spendNeeded: number };                                       // min-spend not met
}
```

### 6.3 Recommendation
`recommend(userCards, allTransactions, purchase, now) -> Recommendation[]`

For each active user card: compute earnings for the current period with and without the hypothetical purchase; **incremental RM = difference**. This naturally accounts for remaining caps, tier crossings, and min-spend unlocks. Return cards sorted by incremental RM (desc), ties by lower cap utilisation. Each result includes a human-readable reason, e.g. "5% dining — RM3.00 cap left" or "Cap reached — earns RM0".

### 6.4 Effective card
`resolveCard(userCard, product) -> CardProduct` merges the catalog product with the user's overrides; the engine only ever sees resolved cards.

## 7. Screens

Navigation: sidebar on desktop; bottom tab bar on narrow screens.

1. **Dashboard** — period cashback total and per card; cap meters per card (amber at ≥80%, red at 100%); tier nudges ("Spend RM180 more on UOB One for the next tier"); min-spend locks; recent transactions; disclaimer "Estimates only — check your bank statement".
2. **Which card?** — amount, category chips, optional merchant (autocomplete from history), payment method → live ranked list with incremental RM, rate, and reason. "Log it" saves the transaction to the chosen card.
3. **Transactions** — list filterable by period, card, category; add/edit/delete; merchant memory suggests the category last used for that merchant; recurring templates managed here.
4. **Cards** — owned cards with key rules summary and verification badge; "Add card" searches the catalog or creates a custom card; rule editor (rate, tiers, caps, filters) with "reset to catalog default"; archive card.
5. **Reports** — monthly stacked bar of cashback by card; category breakdown; effective cashback rate (earned ÷ spend) per month.
6. **Settings** — points RM values; export/import JSON; backup reminder when `lastBackupAt` is over 30 days old or never.

## 8. Period rollover and recurring transactions

On app start (and when the app regains focus), for each active recurring template, generate any missing transactions for every period start between the template's last generated date and today. Generation is idempotent (keyed on template id + period start), so repeated opens never duplicate.

## 9. Error handling and data safety

- Form validation: amount ≠ 0, required fields present; rule editor enforces ascending tiers, non-negative rates/caps, cycle day 1–28.
- On startup, detect IndexedDB unavailability (e.g. private browsing) and show a blocking warning explaining data won't persist.
- Export: JSON containing `schemaVersion`, cards, transactions, templates, settings.
- Import: validate schema and version, show a preview (counts, date range), then replace existing data after confirmation. Invalid files are rejected with a specific message.
- Dexie schema migrations on version bumps; export files from older schema versions are migrated on import.
- Engine errors (e.g. malformed custom rule) are caught per card: that card shows an error state; the rest of the app keeps working.

## 10. Testing

- **Engine (Vitest, TDD):** unit tests for periods, rule matching, rule selection, tiers, min spend, each cap level, partial cap, points conversion, refunds, and recommendation ranking. Boundary cases: statement-cycle boundary dates, tier boundary exactly at threshold, cap hit mid-transaction, weekend on a period boundary.
- **Catalog:** schema validation test for `cards.json`; for each card, at least one scenario test derived from its T&C examples (e.g. "RM1,200 total spend incl. RM300 at Shell → expected cashback").
- **Data:** repository tests against fake-indexeddb; export → import round-trip; migration tests.
- **UI:** component tests for the recommendation form and cap meter.
- **E2E (Playwright):** add card → log transaction → dashboard cap meter updates; export then import restores data.

## 11. Future phases (not designed here)

1. CSV statement import
2. AI PDF statement parsing (requires backend + API key)
3. Login + cloud sync via a new `Repository` implementation
4. Capacitor wrap for iOS App Store / Play Store
5. Missed-savings report
