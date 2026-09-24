import type { CardProduct } from '../../engine/types';
import { newId } from '../../lib/id';

export function newCustomProduct(): CardProduct {
  return {
    id: `custom-${newId()}`,
    bank: 'Custom',
    name: 'My card',
    rewardType: 'cashback',
    periodType: 'calendar',
    rules: [{ id: newId(), label: 'All spend', rate: 0.01 }],
    sourceUrl: '',
    verifiedOn: null,
    catalogVersion: 1,
  };
}

/** Fields a user may override on a catalog card. */
const EDITABLE_FIELDS = [
  'periodType',
  'rules',
  'capGroups',
  'totalCapPerPeriod',
  'minMonthlySpendToEarn',
  'pointValueRM',
  'tierExcludedCategories',
] as const satisfies readonly (keyof CardProduct)[];

/** JSON with object keys sorted, so equal values compare equal regardless of key order. */
const canonical = (v: unknown): string | undefined =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x,
  );

/**
 * The editable fields of an edited catalog card that differ from the catalog product, or undefined when none do.
 * Unchanged fields are left out so later catalog updates and Settings point values still reach the card.
 */
export function catalogOverrides(draft: CardProduct, product: CardProduct): Partial<CardProduct> | undefined {
  const out: Partial<CardProduct> = {};
  for (const k of EDITABLE_FIELDS) {
    if (canonical(draft[k]) !== canonical(product[k])) Object.assign(out, { [k]: draft[k] });
  }
  return Object.keys(out).length ? out : undefined;
}
