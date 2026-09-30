import { useState } from 'react';
import type { CardProduct, UserCard } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { nameOf, needsStatementDay } from '../../app/selectors';
import { getProduct } from '../../catalog';
import { describeRule } from '../../engine/format';
import { getPeriod } from '../../engine/periods';
import { resolveCard } from '../../engine/resolve';
import { newId } from '../../lib/id';
import { AddCardDialog } from './AddCardDialog';
import { RuleEditor } from './RuleEditor';
import { catalogOverrides, newCustomProduct } from './customCard';

export function CardsPage() {
  const data = useAppData();
  const { repo, userCards, resolved, cardErrors, refresh, today } = data;
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
    const product = uc.productId ? getProduct(uc.productId) : undefined;
    if (product) {
      // Keep a statement day the user already chose, even if it equals the catalog placeholder.
      const keepDay = uc.cycleDay != null || draft.defaultCycleDay !== product.defaultCycleDay;
      await save({ ...uc, cycleDay: keepDay ? draft.defaultCycleDay : undefined, overrides: catalogOverrides(draft, product) });
    } else {
      await save({ ...uc, overrides: draft });
    }
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
        const current = card ? getPeriod(card, today) : null;
        return (
          <section key={uc.id} className="panel" aria-label={name}>
            <h2>{name}</h2>
            {cardErrors[uc.id] && <p className="error" role="alert">{cardErrors[uc.id]}</p>}
            {card && (
              <>
                <p>
                  {needsStatementDay(uc, card) && <span className="badge warn">Set your statement day</span>}{' '}
                  {card.verifiedOn ? <span className="badge">Verified {card.verifiedOn}</span> : <span className="badge warn">Unverified — please check</span>}{' '}
                  {product && product.catalogVersion > uc.catalogVersionSeen && (
                    <>
                      <span className="badge warn">Catalog updated — review changes</span>{' '}
                      <button type="button" onClick={() => save({ ...uc, catalogVersionSeen: product.catalogVersion })}>Mark reviewed</button>
                    </>
                  )}
                </p>
                <p className="muted">
                  Current period: {current?.start} – {current?.end}
                </p>
                {/* Keys must differ between the two forms: remounting on save refreshes their inputs. */}
                {card.periodType === 'statement' && <StatementDayForm key={`day-${uc.id}-${uc.cycleDay ?? ''}`} userCard={uc} onSave={save} />}
                <Last4Form key={`last4-${uc.id}-${uc.last4 ?? ''}`} userCard={uc} onSave={save} />
                {uc.pdfPassword && (
                  <button type="button" onClick={() => save({ ...uc, pdfPassword: undefined })}>
                    Forget saved PDF password
                  </button>
                )}
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
                initial={product ? resolveCard(uc, product) /* no Settings point values: overrides are diffed against the catalog */ : card}
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

function StatementDayForm({ userCard, onSave }: { userCard: UserCard; onSave(uc: UserCard): Promise<void> }) {
  const [value, setValue] = useState(userCard.cycleDay != null ? String(userCard.cycleDay) : '');
  const [error, setError] = useState<string | null>(null);
  const inputId = `statement-day-${userCard.id}`;

  async function submit() {
    const day = Number(value.trim());
    if (value.trim() === '' || !Number.isInteger(day) || day < 1 || day > 28) {
      setError('Enter a whole number from 1 to 28.');
      return;
    }
    setError(null);
    await onSave({ ...userCard, cycleDay: day });
  }

  return (
    <div className="fields">
      <label htmlFor={inputId}>Statement day (1–28)</label>
      <input id={inputId} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="button" onClick={submit}>Save statement day</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function Last4Form({ userCard, onSave }: { userCard: UserCard; onSave(uc: UserCard): Promise<void> }) {
  const [value, setValue] = useState(userCard.last4 ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputId = `last4-${userCard.id}`;

  async function submit() {
    const trimmed = value.trim();
    if (trimmed !== '' && !/^\d{4}$/.test(trimmed)) {
      setError('Enter exactly 4 digits.');
      return;
    }
    setError(null);
    await onSave({ ...userCard, last4: trimmed || undefined });
  }

  return (
    <div className="fields">
      <label htmlFor={inputId}>Last 4 digits</label>
      <input id={inputId} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="button" onClick={submit}>Save last 4 digits</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
