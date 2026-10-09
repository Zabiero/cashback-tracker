import { useMemo, useState } from 'react';
import { useAppData } from '../../app/DataProvider';
import { cardInputs, nameOf } from '../../app/selectors';
import { effectiveRate, monthlyReport } from '../../engine/report';
import type { Category } from '../../engine/types';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';
import { PageHeader } from '../../components/PageHeader';

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function ReportsPage() {
  const data = useAppData();
  const inputs = useMemo(() => cardInputs(data, true), [data]);
  const rows = useMemo(() => monthlyReport(inputs), [inputs]);
  const [picked, setPicked] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Reports" />
        <p className="panel">No transactions yet.</p>
      </>
    );
  }

  const thisMonth = data.today.slice(0, 7);
  const month = picked ?? (rows.some((r) => r.month === thisMonth) ? thisMonth : rows[rows.length - 1].month);
  const selected = rows.find((r) => r.month === month) ?? rows[rows.length - 1];
  const cards = Object.entries(selected.spendByCard)
    .map(([id, spent]) => {
      const earned = selected.byCard[id] ?? 0;
      return { id, name: nameOf(data, id), spent, earned, rate: spent > 0 ? earned / spent : 0 };
    })
    .sort((a, b) => b.rate - a.rate || b.spent - a.spent);
  const topRate = Math.max(0, ...cards.map((c) => c.rate));

  return (
    <>
      <PageHeader title="Reports" />
      <section className="panel">
        <label>
          Month
          <select value={month} onChange={(e) => setPicked(e.target.value)}>
            {[...rows].reverse().map((r) => (
              <option key={r.month} value={r.month}>
                {r.month}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Spent {formatRM(selected.spend)} · cashback {formatRM(selected.earnedRM)} · {pct(effectiveRate(selected))} back
        </p>
      </section>

      <section className="panel" aria-label="Cashback for spending by card">
        <h2>Cashback for spending, by card</h2>
        <p className="muted">Bar = cashback ÷ spending. Longest bar gives back the most per RM spent.</p>
        {cards.map((c) => (
          <div key={c.id} className="cap">
            <div className="cap-label">
              <span className="cap-more">{c.name}</span>
              <span className="cap-more">{pct(c.rate)}</span>
            </div>
            <div
              role="meter"
              aria-label={`${c.name} cashback rate`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number((c.rate * 100).toFixed(2))}
              title={`${formatRM(c.earned)} cashback on ${formatRM(c.spent)} spent`}
              className="cap-track"
            >
              <div className="cap-fill" style={{ width: `${topRate > 0 ? (c.rate / topRate) * 100 : 0}%` }} />
            </div>
            <div className="muted cap-note">
              {formatRM(c.earned)} cashback on {formatRM(c.spent)} spent
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>By category</h2>
        <ul aria-label="By category" className="rows">
          {(Object.entries(selected.spendByCategory) as [Category, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([c, spent]) => (
              <li key={c}>
                <div className="row-main">
                  <span className="row-title">{CATEGORY_LABELS[c]}</span>
                  <span className="muted">cashback {formatRM(selected.byCategory[c] ?? 0)}</span>
                </div>
                <span className="amount">{formatRM(spent)}</span>
              </li>
            ))}
        </ul>
      </section>

      <div className="table-wrap">
        <table aria-label="Monthly cashback">
          <thead>
            <tr>
              <th>Month</th><th className="num">Spend</th><th className="num">Cashback</th><th className="num">Effective rate</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td className="num">{formatRM(r.spend)}</td>
                <td className="num">{formatRM(r.earnedRM)}</td>
                <td className="num">{pct(effectiveRate(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Months follow each card's period end date. Estimates only — check your bank statement</p>
    </>
  );
}
