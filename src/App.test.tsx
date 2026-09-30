import { screen } from '@testing-library/react';
import { Layout } from './app/Layout';
import { renderWithData } from './test/renderWithData';

it('renders navigation for every screen', async () => {
  await renderWithData(<Layout />);
  for (const name of ['Dashboard', 'Which card?', 'Bills', 'Transactions', 'Cards', 'Reports', 'Settings']) {
    expect(screen.getByRole('link', { name })).toBeInTheDocument();
  }
});

it('has a More link and keeps the Dashboard link name', async () => {
  await renderWithData(<Layout />);
  expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('href', '/more');
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('active');
});

it('highlights More while on a screen that lives under More', async () => {
  await renderWithData(<Layout />, { route: '/cards' });
  expect(screen.getByRole('link', { name: 'More' })).toHaveClass('active');
});

it('opens the More page at /more', async () => {
  await renderWithData(<Layout />, { route: '/more' });
  expect(screen.getByRole('heading', { level: 1, name: 'More' })).toBeInTheDocument();
});
