import { CATEGORIES, PAYMENT_METHODS, type Category, type PaymentMethod } from '../engine/types';
import { CATEGORY_LABELS, PAYMENT_LABELS } from '../lib/labels';

export type TxPaymentMethod = Exclude<PaymentMethod, 'any'>;
export const TX_PAYMENT_METHODS = PAYMENT_METHODS.filter((m): m is TxPaymentMethod => m !== 'any');

export interface PurchaseDraft {
  amount: string;
  category: Category;
  merchant: string;
  paymentMethod: TxPaymentMethod;
  date: string;
  overseas: boolean;
}

export function emptyDraft(today: string): PurchaseDraft {
  return { amount: '', category: 'others', merchant: '', paymentMethod: 'contactless', date: today, overseas: false };
}

interface Props {
  value: PurchaseDraft;
  onChange(v: PurchaseDraft): void;
  merchants: string[];
  categoryFor(merchant: string): Category | undefined;
}

export function PurchaseFields({ value, onChange, merchants, categoryFor }: Props) {
  const set = (patch: Partial<PurchaseDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="fields">
      <label>
        Amount (RM)
        <input inputMode="decimal" value={value.amount} onChange={(e) => set({ amount: e.target.value })} />
      </label>
      <div role="group" aria-label="Category" className="chips">
        {CATEGORIES.map((c) => (
          <button type="button" key={c} aria-pressed={value.category === c} onClick={() => set({ category: c })}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <label>
        Merchant (optional)
        <input
          list="merchant-options"
          value={value.merchant}
          onChange={(e) => set({ merchant: e.target.value })}
          onBlur={() => {
            const c = categoryFor(value.merchant);
            if (c) set({ category: c });
          }}
        />
      </label>
      <datalist id="merchant-options">
        {merchants.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <label>
        Payment method
        <select value={value.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as TxPaymentMethod })}>
          {TX_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="inline">
        <input type="checkbox" checked={value.overseas} onChange={(e) => set({ overseas: e.target.checked })} />
        Overseas (foreign currency)
      </label>
      <label>
        Date
        <input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} />
      </label>
    </div>
  );
}
