"use client";

import { useEffect, useState } from "react";

import {
  getBudgetExecutionDashboard,
  getGiofOperationsDashboard,
} from "@/lib/dashboard";
import { useAuthStore } from "@/stores/auth-store";
import type {
  BudgetDashboardExecution,
  BudgetDashboardExecutionFilters,
  GiofOperationsDashboard,
  GiofOperationsDashboardFilters,
} from "@/types/dashboard";

interface DashboardHookState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useBudgetExecutionDashboard(
  filters: BudgetDashboardExecutionFilters | null,
): DashboardHookState<BudgetDashboardExecution> {
  const [data, setData] = useState<BudgetDashboardExecution | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  async function refetch() {
    setRefreshKey((current) => current + 1);
  }

  useEffect(() => {
    if (!filters || authIsLoading || !accessToken) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getBudgetExecutionDashboard(filters)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((unknownError: unknown) => {
        if (!cancelled) {
          setError(unknownError instanceof Error ? unknownError : new Error("Error al cargar dashboard presupuestal"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    filters?.fiscal_year_id,
    filters?.org_unit_id,
    filters?.territory_id,
    filters?.program_id,
    filters?.budget_category_id,
    authIsLoading,
    accessToken,
    refreshKey,
  ]);

  return { data, isLoading, error, refetch };
}

export function useGiofOperationsDashboard(
  filters: GiofOperationsDashboardFilters,
): DashboardHookState<GiofOperationsDashboard> {
  const [data, setData] = useState<GiofOperationsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  async function refetch() {
    setRefreshKey((current) => current + 1);
  }

  useEffect(() => {
    if (authIsLoading || !accessToken) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getGiofOperationsDashboard(filters)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((unknownError: unknown) => {
        if (!cancelled) {
          setError(unknownError instanceof Error ? unknownError : new Error("Error al cargar dashboard operativo"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    filters.date_from,
    filters.date_to,
    filters.fiscal_year,
    filters.org_unit_id,
    filters.territory_id,
    authIsLoading,
    accessToken,
    refreshKey,
  ]);

  return { data, isLoading, error, refetch };
}
