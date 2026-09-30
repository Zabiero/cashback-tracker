# Visual & Layout Redesign — Design

Date: 2026-09-30
Status: approved in chat (visual system + screen layouts); awaiting written-spec review

## Goal

Give the whole app a polished "clean fintech" look and better layouts on all 7 screens, for daily use on iPhone (Safari / home-screen web app) and on a PC browser.

- **In scope:** look (colour, type, spacing, shape, icons) and arrangement (navigation, page headers, how each screen groups its content).
- **Out of scope:** features, data, engine, statement readers, flows. No screen is added or removed except the small **More** page on phones.
- **Success:** it looks consistent and polished at 375px (iPhone) and ≥1024px (PC); every existing test still passes with at most selector-neutral changes; new tests cover the tab bar and More page.

## Constraints

- Free: no paid fonts, services or libraries. No new runtime dependencies (no Tailwind, no UI kit, no icon package).
- Always light theme (`color-scheme: light`, unchanged).
- Accessible names stay the same: button text, labels, headings, `aria-label`s, `role`s and messages that tests or the user rely on are not reworded. Tests query by role/label/text, so restyling must not change those.
- Touch targets ≥ 44px tall on phones.

## Approach

Hand-written CSS design system in `src/styles.css` (tokens on `:root` + component classes) plus a few small presentational React components. Chosen over Tailwind (utility noise, build setup) and a component library (heavy, generic, forces form rewrites).

## Visual system

**Tokens (`:root`)**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F4F5F7` | page background |
| `--surface` | `#FFFFFF` | cards, sidebar, tab bar |
| `--surface-2` | `#F8F9FA` | table header, tinted tips, input fill |
| `--text` | `#111827` | body text |
| `--muted` | `#6B7280` | labels, secondary text |
| `--border` | `#E5E7EB` | dividers, input borders |
| `--accent` | `#0F766E` | primary buttons, active nav, progress |
| `--accent-soft` | `#E6F4F2` | best-pick highlight, active nav background (sidebar) |
| `--warn` / `--warn-soft` | `#B45309` / `#FEF3C7` | due soon, cap ≥ 80% |
| `--danger` / `--danger-soft` | `#B91C1C` / `#FEE2E2` | overdue, cap full, errors |
| `--ok` / `--ok-soft` | `#166534` / `#DCFCE7` | paid |
| `--radius` | `16px` (cards), `10px` (inputs), `999px` (pills) | |
| `--shadow` | `0 1px 2px rgb(0 0 0 / .04), 0 2px 8px rgb(0 0 0 / .04)` | cards |
| spacing | 4 / 8 / 12 / 16 / 24 / 32 px scale (`--s1`…`--s6`) | |

**Type:** system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). Page title 28px/700; section title 17px/600; body 15px; small/muted 13px. Money uses `font-variant-numeric: tabular-nums`; hero amount 36px/700, row amount 17px/600.

**Controls**
- `button` default: secondary — white, 1px border, pill radius, min-height 44px on phones (40px desktop).
- `button.primary`: filled accent, white text.
- `button.link`: text-only accent button for minor actions (Edit, Delete, Add to calendar, Rename…). Delete uses `button.link.danger`.
- Inputs/selects: 44px min height, `--surface-2` fill, 10px radius, accent focus ring. Amount inputs use `inputmode="decimal"` (already or added — attribute only).
- `.chip` variants keep existing class names (`chip-overdue`, `chip-soon`, `chip-paid`) restyled as soft pills; `.badge`/`.badge.warn` likewise.
- `.banner` → notice style: soft tinted background, left icon, 12px radius. `.error` text keeps danger colour; `.panel.error` becomes a danger-soft notice.

**Icons:** one `src/components/Icon.tsx` exporting ~10 inline SVG line icons (home, sparkle/which, receipt/bills, list/transactions, more, card, chart, settings, upload, plus, calendar, alert). `aria-hidden="true"`; the visible label always carries the name.

## Shared components (new, presentational only)

- `Icon` — `<Icon name="home" />`.
- `PageHeader` — `<PageHeader title="Bills" actions={…} />` renders the existing `<h1>` text unchanged plus an optional actions slot aligned right (wraps below on narrow screens).
- `Money` — `<Money value={n} size="hero|lg|md" />` wraps `formatRM` output in a tabular-nums span. Text content identical to `formatRM(n)`.

Existing `CapMeter` is restyled via CSS only (thicker 10px rounded track, label row muted); markup and ARIA unchanged.

## Navigation

