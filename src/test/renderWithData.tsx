import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataProvider } from '../app/DataProvider';
import { DexieRepository } from '../data/dexieRepository';
import type { Repository } from '../data/repository';
import type { CardProduct, UserCard } from '../engine/types';
import { card } from './fixtures';

export const FIXED_TODAY = '2026-09-24';
const today = () => FIXED_TODAY;

export async function seedCard(repo: Repository, product: Partial<CardProduct> = {}, id = 'uc1', nickname = 'Test Card'): Promise<UserCard> {
  const uc: UserCard = { id, productId: null, nickname, overrides: card(product), catalogVersionSeen: 1, archived: false };
  await repo.saveUserCard(uc);
  return uc;
}

export async function renderWithData(
  ui: ReactElement,
  opts: { route?: string; seed?: (repo: Repository) => Promise<void> } = {},
): Promise<{ repo: Repository }> {
  const repo = new DexieRepository(`test-${Math.random()}`);
  if (opts.seed) await opts.seed(repo);
  render(
    <DataProvider repo={repo} today={today}>
      <MemoryRouter initialEntries={[opts.route ?? '/']}>{ui}</MemoryRouter>
    </DataProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return { repo };
}
