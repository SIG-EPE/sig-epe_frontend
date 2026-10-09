"use client";

import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { isMonthlyFxRate, monthlyFxApi } from "@/lib/monthly-fx";
import type { MonthlyFxMonth, MonthlyFxPolicy } from "@/types/monthly-fx";
import { MonthlyFxPanel } from "./monthly-fx-panel";

interface MonthlyFxCatalogSectionProps {
  role: string | undefined;
}

function isMonthlyFxRows(value: unknown): value is MonthlyFxMonth[] {
  if (!Array.isArray(value)) return false;
  const keys = new Set<string>();
  return value.every((row: unknown) => {
    if (typeof row !== "object" || row === null) return false;
    const rate = row as Record<string, unknown>;
    const key = `${rate.year}-${rate.month}`;
    if (
      !Number.isInteger(rate.year) ||
      typeof rate.year !== "number" ||
      rate.year < 2000 ||
      rate.year > 2100 ||
      !Number.isInteger(rate.month) ||
      typeof rate.month !== "number" ||
      rate.month < 1 ||
      rate.month > 12 ||
      typeof rate.referenceRate !== "string" ||
      !isMonthlyFxRate(rate.referenceRate) ||
      (rate.closeRate !== null &&
        (typeof rate.closeRate !== "string" ||
          !isMonthlyFxRate(rate.closeRate))) ||
      keys.has(key)
    ) {
      return false;
    }
    keys.add(key);
    return true;
  });
}

export function MonthlyFxCatalogSection({
  role,
}: MonthlyFxCatalogSectionProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [policy, setPolicy] = useState<MonthlyFxPolicy | null>(null);
  const [months, setMonths] = useState<MonthlyFxMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isManager = role === ROLE_CODE.GIOF_MANAGER;
  const controller = useRef<AbortController | null>(null);

  async function refresh() {
    const signal = controller.current?.signal;
    signal?.throwIfAborted();
    try {
      const rates = await monthlyFxApi.getRates({ signal });
      signal?.throwIfAborted();
      if (!isMonthlyFxRows(rates)) {
        throw new Error("Invalid monthly FX catalog");
      }
      setMonths(rates);
      setError(null);
    } catch (cause) {
      if (signal?.aborted) throw cause;
      setMonths(null);
      setError(
        "Catálogo de TC mensual no disponible. No se pueden guardar referencias.",
      );
      throw cause;
    }
  }

  useEffect(() => {
    if (!isManager) return;
    const request = new AbortController();
    controller.current = request;
    setMonths(null);
    setPolicy(null);
    setError(null);
    let current = true;
    Promise.all([
      monthlyFxApi.getPolicy({ signal: request.signal }),
      monthlyFxApi.getRates({ signal: request.signal }),
    ])
      .then(([nextPolicy, nextRates]) => {
        if (
          typeof nextPolicy?.active !== "boolean" ||
          !isMonthlyFxRows(nextRates)
        ) {
          throw new Error("Invalid monthly FX catalog");
        }
        if (current) {
          setPolicy(nextPolicy);
          setMonths(nextRates);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (current) {
          setMonths(null);
          setError(
            cause instanceof ApiRequestError && cause.status === 403
              ? "No tienes permiso para consultar el TC mensual."
              : "Catálogo de TC mensual no disponible. No se pueden guardar referencias.",
          );
        }
      });
    return () => {
      current = false;
      request.abort();
    };
  }, [isManager]);

  if (!isManager) return null;
  return (
    <div className="space-y-4 rounded-lg border p-4 sm:p-5">
      {error ? (
        <p role="alert">{error}</p>
      ) : months === null || policy === null ? (
        <p role="status">Cargando tipo de cambio mensual…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {policy.active
              ? "Política mensual activa."
              : "Política mensual OFF: configurar referencias y cierres no activa nuevas solicitudes mensuales."}
          </p>
          <label className="grid max-w-40 gap-1 text-sm">
            Año
            <input
              type="number"
              disabled={busy}
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="h-10 rounded-md border bg-background px-3"
            />
          </label>
          {Number.isInteger(year) && year >= 2000 && year <= 2100 ? (
            <MonthlyFxPanel
              key={year}
              year={year}
              months={months}
              onCreateReference={(input) =>
                monthlyFxApi.createReference(input, {
                  signal: controller.current?.signal,
                })
              }
              onRetryReference={(input) =>
                monthlyFxApi.retryReference(input, {
                  signal: controller.current?.signal,
                })
              }
              onCloseMonth={(input) =>
                monthlyFxApi.closeMonth(input, {
                  signal: controller.current?.signal,
                })
              }
              onRefresh={refresh}
              onBusyChange={setBusy}
            />
          ) : (
            <p role="alert">Año fuera del rango permitido (2000–2100).</p>
          )}
        </>
      )}
    </div>
  );
}
