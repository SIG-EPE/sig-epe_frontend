"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  aggregateBulkMarkPaidTotals,
  createBulkMarkPaidOrchestrator,
  createBulkMarkPaidRun,
  getBulkMarkPaidRunProgress,
  type BulkMarkPaidLease,
  type BulkMarkPaidOrchestrator,
} from "@/hooks/use-bulk-mark-paid-orchestrator";
import { useBulkMarkPaid } from "@/hooks/use-requests";
import { parseBusinessDateTimeLocalToIso } from "@/lib/business-timezone";
import {
  BULK_MARK_PAID_ITEM_STATUS,
  BULK_MARK_PAID_RUN_PHASE,
  loadBulkMarkPaidRun,
  removeBulkMarkPaidRun,
  saveBulkMarkPaidRun,
  type BulkMarkPaidCommand,
  type BulkMarkPaidRunScope,
  type BulkMarkPaidRunState,
} from "@/lib/bulk-mark-paid-run-storage";
import { formatExactMoney, getExactPayablePrincipal } from "@/lib/payment-fx";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import { getRequestDisplayCode } from "@/lib/requests";
import {
  BULK_PAYMENT_RESULT_STATUS,
  type BulkMarkPaidResponse,
  type BulkRegisterPaymentItemInput,
  type MarkPaidItemResult,
  type PaymentRequest,
} from "@/types/requests";
import { PaymentValuation } from "./payment-valuation";

export type PreparedPaymentLease = Pick<
  BulkRegisterPaymentItemInput,
  "request_id" | "assignment_version" | "lease_token"
>;

interface BulkMarkPaidModalProps {
  requests: PaymentRequest[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: BulkMarkPaidResponse) => Promise<void> | void;
  prepareItems?: (
    requests: PaymentRequest[],
  ) => Promise<PreparedPaymentLease[]>;
  scope?: BulkMarkPaidRunScope | null;
  pageRequestIds?: string[];
  acquireLease?: (command: BulkMarkPaidCommand) => Promise<BulkMarkPaidLease>;
  releaseLease?: (requestId: string) => Promise<void>;
  refetchQueue?: (options: { force: boolean }) => Promise<void>;
  reconcileRun?: (run: BulkMarkPaidRunState) => Promise<MarkPaidItemResult[]>;
}

const VOLATILE_SCOPE: BulkMarkPaidRunScope = {
  userId: "volatile",
  sessionId: "volatile",
  pageIdentity: "volatile",
};

function isRunSettled(run: BulkMarkPaidRunState | null): boolean {
  return (
    run === null ||
    run.phase === BULK_MARK_PAID_RUN_PHASE.COMPLETED ||
    run.phase === BULK_MARK_PAID_RUN_PHASE.CANCELLED
  );
}

function toResponse(run: BulkMarkPaidRunState): BulkMarkPaidResponse {
  const totals = aggregateBulkMarkPaidTotals(run.results);
  return {
    items: Object.values(run.results),
    amounts_by_currency: totals.amountsByCurrency,
    unresolved_count: totals.unresolvedCount,
    totals_complete: totals.totalsComplete,
  };
}

function getStatusLabel(status: string): string {
  if (status === BULK_MARK_PAID_ITEM_STATUS.SUCCESS) return "Pagada";
  if (status === BULK_MARK_PAID_ITEM_STATUS.ALREADY_PROCESSED)
    return "Ya procesado · Pagada";
  if (status === BULK_MARK_PAID_ITEM_STATUS.FAILED) return "No registrada";
  if (status === BULK_MARK_PAID_ITEM_STATUS.LEASE_FAILED)
    return "Conflicto de asignación";
  if (status === BULK_MARK_PAID_ITEM_STATUS.AMBIGUOUS)
    return "Respuesta no confirmada";
  if (status === BULK_MARK_PAID_ITEM_STATUS.CANCELLED) return "No iniciada";
  if (status === BULK_MARK_PAID_ITEM_STATUS.ACQUIRING)
    return "Preparando sesión PAYMENT";
  if (status === BULK_MARK_PAID_ITEM_STATUS.SUBMITTING)
    return "Esperando respuesta del servidor";
  return "Pendiente";
}

