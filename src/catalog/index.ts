import type { CardProduct } from '../engine/types';
import cards from './cards.json';

export const CATALOG: CardProduct[] = cards as unknown as CardProduct[]; // shape enforced by catalog.test.ts

export function getProduct(id: string): CardProduct | undefined {
  return CATALOG.find((c) => c.id === id);
}
