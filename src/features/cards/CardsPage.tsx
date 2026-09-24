import { useState } from 'react';
import type { CardProduct, UserCard } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { nameOf } from '../../app/selectors';
import { getProduct } from '../../catalog';
import { describeRule } from '../../engine/format';
import { newId } from '../../lib/id';
import { AddCardDialog } from './AddCardDialog';
import { RuleEditor } from './RuleEditor';
import { newCustomProduct, pickEditable } from './customCard';

export function CardsPage() {
  const data = useAppData();
  const { repo, userCards, resolved, cardErrors, refresh } = data;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const visible = userCards.filter((c) => !c.archived);

  async function save(uc: UserCard) {
    await repo.saveUserCard(uc);
    await refresh();
  }
  async function addFromCatalog(p: CardProduct) {
    await save({ id: newId(), productId: p.id, nickname: '', catalogVersionSeen: p.catalogVersion, archived: false });
    setAdding(false);
  }
  async function addCustom() {
    const id = newId();
    await save({ id, productId: null, nickname: '', overrides: newCustomProduct(), catalogVersionSeen: 1, archived: false });
    setAdding(false);
    setEditingId(id);
  }
  async function saveRules(uc: UserCard, draft: CardProduct) {
    await save(uc.productId ? { ...uc, cycleDay: draft.defaultCycleDay, overrides: pickEditable(draft) } : { ...uc, overrides: draft });
    setEditingId(null);
  }
  async function reset(uc: UserCard) {
    await save({ ...uc, overrides: undefined, cycleDay: undefined });
    setEditingId(null);
  }
  async function rename(uc: UserCard) {
    const nickname = window.prompt('Nickname (leave empty to use the card name)', uc.nickname);
    if (nickname !== null) await save({ ...uc, nickname: nickname.trim() });
  }
  async function archive(uc: UserCard) {
    if (window.confirm(`Archive ${nameOf(data, uc.id)}? Its past transactions stay in your reports.`)) await save({ ...uc, archived: true });
  }

  return (
    <>
      <h1>Cards</h1>
      {adding ? (
        <AddCardDialog onAdd={addFromCatalog} onCustom={addCustom} onClose={() => setAdding(false)} />
      ) : (
        <button type="button" className="primary" onClick={() => setAdding(true)}>Add card</button>
      )}

      {visible.map((uc) => {
        const card = resolved[uc.id];
        const product = uc.productId ? getProduct(uc.productId) : undefined;
        const name = nameOf(data, uc.id);
        return (
          <section key={uc.id} className="panel" aria-label={name}>
            <h2>{name}</h2>
            {cardErrors[uc.id] && <p className="error" role="alert">{cardErrors[uc.id]}</p>}
            {card && (
              <>
                <p>
                  {card.verifiedOn ? <span className="badge">Verified {card.verifiedOn}</span> : <span className="badge warn">Unverified — please check</span>}{' '}
                  {product && product.catalogVersion > uc.catalogVersionSeen && (
                    <>
                      <span className="badge warn">Catalog updated — review changes</span>{' '}
                      <button type="button" onClick={() => save({ ...uc, catalogVersionSeen: product.catalogVersion })}>Mark reviewed</button>
                    </>
                  )}
                </p>
                <ul>
                  {card.rules.map((r) => (
                    <li key={r.id}>
                      <strong>{r.label}</strong>: {describeRule(r, card.rewardType)}
                    </li>
                  ))}
                </ul>
                {card.sourceUrl && (
                  <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                    Bank terms
                  </a>
                )}
              </>
            )}
            {editingId === uc.id && card ? (
              <RuleEditor
                initial={card}
                custom={!uc.productId}
                onSave={(d) => saveRules(uc, d)}
                onCancel={() => setEditingId(null)}
                onReset={uc.productId ? () => reset(uc) : undefined}
              />
            ) : (
              <div>
                {card && <button type="button" onClick={() => setEditingId(uc.id)}>Edit rules</button>}{' '}
                <button type="button" onClick={() => rename(uc)}>Rename</button>{' '}
                <button type="button" onClick={() => archive(uc)}>Archive</button>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
