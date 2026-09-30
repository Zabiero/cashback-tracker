import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { UserCard } from '../../engine/types';
import { useAppData } from '../../app/DataProvider';
import { activeCards } from '../../app/selectors';
import { BANK_LABELS } from '../../statements/banks';
import { redact } from '../../statements/redact';
import { readStatement, type ReadOutcome, type StatementCandidate } from '../../statements/readStatement';
import { StatementForm, draftFrom, type StatementInput } from './StatementForm';
import type { SaveMeta } from './BillsPage';

type OkOutcome = Extract<ReadOutcome, { ok: true }>;

type Step =
  | { kind: 'pick' }
  | { kind: 'reading' }
  | { kind: 'password'; wrong: boolean }
  | { kind: 'notPdf' }
  | { kind: 'noText' }
  | { kind: 'error' }
  | { kind: 'ok'; outcome: OkOutcome; index: number };

interface Props {
  onSave(v: StatementInput, meta: SaveMeta): Promise<boolean>;
  onDone(): void;
  /** A PDF already picked on the Bills screen; reading starts immediately. */
  initialFile?: File;
}

function noteFor(outcome: OkOutcome, candidate: StatementCandidate): string {
  if (candidate.readerUsed && outcome.bank) {
    return `Read by: ${BANK_LABELS[outcome.bank]} reader. Please check before saving.`;
  }
  if (outcome.bank && !outcome.hasReader) {
    return `No reader for ${BANK_LABELS[outcome.bank]} yet — please fill in.`;
  }
  return "Couldn't read this statement — please fill in.";
}

export function UploadStatement({ onSave, onDone, initialFile }: Props) {
  const data = useAppData();
  const cards = activeCards(data);
  const [step, setStep] = useState<Step>(initialFile ? { kind: 'reading' } : { kind: 'pick' });
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [passwordUsed, setPasswordUsed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Latest saved cards, so updates for a later candidate build on what an earlier one stored.
  const userCardsRef = useRef(data.userCards);
  userCardsRef.current = data.userCards;

  async function attemptRead(b: Uint8Array, pw: string | undefined) {
    try {
      const outcome = await readStatement(b, { password: pw, userCards: data.userCards, resolved: data.resolved, today: data.today });
      if (!outcome.ok) {
        if (outcome.reason === 'needsPassword') {
          setPasswordUsed(true);
          setStep({ kind: 'password', wrong: false });
          return;
        }
        if (outcome.reason === 'wrongPassword') {
          setPasswordUsed(true);
          setStep({ kind: 'password', wrong: true });
          return;
        }
        if (outcome.reason === 'notPdf') {
          setStep({ kind: 'notPdf' });
          return;
        }
        setStep({ kind: 'noText' });
        return;
      }
      setStep({ kind: 'ok', outcome, index: 0 });
    } catch {
      setStep({ kind: 'error' });
    }
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) await readFile(f);
  }

  // Read the file picked on the Bills screen once (the ref guards React StrictMode's double effect).
  const startedRef = useRef(false);
  useEffect(() => {
    if (!initialFile || startedRef.current) return;
    startedRef.current = true;
    void readFile(initialFile); // runs once for the file passed in
  }, [initialFile]);

  async function readFile(f: File) {
    let b: Uint8Array;
    try {
      b = new Uint8Array(await f.arrayBuffer());
    } catch {
      setStep({ kind: 'error' });
      return;
    }
    setBytes(b);
    setStep({ kind: 'reading' });
    await attemptRead(b, undefined);
  }

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bytes) return;
    setStep({ kind: 'reading' });
    await attemptRead(bytes, password);
  }

  async function applyCardUpdates(userCardId: string, last4?: string) {
    const card = userCardsRef.current.find((c) => c.id === userCardId);
    if (!card) return;
    const updates: Partial<UserCard> = {};
    if (last4 && !card.last4) updates.last4 = last4;
    if (passwordUsed && remember) updates.pdfPassword = password;
    if (Object.keys(updates).length === 0) return;
    await data.repo.saveUserCard({ ...card, ...updates });
    await data.refresh();
  }

  function advance(current: Extract<Step, { kind: 'ok' }>) {
    if (current.index + 1 < current.outcome.candidates.length) {
      setStep({ ...current, index: current.index + 1 });
    } else {
      onDone();
    }
  }

  function chooseAnotherFile() {
    if (inputRef.current) inputRef.current.value = '';
    setStep({ kind: 'pick' });
  }

  if (step.kind === 'pick' || step.kind === 'reading') {
    return (
      <div className="panel fields">
        <label>
          Statement PDF
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={(e) => void onFileChange(e)} />
        </label>
        {step.kind === 'reading' && (
          <p className="reading">
            <span className="spinner" aria-hidden="true" />
            Reading…
          </p>
        )}
        <div>
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'password') {
    return (
      <form onSubmit={(e) => void onPasswordSubmit(e)} className="panel fields">
        <label>
          PDF password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember for this card on this device
        </label>
        <p className="muted">Saved only in this browser. Anyone using this browser profile could see it.</p>
        {step.wrong && (
          <p className="error" role="alert">
            Password incorrect.
          </p>
        )}
        <div>
          <button type="submit" className="primary">
            Open
          </button>{' '}
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (step.kind === 'notPdf' || step.kind === 'error') {
    return (
      <div className="panel">
        <p className="error">{step.kind === 'notPdf' ? "This file isn't a readable PDF." : 'Something went wrong reading this file.'}</p>
        <button type="button" onClick={chooseAnotherFile}>
          Choose another file
        </button>
      </div>
    );
  }

  if (step.kind === 'noText') {
    return (
      <>
        <p className="banner">This PDF has no text (it may be a scan). Please enter the values manually.</p>
        <StatementForm
          cards={cards}
          today={data.today}
          initial={draftFrom({})}
          onCancel={onDone}
          onSubmit={async (v) => {
            const ok = await onSave(v, { source: 'manual' });
            if (!ok) return;
            await applyCardUpdates(v.userCardId);
            onDone();
          }}
        />
      </>
    );
  }

  const { outcome, index } = step;
  const candidate = outcome.candidates[index];
  const total = outcome.candidates.length;
  const nothingToPay = total > 1 && candidate.values.statementBalance === 0 && candidate.values.minimumDue === 0;

  return (
    <>
      {total > 1 && <h2>Statement {index + 1} of {total}</h2>}
      {nothingToPay && <p className="tip">This card has nothing to pay this month.</p>}
      <StatementForm
        key={index}
        cards={cards}
        today={data.today}
        initial={draftFrom({ ...candidate.values, userCardId: candidate.userCardId })}
        issues={candidate.issues}
        note={noteFor(outcome, candidate)}
        submitPrimary={!nothingToPay}
        onCancel={onDone}
        onSubmit={async (v) => {
          const meta: SaveMeta =
            candidate.readerUsed && outcome.bank ? { source: 'reader', readerBank: outcome.bank } : { source: 'manual' };
          const ok = await onSave(v, meta);
          if (!ok) return;
          await applyCardUpdates(v.userCardId, candidate.last4);
          advance(step);
        }}
      />
      {total > 1 && (
        <button type="button" className={nothingToPay ? 'primary' : undefined} onClick={() => advance(step)}>
          Skip this card
        </button>
      )}
      <div className="panel">
        <details>
          <summary>Show extracted text</summary>
          <p className="muted">Personal details are partly hidden. Check and remove anything personal before sharing.</p>
          <pre>{redact(outcome.text)}</pre>
        </details>
      </div>
    </>
  );
}
