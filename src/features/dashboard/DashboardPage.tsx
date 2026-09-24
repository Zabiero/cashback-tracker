import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { currentEarnings, nameOf, needsStatementDay } from '../../app/selectors';
import { CapMeter } from '../../components/CapMeter';
import { round2 } from '../../engine/earnings';
import { formatRate } from '../../engine/format';
import { CATEGORY_LABELS } from '../../lib/labels';
import { formatRM } from '../../lib/money';

export function DashboardPage() {
  const data = useAppData();
  const rows = currentEarnings(data);
  const total = round2(rows.reduce((s, r) => s + r.earnings.totalEarnedRM, 0));
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const errors = Object.entries(data.cardErrors);

  return (
    <>
      <h1>Dashboard</h1>
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
        <p>
          <Link to="/cards">Add your first card</Link> to start tracking cashback.
        </p>
      ) : (
        <>
          <section className="panel">
            <div className="muted">Earned this period (all cards)</div>
            <div data-testid="period-total" style={{ fontSize: 32, fontWeight: 700 }}>
              {formatRM(total)}
            </div>
            <p className="muted">Estimates only — check your bank statement</p>
          </section>

          {rows.map(({ userCard, card, name, earnings }) => (
            <section key={userCard.id} className="panel" aria-label={name}>
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
              <div className="muted">
                {earnings.period.start} – {earnings.period.end} · spent {formatRM(earnings.totalSpend)} · earned {formatRM(earnings.totalEarnedRM)}
              </div>
              {earnings.caps.map((c) => (
                <CapMeter key={c.key} label={c.label} usedRM={c.usedRM} limitRM={c.limitRM} />
              ))}
              {earnings.locked && <p className="banner">Spend {formatRM(earnings.locked.spendNeeded)} more this period to unlock rewards</p>}
              {earnings.nextTier && (
                <p>
                  Spend {formatRM(earnings.nextTier.spendNeeded)} more on {name} to reach {formatRate(earnings.nextTier.nextRate, card.rewardType)}
                </p>
              )}
            </section>
          ))}
        </>
      )}

      <section className="panel">
        <h2>Recent transactions</h2>
        <ul data-testid="recent">
          {recent.map((t) => (
            <li key={t.id}>
              {t.date} · {nameOf(data, t.userCardId)} · {t.merchant ?? CATEGORY_LABELS[t.category]} · {formatRM(t.amount)}
            </li>
          ))}
        </ul>
        <Link to="/transactions">All transactions</Link>
      </section>
    </>
  );
}
