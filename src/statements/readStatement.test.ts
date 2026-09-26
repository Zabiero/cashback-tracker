import { matchCard, readStatement } from './readStatement';
import { card } from '../test/fixtures';
import type { PdfTextResult } from './pdfText';
import type { UserCard } from '../engine/types';
import uobText from './fixtures/uob-1.txt?raw';
import rhb2Text from './fixtures/rhb-2.txt?raw';

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
  it('skips a bank-fallback card whose known last 4 differs', () => {
    expect(matchCard('9999', 'uob', cards, resolved)).toBeUndefined();
    expect(matchCard(undefined, 'uob', cards, resolved)).toBe('U');
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
    expect(r.ok && r.bank).toBe('pbb');
    expect(r.ok && r.hasReader).toBe(false);
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
  describe('two-card statement with one saved card (rhb-2)', () => {
    const rhb = card({ id: 'rhb-x', bank: 'RHB', name: 'X' });
    const extract = async (): Promise<PdfTextResult> => ({ ok: true, pages: [rhb2Text] });
    const read = (r: UserCard) => readStatement(new Uint8Array([1]), { ...base, userCards: [r], resolved: { R: rhb }, extract });
    it('pre-selects the card only for the larger balance when the card has no last 4', async () => {
      const r = await read(uc('R'));
      expect(r.ok && r.candidates.map((c) => [c.last4, c.userCardId])).toEqual([['2222', 'R'], ['2223', undefined]]);
    });
    it('pre-selects the card only for the matching last 4', async () => {
      const r = await read(uc('R', { last4: '2222' }));
      expect(r.ok && r.candidates.map((c) => [c.last4, c.userCardId])).toEqual([['2222', 'R'], ['2223', undefined]]);
    });
  });
  it('passes through notPdf and noText', async () => {
    for (const reason of ['notPdf', 'noText'] as const) {
      const extract = async (): Promise<PdfTextResult> => ({ ok: false, reason });
      expect(await readStatement(new Uint8Array([1]), { ...base, extract })).toEqual({ ok: false, reason });
    }
  });
});
