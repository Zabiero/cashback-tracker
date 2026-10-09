import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { currentEarnings, nameOf, needsStatementDay, txnsFor } from '../../app/selectors';
import { SpendMeter } from '../../components/SpendMeter';
import { spendPlan } from '../../engine/spendTargets';
import { round2 } from '../../engine/earnings';
import { inPeriod } from '../../engine/periods';
import { spendByCategory } from '../../engine/report';
import type { Category } from '../../engine/types';
import { formatRate } from '../../engine/format';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';
import { UpcomingPayments } from './UpcomingPayments';
import { PageHeader } from '../../components/PageHeader';
import { Money } from '../../components/Money';

export function DashboardPage() {
  const data = useAppData();
  const rows = currentEarnings(data);
  const total = round2(rows.reduce((s, r) => s + r.earnings.totalEarnedRM, 0));
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const errors = Object.entries(data.cardErrors);
  const periodTxs = rows.flatMap(({ userCard, earnings }) => txnsFor(data.transactions, userCard.id).filter((t) => inPeriod(t.date, earnings.period)));
  const spending = spendByCategory(periodTxs);
  const cardSplit = (c: Category) =>
    rows
      .map(({ userCard, name }) => ({ name, spent: round2(periodTxs.reduce((s, t) => (t.userCardId === userCard.id && t.category === c ? s + t.amount : s), 0)) }))
      .filter((x) => x.spent !== 0)
      .sort((a, b) => b.spent - a.spent);
  const totalSpend = round2(rows.reduce((s, r) => s + r.earnings.totalSpend, 0));

  return (
    <>
      <PageHeader title="Dashboard" />
      {errors.length > 0 && (
        <div className="panel error" role="alert">
          {errors.map(([id, msg]) => (
            <p key={id}>
              {nameOf(data, id)}: {msg}
            </p>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="panel">
          <Link to="/cards">Add your first card</Link> to start tracking cashback.
        </p>
      ) : (
        <section className="panel hero">
          <div className="muted">Earned this period (all cards)</div>
          <div data-testid="period-total" className="amount amount-hero">
            {formatRM(total)}
          </div>
          <p className="muted">Estimates only — check your bank statement</p>
        </section>
      )}

      {spending.length > 0 && (
        <details className="panel spending" aria-label="Spending this period">
          <summary>
            <span className="spending-title">Spending this period</span>
            <span className="amount">{formatRM(totalSpend)}</span>
          </summary>
          <ul className="rows">
            {spending.map(([c, spent]) => (
              <li key={c}>
                <div className="row-main">
                  <span className="row-title">{CATEGORY_LABELS[c]}</span>
                  <span className="muted">{cardSplit(c).map((x) => `${x.name} ${formatRM(x.spent)}`).join(' · ')}</span>
                </div>
                <span className="amount">{formatRM(spent)}</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Periods: {rows.map(({ name, earnings }) => `${name} ${earnings.period.start} – ${earnings.period.end}`).join(' · ')}
          </p>
        </details>
      )}

      <UpcomingPayments />

      {rows.map(({ userCard, card, name, earnings }) => {
        const plan = spendPlan(card, txnsFor(data.transactions, userCard.id), earnings);
        return (
          <section key={userCard.id} className="panel" aria-label={name}>
            <div className="card-head">
              <h2>
                {name}
                {needsStatementDay(userCard, card) && (
                  <>
                    {' '}
                    <Link to="/cards" className="badge warn">
                      Set your statement day
                    </Link>
                  </>
                )}
              </h2>
            </div>
            <div className="muted">
              {earnings.period.start} – {earnings.period.end} · spent {formatRM(earnings.totalSpend)} · earned {formatRM(earnings.totalEarnedRM)}
            </div>
            {plan.rows.length > 0 && (
              <p className="spend-total">{plan.moreToMax > 0 ? `Spend ${formatRM(plan.moreToMax)} more to max this card` : 'This card is maxed out ✓'}</p>
            )}
            {plan.rows.map((t) => (
              <SpendMeter key={t.key} t={t} />
            ))}
            {earnings.locked && <p className="tip">Spend {formatRM(earnings.locked.spendNeeded)} more this period to unlock rewards</p>}
            {earnings.nextTier && (
              <p className="tip">
                Spend {formatRM(earnings.nextTier.spendNeeded)} more on {name} to reach {formatRate(earnings.nextTier.nextRate, card.rewardType)}
              </p>
            )}
          </section>
        );
      })}

      <section className="panel">
        <div className="card-head">
          <h2>Recent transactions</h2>
          <Link to="/transactions">All transactions</Link>
        </div>
        <ul data-testid="recent" className="rows">
          {recent.map((t) => (
            <li key={t.id}>
              <div className="row-main">
                <span className="row-title">{t.merchant ?? CATEGORY_LABELS[t.category]}</span>
                <span className="muted">
                  {t.date} · {nameOf(data, t.userCardId)}
                </span>
              </div>
              <Money value={t.amount} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