- **Desktop (> 700px):** left sidebar 220px, white, "Finory" wordmark at top, each of the 7 links = icon + label, active = `--accent-soft` background + accent text. Content column max 960px, centred, 32px padding.
- **Phone (≤ 700px):** fixed bottom tab bar with 5 items (Home, Which card?, Bills, Transactions, More), each an icon above an 11px label, active = accent colour. Bottom padding respects `env(safe-area-inset-bottom)`; `index.html` viewport gets `viewport-fit=cover`.
- **Link names:** existing tests click links named `Cards`, `Bills`, etc. The phone bar shows *Home, Which card?, Bills, Transactions, More*; to keep tests and accessible names stable, a single `<nav aria-label="Main">` keeps all 7 `NavLink`s (names unchanged: "Dashboard", "Which card?", …). On phones, CSS hides Cards/Reports/Settings from the bar and shows a `More` link (`/more`); the Dashboard link shows visible label "Home" via a phone-only span while keeping accessible name "Dashboard" (`aria-label="Dashboard"`). On desktop the More link is hidden.
- **More page (`/more`):** `PageHeader "More"` + a card list of three rows (icon, label, chevron) linking to Cards, Reports, Settings. On desktop the route still works (plain list). The More tab is shown active when on `/more`, `/cards`, `/reports` or `/settings`.

## Screen layouts

All screens: `PageHeader` replaces the bare `<h1>` (same text). Sections use `.panel` (restyled card).

**Dashboard**
1. Hero card: muted "Earned this period (all cards)", `data-testid="period-total"` hero amount, muted estimates note.
2. `UpcomingPayments`: card titled "Upcoming payments"; each item a row — card name link (left), status chip, amount right-aligned with "min RM x" muted beneath.
3. Per-card cards: header row name (+ statement-day badge) left, earned amount right; muted period/spend line; cap meters; `locked`/`nextTier` messages as a tinted tip strip (`.tip`).
4. Recent transactions: card with rows (merchant or category + muted "date · card" left, amount right) and a "All transactions" link (text unchanged). `data-testid="recent"` stays on the list.

**Which card?**
- Purchase fields in one card; amount field first in visual order only if already first (no DOM reordering that changes behaviour); amount input large (20px).
- Results `<ol className="results">`: each row card; first positive result gets `.best` (accent outline + "Best" chip replacing the 🥇 emoji — no test depends on the emoji). Row: name left, incremental amount right (lg), reason muted, "Log it" button (secondary, accessible name unchanged).

**Bills**
- Header actions: "Upload statement" file-button styled as primary pill with upload icon; "Add manually" secondary. (Swap of emphasis from today; names unchanged.)
- Statement card: name + chip header; balance as lg amount with "Minimum RM x · Due yyyy-mm-dd" muted line; "Statement yyyy-mm-dd" muted; action row: Mark paid/Mark unpaid (secondary) then Add to calendar / Edit / Delete as `button.link`. Paid section cards muted (lower-contrast text).
- Upload flow steps each render inside a `.panel`; "Reading…" gets a CSS spinner beside the unchanged text.

**Transactions**
- `TransactionForm` inside a card (as now if already a panel).
- Filters card: fields in a responsive row (wrap).
- Table restyled: `--surface-2` header, row dividers, numeric columns right-aligned, inside a card with horizontal padding. **Phone:** CSS turns each `<tr>` into a stacked two-line block (table semantics kept for tests/screen readers; `td[data-label]` pseudo-labels where helpful, Edit/Delete as link buttons).
- Recurring card unchanged in content.

**Cards**
- Header action "Add card" (primary) in `PageHeader`.
- Each card: name header with badges row; settings forms (statement day, last 4, PDF password) in `.form-grid` — 2 columns desktop, 1 column phone; actions row at bottom with Edit rules / Rename / Archive as secondary small buttons.

**Reports:** chart in a card, table in a card (same table style). **Settings:** Backup and Points value cards, buttons in an action row.

**Storage-blocked screen:** centred card with the same text and button.

## Error handling

No behaviour change. Visual only: `role="alert"` messages render as danger notices; `role="status"` as neutral/ok notices.

## Testing

- Existing unit/component tests (439) and Playwright e2e must pass unchanged; if one asserts exact DOM structure that the new layout changes, it is updated only to keep its intent. Playwright e2e runs at a desktop viewport, where all 7 nav links are visible.
- New tests: Layout renders a More link to `/more`; More page lists links to Cards, Reports, Settings; Dashboard link keeps accessible name "Dashboard".
- Manual/visual: Playwright screenshots of every screen at 390×844 (iPhone, WebKit) and 1280×800 (Chromium) with seeded demo data; reviewed before deploy.
- Deploy with `npm run deploy` after the user OKs the screenshots.
