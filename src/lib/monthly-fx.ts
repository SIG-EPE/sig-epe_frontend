import { api } from "@/lib/api-client";
import type {
  MonthlyFxMonth,
  MonthlyFxPolicy,
  MonthlyFxReferenceInput,
  MonthlyFxCloseInput,
} from "@/types/monthly-fx";

const ROOT = "/catalogs/monthly-fx";

/** Normalizar el separador sin convertir la tasa a punto flotante. */
export function normalizeMonthlyFxRate(value: string): string {
  return value.trim().replace(",", ".");
}

export function isMonthlyFxRate(value: string): boolean {
  return /^(?=.*[1-9])\d{1,12}(?:\.\d{1,12})?$/.test(value);
}

export const monthlyFxApi = {
  getPolicy(options?: RequestInit): Promise<MonthlyFxPolicy> {
    return api.get<MonthlyFxPolicy>(`${ROOT}/policy`, options);
  },
  getRates(options?: RequestInit): Promise<MonthlyFxMonth[]> {
    return api.get<MonthlyFxMonth[]>(`${ROOT}/rates`, {
      ...options,
      cache: "no-store",
    });
  },
  createReference(
    input: MonthlyFxReferenceInput,
    options?: RequestInit,
  ): Promise<MonthlyFxMonth> {
    return api.post<MonthlyFxMonth>(`${ROOT}/rates`, input, options);
  },
  retryReference(
    input: MonthlyFxReferenceInput,
    options?: RequestInit,
  ): Promise<MonthlyFxMonth> {
    // El servidor permite edición antes de uso y reintento idéntico después.
    return api.put<MonthlyFxMonth>(`${ROOT}/rates`, input, options);
  },
  closeMonth(
    input: MonthlyFxCloseInput,
    options?: RequestInit,
  ): Promise<MonthlyFxMonth> {
    return api.post<MonthlyFxMonth>(`${ROOT}/rates/close`, input, options);
  },
};
