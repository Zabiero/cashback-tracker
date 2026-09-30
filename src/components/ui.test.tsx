import { render, screen } from '@testing-library/react';
import { Icon } from './Icon';
import { PageHeader } from './PageHeader';
import { Money } from './Money';

it('Icon is decorative', () => {
  const { container } = render(<Icon name="home" />);
  const svg = container.querySelector('svg')!;
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg).toHaveClass('icon');
});

it('PageHeader renders the title as the page heading, with actions', () => {
  render(<PageHeader title="Bills" actions={<button type="button">Add</button>} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Bills' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});

it('PageHeader without actions renders no actions box', () => {
  const { container } = render(<PageHeader title="More" />);
  expect(container.querySelector('.actions')).toBeNull();
});

it('Money shows the RM amount as its only text', () => {
  render(<Money value={1234.5} size="lg" />);
  const el = screen.getByText('RM1,234.50');
  expect(el).toHaveClass('amount', 'amount-lg');
});
