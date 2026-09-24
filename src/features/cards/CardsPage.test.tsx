import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardsPage } from './CardsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { CATALOG } from '../../catalog';

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
});
