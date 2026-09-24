import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { makeBackup } from '../../data/backup';
import { DEFAULT_SETTINGS } from '../../data/repository';
import { card } from '../../test/fixtures';
import { CATALOG } from '../../catalog';
import { newId } from '../../lib/id';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:backup');
  URL.revokeObjectURL = vi.fn();
});

describe('SettingsPage', () => {
  it('exports a backup and records the date', async () => {
    const { repo } = await renderWithData(<SettingsPage />, { seed: (r) => seedCard(r).then(() => undefined) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(click).toHaveBeenCalled();
    expect((await repo.getSettings()).lastBackupAt).toBe('2026-09-24');
  });

  it('previews then imports a backup', async () => {
    const { repo } = await renderWithData(<SettingsPage />);
    const backup = makeBackup(
      {
        userCards: [{ id: 'u1', productId: null, nickname: 'Imported', overrides: card(), catalogVersionSeen: 1, archived: false }],
        transactions: [{ id: 't', userCardId: 'u1', date: '2026-09-01', amount: 10, category: 'others', paymentMethod: 'physical', createdAt: 'a' }],
        templates: [],
        settings: DEFAULT_SETTINGS,
      },
      '2026-09-24T00:00:00Z',
    );
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Import backup file'), file);
    expect(await screen.findByText('1 card, 1 transaction (2026-09-01 to 2026-09-01). This replaces all current data.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByText('Backup imported.')).toBeInTheDocument();
    expect((await repo.listUserCards()).map((c) => c.nickname)).toEqual(['Imported']);
  });

  it('shows why an import was rejected and keeps existing data', async () => {
    const { repo } = await renderWithData(<SettingsPage />, { seed: (r) => seedCard(r).then(() => undefined) });
    await userEvent.upload(screen.getByLabelText('Import backup file'), new File(['nope'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is not valid JSON.');
    expect(await repo.listUserCards()).toHaveLength(1);
  });

  it('lets a hybrid cashback+points card set its point value', async () => {
    const hybridProduct = CATALOG.find(
      (p) => p.rewardType === 'cashback' && p.rules.some((r) => r.pointValueRM != null),
    );
    if (!hybridProduct) throw new Error('No hybrid cashback+points product found in CATALOG for this test');

    const { repo } = await renderWithData(<SettingsPage />, {
      seed: (r) =>
        r.saveUserCard({
          id: newId(),
          productId: hybridProduct.id,
          nickname: '',
          catalogVersionSeen: hybridProduct.catalogVersion,
          archived: false,
        }),
    });

    const input = screen.getByLabelText(/RM value of 1,000 points/);
    await userEvent.clear(input);
    await userEvent.type(input, '4');
    await userEvent.click(screen.getByRole('button', { name: 'Save point values' }));

    expect(await screen.findByText('Point values saved.')).toBeInTheDocument();
    expect((await repo.getSettings()).pointValueOverrides[hybridProduct.id]).toBe(0.004);
  });
  it('rejects a point value that is not a positive number and saves nothing', async () => {
    const pointsProduct = CATALOG.find((p) => p.rewardType === 'points')!;
    const { repo } = await renderWithData(<SettingsPage />, {
      seed: (r) => r.saveUserCard({ id: 'p1', productId: pointsProduct.id, nickname: '', catalogVersionSeen: pointsProduct.catalogVersion, archived: false }),
    });
    const input = screen.getByLabelText(/RM value of 1,000 points/);
    for (const bad of ['abc', '0', '-2']) {
      await userEvent.clear(input);
      await userEvent.type(input, bad);
      await userEvent.click(screen.getByRole('button', { name: 'Save point values' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a positive number of RM per 1,000 points.');
    }
    expect((await repo.getSettings()).pointValueOverrides).toEqual({});
    expect(screen.queryByText('Point values saved.')).not.toBeInTheDocument();
  });

  it('shows an error when the import cannot be saved', async () => {
    const { repo } = await renderWithData(<SettingsPage />);
    vi.spyOn(repo, 'replaceAll').mockRejectedValueOnce(new Error('quota exceeded'));
    const backup = makeBackup({ userCards: [], transactions: [], templates: [], settings: DEFAULT_SETTINGS }, '2026-09-24T00:00:00Z');
    await userEvent.upload(screen.getByLabelText('Import backup file'), new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not import the backup: quota exceeded');
    expect(screen.getByRole('button', { name: 'Replace my data' })).toBeEnabled();
  });
});
