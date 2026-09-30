import { useRef, useState, type ChangeEvent } from 'react';
import { useAppData } from '../../app/DataProvider';
import { activeCards } from '../../app/selectors';
import { makeBackup, parseBackup, type BackupSummary } from '../../data/backup';
import type { AppSnapshot } from '../../data/repository';
import type { CardProduct } from '../../engine/types';
import { getProduct } from '../../catalog';
import { downloadText, readFileText } from '../../lib/download';
import { PageHeader } from '../../components/PageHeader';

interface PointProduct {
  pid: string;
  name: string;
  product: CardProduct;
}

function hasPoints(product: CardProduct): boolean {
  return product.rewardType === 'points' || product.rules.some((r) => r.pointValueRM != null);
}

function currentPointValueRM(product: CardProduct): number {
  return product.pointValueRM ?? product.rules.find((r) => r.pointValueRM != null)?.pointValueRM ?? 0;
}

export function SettingsPage() {
  const data = useAppData();
  const { repo, settings, refresh, today } = data;
  const [pending, setPending] = useState<{ data: AppSnapshot; summary: BackupSummary } | null>(null);
  const [importError, setImportError] = useState('');
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false); // blocks a second click before the disabled state renders
  const [pointError, setPointError] = useState('');

  // Every owned (active, catalog) card whose product earns points anywhere, deduped by product.
  const pointProducts = [...new Map<string, PointProduct>(
    activeCards(data)
      .filter((c) => c.userCard.productId)
      .map((c): [string, PointProduct] | null => {
        const pid = c.userCard.productId!;
        const product = getProduct(pid);
        if (!product || !hasPoints(product)) return null;
        return [pid, { pid, name: c.name, product }];
      })
      .filter((entry): entry is [string, PointProduct] => entry !== null),
  ).values()];
  const [pointValues, setPointValues] = useState<Record<string, string>>({});

  async function exportBackup() {
    const snapshot = await repo.exportAll();
    downloadText(`cashback-backup-${today}.json`, JSON.stringify(makeBackup(snapshot, new Date().toISOString()), null, 2));
    await repo.saveSettings({ ...settings, lastBackupAt: today });
    await refresh();
    setMessage('Backup exported.');
  }

  async function chooseFile(e: ChangeEvent<HTMLInputElement>) {
    setMessage('');
    setPending(null);
    setImportError('');
    const file = e.target.files?.[0];
    if (!file) return;
    const result = parseBackup(await readFileText(file));
    if (result.ok) setPending({ data: result.data, summary: result.summary });
    else setImportError(result.error);
    e.target.value = '';
  }

  async function confirmImport() {
    if (!pending || importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setImportError('');
    try {
      await repo.replaceAll(pending.data);
      setPending(null);
      await refresh();
      setMessage('Backup imported.');
    } catch (e) {
      setImportError(`Could not import the backup: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  async function savePointValues() {
    const next = { ...settings.pointValueOverrides };
    for (const [pid, v] of Object.entries(pointValues)) {
      const n = Number(v);
      if (v.trim() === '') delete next[pid];
      else if (Number.isFinite(n) && n > 0) next[pid] = n / 1000;
      else {
        setMessage('');
        setPointError('Enter a positive number of RM per 1,000 points.');
        return;
      }
    }
    setPointError('');
    await repo.saveSettings({ ...settings, pointValueOverrides: next });
    await refresh();
    setMessage('Point values saved.');
  }

  const s = pending?.summary;
  return (
    <>
      <PageHeader title="Settings" />
      {message && <p role="status" className="status-msg">{message}</p>}

      <section className="panel fields">
        <h2>Backup</h2>
        <p className="muted">Your data lives only in this browser. Last backup: {settings.lastBackupAt ?? 'never'}.</p>
        <p className="muted">Saved PDF passwords are not included in backups.</p>
        <div className="action-row">
          <button type="button" className="primary" onClick={exportBackup}>Export backup</button>
        </div>
        <label>
          Import backup file
          <input type="file" accept="application/json,.json" onChange={chooseFile} />
        </label>
        {importError && <p className="error" role="alert">{importError}</p>}
        {s && (
          <div className="banner">
            <p>
              {s.cards} card{s.cards === 1 ? '' : 's'}, {s.transactions} transaction{s.transactions === 1 ? '' : 's'}
              {s.from ? ` (${s.from} to ${s.to})` : ''}. This replaces all current data.
            </p>
            <div className="action-row">
              <button type="button" onClick={confirmImport} disabled={importing}>Replace my data</button>
              <button type="button" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {pointProducts.length > 0 && (
        <section className="panel fields">
          <h2>Points value</h2>
          {pointProducts.map(({ pid, name, product }) => {
            const current = settings.pointValueOverrides[pid] ?? currentPointValueRM(product);
            return (
              <label key={pid}>
                {name}: RM value of 1,000 points
                <input
                  inputMode="decimal"
                  defaultValue={String(Number((current * 1000).toFixed(4)))}
                  onChange={(e) => setPointValues((p) => ({ ...p, [pid]: e.target.value }))}
                />
              </label>
            );
          })}
          {pointError && <p className="error" role="alert">{pointError}</p>}
          <div className="action-row">
            <button type="button" onClick={savePointValues}>Save point values</button>
          </div>
        </section>
      )}
    </>
  );
}
