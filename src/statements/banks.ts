import type { BankId } from '../engine/types';

export const BANK_LABELS: Record<BankId, string> = {
  maybank: 'Maybank',
  rhb: 'RHB',
  uob: 'UOB',
  alliance: 'Alliance Bank',
  pbb: 'Public Bank',
  aeon: 'AEON',
};

/** Legal-entity names (or the bank's own web address) printed on each bank's statement (never personal data). */
const MARKERS: Partial<Record<BankId, RegExp[]>> = {
  maybank: [/Maybank Islamic Berhad/i, /Malayan Banking Berhad/i],
  rhb: [/RHB Bank Berhad/i, /RHB Islamic Bank Berhad/i],
  uob: [/United Overseas Bank \(Malaysia\) (?:Bhd|Berhad)/i],
  // The Alliance card statement prints no legal-entity name; it links to the bank's own website.
  alliance: [/Alliance Bank Malaysia Berhad/i, /Alliance Islamic Bank Berhad/i, /www\.alliancebank\.com\.my/i],
  // Detected (so the "No reader for … yet" message shows) but not yet read.
  pbb: [/Public Bank Berhad/i],
  aeon: [/AEON Credit Service/i],
};

export function detectBank(text: string): BankId | null {
  for (const [bank, markers] of Object.entries(MARKERS) as [BankId, RegExp[]][]) {
    if (markers.some((m) => m.test(text))) return bank;
  }
  return null;
}

const BANK_NAME_PREFIXES: [RegExp, BankId][] = [
  [/^maybank\b/, 'maybank'],
  [/^rhb\b/, 'rhb'],
  [/^uob\b/, 'uob'],
  [/^alliance\b/, 'alliance'],
  [/^public bank\b/, 'pbb'],
  [/^aeon\b/, 'aeon'],
];

/** Maps a catalog product's `bank` field (e.g. "Maybank Islamic") to its BankId. */
export function bankIdForBankName(bank: string): BankId | null {
  const name = bank.trim().toLowerCase();
  return BANK_NAME_PREFIXES.find(([re]) => re.test(name))?.[1] ?? null;
}
