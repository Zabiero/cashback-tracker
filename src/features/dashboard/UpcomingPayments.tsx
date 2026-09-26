import { Link } from 'react-router-dom';
import { useAppData } from '../../app/DataProvider';
import { nameOf } from '../../app/selectors';
import { statementStatus, upcomingPayments } from '../../statements/logic';
import { formatRM } from '../../lib/money';

export function UpcomingPayments() {
  const data = useAppData();
  const items = upcomingPayments(data.statements, data.today);
  if (items.length === 0) return null;
  return (
    <section className="panel" aria-label="Upcoming payments">
      <h2>Upcoming payments</h2>
      <ul>
        {items.map((s) => {
          const st = statementStatus(s, data.today);
          return (
            <li key={s.id}>
              <Link to="/bills">{nameOf(data, s.userCardId)}</Link> — <span className={`chip chip-${st.tone}`}>{st.label}</span> —{' '}
              {formatRM(s.statementBalance)} (min {formatRM(s.minimumDue)})
            </li>
          );
        })}
      </ul>
    </section>
  );
}