export function BulkMarkPaidModal({
  requests,
  open,
  onOpenChange,
  onSuccess,
  prepareItems,
  scope,
  pageRequestIds,
  acquireLease,
  releaseLease,
  refetchQueue,
  reconcileRun,
}: BulkMarkPaidModalProps) {
  const { bulkMarkPaid } = useBulkMarkPaid();
  const [paidAt, setPaidAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<BulkMarkPaidRunState | null>(null);
  const controllerRef = useRef<BulkMarkPaidOrchestrator | null>(null);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const leaseCacheRef = useRef<Map<string, PreparedPaymentLease>>(new Map());
  const effectiveScope = scope ?? VOLATILE_SCOPE;
  const persistent = Boolean(scope);

  useEffect(() => {
    if (!open) return;
    setPaidAt("");
    setConfirmed(false);
    setError(null);
    setRun(scope ? loadBulkMarkPaidRun(scope) : null);
    controllerRef.current = null;
    leaseCacheRef.current.clear();
  }, [open, scope?.pageIdentity, scope?.sessionId, scope?.userId]);

  useEffect(() => {
    if (
      !open ||
      (!error &&
        run?.phase !== BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE &&
        run?.phase !== BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS &&
        run?.phase !== BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED)
    )
      return;
    actionRef.current?.focus();
  }, [error, open, run?.phase]);

  const validSize =
    requests.length > 0 &&
    requests.length <= 50 &&
    new Set(requests.map((row) => row.id)).size === requests.length;
  const progress = run ? getBulkMarkPaidRunProgress(run) : null;
  const totals = run ? aggregateBulkMarkPaidTotals(run.results) : null;
  const requestsById = new Map(
    requests.map((request) => [request.id, request]),
  );
  const commands = run?.commands ?? [];
  const activeRun = Boolean(run && !isRunSettled(run));

  async function legacyAcquire(
    command: BulkMarkPaidCommand,
  ): Promise<BulkMarkPaidLease> {
    let prepared = leaseCacheRef.current.get(command.requestId);
    if (!prepared) {
      if (!prepareItems)
        throw new Error("No se pudo preparar la sesión PAYMENT.");
      const leases = await prepareItems(requests);
      leaseCacheRef.current = new Map(
        leases.map((lease) => [lease.request_id, lease]),
      );
      prepared = leaseCacheRef.current.get(command.requestId);
    }
    if (!prepared)
      throw new Error("No se pudo preparar la asignación. Actualiza la cola.");
    return {
      requestId: prepared.request_id,
      assignmentVersion: prepared.assignment_version,
      leaseToken: prepared.lease_token,
    };
  }

  function createController(
    current: BulkMarkPaidRunState,
  ): BulkMarkPaidOrchestrator {
    const controller = createBulkMarkPaidOrchestrator(
      current,
      {
        acquireLease: acquireLease ?? legacyAcquire,
        releaseLease: releaseLease ?? (async () => undefined),
        postChunk: bulkMarkPaid,
        refetchQueue: refetchQueue ?? (async () => undefined),
        saveRun: (runScope, next) => {
          if (persistent) saveBulkMarkPaidRun(runScope, next);
          setRun(next);
        },
        removeRun: (runScope) => {
          if (persistent) removeBulkMarkPaidRun(runScope);
        },
        reconcileRun,
      },
      effectiveScope,
    );
    controllerRef.current = controller;
    return controller;
  }

  async function execute(
    action: (
      controller: BulkMarkPaidOrchestrator,
    ) => Promise<BulkMarkPaidRunState>,
    current: BulkMarkPaidRunState,
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    leaseCacheRef.current.clear();
    try {
      const finalRun = await action(createController(current));
      setRun(finalRun);
      if (finalRun.phase === BULK_MARK_PAID_RUN_PHASE.COMPLETED)
        await onSuccess(toResponse(finalRun));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo continuar el marcado masivo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function start(): Promise<void> {
    if (busy || run || !confirmed || !validSize) return;
    try {
      if (
        requests.some(
          (request) => request.currency !== "PEN" && request.currency !== "USD",
        )
      )
        throw new Error(
          "Moneda original sin resolver. Actualiza la solicitud.",
        );
      const timestamp = parseBusinessDateTimeLocalToIso(paidAt);
      const initial = createBulkMarkPaidRun({
        scope: effectiveScope,
        pageRequestIds: pageRequestIds ?? requests.map((row) => row.id),
        selected: requests.map((row) => ({
          requestId: row.id,
          originalAmount: getExactPayablePrincipal(row),
          originalCurrency: row.currency,
        })),
        paidAt: timestamp,
      });
      setRun(initial);
      if (persistent) saveBulkMarkPaidRun(effectiveScope, initial);
      await execute((controller) => controller.start(), initial);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo iniciar el marcado masivo.",
      );
    }
  }

  function cancel(): void {
    controllerRef.current?.cancel();
    const next = controllerRef.current?.getState();
    if (next) setRun(next);
  }

  function discard(): void {
    if (persistent) removeBulkMarkPaidRun(effectiveScope);
    setRun(null);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy && !activeRun) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-4xl" closeDisabled={busy || activeRun}>
        <DialogHeader>
          <DialogTitle>Marcar pagos realizados</DialogTitle>
          <DialogDescription>
            Confirma transferencias que ya ocurrieron, no órdenes de
            transferencia. Puedes procesar hasta 50 pagos de esta página; el
            sistema los envía internamente en grupos de hasta 5.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm">
            Referencia, constancia y TC final se completan después por cada
            pago. No se comparte cuenta, constancia, referencia ni tipo de
            cambio entre solicitudes.
          </p>

          {!run ? (
            <>
              <label htmlFor="bulk-paid-at">
                Fecha efectiva del pago (hora Perú)
              </label>
              <Input
                id="bulk-paid-at"
                type="datetime-local"
                value={paidAt}
                disabled={busy}
                onChange={(event) => setPaidAt(event.target.value)}
              />
              <ul className="space-y-2">
                {requests.map((row) => (
                  <li key={row.id} className="rounded-md border p-3">
                    {getRequestDisplayCode(row)} · Principal original:{" "}
                    {row.currency ?? "Moneda sin resolver"}{" "}
                    {getExactPayablePrincipal(row)}
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                Confirmo que las transferencias seleccionadas ya se realizaron
                realmente ({requests.length} pagos)
              </label>
            </>
          ) : null}

          {run && progress && totals ? (
            <section
              aria-label="Progreso del marcado de pagos"
              className="space-y-4"
            >
              <div
                aria-live="polite"
                role="status"
                className="rounded-md border bg-muted/40 p-3 text-sm"
              >
                Procesados {progress.completed + progress.failed} de{" "}
                {progress.total}. Exitosos {progress.completed}; fallidos{" "}
                {progress.failed}; pendientes {progress.pending}; sin confirmar{" "}
                {progress.unresolved}; reintentables {progress.retryable}.
              </div>
              <p className="text-sm text-muted-foreground">
                Grupo {Math.min(run.cursor + 1, run.chunks.length)} de{" "}
                {run.chunks.length}. Los resultados confirmados no se revierten
                al cancelar.
              </p>
              {Object.entries(totals.amountsByCurrency).map(
                ([currency, amount]) => (
                  <p key={currency} className="font-medium">
                    Principal confirmado: {formatExactMoney(amount, currency)}
                  </p>
                ),
              )}
              {!totals.totalsComplete ? (
                <p>
                  Importes exitosos sin moneda resuelta:{" "}
                  {totals.unresolvedCount}. No se muestra un total nominal
                  mezclado.
                </p>
              ) : null}
              <ul aria-label="Resultados por solicitud" className="space-y-2">
                {commands.map((command) => {
                  const item = run.items[command.requestId];
                  const result = run.results[command.requestId];
                  const request = requestsById.get(command.requestId);
                  return (
                    <li
                      key={command.requestId}
                      className="rounded-md border p-3 text-sm"
                    >
                      <p className="font-medium">
                        {request
                          ? getRequestDisplayCode(request)
                          : command.requestId}{" "}
                        · {getStatusLabel(item.status)}
                      </p>
                      {result ? (
                        <p>
                          {result.message} ({result.code})
                        </p>
                      ) : null}
                      {!result &&
                      item.errorMessage &&
                      commands.find(
                        (candidate) =>
                          run.items[candidate.requestId]?.errorMessage ===
                          item.errorMessage,
                      )?.requestId === command.requestId ? (
                        <p className="text-destructive">{item.errorMessage}</p>
                      ) : null}
                      {result?.original ? (
                        <p>
                          {formatExactMoney(
                            result.original.amount,
                            result.original.currency ?? "Moneda sin resolver",
                          )}
                        </p>
                      ) : null}
                      {result &&
                      result.outcome !== BULK_PAYMENT_RESULT_STATUS.FAILED ? (
                        <>
                          <p>
                            {getPaymentCompletenessPresentation({
                              missing_fields: result.missing_fields,
                            }).labels.join(" · ")}
                          </p>
                          <PaymentValuation valuation={result.valuation} />
                        </>
                      ) : result?.outcome ===
                        BULK_PAYMENT_RESULT_STATUS.FAILED ? (
                        <p className="text-destructive">
                          Actualiza la cola y revisa esta solicitud antes de
                          volver a operar. Los pagos exitosos no se reenviarán.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {run?.phase === BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 p-3 text-sm"
            >
              La respuesta del grupo actual es ambigua. Reintenta exactamente el
              mismo grupo para reconciliarlo antes de continuar. No inicies otra
              operación.{" "}
              {run.items[run.chunks[run.cursor]?.requestIds[0]]?.errorMessage}
            </p>
          ) : null}
          {run?.phase === BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 p-3 text-sm"
            >
              La operación está pausada antes de confirmar el siguiente grupo.
              Actualiza la asignación y reanuda con los mismos comandos.
            </p>
          ) : null}
          {run?.phase === BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 p-3 text-sm"
            >
              Hay una operación recuperada. Primero se consultará el estado
              autoritativo; después se reanudarán solo los pagos pendientes con
              sus mismas claves.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {isRunSettled(run) ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          ) : null}
          {run?.phase === BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED ? (
            <>
              <Button variant="outline" disabled={busy} onClick={discard}>
                Descartar después de revisar
              </Button>
              <Button
                ref={actionRef}
                disabled={busy}
                onClick={() =>
                  void execute((controller) => controller.resumeRecovery(), run)
                }
              >
                {busy ? "Reconciliando..." : "Reconciliar y reanudar"}
              </Button>
            </>
          ) : null}
          {run?.phase === BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE ? (
            <Button
              ref={actionRef}
              disabled={busy}
              onClick={() =>
                void execute((controller) => controller.resumeSafe(), run)
              }
            >
              {busy ? "Reanudando..." : "Reanudar pagos pendientes"}
            </Button>
          ) : null}
          {run?.phase === BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS ? (
            <Button
              ref={actionRef}
              disabled={busy}
              onClick={() =>
                void execute((controller) => controller.retryAmbiguous(), run)
              }
            >
              {busy
                ? "Reconciliando..."
                : "Reintentar misma confirmación (mismo grupo)"}
            </Button>
          ) : null}
          {run &&
          activeRun &&
          run.phase !== BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED ? (
            <Button variant="outline" onClick={cancel}>
              Cancelar pagos restantes
            </Button>
          ) : null}
          {!run ? (
            <Button
              ref={actionRef}
              disabled={busy || !confirmed || !paidAt || !validSize}
              onClick={() => void start()}
            >
              {busy ? "Iniciando..." : `Marcar ${requests.length} pagos`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
