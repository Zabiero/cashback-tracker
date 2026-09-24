import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardsPage } from './CardsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { CATALOG, getProduct } from '../../catalog';
import { resolveUserCard } from '../../catalog/resolveUserCard';
import type { Repository } from '../../data/repository';
import type { UserCard } from '../../engine/types';

describe('CardsPage', () => {
  it('adds a card from the catalog', async () => {
    const { repo } = await renderWithData(<CardsPage />);
    const p = CATALOG[0];
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    await userEvent.type(screen.getByLabelText('Search cards'), p.name);
    await userEvent.click(screen.getByRole('button', { name: `Add ${p.bank} ${p.name}` }));
    expect(await screen.findByRole('heading', { name: `${p.bank} ${p.name}` })).toBeInTheDocument();
    expect((await repo.listUserCards())[0]).toMatchObject({ productId: p.id, catalogVersionSeen: p.catalogVersion });
  });

  it('creates a custom card and opens the editor', async () => {
    await renderWithData(<CardsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create custom card' }));
    expect(await screen.findByRole('region', { name: 'Edit rules' })).toBeInTheDocument();
  });

  it('marks unverified cards', async () => {
    await renderWithData(<CardsPage />, { seed: (repo) => seedCard(repo).then(() => undefined) });
    expect(screen.getByText('Unverified — please check')).toBeInTheDocument();
  });

  it('archives a card after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { repo } = await renderWithData(<CardsPage />, { seed: (r) => seedCard(r).then(() => undefined) });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect((await repo.listUserCards())[0].archived).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Test Card' })).not.toBeInTheDocument();
  });
  describe('statement day', () => {
    const shell = getProduct('rhb-shell-visa')!;
    const shellName = `${shell.bank} ${shell.name}`;

    async function addShell() {
      const { repo } = await renderWithData(<CardsPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
      await userEvent.type(screen.getByLabelText('Search cards'), shell.name);
      await userEvent.click(screen.getByRole('button', { name: `Add ${shellName}` }));
      await screen.findByRole('heading', { name: shellName });
      return repo;
    }

    it('asks for the statement day when a statement-cycle catalog card is added', async () => {
      await addShell();
      expect(screen.getByText('Set your statement day')).toBeInTheDocument();
      expect(screen.getByLabelText('Statement day (1–28)')).toBeInTheDocument();
    });

    it('saves only the statement day and shows the new current period', async () => {
      const repo = await addShell();
      await userEvent.type(screen.getByLabelText('Statement day (1–28)'), '15');
      await userEvent.click(screen.getByRole('button', { name: 'Save statement day' }));
      expect(await screen.findByText('Current period: 2026-09-15 – 2026-10-14')).toBeInTheDocument();
      const [uc] = await repo.listUserCards();
      expect(uc.cycleDay).toBe(15);
      expect(uc.overrides).toBeUndefined();
      expect(screen.queryByText('Set your statement day')).not.toBeInTheDocument();
    });

    it('rejects a day outside 1–28 and saves nothing', async () => {
      const repo = await addShell();
      await userEvent.type(screen.getByLabelText('Statement day (1–28)'), '31');
      await userEvent.click(screen.getByRole('button', { name: 'Save statement day' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 28.');
      expect((await repo.listUserCards())[0].cycleDay).toBeUndefined();
    });
  });

  describe('rule editor overrides on catalog cards', () => {
    const productId = 'alliance-visa-virtual';
    const product = getProduct(productId)!;
    const seedVirtual = async (repo: Repository) => {
      await repo.saveUserCard({ id: 'v', productId, nickname: 'Virtual', catalogVersionSeen: product.catalogVersion, archived: false });
      await repo.saveSettings({ ...(await repo.getSettings()), pointValueOverrides: { [productId]: 0.0025 } });
    };
    const stored = async (repo: Repository): Promise<UserCard> => (await repo.listUserCards())[0];

    it('stores nothing in overrides when saved without changes', async () => {
      const { repo } = await renderWithData(<CardsPage />, { seed: seedVirtual });
      await userEvent.click(screen.getByRole('button', { name: 'Edit rules' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
      await screen.findByRole('button', { name: 'Edit rules' });
      const uc = await stored(repo);
      expect(uc.overrides).toBeUndefined();
      expect(uc.cycleDay).toBeUndefined();
    });

    it('changing only the statement day keeps Settings point values in effect', async () => {
      const { repo } = await renderWithData(<CardsPage />, { seed: seedVirtual });
      await userEvent.click(screen.getByRole('button', { name: 'Edit rules' }));
      const day = screen.getByLabelText('Statement cycle day (1–28)');
      await userEvent.clear(day);
      await userEvent.type(day, '15');
      await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
      await screen.findByRole('button', { name: 'Edit rules' });
      const uc = await stored(repo);
      expect(uc.cycleDay).toBe(15);
      expect(uc.overrides).toBeUndefined();
      const resolved = resolveUserCard(uc, { pointValueOverrides: { [productId]: 0.004 } });
      expect(resolved.pointValueRM).toBe(0.004);
      expect(resolved.defaultCycleDay).toBe(15);
    });

    it('stores only the fields that differ from the catalog product', async () => {
      const { repo } = await renderWithData(<CardsPage />, { seed: seedVirtual });
      await userEvent.click(screen.getByRole('button', { name: 'Edit rules' }));
      await userEvent.type(screen.getByLabelText('Minimum spend to earn (RM)'), '500');
      await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
      await screen.findByRole('button', { name: 'Edit rules' });
      expect((await stored(repo)).overrides).toEqual({ minMonthlySpendToEarn: 500 });
    });
  });
});
