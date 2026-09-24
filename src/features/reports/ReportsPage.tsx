import { useMemo, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppData } from '../../app/DataProvider';
import { cardInputs, nameOf } from '../../app/selectors';
import { effectiveRate, monthlyReport } from '../../engine/report';
import type { Category } from '../../engine/types';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';

const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777'];

export function ReportsPage() {
  const data = useAppData();
  const inputs = useMemo(() => cardInputs(data, true), [data]);
  const rows = useMemo(() => monthlyReport(inputs), [inputs]);
  const [picked, setPicked] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <>
        <h1>Reports</h1>
        <p>No transactions yet.</p>
      </>
    );
  }

  const month = picked ?? rows[rows.length - 1].month;
  const selected = rows.find((r) => r.month === month) ?? rows[rows.length - 1];
  const chartData = rows.slice(-12).map((r) => ({ month: r.month, ...r.byCard }));
  const cardIds = inputs.map((i) => i.userCard.id);

  return (
    <>
      <h1>Reports</h1>
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

      <table aria-label="Monthly cashback">
        <thead>
          <tr>
            <th>Month</th><th>Spend</th><th>Cashback</th><th>Effective rate</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.month}>
              <td>{r.month}</td>
              <td>{formatRM(r.spend)}</td>
              <td>{formatRM(r.earnedRM)}</td>
              <td>{(effectiveRate(r) * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <ul aria-label="By category">
          {(Object.entries(selected.byCategory) as [Category, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([c, v]) => (
              <li key={c}>
                {CATEGORY_LABELS[c]}: {formatRM(v)}
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
