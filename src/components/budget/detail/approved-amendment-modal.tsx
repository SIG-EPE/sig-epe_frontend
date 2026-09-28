"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api-client";
import {
  APPROVED_FREQUENCY,
  APPROVED_IMPORTANCE,
  approvedAmendmentDistribution,
  buildApprovedAmendment,
  seedApprovedAmendment,
  type ApprovedAmendmentErrors,
  type ApprovedAmendmentFields,
} from "@/lib/approved-amendment";
import {
  useApprovedAmendment,
  type ApprovedAmendmentWarning,
} from "@/hooks/use-approved-amendment";
import type { PlanningLine } from "@/types/budget";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const EXACT_DECIMALS_ERROR =
  "El detalle no contiene los decimales exactos de precio, cantidad y los doce meses. No se completarán meses faltantes ni se redondearán valores. Solicita la proyección decimal exacta del servidor.";
const CONFLICT_ERROR =
  "La línea cambió durante la lectura. Cierra y recarga el detalle antes de editar.";

function validRevision(
  value: { line_id: string; revision: string },
  id: string,
) {
  return (
    value.line_id === id &&
    /^(0|[1-9]\d{0,18})$/.test(value.revision) &&
    BigInt(value.revision) <= BigInt("9223372036854775806")
  );
}

async function readMatchingSnapshot(
  id: string,
  readRevision: (
    signal?: AbortSignal,
  ) => Promise<{ line_id: string; revision: string }>,
  readDetail: (signal?: AbortSignal) => Promise<PlanningLine>,
  signal: AbortSignal,
) {
  // Dos intentos como máximo; ninguna lectura previa del detalle autoriza la edición.
  for (let attempt = 0; attempt < 2; attempt++) {
    const first = await readRevision(signal);
    if (signal.aborted) throw new Error("aborted");
    if (!validRevision(first, id)) throw new Error("invalid-revision");
    const detail = await readDetail(signal);
    if (signal.aborted) throw new Error("aborted");
    if (detail?.id !== id || detail.status !== "APPROVED")
      throw new Error("invalid-detail");
    const second = await readRevision(signal);
    if (signal.aborted) throw new Error("aborted");
    if (!validRevision(second, id)) throw new Error("invalid-revision");
    if (first.revision === second.revision) {
      if (!seedApprovedAmendment(detail)) throw new Error("invalid-decimals");
      return { line: detail, revision: second.revision };
    }
  }
  throw new Error("conflict");
}

