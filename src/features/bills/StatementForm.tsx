import { useRef, useState, type FormEvent } from 'react';
import type { ActiveCard } from '../../app/selectors';
import { checkStatement, parseAmount, type StatementIssue, type StatementValues } from '../../statements/logic';

export interface StatementInput {
  userCardId: string;
  statementDate: string;
  dueDate: string;
  statementBalance: number;
  minimumDue: number;
}

export interface StatementDraft {
  userCardId: string;
  statementDate: string;
  dueDate: string;
  statementBalance: string;
  minimumDue: string;
}

export function draftFrom(v: Partial<StatementValues> & { userCardId?: string } = {}): StatementDraft {
  return {
    userCardId: v.userCardId ?? '',
    statementDate: v.statementDate ?? '',
    dueDate: v.dueDate ?? '',
    statementBalance: v.statementBalance != null ? v.statementBalance.toFixed(2) : '',
    minimumDue: v.minimumDue != null ? v.minimumDue.toFixed(2) : '',
  };
}

interface Props {
  cards: ActiveCard[];
  initial: StatementDraft;
  today: string;
  note?: string;
  issues?: StatementIssue[];
  submitLabel?: string;
  /** Style the submit button as the primary action (default true). */
  submitPrimary?: boolean;
  onSubmit(values: StatementInput): Promise<void>;
  onCancel(): void;
}

export function StatementForm({ cards, initial, today, note, issues = [], submitLabel = 'Save statement', submitPrimary = true, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const set = (p: Partial<StatementDraft>) => setDraft((d) => ({ ...d, ...p }));
  const flagged = new Set(issues.map((i) => i.field));
  const balance = parseAmount(draft.statementBalance);
  const minimum = parseAmount(draft.minimumDue);
  const warnings = checkStatement(
    {
      statementDate: draft.statementDate || undefined,
      dueDate: draft.dueDate || undefined,
      statementBalance: balance ?? undefined,
      minimumDue: minimum ?? undefined,
    },
    today,
  ).filter((i) => !i.missing);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    if (!draft.userCardId) return setError('Choose a card.');
    if (!draft.statementDate || !draft.dueDate) return setError('Enter the statement date and due date.');
    if (balance === null) return setError('Enter the statement balance (e.g. 1234.50, or 20.00 CR for a credit).');
    if (minimum === null || minimum < 0) return setError('Enter the minimum due (e.g. 50.00).');
    setError('');
    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit({ userCardId: draft.userCardId, statementDate: draft.statementDate, dueDate: draft.dueDate, statementBalance: balance, minimumDue: minimum });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const cls = (f: keyof StatementValues) => (flagged.has(f) ? 'field-issue' : undefined);
  return (
    <form className="panel fields" onSubmit={submit} aria-label="Statement">
      {note && <p className="muted">{note}</p>}
      <label>
        Card
        <select value={draft.userCardId} onChange={(e) => set({ userCardId: e.target.value })}>
          <option value="">Choose a card</option>
          {cards.map((c) => (
            <option key={c.userCard.id} value={c.userCard.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={cls('statementDate')}>
        Statement date
        <input type="date" value={draft.statementDate} onChange={(e) => set({ statementDate: e.target.value })} />
      </label>
      <label className={cls('dueDate')}>
        Payment due date
        <input type="date" value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
      </label>
      <label className={cls('statementBalance')}>
        Statement balance (RM)
        <input inputMode="decimal" value={draft.statementBalance} onChange={(e) => set({ statementBalance: e.target.value })} />
      </label>
      <label className={cls('minimumDue')}>
        Minimum due (RM)
        <input inputMode="decimal" value={draft.minimumDue} onChange={(e) => set({ minimumDue: e.target.value })} />
      </label>
      {warnings.length > 0 && (
        <div role="status" className="banner">
          Please double-check:
          <ul>
            {warnings.map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className={submitPrimary ? 'primary' : undefined} disabled={saving}>
          {submitLabel}
        </button>{' '}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
