export const CATEGORIES = [
  'petrol', 'groceries', 'dining', 'online', 'ewallet', 'utilities', 'travel', 'insurance', 'others',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PAYMENT_METHODS = ['contactless', 'online', 'physical', 'ewallet_reload', 'any'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type RewardType = 'cashback' | 'points';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Tier {
  minPeriodSpend: number; // RM, total spend on the card in the period
  rate: number; // cashback: fraction (0.05 = 5%); points: points per RM1
}

export interface Rule {
  id: string;
  label: string;
  rate: number;
  tiers?: Tier[]; // ascending by minPeriodSpend; replaces rate when present
  categories?: Category[];
  merchants?: string[]; // case-insensitive substring match on merchant name
  paymentMethods?: PaymentMethod[];
  days?: Weekday[];
  capPerPeriod?: number; // in reward units (RM or points)
  capGroup?: string;
  overseas?: boolean; // true = only overseas txns; false = only domestic txns; undefined = either
  minTxAmount?: number; // RM; the transaction's |amount| must be >= this to match
  daysOfMonth?: number[]; // 1–31; the transaction's day-of-month must be listed
  minCategorySpend?: number; // RM; rule is only eligible in a period if the period spend on transactions matching this rule reaches this
  pointValueRM?: number; // if set, this rule earns POINTS (rate = points per RM1) worth pointValueRM each, even on a cashback card
  overflowRate?: number; // rate (same units as the rule) earned on spend beyond the rule's own/group cap, instead of 0
}

export interface CardProduct {
  id: string;
  bank: string;
  name: string;
  rewardType: RewardType;
  pointValueRM?: number; // RM value of ONE point
  periodType: 'statement' | 'calendar';
  defaultCycleDay?: number; // 1–28
  capGroups?: Record<string, number>;
  totalCapPerPeriod?: number;
  minMonthlySpendToEarn?: number;
  tierExcludedCategories?: Category[]; // spend in these categories does not count toward tiers or minMonthlySpendToEarn
  rules: Rule[];
  sourceUrl: string;
  verifiedOn: string | null;
  catalogVersion: number;
}

export interface UserCard {
  id: string;
  productId: string | null; // null = custom card; overrides then holds the full CardProduct
  nickname: string;
  cycleDay?: number;
  overrides?: Partial<CardProduct>;
  catalogVersionSeen: number;
  archived: boolean;
}

export interface Transaction {
  id: string;
  userCardId: string;
  date: string;
  amount: number; // negative = refund
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  note?: string;
  recurringId?: string;
  createdAt: string; // ordering tiebreak for same-date transactions
  overseas?: boolean; // foreign-currency / overseas spend
}

export interface RecurringTemplate {
  id: string;
  userCardId: string;
  amount: number;
  category: Category;
  merchant?: string;
  paymentMethod: PaymentMethod;
  dayOfPeriod: 'first';
  active: boolean;
  startDate: string;
  lastGeneratedPeriodStart?: string;
  overseas?: boolean; // copied into generated transactions
}

export interface Settings {
  schemaVersion: number;
  lastBackupAt: string | null;
  pointValueOverrides: Record<string, number>; // productId -> RM per point
}
