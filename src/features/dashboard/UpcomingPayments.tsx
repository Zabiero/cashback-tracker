import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { nameOf } from '../../app/selectors';
import { statementStatus, upcomingPayments } from '../../statements/logic';
import { formatRM } from '../../lib/money';
import { Money } from '../../components/Money';

export function UpcomingPayments() {
  const data = useAppData();
  const items = upcomingPayments(data.statements, data.today);
  if (items.length === 0) return null;
  return (
    <section className="panel" aria-label="Upcoming payments">
      <h2>Upcoming payments</h2>
      <ul className="rows">
        {items.map((s) => {
          const st = statementStatus(s, data.today);
          return (
            <li key={s.id}>
              <div className="row-main">
                <Link to="/bills" className="row-title">{nameOf(data, s.userCardId)}</Link>
                <span><span className={`chip chip-${st.tone}`}>{st.label}</span></span>
              </div>
              <div className="row-end">
                <Money value={s.statementBalance} size="lg" />
                <span className="muted">min {formatRM(s.minimumDue)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
