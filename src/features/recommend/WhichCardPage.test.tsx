import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhichCardPage } from './WhichCardPage';
import { renderWithData, seedCard } from '../../test/renderWithData';

async function setup() {
  return renderWithData(<WhichCardPage />, {
    seed: async (repo) => {
      await seedCard(repo, { rules: [{ id: 'all', label: 'All spend', rate: 0.01 }] }, 'A', 'Card A');
      await seedCard(repo, { rules: [{ id: 'dine', label: 'Dining', rate: 0.05, categories: ['dining'], capPerPeriod: 30 }] }, 'B', 'Card B');
    },
  });
}

describe('WhichCardPage', () => {
  it('prompts for an amount before ranking', async () => {
    await setup();
    expect(screen.getByText('Enter an amount to compare your cards.')).toBeInTheDocument();
  });

  it('ranks cards for the purchase', async () => {
    await setup();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Dining' }));
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Card B')).toBeInTheDocument();
    expect(within(items[0]).getByText('RM5.00')).toBeInTheDocument();
    expect(within(items[0]).getByText('5% Dining — RM25.00 cap left')).toBeInTheDocument();
    expect(within(items[1]).getByText('Card A')).toBeInTheDocument();
  });

  it('logs the purchase to the chosen card', async () => {
    const { repo } = await setup();
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Dining' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log it to Card B' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Logged RM100.00 to Card B');
    expect(await repo.listTransactions()).toEqual([expect.objectContaining({ userCardId: 'B', amount: 100, category: 'dining' })]);
    expect(screen.getByLabelText('Amount (RM)')).toHaveDisplayValue('');
  });

  it('accounts for overseas spend when ranking and logging', async () => {
    const { repo } = await renderWithData(<WhichCardPage />, {
      seed: async (repo) => {
        await seedCard(
          repo,
          {
            rules: [
              { id: 'os', label: 'Overseas', rate: 0.02, overseas: true },
              { id: 'dom', label: 'Domestic', rate: 0 },
            ],
          },
          'A',
          'Card A',
        );
        await seedCard(repo, { rules: [{ id: 'all', label: 'All spend', rate: 0.01 }] }, 'B', 'Card B');
      },
    });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');

    let items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Card B')).toBeInTheDocument();
    expect(within(items[0]).getByText('RM1.00')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Overseas (foreign currency)'));

    items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Card A')).toBeInTheDocument();
    expect(within(items[0]).getByText('RM2.00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Log it to Card A' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Logged RM100.00 to Card A');
    expect(await repo.listTransactions()).toEqual([expect.objectContaining({ userCardId: 'A', amount: 100, overseas: true })]);
  });
  it('logs exactly one transaction when Log it is double-clicked', async () => {
    const { repo } = await setup();
    // Hold the first save open so the second click lands while it is still pending.
    const realSave = repo.saveTransaction.bind(repo);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(repo, 'saveTransaction').mockImplementation(async (t) => {
      await gate;
      return realSave(t);
    });
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Log it to Card B' }));
    release();
    expect(await screen.findByRole('status')).toHaveTextContent('Logged RM100.00 to Card B');
    expect(await repo.listTransactions()).toHaveLength(1);
  });

  it('shows an error when logging fails', async () => {
    const { repo } = await setup();
    vi.spyOn(repo, 'saveTransaction').mockRejectedValueOnce(new Error('disk full'));
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Log it to Card B' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the transaction: disk full');
    expect(screen.getByRole('button', { name: 'Log it to Card B' })).toBeEnabled();
  });
});
