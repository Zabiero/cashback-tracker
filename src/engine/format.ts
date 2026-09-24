import type { RewardType, Rule } from './types';
import { formatRM } from '../lib/money';
import { CATEGORY_LABELS, DAY_LABELS, PAYMENT_LABELS } from '../lib/labels';

export function formatRate(rate: number, rewardType: RewardType): string {
  return rewardType === 'points' ? `${rate} pts/RM` : `${Number((rate * 100).toFixed(2))}%`;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function describeRule(rule: Rule, rewardType: RewardType): string {
  const effectiveRewardType: RewardType = rule.pointValueRM != null ? 'points' : rewardType;
  const parts: string[] = [];
  if (rule.tiers?.length) {
    parts.push(
      rule.tiers
        .map((t, i) => (i === 0 && t.minPeriodSpend === 0 ? formatRate(t.rate, effectiveRewardType) : `${formatRate(t.rate, effectiveRewardType)} from ${formatRM(t.minPeriodSpend)}`))
        .join(' → '),
    );
  } else {
    parts.push(formatRate(rule.rate, effectiveRewardType));
  }
  if (rule.categories?.length) parts.push(rule.categories.map((c) => CATEGORY_LABELS[c]).join(', '));
  if (rule.merchants?.length) parts.push(`at ${rule.merchants.join(', ')}`);
  if (rule.paymentMethods?.length) parts.push(rule.paymentMethods.map((p) => PAYMENT_LABELS[p]).join(', '));
  if (rule.days?.length) parts.push(rule.days.map((d) => DAY_LABELS[d]).join(', '));
  if (rule.overseas === true) parts.push('Overseas');
  if (rule.overseas === false) parts.push('Domestic');
  if (rule.minTxAmount != null) parts.push(`min ${formatRM(rule.minTxAmount)}/txn`);
  if (rule.daysOfMonth?.length) parts.push(`on ${rule.daysOfMonth.map(ordinal).join(', ')}`);
  if (rule.minCategorySpend != null) parts.push(`needs ${formatRM(rule.minCategorySpend)} in category`);
  if (rule.capPerPeriod != null) parts.push(effectiveRewardType === 'points' ? `cap ${rule.capPerPeriod} pts` : `cap ${formatRM(rule.capPerPeriod)}`);
  if (rule.overflowRate != null) parts.push(`then ${formatRate(rule.overflowRate, effectiveRewardType)}`);
  return parts.join(' · ');
}
