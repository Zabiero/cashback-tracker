import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';

const ITEMS: { to: string; label: string; icon: IconName }[] = [
  { to: '/cards', label: 'Cards', icon: 'card' },
  { to: '/reports', label: 'Reports', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/** Phone-only home for the screens that don't fit in the bottom tab bar. */
export function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <nav className="panel" aria-label="More">
        <ul className="rows more-list">
          {ITEMS.map((i) => (
            <li key={i.to}>
              <Link to={i.to}>
                <Icon name={i.icon} />
                <span>{i.label}</span>
                <span className="chevron"><Icon name="chevron" size={16} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
