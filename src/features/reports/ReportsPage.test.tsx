import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from './ReportsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';

describe('ReportsPage', () => {
  it('shows an empty state', async () => {
    await renderWithData(<ReportsPage />);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('lists monthly totals, effective rate and category breakdown', async () => {
    await renderWithData(<ReportsPage />, {
      seed: async (repo) => {
        await seedCard(repo, { rules: [{ id: 'all', label: 'All', rate: 0.05 }] }, 'A', 'Card A');
        await repo.saveTransactions([
          { id: 'x', userCardId: 'A', date: '2026-08-10', amount: 100, category: 'dining', paymentMethod: 'physical', createdAt: 'a' },
          { id: 'y', userCardId: 'A', date: '2026-09-10', amount: 200, category: 'petrol', paymentMethod: 'physical', createdAt: 'b' },
        ]);
      },
    });
    const table = screen.getByRole('table', { name: 'Monthly cashback' });
    const sep = within(table).getByRole('row', { name: /2026-09/ });
    expect(sep).toHaveTextContent('RM200.00');
    expect(sep).toHaveTextContent('RM10.00');
    expect(sep).toHaveTextContent('5.00%');
    const petrol = within(screen.getByRole('list', { name: 'By category' })).getByRole('listitem');
    expect(petrol).toHaveTextContent('Petrol');
    expect(petrol).toHaveTextContent('cashback RM10.00');
    expect(petrol).toHaveTextContent('RM200.00');
    await userEvent.selectOptions(screen.getByLabelText('Breakdown month'), '2026-08');
    const dining = within(screen.getByRole('list', { name: 'By category' })).getByRole('listitem');
    expect(dining).toHaveTextContent('Dining');
    expect(dining).toHaveTextContent('cashback RM5.00');
    expect(dining).toHaveTextContent('RM100.00');
  });
});
