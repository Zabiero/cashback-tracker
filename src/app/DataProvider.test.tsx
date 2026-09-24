import { screen } from '@testing-library/react';
import { useAppData } from './DataProvider';
import { renderWithData, seedCard } from '../test/renderWithData';

function Probe() {
  const d = useAppData();
  return (
    <div>
      <p>resolved: {Object.keys(d.resolved).sort().join(',')}</p>
      <p>errors: {Object.entries(d.cardErrors).map(([k, v]) => `${k}=${v}`).join(';')}</p>
    </div>
  );
}

describe('DataProvider', () => {
  it('isolates a broken card and still resolves the others', async () => {
    await renderWithData(<Probe />, {
      seed: async (repo) => {
        await seedCard(repo, {}, 'good');
        await seedCard(repo, { rules: [] }, 'bad');
        await repo.saveUserCard({ id: 'gone', productId: 'removed-card', nickname: '', catalogVersionSeen: 1, archived: false });
      },
    });
    expect(screen.getByText('resolved: good')).toBeInTheDocument();
    expect(screen.getByText(/bad=At least one rule is required/)).toBeInTheDocument();
    expect(screen.getByText(/gone=This card is no longer in the catalog/)).toBeInTheDocument();
  });
});
