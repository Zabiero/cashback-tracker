import type { CardProduct, Category, PaymentMethod, Rule, Transaction, UserCard } from './types';
import { calculateEarnings, capKeysFor, round2, type CapStatus } from './earnings';
import { getPeriod } from './periods';
import { rateFor } from './rules';
import { formatRate } from './format';
import { formatRM } from '../lib/money';

export interface Purchase {
  amount: number;
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  date: string;
  overseas?: boolean;
}

export interface CardInput {
  userCard: UserCard;
  card: CardProduct;
  transactions: Transaction[]; // this card's transactions only
}

export interface Recommendation {
  userCardId: string;
  incrementalRM: number;
  rate: number | null;
  ruleLabel: string | null;
  reason: string;
  capUtilisation: number; // 0–1, highest across the card's caps after the purchase
}

const HYPOTHETICAL_ID = '__purchase__';
// U+FFFF sorts after every real createdAt, so the hypothetical purchase is applied last within its day.
const LAST_IN_DAY = '\uFFFF';

/** The card as if this period's spend reaches its top tier and every spending minimum; caps still apply. */
export function atBestTier(card: CardProduct): CardProduct {
  return {
    ...card,
    minMonthlySpendToEarn: undefined,
    rules: card.rules.map((r) => ({
      ...r,
      rate: r.tiers?.length ? Math.max(...r.tiers.map((t) => t.rate)) : r.rate,
      tiers: undefined,
      minCategorySpend: undefined,
    })),
  };
}

/** Ranks cards for a purchase, assuming each card reaches its top tier this period. */
export function recommend(inputs: CardInput[], purchase: Purchase): Recommendation[] {
  return inputs
    .filter((i) => !i.userCard.archived)
    .map(({ userCard, card: product, transactions }) => {
      const card = atBestTier(product);
      const period = getPeriod(card, purchase.date);
      const hypo: Transaction = { ...purchase, id: HYPOTHETICAL_ID, userCardId: userCard.id, createdAt: LAST_IN_DAY };
      const before = calculateEarnings(card, transactions, period);
      const after = calculateEarnings(card, [...transactions, hypo], period);
      const incrementalRM = round2(after.totalEarnedRM - before.totalEarnedRM);
      const hypoRuleId = after.perTransaction.find((p) => p.transactionId === HYPOTHETICAL_ID)?.ruleId ?? null;
      const rule: Rule | undefined = hypoRuleId ? card.rules.find((r) => r.id === hypoRuleId) : undefined;
      const rate = rule ? rateFor(rule, after.tierSpend) : null;
      const capUtilisation = Math.max(0, ...after.caps.map((c) => (c.limitRM > 0 ? c.usedRM / c.limitRM : 1)));

      let reason: string;
      if (!rule) {
        reason = 'No reward for this purchase';
      } else if (incrementalRM === 0) {
        reason = `Cap reached — earns ${formatRM(0)}`;
      } else {
        const keys = capKeysFor(rule);
        const relevant = after.caps.filter((c) => keys.includes(c.key));
        const left = relevant.length ? Math.min(...relevant.map((c) => c.limitRM - c.usedRM)) : null;
        const rewardType = rule.pointValueRM != null ? 'points' : card.rewardType;
        const overflowLeft = (caps: CapStatus[]): number | null => {
          const ruleGroup = caps.filter((c) => c.key !== 'total' && keys.includes(c.key));
          return ruleGroup.length ? Math.min(...ruleGroup.map((c) => c.limitRM - c.usedRM)) : null;
        };
        const leftBefore = rule.overflowRate != null ? overflowLeft(before.caps) : null;
        const leftAfter = rule.overflowRate != null ? overflowLeft(after.caps) : null;
        if (rule.overflowRate != null && leftBefore != null && leftBefore <= 0) {
          reason = `${formatRate(rule.overflowRate, rewardType)} ${rule.label} (after cap)`;
        } else if (rule.overflowRate != null && leftAfter != null && leftAfter <= 0) {
          reason = `${formatRate(rate!, rewardType)} then ${formatRate(rule.overflowRate, rewardType)} ${rule.label}`;
        } else {
          reason = `${formatRate(rate!, rewardType)} ${rule.label}${left != null ? ` — ${formatRM(round2(left))} cap left` : ''}`;
        }
      }

      return { userCardId: userCard.id, incrementalRM, rate, ruleLabel: rule?.label ?? null, reason, capUtilisation };
    })
    .sort((a, b) => b.incrementalRM - a.incrementalRM || a.capUtilisation - b.capUtilisation);
}
