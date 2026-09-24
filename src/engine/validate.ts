import { CATEGORIES, PAYMENT_METHODS, type CardProduct, type Rule } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const nonNeg = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const intIn = (n: unknown, lo: number, hi: number): boolean => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;

export function validateCardProduct(input: unknown): string[] {
  if (!input || typeof input !== 'object') return ['Card must be an object'];
  const p = input as Partial<CardProduct>;
  const e: string[] = [];

  for (const k of ['id', 'bank', 'name'] as const) if (typeof p[k] !== 'string' || !p[k]) e.push(`${k} is required`);
  if (p.rewardType !== 'cashback' && p.rewardType !== 'points') e.push('rewardType must be cashback or points');
  if (p.rewardType === 'points' && !(nonNeg(p.pointValueRM) && (p.pointValueRM as number) > 0)) e.push('Points cards need pointValueRM > 0');
  if (p.periodType !== 'calendar' && p.periodType !== 'statement') e.push('periodType must be calendar or statement');
  if (p.periodType === 'statement' && !intIn(p.defaultCycleDay, 1, 28)) e.push('defaultCycleDay must be 1–28');
  if (p.totalCapPerPeriod != null && !nonNeg(p.totalCapPerPeriod)) e.push('totalCapPerPeriod must be ≥ 0');
  if (p.minMonthlySpendToEarn != null && !nonNeg(p.minMonthlySpendToEarn)) e.push('minMonthlySpendToEarn must be ≥ 0');
  p.tierExcludedCategories?.forEach((c) => {
    if (!(CATEGORIES as readonly string[]).includes(c)) e.push(`Unknown excluded category ${c}`);
  });

  const groups = p.capGroups ?? {};
  for (const [g, v] of Object.entries(groups)) if (!nonNeg(v)) e.push(`Cap group ${g} must be ≥ 0`);

  if (!Array.isArray(p.rules) || p.rules.length === 0) {
    e.push('At least one rule is required');
  } else {
    const ids = new Set<string>();
    p.rules.forEach((r, i) => validateRule(r, `Rule ${i + 1}`, ids, groups, e));
  }

  if (typeof p.sourceUrl !== 'string') e.push('sourceUrl must be a string');
  if (p.verifiedOn !== null && !(typeof p.verifiedOn === 'string' && DATE_RE.test(p.verifiedOn))) e.push('verifiedOn must be null or YYYY-MM-DD');
  if (!intIn(p.catalogVersion, 1, Number.MAX_SAFE_INTEGER)) e.push('catalogVersion must be a positive integer');
  return e;
}

function validateRule(r: Rule, at: string, ids: Set<string>, groups: Record<string, number>, e: string[]): void {
  if (!r.id) e.push(`${at}: id is required`);
  else if (ids.has(r.id)) e.push(`${at}: duplicate id ${r.id}`);
  else ids.add(r.id);
  if (!r.label) e.push(`${at}: label is required`);
  if (!nonNeg(r.rate)) e.push(`${at}: rate must be ≥ 0`);
  r.tiers?.forEach((t, j) => {
    if (!nonNeg(t.rate) || !nonNeg(t.minPeriodSpend)) e.push(`${at}: tier ${j + 1} values must be ≥ 0`);
    if (j > 0 && t.minPeriodSpend <= r.tiers![j - 1].minPeriodSpend) e.push(`${at}: tiers must be in ascending order of spend`);
  });
  if (r.capPerPeriod != null && !nonNeg(r.capPerPeriod)) e.push(`${at}: cap must be ≥ 0`);
  if (r.capGroup && !(r.capGroup in groups)) e.push(`${at}: cap group "${r.capGroup}" is not defined`);
  r.categories?.forEach((c) => {
    if (!(CATEGORIES as readonly string[]).includes(c)) e.push(`${at}: unknown category ${c}`);
  });
  r.paymentMethods?.forEach((m) => {
    if (!(PAYMENT_METHODS as readonly string[]).includes(m)) e.push(`${at}: unknown payment method ${m}`);
  });
  if (r.days?.some((d) => !intIn(d, 0, 6))) e.push(`${at}: days must be 0–6`);
  if (r.overseas !== undefined && typeof r.overseas !== 'boolean') e.push(`${at}: overseas must be true or false`);
  if (r.minTxAmount != null && !nonNeg(r.minTxAmount)) e.push(`${at}: minimum transaction amount must be ≥ 0`);
  if (r.minCategorySpend != null && !nonNeg(r.minCategorySpend)) e.push(`${at}: minimum category spend must be ≥ 0`);
  if (r.daysOfMonth?.some((d) => !intIn(d, 1, 31))) e.push(`${at}: days of month must be 1–31`);
  if (r.pointValueRM != null && !(nonNeg(r.pointValueRM) && r.pointValueRM > 0)) e.push(`${at}: point value must be > 0`);
  if (r.overflowRate != null && !nonNeg(r.overflowRate)) e.push(`${at}: overflow rate must be ≥ 0`);
}
