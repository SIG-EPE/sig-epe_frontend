import { create } from "zustand";
import type { BalanceData, BalanceFilters } from "@/types/budget";

// -------------------------------------------------------
// Budget Balance store — Zustand 5
// Gestiona el estado del dashboard de saldos presupuestales
// -------------------------------------------------------

interface BudgetBalanceStore {
  fiscalYearId: string | null;
  filters: BalanceFilters;
  balanceData: BalanceData | null;
  isLoading: boolean;
  error: Error | null;

  setFiscalYearId: (id: string) => void;
  setFilter: (key: keyof BalanceFilters, value: string) => void;
  clearFilters: () => void;
  setBalanceData: (data: BalanceData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

export const useBudgetBalanceStore = create<BudgetBalanceStore>((set) => ({
  fiscalYearId: null,
  filters: {},
  balanceData: null,
  isLoading: false,
  error: null,

  setFiscalYearId: (id) => set({ fiscalYearId: id }),

  setFilter: (key, value) =>
    set((state) => ({
      filters: value
        ? { ...state.filters, [key]: value }
        : (() => {
            const next = { ...state.filters };
            delete next[key];
            return next;
          })(),
    })),

  clearFilters: () => set({ filters: {} }),

  setBalanceData: (data) => set({ balanceData: data }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));
