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
      merged.pointValueRM = pointValueOverrides[product.id];
    }
  } else {
    if (!userCard.overrides) throw new Error(`Custom card "${userCard.nickname}" has no definition`);
    merged = { ...(userCard.overrides as CardProduct) };
  }
  if (userCard.cycleDay) merged.defaultCycleDay = userCard.cycleDay;
  return merged;
}
