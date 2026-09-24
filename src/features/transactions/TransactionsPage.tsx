import { useMemo, useState } from 'react';
import { CATEGORIES, type RecurringTemplate, type Transaction } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { activeCards, earningsByTransaction, nameOf } from '../../app/selectors';
import { getPeriod } from '../../engine/periods';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';
import { newId } from '../../lib/id';
import { TransactionForm } from './TransactionForm';

export function TransactionsPage() {
  const data = useAppData();
  const { repo, transactions, templates, resolved, refresh, today } = data;
  const cards = activeCards(data);
  const earned = useMemo(() => earningsByTransaction(data), [data]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [cardFilter, setCardFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const rows = transactions
    .filter((t) => (!month || t.date.startsWith(month)) && (!cardFilter || t.userCardId === cardFilter) && (!categoryFilter || t.category === categoryFilter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  async function submit(tx: Transaction, makeRecurring: boolean) {
    let toSave = tx;
    if (makeRecurring && resolved[tx.userCardId]) {
      const tpl: RecurringTemplate = {
        id: newId(),
        userCardId: tx.userCardId,
        amount: tx.amount,
        category: tx.category,
        merchant: tx.merchant,
        paymentMethod: tx.paymentMethod,
        dayOfPeriod: 'first',
        active: true,
        startDate: tx.date,
        lastGeneratedPeriodStart: getPeriod(resolved[tx.userCardId], tx.date).start,
        ...(tx.overseas ? { overseas: true } : {}),
      };
      await repo.saveTemplate(tpl);
      toSave = { ...tx, recurringId: tpl.id };
    }
    await repo.saveTransaction(toSave);
    setEditing(null);
    await refresh();
  }

  async function remove(t: Transaction) {
    if (!window.confirm(`Delete ${formatRM(t.amount)} on ${t.date}?`)) return;
    await repo.deleteTransaction(t.id);
    await refresh();
  }

  async function toggleTemplate(t: RecurringTemplate) {
    const card = resolved[t.userCardId];
    // Resuming does not backfill missed periods: mark the current period as already handled.
    const next = t.active ? { ...t, active: false } : { ...t, active: true, lastGeneratedPeriodStart: card ? getPeriod(card, today).start : t.lastGeneratedPeriodStart };
    await repo.saveTemplate(next);
    await refresh();
  }

  return (
    <>
      <h1>Transactions</h1>
      <TransactionForm
        key={editing?.id ?? 'new'}
        cards={cards}
        transactions={transactions}
        today={today}
        initial={editing ?? undefined}
        onSubmit={submit}
        onCancel={editing ? () => setEditing(null) : undefined}
      />

      <section className="panel" aria-label="Filters">
        <label className="inline">
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="inline">
          Card
          <select value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}>
            <option value="">All cards</option>
            {data.userCards.map((uc) => (
              <option key={uc.id} value={uc.id}>
                {nameOf(data, uc.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {rows.length === 0 ? (
        <p className="muted">No transactions match.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Card</th><th>Merchant</th><th>Category</th><th>Amount</th><th>Cashback</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{nameOf(data, t.userCardId)}</td>
                <td>{t.merchant ?? ''}{t.overseas ? ' · Overseas' : ''}</td>
                <td>{CATEGORY_LABELS[t.category]}</td>
                <td>{formatRM(t.amount)}</td>
                <td>{formatRM(earned.get(t.id) ?? 0)}</td>
                <td>
                  <button type="button" onClick={() => setEditing(t)}>Edit</button>{' '}
                  <button type="button" onClick={() => remove(t)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">Estimates only — check your bank statement</p>

      {templates.length > 0 && (
        <section className="panel" aria-label="Recurring transactions">
          <h2>Recurring</h2>
          <ul>
            {templates.map((t) => (
              <li key={t.id}>
                {nameOf(data, t.userCardId)} · {t.merchant ?? CATEGORY_LABELS[t.category]} · {formatRM(t.amount)} {t.active ? '' : '(stopped)'}{' '}
                <button type="button" onClick={() => toggleTemplate(t)}>{t.active ? 'Stop' : 'Resume'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
