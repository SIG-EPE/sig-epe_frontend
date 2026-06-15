"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchReport, REPORT_SECTION, type ReportSection } from "@/lib/reports";
import { useAuthStore } from "@/stores/auth-store";
import type {
  ConceptDetailsFilters,
  ExpensesByConceptDetailsReport,
  ExpensesByConceptReport,
  ExpensesByRequestTypeReport,
  ReportFilters,
  RequestsByStatusReport,
} from "@/types/reports";

interface UseReportOptions {
  enabled?: boolean;
}

interface ReportState<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
}

function useReportData<T>(section: ReportSection, filters: ReportFilters | ConceptDetailsFilters, options: UseReportOptions = {}) {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<ReportState<T>>({
    data: null,
    error: null,
    isLoading: enabled,
    isRefreshing: false,
  });
  const authIsLoading = useAuthStore((store) => store.isLoading);
  const accessToken = useAuthStore((store) => store.accessToken);
  const queryKey = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    if (!enabled || authIsLoading || !accessToken) return;
    setState((current) => ({
      ...current,
      error: null,
      isLoading: current.data === null,
      isRefreshing: current.data !== null,
    }));
    try {
      const data = await fetchReport<T>(section, filters);
      setState({ data, error: null, isLoading: false, isRefreshing: false });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error : new Error("No se pudo cargar el reporte"),
        isLoading: false,
        isRefreshing: false,
      }));
    }
    // queryKey compacta cambios de filtros sin conservar referencias inestables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, authIsLoading, enabled, queryKey, section]);

  useEffect(() => {
    if (!enabled || authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, enabled, refetch]);

  return { ...state, refetch };
}

export function useRequestsByStatusReport(filters: ReportFilters, options?: UseReportOptions) {
  return useReportData<RequestsByStatusReport>(REPORT_SECTION.REQUESTS_BY_STATUS, filters, options);
}

export function useExpensesByRequestTypeReport(filters: ReportFilters, options?: UseReportOptions) {
  return useReportData<ExpensesByRequestTypeReport>(REPORT_SECTION.EXPENSES_BY_REQUEST_TYPE, filters, options);
}

export function useExpensesByConceptReport(filters: ReportFilters, options?: UseReportOptions) {
  return useReportData<ExpensesByConceptReport>(REPORT_SECTION.EXPENSES_BY_CONCEPT, filters, options);
}

export function useExpensesByConceptDetailsReport(filters: ConceptDetailsFilters, options?: UseReportOptions) {
  return useReportData<ExpensesByConceptDetailsReport>(REPORT_SECTION.EXPENSES_BY_CONCEPT_DETAILS, filters, options);
}
