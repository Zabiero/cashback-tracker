import { CATALOG } from '../catalog';
import { BANK_IDS } from '../engine/types';
import { BANK_LABELS, bankIdForBankName, detectBank } from './banks';
import maybank1 from './fixtures/maybank-1.txt?raw';
import rhb1 from './fixtures/rhb-1.txt?raw';
import rhb2 from './fixtures/rhb-2.txt?raw';
import uob1 from './fixtures/uob-1.txt?raw';
import alliance1 from './fixtures/alliance-1.txt?raw';

describe('BANK_LABELS', () => {
  it('labels every bank', () => {
    expect(BANK_LABELS).toEqual({
      maybank: 'Maybank', rhb: 'RHB', uob: 'UOB', alliance: 'Alliance Bank', pbb: 'Public Bank', aeon: 'AEON',
    });
    expect(Object.keys(BANK_LABELS).sort()).toEqual([...BANK_IDS].sort());
  });
});

describe('detectBank', () => {
  it.each([
    ['maybank-1', maybank1, 'maybank'],
    ['rhb-1', rhb1, 'rhb'],
    ['rhb-2', rhb2, 'rhb'],
    ['uob-1', uob1, 'uob'],
    ['alliance-1', alliance1, 'alliance'],
  ])('detects %s', (_name, text, bank) => expect(detectBank(text)).toBe(bank));

  it.each([
    ['Public Bank', 'Issued by Public Bank Berhad (6463-H)', 'pbb'],
    ['AEON', 'AEON Credit Service (M) Berhad', 'aeon'],
  ])('detects %s statements (no reader yet)', (_name, text, bank) => expect(detectBank(text)).toBe(bank));

  it('returns null for unrelated text', () => {
    expect(detectBank('Electricity bill\nAccount 123\nAmount due RM 88.00')).toBeNull();
    expect(detectBank('')).toBeNull();
  });
});

describe('bankIdForBankName', () => {
  it('maps every catalog product bank', () => {
    expect(CATALOG).toHaveLength(10);
    for (const p of CATALOG) expect(bankIdForBankName(p.bank)).not.toBeNull();
  });

  it.each([
    ['Maybank Islamic', 'maybank'], ['Maybank', 'maybank'], ['RHB', 'rhb'], ['UOB', 'uob'],
    ['Alliance Bank', 'alliance'], ['Public Bank', 'pbb'], ['AEON', 'aeon'], [' aeon ', 'aeon'],
  ])('maps %s', (name, id) => expect(bankIdForBankName(name)).toBe(id));

  it('returns null for an unknown bank', () => {
    expect(bankIdForBankName('CIMB')).toBeNull();
    expect(bankIdForBankName('')).toBeNull();
  });
});
