import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CardProduct, RecurringTemplate, Settings, Transaction, UserCard } from '../engine/types';
import type { Repository } from '../data/repository';
import { checkStorage } from '../data/storageCheck';
import { runRecurring } from '../data/recurringRunner';
import { resolveUserCard } from '../catalog/resolveUserCard';
import { validateCardProduct } from '../engine/validate';
import { todayISO } from '../engine/dates';

export interface AppData {
  repo: Repository;
  userCards: UserCard[];
  transactions: Transaction[];
  templates: RecurringTemplate[];
  settings: Settings;
  resolved: Record<string, CardProduct>;
  cardErrors: Record<string, string>;
  storageOk: boolean;
  today: string;
  refresh(): Promise<void>;
}

interface Loaded {
  userCards: UserCard[];
  transactions: Transaction[];
  templates: RecurringTemplate[];
  settings: Settings;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used inside <DataProvider>');
  return v;
}

export function DataProvider({ repo, today = todayISO, children }: { repo: Repository; today?: () => string; children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [userCards, transactions, templates, settings] = await Promise.all([
      repo.listUserCards(),
      repo.listTransactions(),
      repo.listTemplates(),
      repo.getSettings(),
    ]);
    setLoaded({ userCards, transactions, templates, settings });
  }, [repo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkStorage();
      if (cancelled) return;
      setStorageOk(ok);
      try {
        await runRecurring(repo, today());
        await refresh();
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    const onFocus = () => {
      void runRecurring(repo, today())
        .then(refresh)
        .catch((e) => {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
        });
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [repo, refresh, today]);

  const value = useMemo<AppData | null>(() => {
    if (!loaded) return null;
    const resolved: Record<string, CardProduct> = {};
    const cardErrors: Record<string, string> = {};
    for (const uc of loaded.userCards) {
      try {
        const card = resolveUserCard(uc, loaded.settings);
        const errs = validateCardProduct(card);
        if (errs.length) cardErrors[uc.id] = errs[0];
        else resolved[uc.id] = card;
      } catch (e) {
        cardErrors[uc.id] = e instanceof Error ? e.message : String(e);
      }
    }
    return { repo, ...loaded, resolved, cardErrors, storageOk, today: today(), refresh };
  }, [loaded, repo, storageOk, today, refresh]);

  if (loadError) return <p className="error" role="alert">Could not load your data: {loadError}</p>;
  if (!value) return <p>Loading…</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
