import { useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAppData } from './DataProvider';
import { needsBackupReminder } from './backupReminder';
import { Icon, type IconName } from '../components/Icon';
import { cx } from '../lib/cx';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { WhichCardPage } from '../features/recommend/WhichCardPage';
import { BillsPage } from '../features/bills/BillsPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { CardsPage } from '../features/cards/CardsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { MorePage } from '../features/more/MorePage';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Shorter label for the phone tab bar; the link keeps `label` as its accessible name. */
  short?: string;
  /** Reached through "More" on phones. */
  underMore?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: 'home' },
  { to: '/which', label: 'Which card?', icon: 'which' },
  { to: '/bills', label: 'Bills', icon: 'bills' },
  { to: '/transactions', label: 'Transactions', icon: 'list' },
  { to: '/cards', label: 'Cards', icon: 'card', underMore: true },
  { to: '/reports', label: 'Reports', icon: 'chart', underMore: true },
  { to: '/settings', label: 'Settings', icon: 'settings', underMore: true },
];
const MORE_PATHS = ['/more', ...NAV.filter((n) => n.underMore).map((n) => n.to)];

export function Layout() {
  const { storageOk, settings, transactions, today } = useAppData();
  const { pathname } = useLocation();
  const [continueWithoutStorage, setContinue] = useState(false);

  if (!storageOk && !continueWithoutStorage) {
    return (
      <main className="main" role="alert">
        <div className="panel">
          <h1>Your data can't be saved in this browser</h1>
          <p>Storage is blocked (for example in a private window). Anything you enter will be lost when you close the tab.</p>
          <button type="button" className="primary" onClick={() => setContinue(true)}>Continue anyway</button>
        </div>
      </main>
    );
  }

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">Cashback Tracker</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            aria-label={n.short ? n.label : undefined}
            className={({ isActive }) => cx(isActive && 'active', n.underMore && 'desktop-only')}
          >
            <Icon name={n.icon} />
            {n.short ? (
              <>
                <span className="label-long">{n.label}</span>
                <span className="label-short">{n.short}</span>
              </>
            ) : (
              <span>{n.label}</span>
            )}
          </NavLink>
        ))}
        <Link to="/more" className={cx('more-link', MORE_PATHS.includes(pathname) && 'active')}>
          <Icon name="more" />
          <span>More</span>
        </Link>
      </nav>
      <main className="main">
        {needsBackupReminder(settings, transactions.length, today) && (
          <p className="banner notice" role="status">
            <Icon name="alert" />
            <span>
              You haven't backed up in over 30 days. <Link to="/settings">Export a backup</Link>
            </span>
          </p>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/which" element={<WhichCardPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/more" element={<MorePage />} />
        </Routes>
      </main>
    </div>
  );
}
