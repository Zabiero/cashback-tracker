import { screen, within } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { statement } from '../../test/fixtures';

describe('DashboardPage', () => {
  it('invites the user to add a card when there are none', async () => {
    await renderWithData(<DashboardPage />);
    expect(screen.getByRole('link', { name: 'Add your first card' })).toBeInTheDocument();
  });

  it('shows period totals, cap meters, tier nudges and recent transactions', async () => {
    await renderWithData(<DashboardPage />, {
      seed: async (repo) => {
        await seedCard(repo, { rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capPerPeriod: 30 }] }, 'A', 'Card A');
        await seedCard(repo, { rules: [{ id: 't', label: 'Tiered', rate: 0, tiers: [{ minPeriodSpend: 0, rate: 0.002 }, { minPeriodSpend: 1000, rate: 0.05 }] }] }, 'B', 'Card B');
        await repo.saveTransaction({ id: 'x', userCardId: 'A', date: '2026-09-10', amount: 500, category: 'dining', paymentMethod: 'physical', merchant: 'Nando', createdAt: 'a' });
        await repo.saveTransaction({ id: 'y', userCardId: 'B', date: '2026-09-11', amount: 600, category: 'others', paymentMethod: 'physical', createdAt: 'b' });
      },
    });
    expect(screen.getByTestId('period-total')).toHaveTextContent('RM26.20'); // 25 + 1.20
    expect(screen.getByRole('progressbar', { name: 'Dining spend' })).toHaveAttribute('aria-valuenow', '500');
    expect(screen.getByText('RM100.00 more')).toBeInTheDocument();
    expect(screen.getByText('RM500.00 of RM600.00 · cashback RM25.00 of RM30.00')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Card A' })).getByText('Spend RM100.00 more to max this card')).toBeInTheDocument();
    expect(screen.getByText('Spend RM400.00 more on Card B to reach 5%')).toBeInTheDocument();
    expect(screen.getByTestId('recent')).toHaveTextContent('Nando');
    expect(screen.getByText('Estimates only — check your bank statement')).toBeInTheDocument();
  });

  it('shows spending this period by category, largest first, across all cards', async () => {
    await renderWithData(<DashboardPage />, {
      seed: async (repo) => {
        await seedCard(repo, {}, 'A', 'Card A');
        await seedCard(repo, {}, 'B', 'Card B');
        await repo.saveTransactions([
          { id: 'x', userCardId: 'A', date: '2026-09-10', amount: 80, category: 'dining', paymentMethod: 'physical', createdAt: 'a' },
          { id: 'y', userCardId: 'B', date: '2026-09-11', amount: 200, category: 'petrol', paymentMethod: 'physical', createdAt: 'b' },
          { id: 'z', userCardId: 'B', date: '2026-09-12', amount: 40, category: 'dining', paymentMethod: 'physical', createdAt: 'c' },
          { id: 'old', userCardId: 'A', date: '2026-08-20', amount: 999, category: 'dining', paymentMethod: 'physical', createdAt: 'd' },
        ]);
      },
    });
    const panel = screen.getByRole('region', { name: 'Spending this period' });
    expect(within(panel).getByRole('heading', { name: 'Spending this period' }).parentElement).toHaveTextContent('RM320.00');
    const items = within(panel).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['PetrolRM200.00', 'DiningRM120.00']);
  });

  it('shows broken cards without hiding the rest', async () => {
    await renderWithData(<DashboardPage />, {
      seed: async (repo) => {
        await seedCard(repo, {}, 'A', 'Card A');
        await seedCard(repo, { rules: [] }, 'B', 'Card B');
      },
    });
    expect(screen.getByRole('heading', { name: 'Card A' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Card B: At least one rule is required');
  });
  it('flags a statement-cycle catalog card whose statement day is not set', async () => {
    await renderWithData(<DashboardPage />, {
      seed: async (repo) => {
        await repo.saveUserCard({ id: 's1', productId: 'rhb-shell-visa', nickname: 'Shell unset', catalogVersionSeen: 1, archived: false });
        await repo.saveUserCard({ id: 's2', productId: 'rhb-shell-visa', nickname: 'Shell set', cycleDay: 15, catalogVersionSeen: 1, archived: false });
      },
    });
    expect(within(screen.getByRole('region', { name: 'Shell unset' })).getByText('Set your statement day')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Shell set' })).queryByText('Set your statement day')).not.toBeInTheDocument();
  });

  it('shows upcoming and overdue payments, soonest first', async () => {
    await renderWithData(<DashboardPage />, {
      seed: async (r) => {
        await seedCard(r, {}, 'A', 'Card A');
        await r.saveStatement(statement({ id: 'x', userCardId: 'A', statementDate: '2026-09-01', dueDate: '2026-09-21', statementBalance: 100, minimumDue: 10 }));
        await r.saveStatement(statement({ id: 'y', userCardId: 'A', statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 200, minimumDue: 20 }));
        await r.saveStatement(statement({ id: 'z', userCardId: 'A', statementDate: '2026-09-15', dueDate: '2026-10-20', statementBalance: 300, minimumDue: 30 }));
      },
    });
    const panel = screen.getByRole('region', { name: 'Upcoming payments' });
    const items = within(panel).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: 'Card A' })).toHaveAttribute('href', '/bills');
    expect(within(items[0]).getByText('Overdue by 3 days')).toBeInTheDocument();
    expect(within(items[0]).getByText('RM100.00')).toBeInTheDocument();
    expect(within(items[0]).getByText('min RM10.00')).toBeInTheDocument();
    expect(within(items[1]).getByText('Due in 4 days')).toBeInTheDocument();
    expect(within(items[1]).getByText('RM200.00')).toBeInTheDocument();
    expect(within(items[1]).getByText('min RM20.00')).toBeInTheDocument();
  });

  it('hides the panel when nothing is due soon', async () => {
    await renderWithData(<DashboardPage />);
    expect(screen.queryByRole('region', { name: 'Upcoming payments' })).not.toBeInTheDocument();
  });
});
