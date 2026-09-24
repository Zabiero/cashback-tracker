import { render, screen } from '@testing-library/react';
import { CapMeter, capLevel } from './CapMeter';

describe('capLevel', () => {
  it('is ok below 80%, warn from 80%, full at 100%', () => {
    expect(capLevel(23.99, 30)).toBe('ok');
    expect(capLevel(24, 30)).toBe('warn');
    expect(capLevel(30, 30)).toBe('full');
    expect(capLevel(0, 0)).toBe('full');
  });
});

describe('CapMeter', () => {
  it('shows usage and exposes a progressbar', () => {
    render(<CapMeter label="Dining" usedRM={25} limitRM={30} />);
    expect(screen.getByText('RM25.00 / RM30.00')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Dining cap' })).toHaveAttribute('aria-valuenow', '25');
  });
});
