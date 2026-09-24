import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Transaction } from '../../engine/types';
import type { ActiveCard } from '../../app/selectors';
import { PurchaseFields, emptyDraft, type PurchaseDraft } from '../../components/PurchaseFields';
import { knownMerchants, lastCategoryFor } from '../../lib/merchantMemory';
import { parseMoney } from '../../lib/money';
import { newId } from '../../lib/id';

interface Props {
  cards: ActiveCard[];
  transactions: Transaction[];
  today: string;
  initial?: Transaction;
  onSubmit(tx: Transaction, makeRecurring: boolean): Promise<void>;
  onCancel?(): void;
}

export function TransactionForm({ cards, transactions, today, initial, onSubmit, onCancel }: Props) {
  const [cardId, setCardId] = useState(initial?.userCardId ?? cards[0]?.userCard.id ?? '');
  const [draft, setDraft] = useState<PurchaseDraft>(() =>
    initial
      ? {
          amount: String(initial.amount),
          category: initial.category,
          merchant: initial.merchant ?? '',
          paymentMethod: initial.paymentMethod === 'any' ? 'physical' : initial.paymentMethod,
          date: initial.date,
          overseas: initial.overseas ?? false,
        }
      : emptyDraft(today),
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState('');
  const merchants = useMemo(() => knownMerchants(transactions), [transactions]);

  if (!cards.length) {
    return (
      <p>
        <Link to="/cards">Add a card</Link> before logging transactions.
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoney(draft.amount);
    if (!cardId) return setError('Choose a card.');
    if (amount === null || amount === 0) return setError('Enter an amount like 12.50 (use a minus sign for refunds).');
    if (!draft.date) return setError('Choose a date.');
    setError('');
    await onSubmit(
      {
        id: initial?.id ?? newId(),
        userCardId: cardId,
        date: draft.date,
        amount,
        category: draft.category,
        merchant: draft.merchant.trim() || undefined,
        paymentMethod: draft.paymentMethod,
        note: note.trim() || undefined,
        recurringId: initial?.recurringId,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
        overseas: draft.overseas ? true : undefined,
      },
      recurring,
    );
    if (!initial) {
      setDraft((d) => ({ ...emptyDraft(today), date: d.date, paymentMethod: d.paymentMethod }));
      setNote('');
      setRecurring(false);
    }
  }

  return (
    <form className="panel fields" onSubmit={submit} aria-label={initial ? 'Edit transaction' : 'New transaction'}>
      <label>
        Card
        <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
          {cards.map((c) => (
            <option key={c.userCard.id} value={c.userCard.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <PurchaseFields value={draft} onChange={setDraft} merchants={merchants} categoryFor={(m) => lastCategoryFor(m, transactions)} />
      <label>
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {!initial && (
        <label className="inline">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Repeat every period
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="primary">
          Save transaction
        </button>{' '}
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
