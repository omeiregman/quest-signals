import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface BankrollCtx {
  bankroll: number;
  setBankroll: (n: number) => void;
}

const Ctx = createContext<BankrollCtx | null>(null);
const STORAGE_KEY = 'quest-bankroll';

export function BankrollProvider({
  initial = 100,
  children,
}: {
  initial?: number;
  children: ReactNode;
}) {
  const [bankroll, setBankroll] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(stored) && stored > 0) return stored;
    }
    return initial;
  });

  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(bankroll));
  }, [bankroll]);

  return <Ctx.Provider value={{ bankroll, setBankroll }}>{children}</Ctx.Provider>;
}

export function useBankroll(): BankrollCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBankroll must be used within BankrollProvider');
  return ctx;
}
