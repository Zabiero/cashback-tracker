import { useState } from 'react';
import type { CardProduct } from '../../engine/types';
import { CATALOG } from '../../catalog';

interface Props {
  onAdd(product: CardProduct): void;
  onCustom(): void;
  onClose(): void;
}

export function AddCardDialog({ onAdd, onCustom, onClose }: Props) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = CATALOG.filter((p) => `${p.bank} ${p.name}`.toLowerCase().includes(needle));
  return (
    <section className="panel" aria-label="Add a card">
      <label>
        Search cards
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <ul>
        {list.map((p) => (
          <li key={p.id}>
            {p.bank} {p.name}{' '}
            <button type="button" aria-label={`Add ${p.bank} ${p.name}`} onClick={() => onAdd(p)}>
              Add
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="muted">No catalog card matches. You can create a custom card.</p>}
      <button type="button" onClick={onCustom}>Create custom card</button>{' '}
      <button type="button" onClick={onClose}>Cancel</button>
    </section>
  );
}
