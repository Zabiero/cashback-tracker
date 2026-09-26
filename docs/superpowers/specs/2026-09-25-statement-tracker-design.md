# Statement & Payment Tracker — Design Spec

**Date:** 2026-09-25
**Status:** Draft — awaiting user review
**Builds on:** `2026-09-24-cashback-tracker-design.md` (same app, same architecture)

## 1. Purpose and success criteria

Track each credit card's monthly statement — **statement balance, minimum due, due date** — so the user always knows what to pay and when, and never misses a due date. Statements are added by **uploading the bank's PDF**, which is read automatically **in the browser, for free**.

**Done when:**
1. The user uploads a statement PDF (entering its password if needed) for Maybank, RHB, UOB or Alliance Bank (Public Bank and AEON: manual entry until their readers exist) and gets statement date, due date, statement balance and minimum due pre-filled correctly, then saves after review.
2. The Bills screen lists statements with correct status (Overdue / Due in N days / Paid) and supports Mark paid (full / minimum / custom amount).
3. "Add to calendar" downloads a calendar file that imports into Google Calendar / Outlook / Apple Calendar with alerts 3 days and 1 day before the due date.
4. The Dashboard shows unpaid statements due within 14 days, overdue first.
5. Statements survive restarts and are included in JSON backups (without passwords).

## 2. Scope

**In:** statement records per card; PDF upload with in-browser text extraction; password handling (ask each time, optional remember per card on this device); per-bank readers for Maybank, RHB, UOB and Alliance Bank (Public Bank and AEON follow when samples are available — see §10); sanity checks; review/edit form; manual entry; Bills screen; payment status; `.ics` calendar export; Dashboard upcoming-payments panel; backup support.

**Out (explicitly):**
- **Any paid service** — no AI, no API keys (user decision: must be free).
- Importing the statement's transaction list as spending — **next phase**, separate spec.
- Automatic fetching of statements (email/bank) — needs a server; later phase.
- Push notifications — needs a server; reminders come from the user's calendar instead.
- Scanned/image-only PDFs (no text layer) — fall back to manual entry; no OCR.

**Constraints:** still browser-only (GitHub Pages), data stays on the device, English UI, RM only. All new libraries must be free and open source.

## 3. Data model

```ts
type PaymentStatus = 'unpaid' | 'paidFull' | 'paidMin' | 'paidPartial';

interface Statement {
  id: string;
  userCardId: string;
  statementDate: string;     // ISO date
  dueDate: string;           // ISO date
  statementBalance: number;  // RM (may be 0 or negative for a credit balance)
  minimumDue: number;        // RM, >= 0
  source: 'reader' | 'manual';
  readerBank?: BankId;       // which bank reader filled it, when source = 'reader'
  paymentStatus: PaymentStatus;
  paidAmount?: number;       // RM, for paidPartial (and recorded for paidFull/paidMin)
  paidOn?: string;           // ISO date
  createdAt: string;
}

type BankId = 'maybank' | 'rhb' | 'uob' | 'alliance' | 'pbb' | 'aeon';

// UserCard additions (optional fields; existing cards unaffected)
interface UserCard {
  // ...existing fields
  last4?: string;            // 4 digits, used to match uploaded statements to this card
  pdfPassword?: string;      // only if the user ticked "remember on this device"
}
```

- Storage: new Dexie table `statements` (indexed by `id, userCardId, dueDate`) via a **schema version bump** (Dexie `version(2)`), so existing user data is kept.
- `Repository` gains `listStatements()`, `saveStatement()`, `deleteStatement()`; `AppSnapshot` gains `statements`.
- Uniqueness: one statement per (`userCardId`, `statementDate`). Saving a duplicate asks "Replace the existing statement?"
- **Backups:** backup schema version 2 includes `statements`; `pdfPassword` is **stripped on export** and never imported. Version-1 backups import with `statements: []`.
- The catalog does not change; each card's bank comes from its catalog product (`bank` field). Custom cards pick a bank reader manually or use manual entry.

## 4. Reading a statement PDF (all in the browser)

Pipeline — pure functions except step 1, each unit-tested:

1. **Extract text** — `pdfjs-dist` (Mozilla PDF.js, Apache-2.0, free). Loaded lazily only when the user uploads, so the rest of the app stays fast. If the PDF is encrypted: use the card's remembered password if present, otherwise prompt. Wrong password → "Password incorrect" and re-prompt. Output: text per page, in reading order.
2. **Detect bank** — `detectBank(text): BankId | null` by distinctive markers (bank name / legal entity / statement header strings taken from the samples).
3. **Match card** — find the last 4 card digits in the text (`last4` patterns from the samples, e.g. `XXXX XXXX XXXX 1234`); match to a user card with that `last4`. If none matches, the review form asks the user to pick the card, and saving stores `last4` on that card for next time. If a statement contains several cards (e.g. PBB Visa + Mastercard on one statement), the reader returns one result per card and the review form shows them all.
4. **Bank reader** — `readers[bank](text): ReadResult` extracts `{ statementDate, dueDate, statementBalance, minimumDue, last4? }` using label-anchored patterns specific to that bank (e.g. "Payment Due Date", "Minimum Payment", "Current Balance" / Malay equivalents "Tarikh Akhir Bayaran", "Bayaran Minimum"). Handles `RM1,234.56`, `1,234.56 CR` (credit balance → negative), and the date formats found in each bank's statements.
5. **Sanity checks** — `checkStatement(result): string[]`:
   - all four values present;
   - due date after statement date, within 10–35 days;
   - `0 <= minimumDue <= max(statementBalance, 0)` unless balance ≤ 0 (then minimum due must be 0);
   - statement date not in the future.
   Any failure → treated as "not read"; the failing fields are highlighted in the review form.
