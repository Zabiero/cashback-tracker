import { formatRM } from '../lib/money';

export function capLevel(used: number, limit: number): 'ok' | 'warn' | 'full' {
  if (limit <= 0) return 'full';
  const r = used / limit;
  return r >= 1 ? 'full' : r >= 0.8 ? 'warn' : 'ok';
}

export function CapMeter({ label, usedRM, limitRM }: { label: string; usedRM: number; limitRM: number }) {
  const pct = limitRM > 0 ? Math.min(100, (usedRM / limitRM) * 100) : 100;
  return (
    <div className={`cap cap-${capLevel(usedRM, limitRM)}`}>
      <div className="cap-label">
        <span>{label}</span>
        <span>
          {formatRM(usedRM)} / {formatRM(limitRM)}
        </span>
      </div>
      <div role="progressbar" aria-label={`${label} cap`} aria-valuemin={0} aria-valuemax={limitRM} aria-valuenow={usedRM} className="cap-track">
        <div className="cap-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
