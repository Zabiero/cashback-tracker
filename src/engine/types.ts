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
}

export interface Settings {
  schemaVersion: number;
  lastBackupAt: string | null;
  pointValueOverrides: Record<string, number>; // productId -> RM per point
}
