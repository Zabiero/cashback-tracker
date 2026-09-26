import { useRef, useState, type FormEvent } from 'react';
import type { PaymentStatus, Statement } from '../../engine/types';
import { formatRM } from '../../lib/money';
import { parseAmount } from '../../statements/logic';

type Choice = Exclude<PaymentStatus, 'unpaid'>;

interface Props {
  statement: Statement;
  today: string;
  onSave(p: { paymentStatus: Choice; paidAmount: number; paidOn: string }): Promise<void>;
  onCancel(): void;
}

export function MarkPaidForm({ statement, today, onSave, onCancel }: Props) {
  const [choice, setChoice] = useState<Choice>('paidFull');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    let paidAmount = choice === 'paidFull' ? statement.statementBalance : statement.minimumDue;
    if (choice === 'paidPartial') {
      const n = parseAmount(amount);
      if (n === null || n <= 0) return setError('Enter the amount you paid.');
      paidAmount = n;
    }
    if (!paidOn) return setError('Choose the date you paid.');
    setError('');
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({ paymentStatus: choice, paidAmount, paidOn });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const option = (value: Choice, label: string) => (
    <label className="inline">
      <input type="radio" name="payment" checked={choice === value} onChange={() => setChoice(value)} />
      {label}
    </label>
  );

  return (
    <form className="panel fields" onSubmit={submit} aria-label="Mark paid">
      <div role="radiogroup" aria-label="Payment">
        {option('paidFull', `Full (${formatRM(statement.statementBalance)})`)}
        {option('paidMin', `Minimum (${formatRM(statement.minimumDue)})`)}
        {option('paidPartial', 'Other amount')}
      </div>
      {choice === 'paidPartial' && (
        <label>
          Amount paid (RM)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      )}
      <label>
        Paid on
        <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="primary" disabled={saving}>
          Save payment
        </button>{' '}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
