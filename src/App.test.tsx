import { screen } from '@testing-library/react';
import { Layout } from './app/Layout';
import { renderWithData } from './test/renderWithData';

it('renders navigation for every screen', async () => {
  await renderWithData(<Layout />);
  for (const name of ['Dashboard', 'Which card?', 'Transactions', 'Cards', 'Reports', 'Settings']) {
    expect(screen.getByRole('link', { name })).toBeInTheDocument();
  }
});
