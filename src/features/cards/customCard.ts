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
export function pickEditable(d: CardProduct): Partial<CardProduct> {
  return {
    periodType: d.periodType,
    rules: d.rules,
    capGroups: d.capGroups,
    totalCapPerPeriod: d.totalCapPerPeriod,
    minMonthlySpendToEarn: d.minMonthlySpendToEarn,
    pointValueRM: d.pointValueRM,
    tierExcludedCategories: d.tierExcludedCategories,
  };
}
