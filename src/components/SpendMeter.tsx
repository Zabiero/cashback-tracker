import type { SpendTarget } from '../engine/spendTargets';
import { formatRM } from '../lib/money';

/** One capped category: how much more to spend for its full cashback, assuming the best rate. */
export function SpendMeter({ t }: { t: SpendTarget }) {
  const pct = t.maxed ? 100 : t.target > 0 ? Math.min(100, (t.spent / t.target) * 100) : 0;
  return (
    <div className={`cap cap-${t.maxed ? 'full' : 'ok'}`}>
      <div className="cap-label">
        <span>{t.label}</span>
        <span className="cap-more">{t.maxed ? 'Maxed ✓' : `${formatRM(t.more)} more`}</span>
      </div>
      <div role="progressbar" aria-label={`${t.label} spend`} aria-valuemin={0} aria-valuemax={t.target} aria-valuenow={t.spent} className="cap-track">
        <div className="cap-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted cap-note">
        {formatRM(t.spent)} of {formatRM(t.target)} · cashback {formatRM(t.earnedRM)} of {formatRM(t.capRM)}
      </div>
    </div>
  );
}
