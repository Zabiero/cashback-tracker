import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MorePage } from './MorePage';

it('links to Cards, Reports and Settings', () => {
  render(<MemoryRouter><MorePage /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: 'More' })).toBeInTheDocument();
  const list = within(screen.getByRole('navigation', { name: 'More' }));
  expect(list.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', '/cards');
  expect(list.getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports');
  expect(list.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
});
