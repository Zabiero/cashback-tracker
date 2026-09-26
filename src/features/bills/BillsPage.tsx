import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BankId, Statement } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { activeCards, nameOf } from '../../app/selectors';
import { findDuplicate, statementStatus } from '../../statements/logic';
import { icsStamp, makeIcs } from '../../statements/ics';
import { downloadText } from '../../lib/download';
import { formatRM } from '../../lib/money';
import { newId } from '../../lib/id';
import { StatementForm, draftFrom, type StatementInput } from './StatementForm';
import { MarkPaidForm } from './MarkPaidForm';
import { UploadStatement } from './UploadStatement';

export interface SaveMeta {
  source: 'reader' | 'manual';
  readerBank?: BankId;
}

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; s: Statement } | { kind: 'pay'; s: Statement } | { kind: 'upload' };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function BillsPage() {
  const data = useAppData();
  const { repo, statements, refresh, today } = data;
  const cards = activeCards(data);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [error, setError] = useState('');

  async function saveStatement(v: StatementInput, meta: SaveMeta, existing?: Statement): Promise<boolean> {
    const dup = findDuplicate(statements, { id: existing?.id ?? '', userCardId: v.userCardId, statementDate: v.statementDate });
    if (dup && !window.confirm(`A ${nameOf(data, v.userCardId)} statement dated ${v.statementDate} already exists (balance ${formatRM(dup.statementBalance)}). Replace it with balance ${formatRM(v.statementBalance)}?`)) return false;
    const base = existing ?? dup;
    const s: Statement = {
      id: base?.id ?? newId(),
      ...v,
      source: meta.source,
      readerBank: meta.readerBank,
      paymentStatus: base?.paymentStatus ?? 'unpaid',
      paidAmount: base?.paidAmount,
      paidOn: base?.paidOn,
      createdAt: base?.createdAt ?? new Date().toISOString(),
    };
    await repo.saveStatement(s);
    if (dup && existing && dup.id !== existing.id) await repo.deleteStatement(dup.id);
    await refresh();
    return true;
  }

  async function run(action: () => Promise<void>) {
    try {
      setError('');
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const unpaid = statements.filter((s) => s.paymentStatus === 'unpaid').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = statements.filter((s) => s.paymentStatus !== 'unpaid').sort((a, b) => b.statementDate.localeCompare(a.statementDate));

  function row(s: Statement) {
    const name = nameOf(data, s.userCardId);
    const st = statementStatus(s, today);
    return (
      <li key={s.id} className="panel" aria-label={`${name} statement ${s.statementDate}`}>
        <strong>{name}</strong> <span className={`chip chip-${st.tone}`}>{st.label}</span>
        <div className="muted">
          Statement {s.statementDate} · Due {s.dueDate}
        </div>
        <div>
          Balance {formatRM(s.statementBalance)} · Minimum {formatRM(s.minimumDue)}
        </div>
        <div>
          {s.paymentStatus === 'unpaid' ? (
            <button type="button" onClick={() => setMode({ kind: 'pay', s })}>Mark paid</button>
          ) : (
            <button
              type="button"
              onClick={() => run(async () => {
                await repo.saveStatement({ ...s, paymentStatus: 'unpaid', paidAmount: undefined, paidOn: undefined });
                await refresh();
              })}
            >
              Mark unpaid
            </button>
          )}{' '}
          <button type="button" onClick={() => downloadText(`${slug(name)}-due-${s.dueDate}.ics`, makeIcs(s, name, icsStamp(new Date())), 'text/calendar')}>
            Add to calendar
          </button>{' '}
          <button type="button" onClick={() => setMode({ kind: 'edit', s })}>Edit</button>{' '}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete this ${name} statement?`)) return;
              void run(async () => {
                await repo.deleteStatement(s.id);
                await refresh();
              });
            }}
          >
            Delete
          </button>
        </div>
      </li>
    );
  }

  if (mode.kind === 'new' || mode.kind === 'edit') {
    const existing = mode.kind === 'edit' ? mode.s : undefined;
    return (
      <>
        <h1>{existing ? 'Edit statement' : 'Add statement'}</h1>
        <StatementForm
          cards={cards}
          today={today}
          initial={draftFrom(existing ?? {})}
          onCancel={() => setMode({ kind: 'list' })}
          onSubmit={async (v) => {
            if (await saveStatement(v, { source: existing?.source ?? 'manual', readerBank: existing?.readerBank }, existing)) setMode({ kind: 'list' });
          }}
        />
      </>
    );
  }

  if (mode.kind === 'upload') {
    return (
      <>
        <h1>Upload statement</h1>
        <UploadStatement onSave={(v, meta) => saveStatement(v, meta)} onDone={() => setMode({ kind: 'list' })} />
      </>
    );
  }

  if (mode.kind === 'pay') {
    return (
      <>
        <h1>Mark paid — {nameOf(data, mode.s.userCardId)}</h1>
        <MarkPaidForm
          statement={mode.s}
          today={today}
          onCancel={() => setMode({ kind: 'list' })}
          onSave={async (p) => {
            await repo.saveStatement({ ...mode.s, ...p });
            await refresh();
            setMode({ kind: 'list' });
          }}
        />
      </>
    );
  }

  return (
    <>
      <h1>Bills</h1>
      {cards.length === 0 ? (
        <p>
          <Link to="/cards">Add your cards</Link> first.
        </p>
      ) : (
        <p>
          <button type="button" onClick={() => setMode({ kind: 'upload' })}>Upload statement</button>{' '}
          <button type="button" className="primary" onClick={() => setMode({ kind: 'new' })}>Add manually</button>
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {statements.length === 0 && <p className="muted">No statements yet.</p>}
      {unpaid.length > 0 && (
        <section aria-label="Unpaid">
          <h2>Unpaid</h2>
          <ul className="results">{unpaid.map(row)}</ul>
        </section>
      )}
      {paid.length > 0 && (
        <section aria-label="Paid">
          <h2>Paid</h2>
          <ul className="results">{paid.map(row)}</ul>
        </section>
      )}
    </>
  );
}
