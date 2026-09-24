import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionsPage } from './TransactionsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import type { Repository } from '../../data/repository';

const seed = async (repo: Repository) => {
  await seedCard(repo, { rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
};

describe('TransactionsPage', () => {
  it('adds a transaction typed with RM and commas and shows its cashback', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), 'RM1,234.00');
    await userEvent.click(screen.getByRole('button', { name: 'Dining' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(await screen.findByText('RM1,234.00')).toBeInTheDocument();
    expect(screen.getByText('RM61.70')).toBeInTheDocument();
    expect((await repo.listTransactions())[0]).toMatchObject({ amount: 1234, category: 'dining', date: '2026-09-24' });
  });

  it('rejects an invalid amount', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount like 12.50');
    expect(await repo.listTransactions()).toEqual([]);
  });

  it('creates a recurring template when asked', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '99');
    await userEvent.click(screen.getByLabelText('Repeat every period'));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    const [tpl] = await repo.listTemplates();
    expect(tpl).toMatchObject({ amount: 99, active: true, startDate: '2026-09-24', lastGeneratedPeriodStart: '2026-09-01' });
    expect((await repo.listTransactions())[0].recurringId).toBe(tpl.id);
  });

  it('copies the overseas flag into a recurring template', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '50');
    await userEvent.click(screen.getByLabelText('Overseas (foreign currency)'));
    await userEvent.click(screen.getByLabelText('Repeat every period'));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    await screen.findByRole('region', { name: 'Recurring transactions' });
    const [tpl] = await repo.listTemplates();
    expect(tpl).toMatchObject({ amount: 50, overseas: true });
  });

  it('remembers the category for a known merchant', async () => {
    await renderWithData(<TransactionsPage />, {
      seed: async (repo) => {
        await seed(repo);
        await repo.saveTransaction({ id: 'old', userCardId: 'uc1', date: '2026-09-01', amount: 50, category: 'petrol', merchant: 'Shell', paymentMethod: 'physical', createdAt: 'a' });
      },
    });
    await userEvent.type(screen.getByLabelText('Merchant (optional)'), 'shell');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Petrol' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('deletes a transaction after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<TransactionsPage />, {
      seed: async (r) => {
        await seed(r);
        await r.saveTransaction({ id: 'x', userCardId: 'uc1', date: '2026-09-02', amount: 10, category: 'others', paymentMethod: 'physical', createdAt: 'a' });
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await repo.listTransactions()).toEqual([]);
  });

  it('saves an overseas transaction and shows it marked in the table', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.click(screen.getByLabelText('Overseas (foreign currency)'));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    const cell = await screen.findByRole('cell', { name: '· Overseas' });
    expect(cell).toBeInTheDocument();
    expect((await repo.listTransactions())[0]).toMatchObject({ overseas: true });
  });

  it('saves a domestic transaction with overseas left undefined', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    await screen.findByText('RM50.00');
    expect((await repo.listTransactions())[0].overseas).toBeUndefined();
  });
});
