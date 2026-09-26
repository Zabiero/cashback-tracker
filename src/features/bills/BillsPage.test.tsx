import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillsPage } from './BillsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { statement } from '../../test/fixtures';
import { downloadText } from '../../lib/download';

vi.mock('../../lib/download', () => ({ downloadText: vi.fn(), readFileText: vi.fn() }));

const seed = (extra?: Parameters<typeof statement>[0]) => async (r: import('../../data/repository').Repository) => {
  await seedCard(r, {}, 'uc1', 'UOB One');
  if (extra) await r.saveStatement(statement({ userCardId: 'uc1', ...extra }));
};

describe('BillsPage', () => {
  it('adds a statement manually', async () => {
    const { repo } = await renderWithData(<BillsPage />, { seed: seed() });
    await userEvent.click(screen.getByRole('button', { name: 'Add manually' }));
    await userEvent.selectOptions(screen.getByLabelText('Card'), 'uc1');
    await userEvent.type(screen.getByLabelText('Statement date'), '2026-09-08');
    await userEvent.type(screen.getByLabelText('Payment due date'), '2026-09-28');
    await userEvent.type(screen.getByLabelText('Statement balance (RM)'), '1,234.50');
    await userEvent.type(screen.getByLabelText('Minimum due (RM)'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    const row = await screen.findByRole('listitem', { name: 'UOB One statement 2026-09-08' });
    expect(within(row).getByText('Due in 4 days')).toBeInTheDocument();
    expect(within(row).getByText(/RM1,234.50/)).toBeInTheDocument();
    expect((await repo.listStatements())[0]).toMatchObject({ statementBalance: 1234.5, minimumDue: 50, source: 'manual', paymentStatus: 'unpaid' });
  });

  it('blocks saving with missing values', async () => {
    const { repo } = await renderWithData(<BillsPage />, { seed: seed() });
    await userEvent.click(screen.getByRole('button', { name: 'Add manually' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a card.');
    expect(await repo.listStatements()).toEqual([]);
  });

  it('shows overdue statements first', async () => {
    await renderWithData(<BillsPage />, {
      seed: async (r) => {
        await seed({ id: 'late', statementDate: '2026-08-08', dueDate: '2026-08-28' })(r);
        await r.saveStatement(statement({ id: 'soon', userCardId: 'uc1', statementDate: '2026-09-08', dueDate: '2026-09-28' }));
      },
    });
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('Overdue by 27 days')).toBeInTheDocument();
  });

  it('marks a statement paid in full, by other amount, and back to unpaid', async () => {
    const { repo } = await renderWithData(<BillsPage />, { seed: seed({ id: 'st' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    await userEvent.click(screen.getByLabelText(/Full/));
    await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('Paid in full')).toBeInTheDocument();
    expect((await repo.listStatements())[0]).toMatchObject({ paymentStatus: 'paidFull', paidAmount: 1234.5, paidOn: '2026-09-24' });
    await userEvent.click(screen.getByRole('button', { name: 'Mark unpaid' }));
    expect(await screen.findByText('Due in 4 days')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    await userEvent.click(screen.getByLabelText('Other amount'));
    await userEvent.type(screen.getByLabelText('Amount paid (RM)'), '300');
    await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('Paid RM300.00')).toBeInTheDocument();
  });

  it('shows an error and stays unpaid when saving a payment fails', async () => {
    const { repo } = await renderWithData(<BillsPage />, { seed: seed({ id: 'st' }) });
    vi.spyOn(repo, 'saveStatement').mockRejectedValueOnce(new Error('disk full'));
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    await userEvent.click(screen.getByLabelText(/Full/));
    await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
    expect((await repo.listStatements())[0]).toMatchObject({ paymentStatus: 'unpaid' });
  });

  it('downloads a calendar file', async () => {
    await renderWithData(<BillsPage />, { seed: seed({ id: 'st' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));
    expect(vi.mocked(downloadText)).toHaveBeenCalledWith('uob-one-due-2026-09-28.ics', expect.stringContaining('BEGIN:VCALENDAR'), 'text/calendar');
  });

  it('asks before replacing a statement with the same card and date', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<BillsPage />, { seed: seed({ id: 'old', statementDate: '2026-09-08' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Add manually' }));
    await userEvent.selectOptions(screen.getByLabelText('Card'), 'uc1');
    await userEvent.type(screen.getByLabelText('Statement date'), '2026-09-08');
    await userEvent.type(screen.getByLabelText('Payment due date'), '2026-09-28');
    await userEvent.type(screen.getByLabelText('Statement balance (RM)'), '99');
    await userEvent.type(screen.getByLabelText('Minimum due (RM)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(confirm).toHaveBeenCalledWith('A UOB One statement dated 2026-09-08 already exists (balance RM1,234.50). Replace it with balance RM99.00?');
    const all = await repo.listStatements();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'old', statementBalance: 99 });
  });

  it('replaces the target statement when editing onto an existing date, keeping its id and payment status', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<BillsPage />, {
      seed: async (r) => {
        await seedCard(r, {}, 'uc1', 'UOB One');
        await r.saveStatement(
          statement({ id: 'A', userCardId: 'uc1', statementDate: '2026-08-08', dueDate: '2026-08-28', paymentStatus: 'paidFull', paidAmount: 1234.5, paidOn: '2026-08-20' }),
        );
        await r.saveStatement(statement({ id: 'B', userCardId: 'uc1', statementDate: '2026-09-08', dueDate: '2026-09-28' }));
      },
    });
    const rowA = screen.getByRole('listitem', { name: 'UOB One statement 2026-08-08' });
    await userEvent.click(within(rowA).getByRole('button', { name: 'Edit' }));
    const dateInput = screen.getByLabelText('Statement date');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-09-08');
    const dueInput = screen.getByLabelText('Payment due date');
    await userEvent.clear(dueInput);
    await userEvent.type(dueInput, '2026-09-28');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(confirm).toHaveBeenCalled();
    const all = await repo.listStatements();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'A', paymentStatus: 'paidFull', statementDate: '2026-09-08', dueDate: '2026-09-28' });
  });

  it('deletes after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<BillsPage />, { seed: seed({ id: 'st' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await repo.listStatements()).toEqual([]);
  });
});