6. **Review form** — always shown before saving: the four fields pre-filled, a note "Read by: UOB reader" (or "Couldn't read this statement — please fill in"), card selector, and **Save**. The PDF itself is never stored.

**Maintenance path:** a hidden-by-default "Show extracted text" toggle on the review form lets the user copy the (already-extracted) text with personal details removed, to report a statement the reader got wrong.

## 5. Screens

**Bills (new nav item "Bills", route `/bills`):**
- "Upload statement" button → file picker (`.pdf`) → password prompt if needed (with "Remember for this card on this device" checkbox) → review form → save.
- "Add manually" button → same review form, empty.
- List of statements, grouped Unpaid (soonest due first) then Paid (newest first). Each row: card name, statement date, due date, balance, minimum due, status chip:
  - **Overdue** (red): unpaid and today > due date.
  - **Due today / Due in N days** (amber when N ≤ 7, neutral otherwise).
  - **Paid in full / Paid minimum / Paid RM X** (green / neutral).
- Row actions: **Mark paid** (Full / Minimum / Other amount + paid-on date, default today), **Add to calendar**, **Edit**, **Delete** (confirm).

**Dashboard:** new "Upcoming payments" panel at the top: unpaid statements with due date within 14 days or overdue; overdue first, then soonest; each line "UOB One — due in 3 days — RM1,234.50 (min RM50.00)" linking to Bills. Hidden when empty.

**Cards:** each card panel gets a **Last 4 digits** field (optional) and a **Forget saved PDF password** button when one is stored.

**Settings:** backup section notes that saved PDF passwords are not included in backups.

## 6. Calendar reminders

`makeIcs(statement, cardName): string` builds a standards-compliant iCalendar file (RFC 5545):
- one all-day `VEVENT` on the due date, summary `Pay <card name>: RM<balance> (min RM<min>)`;
- two `VALARM`s at 9:00 am, 3 days and 1 day before (`TRIGGER:-P2DT15H` and `TRIGGER:-PT15H` relative to the all-day event's midnight start), so alerts don't fire at midnight;
- stable `UID` from the statement id, so re-downloading updates rather than duplicates in most calendar apps.
Downloaded as `<card>-due-<date>.ics`. Tested for exact output.

## 7. Error handling

- Non-PDF / corrupt file → "This file isn't a readable PDF."
- Wrong password → re-prompt; Cancel returns to Bills.
- No text layer (scanned) → "This PDF has no text (it may be a scan). Please enter the values manually." → manual form.
- Unknown bank / reader failure / sanity-check failure → review form with whatever was read, failing fields highlighted.
- Saving is guarded against double submits; storage errors shown inline.

## 8. Testing

- **Reader fixtures:** for each bank, text fixtures under `src/statements/fixtures/<bank>-N.txt`, derived from the user's redacted sample PDFs with **all personal data removed and amounts/dates altered**. The original PDFs live only in `statements-samples/` (git-ignored — the repository is public) and are never committed.
- Unit tests: `detectBank`, each reader against its fixtures (all four values + last4), `checkStatement`, amount/date parsing (incl. `CR` credits, Malay labels), `makeIcs`, status/"due in N days" computation (using the fixed test "today"), duplicate detection, backup v1→v2 import and password stripping, Dexie v1→v2 upgrade keeps existing data.
- PDF.js integration: one test that extracts text from a small generated (non-personal) PDF, including a password-protected one.
- UI tests: upload → review → save flow with the extractor mocked; Mark paid variants; Dashboard panel ordering; manual entry.
- E2E: add a statement manually → it appears on Bills and the Dashboard panel → mark paid → it leaves the panel.

## 9. Security & privacy notes

- PDFs are processed in memory and discarded; nothing leaves the device.
- A remembered PDF password is stored in this browser's IndexedDB in plain form (like the rest of the app's data). It is opt-in per card, excluded from backups, and removable from the Cards screen. Anyone with access to this browser profile could read it — the checkbox label says so briefly.

## 10. Prerequisite from the user

Redacted sample statement PDFs placed in `statements-samples/` in the project folder (git-ignored).

**Status (2026-09-25):** samples provided for **Maybank, RHB, UOB and Alliance Bank** — this phase builds readers for these four. **Public Bank and AEON samples are not available yet**: in this phase their statements go through manual entry (the upload still extracts text and detects the bank, then says "No reader for this bank yet — please fill in"), and their readers are added as a small follow-up once samples arrive. The rest of the feature (manual entry, Bills, reminders, Dashboard) does not depend on samples.

## 11. Future phases

1. Import the statement's transactions as spending (with duplicate detection and category guessing).
2. Optional automatic statement fetching (server + email access).
