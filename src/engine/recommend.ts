import type { CardProduct, Category, PaymentMethod, Rule, Transaction, UserCard } from './types';
import { calculateEarnings, capKeysFor, round2 } from './earnings';
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

export function recommend(inputs: CardInput[], purchase: Purchase): Recommendation[] {
  return inputs
    .filter((i) => !i.userCard.archived)
    .map(({ userCard, card, transactions }) => {
      const period = getPeriod(card, purchase.date);
      const hypo: Transaction = { ...purchase, id: HYPOTHETICAL_ID, userCardId: userCard.id, createdAt: '￿' };
      const before = calculateEarnings(card, transactions, period);
      const after = calculateEarnings(card, [...transactions, hypo], period);
      const incrementalRM = round2(after.totalEarnedRM - before.totalEarnedRM);
      const hypoRuleId = after.perTransaction.find((p) => p.transactionId === HYPOTHETICAL_ID)?.ruleId ?? null;
      const rule: Rule | undefined = hypoRuleId ? card.rules.find((r) => r.id === hypoRuleId) : undefined;
      const rate = rule ? rateFor(rule, after.tierSpend) : null;
      const capUtilisation = Math.max(0, ...after.caps.map((c) => (c.limitRM > 0 ? c.usedRM / c.limitRM : 1)));

      let reason: string;
      if (after.locked) {
        reason = `Spend ${formatRM(after.locked.spendNeeded)} more this period to unlock rewards`;
      } else if (!rule) {
        reason = 'No reward for this purchase';
      } else if (incrementalRM === 0) {
        reason = `Cap reached — earns ${formatRM(0)}`;
      } else {
        const keys = capKeysFor(rule);
        const relevant = after.caps.filter((c) => keys.includes(c.key));
        const left = relevant.length ? Math.min(...relevant.map((c) => c.limitRM - c.usedRM)) : null;
        const rewardType = rule.pointValueRM != null ? 'points' : card.rewardType;
        reason = `${formatRate(rate!, rewardType)} ${rule.label}${left != null ? ` — ${formatRM(round2(left))} cap left` : ''}`;
      }

      return { userCardId: userCard.id, incrementalRM, rate, ruleLabel: rule?.label ?? null, reason, capUtilisation };
    })
    .sort((a, b) => b.incrementalRM - a.incrementalRM || a.capUtilisation - b.capUtilisation);
}
