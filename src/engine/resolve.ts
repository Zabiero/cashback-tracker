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
      const value = pointValueOverrides[product.id];
      merged.pointValueRM = value;
      // Hybrid cards value points per rule; each has a single points currency, so the override applies to all of them.
      merged.rules = merged.rules.map((r) => (r.pointValueRM != null ? { ...r, pointValueRM: value } : r));
    }
  } else {
    if (!userCard.overrides) throw new Error(`Custom card "${userCard.nickname}" has no definition`);
    merged = { ...(userCard.overrides as CardProduct) };
  }
  if (userCard.cycleDay) merged.defaultCycleDay = userCard.cycleDay;
  return merged;
}
