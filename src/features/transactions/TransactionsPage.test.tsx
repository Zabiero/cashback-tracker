import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionsPage } from './TransactionsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import type { Repository } from '../../data/repository';

const seed = async (repo: Repository) => {
  await seedCard(repo, { rules: [{ id: 'all', label: 'All', rate: 0.05 }] });
};

// The add form is closed until 'Add transaction' is tapped, so the list comes first.
async function openForm() {
  await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
}
const tx = (id: string, date: string, amount: number) => ({ id, userCardId: 'uc1', date, amount, category: 'others' as const, paymentMethod: 'physical' as const, createdAt: id });

describe('TransactionsPage', () => {
  it('shows transactions from every month by default, newest first', async () => {
    await renderWithData(<TransactionsPage />, {
      seed: async (r) => {
        await seed(r);
        await r.saveTransaction(tx('aug', '2026-08-15', 11));
        await r.saveTransaction(tx('sep', '2026-09-02', 22));
      },
    });
    expect(screen.getByLabelText('Month')).toHaveValue('');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['2026-09-02', '2026-08-15']);
  });

  it('filters by a month and clears back to all months', async () => {
    await renderWithData(<TransactionsPage />, {
      seed: async (r) => {
        await seed(r);
        await r.saveTransaction(tx('aug', '2026-08-15', 11));
        await r.saveTransaction(tx('sep', '2026-09-02', 22));
      },
    });
    await userEvent.type(screen.getByLabelText('Month'), '2026-08');
    expect(screen.queryByText('RM22.00')).not.toBeInTheDocument();
    expect(screen.getByText('RM11.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all months' }));
    expect(screen.getByLabelText('Month')).toHaveValue('');
    expect(screen.getByText('RM22.00')).toBeInTheDocument();
  });

  it('keeps the add form closed until Add transaction is tapped, and closes it after saving', async () => {
    await renderWithData(<TransactionsPage />, { seed });
    expect(screen.queryByLabelText('Amount (RM)')).not.toBeInTheDocument();
    await openForm();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    await screen.findByText('RM30.00');
    expect(screen.queryByLabelText('Amount (RM)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('cancels the add form', async () => {
    await renderWithData(<TransactionsPage />, { seed });
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Amount (RM)')).not.toBeInTheDocument();
  });

  it('opens the form filled in when editing', async () => {
    await renderWithData(<TransactionsPage />, { seed: async (r) => { await seed(r); await r.saveTransaction(tx('x', '2026-09-02', 10)); } });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Amount (RM)')).toHaveValue('10');
    expect(screen.queryByRole('button', { name: 'Add transaction' })).not.toBeInTheDocument();
  });

  it('adds a transaction typed with RM and commas and shows its cashback', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await openForm();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), 'RM1,234.00');
    await userEvent.click(screen.getByRole('button', { name: 'Dining' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(await screen.findByText('RM1,234.00')).toBeInTheDocument();
    expect(screen.getByText('RM61.70')).toBeInTheDocument();
    // Phones hide the column headers, so the cashback cell carries its own label.
    expect(screen.getByText('RM61.70')).toHaveAttribute('data-label', 'Cashback');
    expect((await repo.listTransactions())[0]).toMatchObject({ amount: 1234, category: 'dining', date: '2026-09-24' });
  });

  it('rejects an invalid amount', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await openForm();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount like 12.50');
    expect(await repo.listTransactions()).toEqual([]);
  });

  it('creates a recurring template when asked', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await openForm();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '99');
    await userEvent.click(screen.getByLabelText('Repeat every period'));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    const [tpl] = await repo.listTemplates();
    expect(tpl).toMatchObject({ amount: 99, active: true, startDate: '2026-09-24', lastGeneratedPeriodStart: '2026-09-01' });
    expect((await repo.listTransactions())[0].recurringId).toBe(tpl.id);
  });

  it('copies the overseas flag into a recurring template', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await openForm();
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
    await openForm();
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
    await openForm();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.click(screen.getByLabelText('Overseas (foreign currency)'));
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    const cell = await screen.findByRole('cell', { name: '· Overseas' });
    expect(cell).toBeInTheDocument();
    expect((await repo.listTransactions())[0]).toMatchObject({ overseas: true });
  });

  it('saves a domestic transaction with overseas left undefined', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    await openForm();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    await screen.findByText('RM50.00');
    expect((await repo.listTransactions())[0].overseas).toBeUndefined();
  });
  it('shows an error and keeps the form when saving fails', async () => {
    const { repo } = await renderWithData(<TransactionsPage />, { seed });
    vi.spyOn(repo, 'saveTransaction').mockRejectedValueOnce(new Error('disk full'));
    await openForm();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the transaction: disk full');
    expect(screen.getByLabelText('Amount (RM)')).toHaveValue('42');
    expect(screen.getByRole('button', { name: 'Save transaction' })).toBeEnabled();
  });
});
