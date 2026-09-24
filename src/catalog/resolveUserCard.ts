import type { CardProduct, Settings, UserCard } from '../engine/types';
import { resolveCard } from '../engine/resolve';
import { getProduct } from './index';

export function resolveUserCard(uc: UserCard, settings: Pick<Settings, 'pointValueOverrides'>): CardProduct {
  if (uc.productId) {
    const product = getProduct(uc.productId);
    if (!product) throw new Error('This card is no longer in the catalog. Recreate it as a custom card.');
    return resolveCard(uc, product, settings.pointValueOverrides);
  }
  return resolveCard(uc, null, settings.pointValueOverrides);
}
