import { useState } from 'react';
import { CATEGORIES, type CardProduct, type Rule, type Weekday } from '../../engine/types';
import { TX_PAYMENT_METHODS } from '../../components/PurchaseFields';
import { validateCardProduct } from '../../engine/validate';
import { CATEGORY_LABELS, DAY_LABELS, PAYMENT_LABELS } from '../../lib/labels';
import { newId } from '../../lib/id';

interface Props {
  initial: CardProduct;
  custom?: boolean;
  onSave(draft: CardProduct): void;
  onCancel(): void;
  onReset?(): void;
}

const optNum = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));

/** Converts a raw rate/tier/overflow value to the unit shown in the field (percent for cashback, pts/RM otherwise). */
const toUi = (r: number | undefined, pct: boolean): number | undefined =>
  r == null || Number.isNaN(r) ? undefined : pct ? Number((r * 100).toFixed(4)) : r;
/** Converts a required rate field back to its stored unit; empty input becomes NaN so validation catches it. */
const fromUi = (v: number | undefined, pct: boolean): number => (v === undefined ? NaN : pct ? v / 100 : v);
/** Same conversion for optional fields (overflow rate), where empty input should stay unset. */
const fromUiOpt = (v: number | undefined, pct: boolean): number | undefined => (v === undefined ? undefined : pct ? v / 100 : v);

function NumField({ label, value, onChange }: { label: string; value: number | undefined; onChange(v: number | undefined): void }) {
  return (
    <label>
      {label}
      <input inputMode="decimal" defaultValue={value == null || Number.isNaN(value) ? '' : value} onChange={(e) => onChange(optNum(e.target.value))} />
    </label>
  );
}

function toggle<T>(list: T[] | undefined, v: T): T[] | undefined {
  const s = new Set(list ?? []);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return s.size ? [...s] : undefined;
}

/** A cap-group row keyed by a stable id, so removing a row never shifts another row's inputs. */
interface CapGroupRow {
  key: string;
  name: string;
  amount: string;
}

const OVERSEAS_OPTIONS = [
  ['any', 'Anywhere'],
  ['true', 'Overseas only'],
  ['false', 'Domestic only'],
] as const;

