import { render, screen } from '@testing-library/react';
import { SpendMeter } from './SpendMeter';
import type { SpendTarget } from '../engine/spendTargets';

const t = (p: Partial<SpendTarget>): SpendTarget => ({ key: 'rule:d', label: 'Dining', spent: 200, target: 600, kind: 'max', maxed: false, earnedRM: 10, capRM: 30, ...p });

describe('SpendMeter', () => {
  it('shows spend against the spend that maxes out the cashback', () => {
    render(<SpendMeter t={t({})} />);
    expect(screen.getByText('RM200.00 / RM600.00')).toBeInTheDocument();
    expect(screen.getByText('Spend RM400.00 more to max out · cashback RM10.00 of RM30.00')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Dining spend' });
    expect(bar).toHaveAttribute('aria-valuenow', '200');
    expect(bar).toHaveAttribute('aria-valuemax', '600');
  });

  it('says when the cap is maxed out', () => {
    const { container } = render(<SpendMeter t={t({ spent: 700, maxed: true, earnedRM: 30 })} />);
    expect(screen.getByText('Maxed out — extra spend here earns no more · cashback RM30.00 of RM30.00')).toBeInTheDocument();
    expect(container.querySelector('.cap')).toHaveClass('cap-full');
  });

  it('shows the spend still needed to unlock a category minimum', () => {
    render(<SpendMeter t={t({ kind: 'unlock', spent: 80, target: 250, earnedRM: 0, capRM: 10 })} />);
    expect(screen.getByText('RM80.00 / RM250.00')).toBeInTheDocument();
    expect(screen.getByText('Spend RM170.00 more to unlock · cashback RM0.00 of RM10.00')).toBeInTheDocument();
  });

  it('copes with no target while nothing is earned', () => {
    render(<SpendMeter t={t({ spent: 100, target: null, earnedRM: 0 })} />);
    expect(screen.getByText('RM100.00 spent')).toBeInTheDocument();
    expect(screen.getByText("Not earning yet — reach the card's next spend tier first · cashback RM0.00 of RM30.00")).toBeInTheDocument();
  });
});
