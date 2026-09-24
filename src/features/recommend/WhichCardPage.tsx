import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { cardInputs, nameOf } from '../../app/selectors';
import { recommend, type Recommendation } from '../../engine/recommend';
import { PurchaseFields, emptyDraft, type PurchaseDraft } from '../../components/PurchaseFields';
import { knownMerchants, lastCategoryFor } from '../../lib/merchantMemory';
import { formatRM, parseMoney } from '../../lib/money';
import { newId } from '../../lib/id';

export function WhichCardPage() {
  const data = useAppData();
  const { repo, transactions, refresh, today } = data;
  const [draft, setDraft] = useState<PurchaseDraft>(() => emptyDraft(today));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // blocks a second click before the disabled state renders
  const amount = parseMoney(draft.amount);
  const merchants = useMemo(() => knownMerchants(transactions), [transactions]);
  const inputs = useMemo(() => cardInputs(data), [data]);

  const results = useMemo(
    () =>
      amount !== null && amount > 0
        ? recommend(inputs, {
            amount,
            category: draft.category,
            merchant: draft.merchant.trim() || undefined,
            paymentMethod: draft.paymentMethod,
            date: draft.date,
            overseas: draft.overseas || undefined,
          })
        : [],
    [inputs, draft, amount],
  );

  async function log(r: Recommendation) {
    if (amount === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    const name = nameOf(data, r.userCardId);
    try {
      await repo.saveTransaction({
        id: newId(),
        userCardId: r.userCardId,
        date: draft.date,
        amount,
        category: draft.category,
        merchant: draft.merchant.trim() || undefined,
        paymentMethod: draft.paymentMethod,
        createdAt: new Date().toISOString(),
        overseas: draft.overseas || undefined,
      });
      setMessage(`Logged ${formatRM(amount)} to ${name}`);
      setDraft((d) => ({ ...d, amount: '', merchant: '' }));
      await refresh();
    } catch (e) {
      setError(`Could not save the transaction: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!inputs.length) {
    return (
      <>
        <h1>Which card?</h1>
        <p>
          <Link to="/cards">Add your cards</Link> to get recommendations.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Which card?</h1>
      <section className="panel">
        <PurchaseFields value={draft} onChange={setDraft} merchants={merchants} categoryFor={(m) => lastCategoryFor(m, transactions)} />
      </section>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {amount === null || amount <= 0 ? (
        <p className="muted">Enter an amount to compare your cards.</p>
      ) : (
        <ol className="results">
          {results.map((r, i) => (
            <li key={r.userCardId} className="panel">
              <strong>
                {i === 0 && r.incrementalRM > 0 ? '🥇 ' : ''}
                <span>{nameOf(data, r.userCardId)}</span>
              </strong>
              <div>
                <span>{formatRM(r.incrementalRM)}</span>
              </div>
              <div className="muted">{r.reason}</div>
              <button type="button" onClick={() => log(r)} disabled={saving} aria-label={`Log it to ${nameOf(data, r.userCardId)}`}>
                Log it
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">Estimates only — check your bank statement</p>
    </>
  );
}
