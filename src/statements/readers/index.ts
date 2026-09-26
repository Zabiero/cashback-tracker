import type { BankId } from '../../engine/types';
import type { StatementValues } from '../logic';
import { readMaybank } from './maybank';
import { readRhb } from './rhb';
import { readUob } from './uob';
import { readAlliance } from './alliance';

export interface ReadCard extends StatementValues {
  last4?: string;
}

export interface ReadResult {
  cards: ReadCard[];
}

export type BankReader = (lines: string[]) => ReadResult;

export const READERS: Partial<Record<BankId, BankReader>> = {
  maybank: readMaybank,
  rhb: readRhb,
  uob: readUob,
  alliance: readAlliance,
};