export function RuleEditor({ initial, custom = false, onSave, onCancel, onReset }: Props) {
  const [draft, setDraft] = useState<CardProduct>(() => JSON.parse(JSON.stringify(initial)) as CardProduct);
  const [groups, setGroups] = useState<CapGroupRow[]>(() => Object.entries(initial.capGroups ?? {}).map(([k, v]) => ({ key: newId(), name: k, amount: String(v) })));
  const [errors, setErrors] = useState<string[]>([]);
  const isPct = draft.rewardType === 'cashback';
  const patch = (p: Partial<CardProduct>) => setDraft((d) => ({ ...d, ...p }));
  const setRule = (i: number, p: Partial<Rule>) => setDraft((d) => ({ ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) }));

  function save() {
    const capGroups = Object.fromEntries(groups.filter((g) => g.name.trim()).map((g) => [g.name.trim(), Number(g.amount)]));
    const next: CardProduct = { ...draft, capGroups: Object.keys(capGroups).length ? capGroups : undefined };
    const errs = validateCardProduct(next);
    setErrors(errs);
    if (!errs.length) onSave(next);
  }

  return (
    <section className="panel fields" aria-label="Edit rules">
      {custom && (
        <>
          <label>
            Bank
            <input value={draft.bank} onChange={(e) => patch({ bank: e.target.value })} />
          </label>
          <label>
            Card name
            <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <label>
            Reward type
            <select value={draft.rewardType} onChange={(e) => patch({ rewardType: e.target.value as CardProduct['rewardType'] })}>
              <option value="cashback">Cashback</option>
              <option value="points">Points</option>
            </select>
          </label>
        </>
      )}
      <label>
        Period
        <select value={draft.periodType} onChange={(e) => patch({ periodType: e.target.value as CardProduct['periodType'] })}>
          <option value="calendar">Calendar month</option>
          <option value="statement">Statement cycle</option>
        </select>
      </label>
      {draft.periodType === 'statement' && <NumField label="Statement cycle day (1–28)" value={draft.defaultCycleDay} onChange={(v) => patch({ defaultCycleDay: v })} />}
      {draft.rewardType === 'points' && <NumField label="RM value of 1 point" value={draft.pointValueRM} onChange={(v) => patch({ pointValueRM: v })} />}
      <NumField label={`Card total cap per period ${isPct ? '(RM)' : '(pts)'}`} value={draft.totalCapPerPeriod} onChange={(v) => patch({ totalCapPerPeriod: v })} />
      <NumField label="Minimum spend to earn (RM)" value={draft.minMonthlySpendToEarn} onChange={(v) => patch({ minMonthlySpendToEarn: v })} />

      <fieldset>
        <legend>Excluded from tier spend</legend>
        {CATEGORIES.map((c) => (
          <label key={c} className="inline">
            <input
              type="checkbox"
              checked={draft.tierExcludedCategories?.includes(c) ?? false}
              onChange={() => patch({ tierExcludedCategories: toggle(draft.tierExcludedCategories, c) })}
            />
            {CATEGORY_LABELS[c]}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Shared cap groups</legend>
        {groups.map(({ key, name, amount }) => (
          <div key={key}>
            <label className="inline">
              Group name
              <input defaultValue={name} onChange={(e) => setGroups((g) => g.map((x) => (x.key === key ? { ...x, name: e.target.value } : x)))} />
            </label>
            <label className="inline">
              Cap
              <input inputMode="decimal" defaultValue={amount} onChange={(e) => setGroups((g) => g.map((x) => (x.key === key ? { ...x, amount: e.target.value } : x)))} />
            </label>
            <button type="button" onClick={() => setGroups((g) => g.filter((x) => x.key !== key))}>Remove group</button>
          </div>
        ))}
        <button type="button" onClick={() => setGroups((g) => [...g, { key: newId(), name: '', amount: '0' }])}>Add cap group</button>
      </fieldset>

      {draft.rules.map((rule, i) => {
        const isPctRule = draft.rewardType === 'cashback' && rule.pointValueRM == null;
        const rateLabel = isPctRule ? '(%)' : '(pts/RM)';
        return (
          <fieldset key={rule.id}>
            <legend>{rule.label || `Rule ${i + 1}`}</legend>
            <label>
              Label
              <input defaultValue={rule.label} onChange={(e) => setRule(i, { label: e.target.value })} />
            </label>
            <NumField
              key={`rate-${rule.id}-${isPctRule}`}
              label={`Rate ${rateLabel}`}
              value={toUi(rule.rate, isPctRule)}
              onChange={(v) => setRule(i, { rate: fromUi(v, isPctRule) })}
            />
            <NumField label={`Cap per period ${isPctRule ? '(RM)' : '(pts)'}`} value={rule.capPerPeriod} onChange={(v) => setRule(i, { capPerPeriod: v })} />
            <NumField
              key={`overflow-${rule.id}-${isPctRule}`}
              label={`Rate after cap ${rateLabel}`}
              value={toUi(rule.overflowRate, isPctRule)}
              onChange={(v) => setRule(i, { overflowRate: fromUiOpt(v, isPctRule) })}
            />
            <label>
              Shared cap group (optional)
              <input defaultValue={rule.capGroup ?? ''} onChange={(e) => setRule(i, { capGroup: e.target.value.trim() || undefined })} />
            </label>
            <NumField label="Point value (RM per point, points rules only)" value={rule.pointValueRM} onChange={(v) => setRule(i, { pointValueRM: v })} />
            <label>
              Merchants (comma-separated, optional)
              <input
                defaultValue={rule.merchants?.join(', ') ?? ''}
                onChange={(e) => {
                  const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                  setRule(i, { merchants: list.length ? list : undefined });
                }}
              />
            </label>
            <label>
              Where
              <select
                value={rule.overseas === undefined ? 'any' : String(rule.overseas)}
                onChange={(e) => setRule(i, { overseas: e.target.value === 'any' ? undefined : e.target.value === 'true' })}
              >
                {OVERSEAS_OPTIONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <NumField label="Minimum per transaction (RM)" value={rule.minTxAmount} onChange={(v) => setRule(i, { minTxAmount: v })} />
            <label>
              Days of month (e.g. 20, 28)
              <input
                defaultValue={rule.daysOfMonth?.join(', ') ?? ''}
                onChange={(e) => {
                  const list = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map(Number);
                  setRule(i, { daysOfMonth: list.length ? list : undefined });
                }}
              />
            </label>
            <NumField label="Minimum category spend (RM)" value={rule.minCategorySpend} onChange={(v) => setRule(i, { minCategorySpend: v })} />
            <div role="group" aria-label="Categories">
              {CATEGORIES.map((c) => (
                <label key={c} className="inline">
                  <input type="checkbox" checked={rule.categories?.includes(c) ?? false} onChange={() => setRule(i, { categories: toggle(rule.categories, c) })} />
                  {CATEGORY_LABELS[c]}
                </label>
              ))}
            </div>
            <div role="group" aria-label="Payment methods">
              {TX_PAYMENT_METHODS.map((m) => (
                <label key={m} className="inline">
                  <input type="checkbox" checked={rule.paymentMethods?.includes(m) ?? false} onChange={() => setRule(i, { paymentMethods: toggle(rule.paymentMethods, m) })} />
                  {PAYMENT_LABELS[m]}
                </label>
              ))}
            </div>
            <div role="group" aria-label="Days">
              {DAY_LABELS.map((d, n) => (
                <label key={d} className="inline">
                  <input type="checkbox" checked={rule.days?.includes(n as Weekday) ?? false} onChange={() => setRule(i, { days: toggle(rule.days, n as Weekday) })} />
                  {d}
                </label>
              ))}
            </div>
            <div role="group" aria-label="Tiers">
              {(rule.tiers ?? []).map((t, j) => (
                <div key={`${rule.id}-${j}-${rule.tiers!.length}`}>
                  <NumField
                    label={`Tier ${j + 1} min spend (RM)`}
                    value={t.minPeriodSpend}
                    onChange={(v) => setRule(i, { tiers: rule.tiers!.map((x, k) => (k === j ? { ...x, minPeriodSpend: v ?? NaN } : x)) })}
                  />
                  <NumField
                    label={`Tier ${j + 1} rate ${rateLabel}`}
                    value={toUi(t.rate, isPctRule)}
                    onChange={(v) => setRule(i, { tiers: rule.tiers!.map((x, k) => (k === j ? { ...x, rate: fromUi(v, isPctRule) } : x)) })}
                  />
                  <button type="button" onClick={() => setRule(i, { tiers: rule.tiers!.filter((_, k) => k !== j).length ? rule.tiers!.filter((_, k) => k !== j) : undefined })}>
                    Remove tier
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setRule(i, { tiers: [...(rule.tiers ?? []), { minPeriodSpend: NaN, rate: NaN }] })}>Add tier</button>
              {rule.tiers?.length ? <p className="muted">With tiers, the rate above is ignored.</p> : null}
            </div>
            <button type="button" onClick={() => setDraft((d) => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }))}>Remove rule</button>
          </fieldset>
        );
      })}
      <button type="button" onClick={() => setDraft((d) => ({ ...d, rules: [...d.rules, { id: newId(), label: 'New rule', rate: 0 }] }))}>Add rule</button>

      {errors.length > 0 && (
        <ul className="error" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="primary" onClick={save}>Save rules</button>{' '}
        <button type="button" onClick={onCancel}>Cancel</button>{' '}
        {onReset && <button type="button" onClick={onReset}>Reset to catalog default</button>}
      </div>
    </section>
  );
}
