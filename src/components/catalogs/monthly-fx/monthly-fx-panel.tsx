"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { isMonthlyFxRate, normalizeMonthlyFxRate } from "@/lib/monthly-fx";
import { ApiRequestError } from "@/lib/api-client";
import type {
  MonthlyFxMonth,
  MonthlyFxReferenceInput,
  MonthlyFxCloseInput,
} from "@/types/monthly-fx";

interface MonthlyFxPanelProps {
  year: number;
  months: MonthlyFxMonth[];
  onCreateReference: (input: MonthlyFxReferenceInput) => Promise<unknown>;
  onRetryReference: (input: MonthlyFxReferenceInput) => Promise<unknown>;
  onRefresh: () => Promise<void>;
  onCloseMonth?: (input: MonthlyFxCloseInput) => Promise<MonthlyFxMonth>;
  onBusyChange?: (busy: boolean) => void;
}

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function isPartialMonthlyFxRate(value: string): boolean {
  return /^\d*(?:[.,]\d*)?$/.test(value);
}

/** Redondeo visual exacto; nunca se usa para guardar la tasa. */
function displayMonthlyFxRate(value: string): string {
  const [integer, fraction = ""] = value.split(".");
  const cents = BigInt(`${integer}${fraction.padEnd(2, "0").slice(0, 2)}`);
  const rounded = cents + (fraction[2] >= "5" ? BigInt(1) : BigInt(0));
  const digits = rounded.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function MonthlyFxPanel({
  year,
  months,
  onCreateReference,
  onRetryReference,
  onRefresh,
  onCloseMonth,
  onBusyChange,
}: MonthlyFxPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closeRate, setCloseRate] = useState("");
  const [confirmation, setConfirmation] =
    useState<MonthlyFxCloseInput | null>(null);
  const alive = useRef(true);
  const submitting = useRef(false);
  // Una edición rechazada requiere borrar/corregir antes de guardar; no unir 1e3 en 13.
  const rejectedReferenceEdit = useRef(false);
  const rejectedCloseEdit = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const byMonth = new Map(
    months
      .filter((row) => row.year === year && row.month >= 1 && row.month <= 12)
      .map((row) => [row.month, row]),
  );
  const selected = byMonth.get(selectedMonth);
  const publishedCloseRate = selected?.closeRate;
  const isClosed = Boolean(
    publishedCloseRate && isMonthlyFxRate(publishedCloseRate),
  );
  const confirmationClosed = Boolean(
    confirmation && byMonth.get(confirmation.month)?.closeRate,
  );
  useEffect(() => {
    if (confirmationClosed) setConfirmation(null);
  }, [confirmationClosed]);
  const normalizedRate = normalizeMonthlyFxRate(rate);
  const validRate = isMonthlyFxRate(normalizedRate);
  const sameRate = selected && normalizedRate === selected.referenceRate;

  async function handleFailure(cause: unknown, closing: boolean) {
    if (!alive.current) return;
    const status = cause instanceof ApiRequestError ? cause.status : null;
    setError(
      status === 409
        ? closing
          ? "Conflicto: cierre inmutable o referencia no disponible. Revisa el valor del servidor; no se sobrescribió."
          : "Conflicto: referencia congelada por uso financiero o cierre, o catálogo actualizado. Revisa el valor del servidor."
        : status === 404
          ? "Referencia no disponible. Configura primero la referencia del mes y vuelve a consultar."
          : status === 401 || status === 403
            ? "No tienes permiso para gestionar el TC mensual."
            : "No se pudo guardar el TC mensual. Conserva el valor e inténtalo más tarde.",
    );
    if (status === 409 || status === 404) {
      try {
        await onRefresh();
      } catch {
        /* El catálogo bloquea escritura si falla la recarga. */
      }
    }
  }

  async function confirmClose() {
    if (
      !confirmation ||
      confirmationClosed ||
      !onCloseMonth ||
      submitting.current ||
      !alive.current
    ) {
      return;
    }
    submitting.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await onCloseMonth(confirmation);
      if (!alive.current) return;
      await onRefresh();
      if (!alive.current) return;
      setConfirmation(null);
      toast.success(
        "Cierre confirmado por el servidor. Un reintento idéntico no genera cambios financieros nuevos.",
      );
    } catch (cause) {
      if (alive.current) setConfirmation(null);
      await handleFailure(cause, true);
    } finally {
      submitting.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy || selected?.closeRate) return;
    if (!validRate || rejectedReferenceEdit.current) {
      setError(
        "Ingresa un TC positivo en PEN por USD (punto o coma, máximo 12 enteros y 12 decimales).",
      );
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    submitting.current = true;
    setError(null);
    const input = { year, month: selectedMonth, referenceRate: normalizedRate };
    try {
      if (selected) await onRetryReference(input);
      else await onCreateReference(input);
      if (!alive.current) return;
      await onRefresh();
      if (!alive.current) return;
      setRate("");
      toast.success("Referencia confirmada por el servidor.");
    } catch (cause) {
      await handleFailure(cause, false);
    } finally {
      submitting.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  return (
    <section aria-label="Tipo de cambio mensual" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          Tipo de cambio mensual · {year}
        </h2>
        <p className="text-sm text-muted-foreground">PEN por USD</p>
        <p className="text-sm text-muted-foreground">
          Configuración mensual en preparación; referencias editables antes del
          primer uso financiero. El cierre publicado es irreversible.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-2">
                Mes
              </th>
              <th scope="col" className="p-2">
                Referencial
              </th>
              <th scope="col" className="p-2">
                Cierre
              </th>
              <th scope="col" className="p-2">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((name, index) => {
              const row = byMonth.get(index + 1);
              return (
                <tr key={name} className="border-t">
                  <th scope="row" className="p-2 font-medium">
                    {name}
                  </th>
                  <td className="p-2">
                    {row ? displayMonthlyFxRate(row.referenceRate) : "—"}
                  </td>
                  <td className="p-2">
                    {row
                      ? row.closeRate === null
                        ? "Pendiente"
                        : displayMonthlyFxRate(row.closeRate)
                      : "—"}
                  </td>
                  <td className="p-2">
                    {row
                      ? row.closeRate === null
                        ? "Provisional"
                        : "Cerrado"
                      : "Sin referencia"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="grid gap-1 text-sm">
          Mes
          <select
            disabled={busy || confirmation !== null}
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(Number(event.target.value));
              setRate("");
              setCloseRate("");
              rejectedReferenceEdit.current = false;
              rejectedCloseEdit.current = false;
              setError(null);
            }}
            className="h-10 rounded-md border bg-background px-3"
          >
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          TC referencial (PEN por USD)
          <input
            disabled={busy || Boolean(selected?.closeRate)}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            onChange={(event) => {
              if (isPartialMonthlyFxRate(event.target.value)) {
                if (event.target.value.length < rate.length) {
                  rejectedReferenceEdit.current = false;
                }
                setRate(event.target.value);
              } else {
                rejectedReferenceEdit.current = true;
              }
            }}
            onPaste={(event) => {
              if (!isPartialMonthlyFxRate(event.clipboardData.getData("text"))) {
                event.preventDefault();
                rejectedReferenceEdit.current = true;
              }
            }}
            className="h-10 min-w-0 rounded-md border bg-background px-3"
            aria-invalid={Boolean(error)}
          />
        </label>
        {!selected?.closeRate && (
          <button
            type="submit"
            disabled={busy}
            className="h-10 rounded-md border px-3 disabled:opacity-50"
          >
            {busy
              ? "Guardando…"
              : selected
                ? sameRate
                  ? "Reintentar misma referencia"
                  : "Editar referencia"
                : "Guardar referencia"}
          </button>
        )}
        {selected && (
          <p className="text-sm text-muted-foreground">
            Referencia existente: {displayMonthlyFxRate(selected.referenceRate)}.{" "}
            {selected.closeRate
              ? "Referencia congelada por cierre publicado."
              : "El servidor permite editar solo antes del primer uso financiero; después devuelve conflicto."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-3">
            {error}
          </p>
        )}
      </form>
      <div className="space-y-3">
        <label className="grid gap-1 text-sm">
          TC de cierre (PEN por USD)
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            readOnly={isClosed}
            value={isClosed ? displayMonthlyFxRate(publishedCloseRate!) : closeRate}
            onChange={(event) => {
              if (isClosed) return;
              if (isPartialMonthlyFxRate(event.target.value)) {
                if (event.target.value.length < closeRate.length) {
                  rejectedCloseEdit.current = false;
                }
                setCloseRate(event.target.value);
              } else {
                rejectedCloseEdit.current = true;
              }
            }}
            onPaste={(event) => {
              if (isClosed) {
                event.preventDefault();
                return;
              }
              if (!isPartialMonthlyFxRate(event.clipboardData.getData("text"))) {
                event.preventDefault();
                rejectedCloseEdit.current = true;
              }
            }}
            disabled={busy || !selected || !onCloseMonth}
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
        {!selected && (
          <p className="text-sm">
            Configura primero la referencia del mes para publicar el cierre.
          </p>
        )}
        {isClosed && (
          <p className="text-sm">
            Cierre inmutable: {displayMonthlyFxRate(publishedCloseRate!)}. El mes
            está cerrado; no se puede editar ni volver a publicar el cierre.
          </p>
        )}
        {!isClosed && (
          <button
            type="button"
            disabled={busy || !selected || !onCloseMonth}
            className="h-10 rounded-md border px-3 disabled:opacity-50"
            onClick={() => {
              if (isClosed || busy || !selected || !onCloseMonth) return;
              const normalized = normalizeMonthlyFxRate(closeRate);
              if (!isMonthlyFxRate(normalized) || rejectedCloseEdit.current) {
                setError(
                  "Ingresa un TC de cierre positivo (punto o coma, máximo 12 enteros y 12 decimales).",
                );
                return;
              }
              setError(null);
              setConfirmation({
                year,
                month: selectedMonth,
                closeRate: normalized,
              });
            }}
          >
            Publicar cierre
          </button>
        )}
      </div>
      <Dialog
        open={confirmation !== null && !confirmationClosed}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent closeDisabled={busy}>
          <DialogTitle>Confirmar cierre mensual</DialogTitle>
          <DialogDescription>
            Publicación irreversible: actualiza los valores PEN de pagos
            mensuales elegibles del mes; los importes USD originales no cambian.
            No activa nuevas solicitudes mensuales.
          </DialogDescription>
          <p>
            {MONTHS[(confirmation?.month ?? 1) - 1]} {confirmation?.year} · TC{" "}
            {confirmation && displayMonthlyFxRate(confirmation.closeRate)}
            {confirmation &&
              displayMonthlyFxRate(confirmation.closeRate) !==
                confirmation.closeRate &&
              ` (${confirmation.closeRate})`}{" "}
            PEN por USD
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={busy} onClick={confirmClose}>
              {busy ? "Publicando…" : "Confirmar cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
