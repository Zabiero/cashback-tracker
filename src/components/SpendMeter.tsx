import type { SpendTarget } from '../engine/spendTargets';
import { formatRM } from '../lib/money';

function note(t: SpendTarget): string {
  if (t.maxed) return 'Maxed out — extra spend here earns no more';
  if (t.target === null) return "Not earning yet — reach the card's next spend tier first";
  const more = formatRM(Math.max(0, t.target - t.spent));
  return t.kind === 'unlock' ? `Spend ${more} more to unlock` : `Spend ${more} more to max out`;
}

/** One cashback cap shown as spend: what you've spent toward it and the spend that earns all of it. */
export function SpendMeter({ t }: { t: SpendTarget }) {
  const pct = t.maxed ? 100 : t.target ? Math.min(100, (t.spent / t.target) * 100) : 0;
  const level = t.maxed ? 'full' : t.kind === 'unlock' ? 'warn' : 'ok';
  return (
    <div className={`cap cap-${level}`}>
      <div className="cap-label">
        <span>{t.label}</span>
        <span>{t.target === null ? `${formatRM(t.spent)} spent` : `${formatRM(t.spent)} / ${formatRM(t.target)}`}</span>
      </div>
      <div role="progressbar" aria-label={`${t.label} spend`} aria-valuemin={0} aria-valuemax={t.target ?? 0} aria-valuenow={t.spent} className="cap-track">
        <div className="cap-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted cap-note">
        {note(t)} · cashback {formatRM(t.earnedRM)} of {formatRM(t.capRM)}
      </div>
    </div>
  );
}
