import { useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useAppData } from './DataProvider';
import { needsBackupReminder } from './backupReminder';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { WhichCardPage } from '../features/recommend/WhichCardPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { CardsPage } from '../features/cards/CardsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/which', label: 'Which card?' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/cards', label: 'Cards' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { storageOk, settings, transactions, today } = useAppData();
  const [continueWithoutStorage, setContinue] = useState(false);

  if (!storageOk && !continueWithoutStorage) {
    return (
      <main className="main" role="alert">
        <h1>Your data can't be saved in this browser</h1>
        <p>Storage is blocked (for example in a private window). Anything you enter will be lost when you close the tab.</p>
        <button type="button" onClick={() => setContinue(true)}>Continue anyway</button>
      </main>
    );
  }

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        {needsBackupReminder(settings, transactions.length, today) && (
          <p className="banner" role="status">
            You haven't backed up in over 30 days. <Link to="/settings">Export a backup</Link>
          </p>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/which" element={<WhichCardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
