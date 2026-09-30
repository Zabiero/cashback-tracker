import { useMemo, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppData } from '../../app/DataProvider';
import { cardInputs, nameOf } from '../../app/selectors';
import { effectiveRate, monthlyReport } from '../../engine/report';
import type { Category } from '../../engine/types';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';
import { PageHeader } from '../../components/PageHeader';

const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777'];

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

  const month = picked ?? rows[rows.length - 1].month;
  const selected = rows.find((r) => r.month === month) ?? rows[rows.length - 1];
  const chartData = rows.slice(-12).map((r) => ({ month: r.month, ...r.byCard }));
  const cardIds = inputs.map((i) => i.userCard.id);

  return (
    <>
      <PageHeader title="Reports" />
      <section className="panel" aria-label="Cashback by month chart">
        <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 400, height: 280 }}>
          <BarChart data={chartData}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(v) => formatRM(Number(v))} />
            <Legend />
            {cardIds.map((id, i) => (
              <Bar key={id} dataKey={id} name={nameOf(data, id)} stackId="cards" fill={PALETTE[i % PALETTE.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
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
              <td className="num">{(effectiveRate(r) * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="muted">Months follow each card's period end date. Estimates only — check your bank statement</p>

      <section className="panel">
        <label>
          Breakdown month
          <select value={month} onChange={(e) => setPicked(e.target.value)}>
            {rows.map((r) => (
              <option key={r.month} value={r.month}>
                {r.month}
              </option>
            ))}
          </select>
        </label>
        <ul aria-label="By category" className="rows">
          {(Object.entries(selected.byCategory) as [Category, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([c, v]) => (
              <li key={c}>
                <span>
                  {CATEGORY_LABELS[c]}: {formatRM(v)}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
