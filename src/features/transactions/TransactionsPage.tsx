import { useMemo, useState } from 'react';
import { CATEGORIES, type RecurringTemplate, type Transaction } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { activeCards, earningsByTransaction, nameOf } from '../../app/selectors';
import { getPeriod } from '../../engine/periods';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';
import { newId } from '../../lib/id';
import { TransactionForm } from './TransactionForm';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';

export function TransactionsPage() {
  const data = useAppData();
  const { repo, transactions, templates, resolved, refresh, today } = data;
  const cards = activeCards(data);
  const earned = useMemo(() => earningsByTransaction(data), [data]);
  const [month, setMonth] = useState(''); // '' = all months
  const [cardFilter, setCardFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [adding, setAdding] = useState(false);
  const formOpen = adding || editing !== null;
  const closeForm = () => {
    setAdding(false);
    setEditing(null);
  };

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
    closeForm();
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
      <PageHeader
        title="Transactions"
        actions={!formOpen && (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />
            Add transaction
          </button>
        )}
      />
      {formOpen && (
        <TransactionForm
          key={editing?.id ?? 'new'}
          cards={cards}
          transactions={transactions}
          today={today}
          initial={editing ?? undefined}
          onSubmit={submit}
          onCancel={closeForm}
        />
      )}

      <section className="panel filters" aria-label="Filters">
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        {month && (
          <button type="button" className="link" onClick={() => setMonth('')}>
            Show all months
          </button>
        )}
        <label>
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
        <label>
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
        <p className="panel muted">No transactions match.</p>
      ) : (
        <div className="table-wrap">
          <table className="stack-on-phone">
            <thead>
              <tr>
                <th>Date</th><th>Card</th><th>Merchant</th><th>Category</th><th className="num">Amount</th><th className="num">Cashback</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="tx-date">{t.date}</td>
                  <td className="tx-card">{nameOf(data, t.userCardId)}</td>
                  <td className="tx-merchant">{t.merchant ?? ''}{t.overseas ? ' · Overseas' : ''}</td>
                  <td className="tx-category">{CATEGORY_LABELS[t.category]}</td>
                  <td className="tx-amount num">{formatRM(t.amount)}</td>
                  <td className="tx-cashback num" data-label="Cashback">{formatRM(earned.get(t.id) ?? 0)}</td>
                  <td className="tx-actions num">
                    <button type="button" className="link" onClick={() => setEditing(t)}>Edit</button>
                    <button type="button" className="link danger" onClick={() => remove(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Estimates only — check your bank statement</p>

      {templates.length > 0 && (
        <section className="panel" aria-label="Recurring transactions">
          <h2>Recurring</h2>
          <ul className="rows">
            {templates.map((t) => (
              <li key={t.id}>
                <span>
                  {nameOf(data, t.userCardId)} · {t.merchant ?? CATEGORY_LABELS[t.category]} · {formatRM(t.amount)} {t.active ? '' : '(stopped)'}
                </span>
                <button type="button" className="link" onClick={() => toggleTemplate(t)}>{t.active ? 'Stop' : 'Resume'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
