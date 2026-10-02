import { render, screen } from '@testing-library/react';
import { SpendMeter } from './SpendMeter';
import type { SpendTarget } from '../engine/spendTargets';

const t = (p: Partial<SpendTarget>): SpendTarget => ({ key: 'rule:d', label: 'Dining', spent: 200, target: 600, more: 400, maxed: false, earnedRM: 10, capRM: 30, ...p });

describe('SpendMeter', () => {
  it('says how much more to spend in the category', () => {
    render(<SpendMeter t={t({})} />);
    expect(screen.getByText('RM400.00 more')).toBeInTheDocument();
    expect(screen.getByText('RM200.00 of RM600.00 · cashback RM10.00 of RM30.00')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Dining spend' });
    expect(bar).toHaveAttribute('aria-valuenow', '200');
    expect(bar).toHaveAttribute('aria-valuemax', '600');
  });

  it('says when the category is maxed out', () => {
    const { container } = render(<SpendMeter t={t({ spent: 700, more: 0, maxed: true, earnedRM: 30 })} />);
    expect(screen.getByText('Maxed ✓')).toBeInTheDocument();
    expect(container.querySelector('.cap')).toHaveClass('cap-full');
  });
});
