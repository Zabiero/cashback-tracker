import type { BankId, CardProduct, UserCard } from '../engine/types';
import { bankIdForBankName, detectBank } from './banks';
import { extractPdfText, type PdfTextResult } from './pdfText';
import { READERS } from './readers';
import { checkStatement, type StatementIssue, type StatementValues } from './logic';

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

/**
 * Matches a statement to a saved card: first by last-4, else the single non-archived card of the detected bank
 * (ignoring cards whose saved last-4 differs from the statement's — a known different last-4 is not this card).
 */
export function matchCard(
  last4: string | undefined,
  bank: BankId | null,
  userCards: UserCard[],
  resolved: Record<string, CardProduct>,
): string | undefined {
  const active = userCards.filter((c) => !c.archived);
  if (last4) {
    const byLast4 = active.find((c) => c.last4 === last4);
    if (byLast4) return byLast4.id;
  }
  if (bank) {
    const byBank = active.filter((c) => {
      const product = resolved[c.id];
      if (last4 && c.last4 && c.last4 !== last4) return false;
      return product && bankIdForBankName(product.bank) === bank;
    });
    if (byBank.length === 1) return byBank[0].id;
  }
  return undefined;
}

export async function readStatement(data: ArrayBuffer | Uint8Array, opts: ReadOptions): Promise<ReadOutcome> {
  const extract = opts.extract ?? extractPdfText;
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)).slice();

  const passwords: (string | undefined)[] = opts.password
    ? [opts.password]
    : [undefined, ...distinctSavedPasswords(opts.userCards)];

  let result: PdfTextResult | undefined;
  for (const password of passwords) {
    result = await extract(new Uint8Array(bytes), password);
    if (result.ok || result.reason === 'notPdf' || result.reason === 'noText') break;
  }

  if (!result) return { ok: false, reason: 'needsPassword' };
  if (!result.ok) {
    if (result.reason === 'notPdf' || result.reason === 'noText') return result;
    return { ok: false, reason: opts.password ? 'wrongPassword' : 'needsPassword' };
  }

  const text = result.pages.join('\n');
  const lines = text.split('\n');
  const bank = detectBank(text);
  const reader = bank ? READERS[bank] : undefined;
  const cards = reader?.(lines).cards ?? [];

  const candidates: StatementCandidate[] =
    cards.length > 0
      ? cards.map((c) => {
          const { last4, ...values } = c;
          const issues = checkStatement(values, opts.today);
          const readerUsed = Boolean(reader) && issues.every((i) => !i.missing);
          return { last4, userCardId: matchCard(last4, bank, opts.userCards, opts.resolved), values, issues, readerUsed };
        })
      : [{ values: {}, issues: checkStatement({}, opts.today), readerUsed: false, userCardId: undefined, last4: undefined }];

  dedupeCardMatches(candidates, opts.userCards);
  return { ok: true, text, bank, hasReader: Boolean(reader), candidates };
}

/**
 * Never pre-select one card for two candidates of the same statement: keep the match only on the candidate
 * whose last-4 equals the card's (or, if the card has no last-4, the one with the larger balance).
 */
function dedupeCardMatches(candidates: StatementCandidate[], userCards: UserCard[]): void {
  const ids = new Set(candidates.map((c) => c.userCardId).filter((id): id is string => Boolean(id)));
  for (const id of ids) {
    const sharing = candidates.filter((c) => c.userCardId === id);
    if (sharing.length < 2) continue;
    const saved = userCards.find((c) => c.id === id);
    const keep = saved?.last4
      ? sharing.find((c) => c.last4 === saved.last4)
      : sharing.reduce((a, b) => ((b.values.statementBalance ?? -Infinity) > (a.values.statementBalance ?? -Infinity) ? b : a));
    for (const c of sharing) if (c !== keep) c.userCardId = undefined;
  }
}

/** Distinct saved PDF passwords, non-archived cards first. */
function distinctSavedPasswords(userCards: UserCard[]): string[] {
  const ordered = [...userCards.filter((c) => !c.archived), ...userCards.filter((c) => c.archived)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of ordered) {
    if (c.pdfPassword && !seen.has(c.pdfPassword)) {
      seen.add(c.pdfPassword);
      out.push(c.pdfPassword);
    }
  }
  return out;
}