export function ApprovedAmendmentWarnings({
  warnings,
}: {
  warnings: ApprovedAmendmentWarning[];
}) {
  if (!warnings.length) return null;
  return (
    <Alert role="status">
      <AlertDescription>
        <strong>Advertencias financieras (no impiden el guardado)</strong>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${warning.scope}-${warning.month ?? warning.fiscalYear ?? "total"}-${index}`}
            >
              {warning.code === "UNKNOWN_VALUATION" &&
              warning.scope === "UNIT_YEAR" ? (
                <>
                  <span>
                    No se pudo comprobar el techo anual de la unidad: falta el
                    techo o una valoración completa en PEN. Los importes
                    mensuales se revisan por separado.
                  </span>{" "}
                  (año {warning.fiscalYear}).
                </>
              ) : (
                <>
                  {warning.status === "BREACH"
                    ? "Incumplimiento"
                    : warning.status === "UNKNOWN"
                      ? "Valoración desconocida"
                      : "Aviso"}
                  :{" "}
                  {warning.code === "BELOW_EXPOSURE"
                    ? "planificación por debajo de la exposición"
                    : warning.code === "CEILING_EXCEEDED"
                      ? "techo de la unidad excedido"
                      : warning.code === "PENDING_PROJECTED"
                        ? "compromisos proyectados pendientes"
                        : warning.code === "PENDING_PRESENT"
                          ? "compromisos pendientes"
                          : warning.code === "HISTORICAL_OVERRUN"
                            ? "exceso histórico"
                            : "valoración no disponible"}{" "}
                  (
                  {warning.scope === "MONTH"
                    ? `mes ${warning.month}`
                    : warning.scope === "UNIT_YEAR"
                      ? `año ${warning.fiscalYear}`
                      : "total"}
                  ).
                </>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

interface Props {
  line: PlanningLine;
  onClose: () => void;
  onSuccess: (warnings: ApprovedAmendmentWarning[]) => void;
}

export function ApprovedAmendmentModal({ line, onClose, onSuccess }: Props) {
  const { readRevision, readDetail, save, isSaving } = useApprovedAmendment(
    line.id,
  );
  const [fields, setFields] = useState<ApprovedAmendmentFields | null>(null);
  const [snapshotLine, setSnapshotLine] = useState<PlanningLine | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const [revision, setRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ApprovedAmendmentErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    line: PlanningLine;
    revision: string;
  } | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setFields(null);
    setSnapshotLine(null);
    setRevision(null);
    setLoadError(null);
    setConflict(null);
    setConflictLoading(false);
    setSaveError(null);
    setLoading(true);
    readMatchingSnapshot(line.id, readRevision, readDetail, controller.signal)
      .then((result) => {
        if (generation.current !== current || controller.signal.aborted) return;
        setSnapshotLine(result.line);
        setFields(seedApprovedAmendment(result.line));
        setRevision(result.revision);
      })
      .catch((error: unknown) => {
        if (generation.current !== current || controller.signal.aborted) return;
        setLoadError(
          error instanceof Error && error.message === "invalid-decimals"
            ? EXACT_DECIMALS_ERROR
            : error instanceof Error && error.message === "conflict"
              ? CONFLICT_ERROR
              : "No se pudo cargar el detalle y la revisión aprobada. Cierra y recarga antes de editar.",
        );
      })
      .finally(() => {
        if (generation.current === current && !controller.signal.aborted)
          setLoading(false);
      });
    return () => {
      generation.current++;
      controller.abort();
    };
    // Solo cambio de identidad: jamás resembrar los campos durante una edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]);

  const hasCatalogResource = snapshotLine?.resource_id != null;
  const validation =
    fields && revision !== null
      ? buildApprovedAmendment(fields, revision, hasCatalogResource)
      : null;
  const distribution = fields
    ? approvedAmendmentDistribution(fields.monthly, validation?.total ?? null)
    : null;
  const remaining = distribution?.remaining;
  const balance =
    remaining === null || remaining === undefined
      ? "Balance: No calculable (revisa precio, cantidad y los doce meses)"
      : remaining.startsWith("-")
        ? `Exceso distribuido: S/ ${remaining.slice(1)}`
        : remaining === "0.00"
          ? "Cuadrado: S/ 0.00 restante por repartir"
          : `Restante por repartir: S/ ${remaining}`;
  const field = (
    key: "unit_price" | "quantity" | "resource_description",
    label: string,
  ) =>
    fields && (
      <div className="space-y-1">
        <Label htmlFor={`amend-${key}`}>{label}</Label>
        {key === "resource_description" ? (
          <Textarea
            id={`amend-${key}`}
            maxLength={2000}
            value={fields[key]}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `amend-${key}-error` : undefined}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          />
        ) : (
          <Input
            id={`amend-${key}`}
            type="text"
            inputMode="decimal"
            value={fields[key]}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `amend-${key}-error` : undefined}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          />
        )}
        {errors[key] && (
          <p
            id={`amend-${key}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {errors[key]}
          </p>
        )}
      </div>
    );

  async function submit() {
    if (
      !fields ||
      revision === null ||
      isSaving ||
      saving.current ||
      conflict ||
      !snapshotLine ||
      loadError
    )
      return;
    const result = buildApprovedAmendment(fields, revision, hasCatalogResource);
    setErrors(result.errors);
    if (!result.request) return;
    setSaveError(null);
    saving.current = true;
    const current = generation.current;
    try {
      const updated = await save(result.request);
      if (generation.current !== current) return;
      toast.success("Presupuesto aprobado actualizado");
      onSuccess(updated.warnings);
    } catch (error) {
      if (generation.current !== current) return;
      if (error instanceof ApiRequestError && error.status === 409) {
        setConflictLoading(true);
        setSaveError(
          "La línea cambió. Tus cambios siguen aquí; revisa la versión actual antes de volver a guardar.",
        );
        try {
          const controller = new AbortController();
          const latest = await readMatchingSnapshot(
            line.id,
            readRevision,
            readDetail,
            controller.signal,
          );
          if (generation.current !== current) return;
          setConflict(latest);
        } catch {
          if (generation.current !== current) return;
          setSaveError(
            "No se pudo cargar el detalle y la revisión actual. Conservamos tus cambios; cierra y recarga o vuelve a intentar.",
          );
        } finally {
          if (generation.current === current) setConflictLoading(false);
        }
      } else if (error instanceof ApiRequestError && error.status === 403)
        setSaveError(
          "No tienes permiso para editar este presupuesto aprobado.",
        );
      else if (error instanceof ApiRequestError && error.status === 400)
        setSaveError(
          "El servidor rechazó los datos. Revisa los campos y vuelve a intentar.",
        );
      else
        setSaveError(
          "No se pudo guardar. No se confirma ningún cambio; vuelve a intentar.",
        );
    } finally {
      saving.current = false;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar presupuesto aprobado</DialogTitle>
          <DialogDescription>
            Solo precio, cantidad, programación mensual, importancia, frecuencia
            y descripción libre sin recurso de catálogo. La identidad,
            jerarquía, fuentes y ejecución permanecen sin cambios. Las
            advertencias financieras son informativas.
          </DialogDescription>
        </DialogHeader>
        {loading && <p role="status">Cargando detalle y revisión aprobada…</p>}
        {loadError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {loadError}{" "}
              <Button type="button" variant="outline" onClick={() => onClose()}>
                Cerrar y recargar
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!loading && !loadError && fields && revision !== null && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Revisión {revision} · {snapshotLine?.line_code ?? line.id} ·{" "}
              {snapshotLine?.fiscalYear?.year ?? "Año fiscal sin dato"} ·{" "}
              {snapshotLine?.organizationalUnit?.name ?? "Unidad sin dato"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("unit_price", "Precio unitario (S/)")}
              {field("quantity", "Cantidad")}
            </div>
            <div
              className="space-y-1 rounded-md border p-3 text-sm"
              aria-label="Resumen de distribución financiera"
            >
              <p>
                Total derivado (precio × cantidad):{" "}
                {validation?.total !== null && validation?.total !== undefined
                  ? `S/ ${validation.total}`
                  : "No calculable"}
              </p>
              <p>
                Distribuido en 12 meses:{" "}
                {distribution?.distributed !== null &&
                distribution?.distributed !== undefined
                  ? `S/ ${distribution.distributed}`
                  : "No calculable"}
              </p>
              <p aria-live="polite" aria-atomic="true" className="font-medium">
                {balance}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["importance", "frequency"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`amend-${key}`}>
                    {key === "importance" ? "Importancia" : "Frecuencia"}
                  </Label>
                  <select
                    id={`amend-${key}`}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={fields[key]}
                    aria-invalid={Boolean(errors[key])}
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                  >
                    <option value="">Seleccione</option>
                    {(key === "importance"
                      ? APPROVED_IMPORTANCE
                      : APPROVED_FREQUENCY
                    ).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors[key] && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors[key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {!hasCatalogResource &&
              field("resource_description", "Descripción libre del recurso")}
            {hasCatalogResource && (
              <p className="text-sm text-muted-foreground">
                Recurso de catálogo: {snapshotLine?.resource_description} (no
                editable)
              </p>
            )}
            <fieldset className="space-y-3">
              <legend className="font-medium">
                Programación de los doce meses (S/)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.monthly.map((entry, index) => (
                  <div key={entry.month} className="space-y-1">
                    <Label htmlFor={`amend-month-${entry.month}`}>
                      {MONTHS[entry.month - 1]}
                    </Label>
                    <Input
                      id={`amend-month-${entry.month}`}
                      type="text"
                      inputMode="decimal"
                      value={entry.planned_amount}
                      aria-invalid={Boolean(errors.monthly)}
                      onChange={(e) =>
                        setFields({
                          ...fields,
                          monthly: fields.monthly.map((row, i) =>
                            i === index
                              ? { ...row, planned_amount: e.target.value }
                              : row,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              {errors.monthly && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.monthly}
                </p>
              )}
            </fieldset>
            {conflict && (
              <Alert role="alert">
                <AlertDescription>
                  La versión actual es {conflict.revision}; total actual S/{" "}
                  {conflict.line.total_cost}, precio {conflict.line.unit_price},
                  cantidad {conflict.line.quantity}. Tus entradas no se
                  reemplazaron. Revisa el detalle actualizado y confirma
                  expresamente si deseas enviar tus valores sobre esta revisión.
                  <p>
                    Importancia actual: {conflict.line.importance ?? "Sin dato"}
                    . Frecuencia actual: {conflict.line.frequency ?? "Sin dato"}
                    . Descripción actual: {conflict.line.resource_description}.
                  </p>
                  <p>
                    Meses actuales:{" "}
                    {(
                      conflict.line.monthlyDistribution ??
                      conflict.line.monthly_distribution ??
                      []
                    )
                      .map(
                        (row) =>
                          `${MONTHS[row.month - 1]}: ${row.monthly_programmed_decimal ?? "sin decimal exacto"}`,
                      )
                      .join(" · ") || "Sin programación disponible"}
                    .
                  </p>{" "}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRevision(conflict.revision);
                      setConflict(null);
                      setSaveError(null);
                    }}
                  >
                    Usar revisión actual y conservar mis entradas
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={
              loading ||
              !!loadError ||
              !fields ||
              revision === null ||
              isSaving ||
              conflictLoading ||
              !!conflict ||
              Boolean(saveError?.includes("No se pudo cargar el detalle")) ||
              Boolean(saveError?.includes("La línea ya no está aprobada")) ||
              Boolean(saveError?.includes("No tienes permiso"))
            }
            onClick={() => void submit()}
          >
            {isSaving ? "Guardando…" : "Guardar presupuesto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
