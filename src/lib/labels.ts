import type { Category, PaymentMethod } from '../engine/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  petrol: 'Petrol', groceries: 'Groceries', dining: 'Dining', online: 'Online', ewallet: 'E-wallet',
  utilities: 'Utilities', travel: 'Travel', insurance: 'Insurance', others: 'Others',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  contactless: 'Contactless', online: 'Online', physical: 'Chip/PIN', ewallet_reload: 'E-wallet reload', any: 'Any',
};

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
