import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleEditor } from './RuleEditor';
import { card } from '../../test/fixtures';

describe('RuleEditor', () => {
  it('converts percentages and saves a valid card', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    const rate = screen.getByLabelText('Rate (%)');
    await userEvent.clear(rate);
    await userEvent.type(rate, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].rules[0].rate).toBeCloseTo(0.05);
  });

  it('shows validation errors and does not save', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    const rate = screen.getByLabelText('Rate (%)');
    await userEvent.clear(rate);
    await userEvent.type(rate, '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Rule 1: rate must be ≥ 0');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('adds a category filter and a tier', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    const categories = within(screen.getByRole('group', { name: 'Categories' }));
    await userEvent.click(categories.getByLabelText('Dining'));
    await userEvent.click(screen.getByRole('button', { name: 'Add tier' }));
    await userEvent.type(screen.getByLabelText('Tier 1 min spend (RM)'), '0');
    await userEvent.type(screen.getByLabelText('Tier 1 rate (%)'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave.mock.calls[0][0].rules[0]).toMatchObject({ categories: ['dining'], tiers: [{ minPeriodSpend: 0, rate: 0.02 }] });
  });

  it('shows a points-rule rate in pts/RM on a cashback card and saves it unconverted', async () => {
    const onSave = vi.fn();
    const initial = card({ rules: [{ id: 'r1', label: 'Bonus points', rate: 1, pointValueRM: 0.005 }] });
    render(<RuleEditor initial={initial} onSave={onSave} onCancel={() => {}} />);
    const rate = screen.getByLabelText('Rate (pts/RM)');
    expect(rate).toHaveValue('1');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave.mock.calls[0][0].rules[0].rate).toBe(1);
  });

  it('saves overseas-only and days-of-month filters', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Where'), 'Overseas only');
    await userEvent.type(screen.getByLabelText('Days of month (e.g. 20, 28)'), '20, 28');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave.mock.calls[0][0].rules[0]).toMatchObject({ overseas: true, daysOfMonth: [20, 28] });
  });

  it('saves card-level tierExcludedCategories', async () => {
    const onSave = vi.fn();
    render(<RuleEditor initial={card()} onSave={onSave} onCancel={() => {}} />);
    const excluded = within(screen.getByRole('group', { name: 'Excluded from tier spend' }));
    await userEvent.click(excluded.getByLabelText('Utilities'));
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ tierExcludedCategories: ['utilities'] });
  });
});
