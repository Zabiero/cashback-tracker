import { screen } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
import { renderWithData, seedCard } from '../../test/renderWithData';

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
    expect(screen.getByRole('progressbar', { name: 'Dining cap' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('Spend RM400.00 more on Card B to reach 5%')).toBeInTheDocument();
    expect(screen.getByTestId('recent')).toHaveTextContent('Nando');
    expect(screen.getByText('Estimates only — check your bank statement')).toBeInTheDocument();
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
});
