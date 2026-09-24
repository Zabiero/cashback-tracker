import type { RewardType, Rule } from './types';
import { formatRM } from '../lib/money';
import { CATEGORY_LABELS, DAY_LABELS, PAYMENT_LABELS } from '../lib/labels';

export function formatRate(rate: number, rewardType: RewardType): string {
  return rewardType === 'points' ? `${rate} pts/RM` : `${Number((rate * 100).toFixed(2))}%`;
}

export function describeRule(rule: Rule, rewardType: RewardType): string {
  const parts: string[] = [];
  if (rule.tiers?.length) {
    parts.push(
      rule.tiers
        .map((t, i) => (i === 0 && t.minPeriodSpend === 0 ? formatRate(t.rate, rewardType) : `${formatRate(t.rate, rewardType)} from ${formatRM(t.minPeriodSpend)}`))
        .join(' → '),
    );
  } else {
    parts.push(formatRate(rule.rate, rewardType));
  }
  if (rule.categories?.length) parts.push(rule.categories.map((c) => CATEGORY_LABELS[c]).join(', '));
  if (rule.merchants?.length) parts.push(`at ${rule.merchants.join(', ')}`);
  if (rule.paymentMethods?.length) parts.push(rule.paymentMethods.map((p) => PAYMENT_LABELS[p]).join(', '));
  if (rule.days?.length) parts.push(rule.days.map((d) => DAY_LABELS[d]).join(', '));
  if (rule.capPerPeriod != null) parts.push(rewardType === 'points' ? `cap ${rule.capPerPeriod} pts` : `cap ${formatRM(rule.capPerPeriod)}`);
  return parts.join(' · ');
}
