import { ApiRequestError } from "@/lib/api-client";
import {
  BULK_MARK_PAID_ITEM_STATUS,
  BULK_MARK_PAID_RUN_PHASE,
  BULK_MARK_PAID_RUN_STORAGE_VERSION,
  createBulkMarkPaidChunkFingerprint,
  createBulkMarkPaidCommandFingerprint,
  getBulkMarkPaidScopeFingerprint,
  getBulkMarkPaidPageFingerprint,
  type BulkMarkPaidCommand,
  type BulkMarkPaidItemState,
  type BulkMarkPaidRunScope,
  type BulkMarkPaidRunState,
} from "@/lib/bulk-mark-paid-run-storage";
import {
  BULK_PAYMENT_RESULT_STATUS,
  type BulkMarkPaidInput,
  type BulkMarkPaidResponse,
  type MarkPaidItemResult,
  type RequestCurrency,
} from "@/types/requests";

const MAX_RUN_ITEMS = 50;
const CHUNK_SIZE = 5;

export const BULK_MARK_PAID_POST_ERROR_KIND = {
  SAFE: "SAFE",
  AMBIGUOUS: "AMBIGUOUS",
} as const;

export type BulkMarkPaidPostErrorKind =
  (typeof BULK_MARK_PAID_POST_ERROR_KIND)[keyof typeof BULK_MARK_PAID_POST_ERROR_KIND];

export const BULK_MARK_PAID_RUN_ACTION = {
  PATCH: "PATCH",
  ITEM_STATUS: "ITEM_STATUS",
  APPLY_RESULTS: "APPLY_RESULTS",
  CANCEL_PENDING: "CANCEL_PENDING",
} as const;

interface PatchRunAction {
  type: typeof BULK_MARK_PAID_RUN_ACTION.PATCH;
  patch: Partial<BulkMarkPaidRunState>;
}

interface ItemStatusAction {
  type: typeof BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS;
  requestIds: string[];
  status: BulkMarkPaidItemState["status"];
  errorCode?: string | null;
  errorMessage?: string | null;
}

interface ApplyResultsAction {
  type: typeof BULK_MARK_PAID_RUN_ACTION.APPLY_RESULTS;
  results: MarkPaidItemResult[];
}

interface CancelPendingAction {
  type: typeof BULK_MARK_PAID_RUN_ACTION.CANCEL_PENDING;
}

export type BulkMarkPaidRunAction =
  PatchRunAction | ItemStatusAction | ApplyResultsAction | CancelPendingAction;

export interface BulkMarkPaidSnapshotItem {
  requestId: string;
  originalAmount: string;
  originalCurrency: RequestCurrency | null;
}

interface CreateBulkMarkPaidRunInput {
  scope: BulkMarkPaidRunScope;
  pageRequestIds: string[];
  selected: BulkMarkPaidSnapshotItem[];
  paidAt: string;
  createId?: () => string;
  now?: () => string;
}

export interface BulkMarkPaidLease {
  requestId: string;
  assignmentVersion: number;
  leaseToken: string;
}

export interface BulkMarkPaidRefetchOptions {
  force: boolean;
}

export interface BulkMarkPaidOrchestratorDependencies {
  acquireLease: (command: BulkMarkPaidCommand) => Promise<BulkMarkPaidLease>;
  releaseLease: (requestId: string) => Promise<void>;
  postChunk: (input: BulkMarkPaidInput) => Promise<BulkMarkPaidResponse>;
  refetchQueue: (options: BulkMarkPaidRefetchOptions) => Promise<void>;
  saveRun: (scope: BulkMarkPaidRunScope, run: BulkMarkPaidRunState) => void;
  removeRun: (scope: BulkMarkPaidRunScope) => void;
  classifyPostError?: (error: unknown) => BulkMarkPaidPostErrorKind;
  reconcileRun?: (run: BulkMarkPaidRunState) => Promise<MarkPaidItemResult[]>;
  now?: () => string;
}

export interface BulkMarkPaidTotals {
  amountsByCurrency: Partial<Record<RequestCurrency, string>>;
  unresolvedCount: number;
  totalsComplete: boolean;
}

export interface BulkMarkPaidRunProgress {
  completed: number;
  failed: number;
  pending: number;
  unresolved: number;
  retryable: number;
  cancelled: number;
  total: number;
}

export interface BulkMarkPaidOrchestrator {
  getState: () => BulkMarkPaidRunState;
  start: () => Promise<BulkMarkPaidRunState>;
  resumeSafe: () => Promise<BulkMarkPaidRunState>;
  retryAmbiguous: () => Promise<BulkMarkPaidRunState>;
  resumeRecovery: () => Promise<BulkMarkPaidRunState>;
  cancel: () => void;
  discard: () => void;
}

function defaultId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  throw new Error("No se pudo generar una clave idempotente segura.");
}

function isExactMoney(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value);
}

export function createBulkMarkPaidRun({
  scope,
  pageRequestIds,
  selected,
  paidAt,
  createId = defaultId,
  now = () => new Date().toISOString(),
}: CreateBulkMarkPaidRunInput): BulkMarkPaidRunState {
  if (selected.length < 1 || selected.length > MAX_RUN_ITEMS)
    throw new Error("Selecciona entre 1 y 50 pagos.");
  if (!paidAt || !Number.isFinite(Date.parse(paidAt)))
    throw new Error("La fecha efectiva del pago no es válida.");
  const selectedIds = selected.map((item) => item.requestId);
  if (new Set(selectedIds).size !== selectedIds.length)
    throw new Error("La selección contiene solicitudes duplicadas.");
  const pageSet = new Set(pageRequestIds);
  if (selectedIds.some((requestId) => !pageSet.has(requestId)))
    throw new Error("La selección debe pertenecer a la página actual.");
  if (
    selected.some(
      (item) =>
        (item.originalCurrency !== "PEN" && item.originalCurrency !== "USD") ||
        !isExactMoney(item.originalAmount),
    )
  )
    throw new Error("Existe un monto o moneda original sin resolver.");

  const runId = createId();
  const selectedById = new Map(selected.map((item) => [item.requestId, item]));
  const orderedSelected = pageRequestIds
    .map((requestId) => selectedById.get(requestId))
    .filter((item): item is BulkMarkPaidSnapshotItem => Boolean(item));
  const commands = orderedSelected.map((item): BulkMarkPaidCommand => {
    const base = {
      requestId: item.requestId,
      commandId: createId(),
      expectedOriginalAmount: item.originalAmount,
      expectedOriginalCurrency: item.originalCurrency as RequestCurrency,
      paidAt,
    };
    return {
      ...base,
      fingerprint: createBulkMarkPaidCommandFingerprint(base),
    };
  });
  if (
    new Set(commands.map((command) => command.commandId)).size !==
    commands.length
  )
    throw new Error("No se pudieron generar claves idempotentes únicas.");
  const chunks = Array.from(
    { length: Math.ceil(commands.length / CHUNK_SIZE) },
    (_, index) => {
      const chunkCommands = commands.slice(
        index * CHUNK_SIZE,
        (index + 1) * CHUNK_SIZE,
      );
      return {
        id: `${runId}:${index}`,
        index,
        requestIds: chunkCommands.map((command) => command.requestId),
        fingerprint: createBulkMarkPaidChunkFingerprint(chunkCommands),
      };
    },
  );
  const timestamp = now();
  return {
    version: BULK_MARK_PAID_RUN_STORAGE_VERSION,
    scopeFingerprint: getBulkMarkPaidScopeFingerprint(scope),
    runId,
    pageFingerprint: getBulkMarkPaidPageFingerprint(scope.pageIdentity),
    createdAt: timestamp,
    updatedAt: timestamp,
    phase: BULK_MARK_PAID_RUN_PHASE.READY,
    cursor: 0,
    cancelRequested: false,
    commands,
    chunks,
    items: Object.fromEntries(
      commands.map((command) => [
        command.requestId,
        {
          requestId: command.requestId,
          status: BULK_MARK_PAID_ITEM_STATUS.PENDING,
          errorCode: null,
          errorMessage: null,
        },
      ]),
    ),
    results: {},
    ambiguousIntent: null,
  };
}

export function bulkMarkPaidRunReducer(
  state: BulkMarkPaidRunState,
  action: BulkMarkPaidRunAction,
): BulkMarkPaidRunState {
  if (action.type === BULK_MARK_PAID_RUN_ACTION.PATCH)
    return { ...state, ...action.patch };
  if (action.type === BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS) {
    const items = { ...state.items };
    for (const requestId of action.requestIds) {
      const current = items[requestId];
      if (!current) continue;
      items[requestId] = {
        ...current,
        status: action.status,
        errorCode: action.errorCode ?? null,
        errorMessage: action.errorMessage ?? null,
      };
    }
    return { ...state, items };
  }
  if (action.type === BULK_MARK_PAID_RUN_ACTION.APPLY_RESULTS) {
    const items = { ...state.items };
    const results = { ...state.results };
    for (const result of action.results) {
      results[result.request_id] = result;
      const current = items[result.request_id];
      if (!current) continue;
      items[result.request_id] = {
        ...current,
        status:
          result.outcome === BULK_PAYMENT_RESULT_STATUS.SUCCESS
            ? BULK_MARK_PAID_ITEM_STATUS.SUCCESS
            : result.outcome === BULK_PAYMENT_RESULT_STATUS.ALREADY_PROCESSED
              ? BULK_MARK_PAID_ITEM_STATUS.ALREADY_PROCESSED
              : BULK_MARK_PAID_ITEM_STATUS.FAILED,
        errorCode:
          result.outcome === BULK_PAYMENT_RESULT_STATUS.FAILED
            ? result.code
            : null,
        errorMessage:
          result.outcome === BULK_PAYMENT_RESULT_STATUS.FAILED
            ? result.message
            : null,
      };
    }
    return { ...state, items, results };
  }
  const items = { ...state.items };
  for (const [requestId, item] of Object.entries(items)) {
    if (
      item.status === BULK_MARK_PAID_ITEM_STATUS.PENDING ||
      item.status === BULK_MARK_PAID_ITEM_STATUS.LEASE_FAILED
    )
      items[requestId] = {
        ...item,
        status: BULK_MARK_PAID_ITEM_STATUS.CANCELLED,
      };
  }
  return {
    ...state,
    items,
    phase: BULK_MARK_PAID_RUN_PHASE.CANCELLED,
    cancelRequested: true,
  };
}

function parseCents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return (
    BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"))
  );
}

function formatCents(value: bigint): string {
  const digits = value.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function aggregateBulkMarkPaidTotals(
  results: Record<string, MarkPaidItemResult>,
): BulkMarkPaidTotals {
  const totals: Partial<Record<RequestCurrency, bigint>> = {};
  let unresolvedCount = 0;
  for (const result of Object.values(results)) {
    if (result.outcome === BULK_PAYMENT_RESULT_STATUS.FAILED) continue;
    const currency = result.original?.currency;
    const cents = result.original ? parseCents(result.original.amount) : null;
    if ((currency !== "PEN" && currency !== "USD") || cents === null) {
      unresolvedCount += 1;
      continue;
    }
    totals[currency] = (totals[currency] ?? BigInt(0)) + cents;
  }
  return {
    amountsByCurrency: Object.fromEntries(
      Object.entries(totals).map(([currency, cents]) => [
        currency,
        formatCents(cents),
      ]),
    ),
    unresolvedCount,
    totalsComplete: unresolvedCount === 0,
  };
}

export function getBulkMarkPaidRunProgress(
  state: BulkMarkPaidRunState,
): BulkMarkPaidRunProgress {
  const statuses = Object.values(state.items);
  return {
    completed: statuses.filter(
      (item) =>
        item.status === BULK_MARK_PAID_ITEM_STATUS.SUCCESS ||
        item.status === BULK_MARK_PAID_ITEM_STATUS.ALREADY_PROCESSED,
    ).length,
    failed: statuses.filter(
      (item) =>
        item.status === BULK_MARK_PAID_ITEM_STATUS.FAILED ||
        item.status === BULK_MARK_PAID_ITEM_STATUS.LEASE_FAILED,
    ).length,
    pending: statuses.filter(
      (item) =>
        item.status === BULK_MARK_PAID_ITEM_STATUS.PENDING ||
        item.status === BULK_MARK_PAID_ITEM_STATUS.ACQUIRING ||
        item.status === BULK_MARK_PAID_ITEM_STATUS.SUBMITTING,
    ).length,
    unresolved: statuses.filter(
      (item) => item.status === BULK_MARK_PAID_ITEM_STATUS.AMBIGUOUS,
    ).length,
    retryable: statuses.filter(
      (item) =>
        item.status === BULK_MARK_PAID_ITEM_STATUS.LEASE_FAILED ||
        item.status === BULK_MARK_PAID_ITEM_STATUS.AMBIGUOUS ||
        (item.status === BULK_MARK_PAID_ITEM_STATUS.PENDING &&
          item.errorCode !== null),
    ).length,
    cancelled: statuses.filter(
      (item) => item.status === BULK_MARK_PAID_ITEM_STATUS.CANCELLED,
    ).length,
    total: statuses.length,
  };
}

function defaultClassifyPostError(error: unknown): BulkMarkPaidPostErrorKind {
  if (
    error instanceof ApiRequestError &&
    error.status >= 400 &&
    error.status < 500
  )
    return BULK_MARK_PAID_POST_ERROR_KIND.SAFE;
  return BULK_MARK_PAID_POST_ERROR_KIND.AMBIGUOUS;
}

function isTerminalItemStatus(
  status: BulkMarkPaidItemState["status"] | undefined,
): boolean {
  return (
    status === BULK_MARK_PAID_ITEM_STATUS.SUCCESS ||
    status === BULK_MARK_PAID_ITEM_STATUS.ALREADY_PROCESSED ||
    status === BULK_MARK_PAID_ITEM_STATUS.FAILED
  );
}

export function createBulkMarkPaidOrchestrator(
  initialRun: BulkMarkPaidRunState,
  dependencies: BulkMarkPaidOrchestratorDependencies,
  scope: BulkMarkPaidRunScope,
): BulkMarkPaidOrchestrator {
  let state = initialRun;
  let executing = false;
  if (getBulkMarkPaidScopeFingerprint(scope) !== initialRun.scopeFingerprint)
    throw new Error("La ejecución no pertenece a la sesión y página actuales.");
  const now = dependencies.now ?? (() => new Date().toISOString());

  function update(action: BulkMarkPaidRunAction): void {
    state = bulkMarkPaidRunReducer(state, action);
    state = { ...state, updatedAt: now() };
    dependencies.saveRun(scope, state);
  }

  async function release(requestIds: string[]): Promise<void> {
    await Promise.all(
      requestIds.map((requestId) =>
        dependencies.releaseLease(requestId).catch(() => undefined),
      ),
    );
  }

  async function refetch(force: boolean): Promise<void> {
    await dependencies.refetchQueue({ force }).catch(() => undefined);
  }

  async function execute(): Promise<BulkMarkPaidRunState> {
    if (executing) return state;
    executing = true;
    try {
      while (state.cursor < state.chunks.length) {
        if (state.cancelRequested) {
          update({ type: BULK_MARK_PAID_RUN_ACTION.CANCEL_PENDING });
          await refetch(true);
          return state;
        }
        const chunk = state.chunks[state.cursor];
        const commands = chunk.requestIds.flatMap((requestId) => {
          const command = state.commands.find(
            (candidate) => candidate.requestId === requestId,
          );
          if (!command)
            throw new Error(
              "El lote persistido no contiene todos sus comandos.",
            );
          return isTerminalItemStatus(state.items[requestId]?.status)
            ? []
            : [command];
        });
        if (commands.length === 0) {
          update({
            type: BULK_MARK_PAID_RUN_ACTION.PATCH,
            patch: { cursor: state.cursor + 1 },
          });
          continue;
        }
        const activeRequestIds = commands.map((command) => command.requestId);
        update({
          type: BULK_MARK_PAID_RUN_ACTION.PATCH,
          patch: {
            phase: BULK_MARK_PAID_RUN_PHASE.ACQUIRING,
            ambiguousIntent: null,
          },
        });
        update({
          type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
          requestIds: activeRequestIds,
          status: BULK_MARK_PAID_ITEM_STATUS.ACQUIRING,
        });
        const leases: BulkMarkPaidLease[] = [];
        let failedCommand: BulkMarkPaidCommand | null = null;
        let leaseError: unknown;
        for (const command of commands) {
          try {
            const lease = await dependencies.acquireLease(command);
            if (
              lease.requestId !== command.requestId ||
              !lease.leaseToken ||
              !Number.isSafeInteger(lease.assignmentVersion)
            )
              throw new Error("La sesión PAYMENT adquirida no es válida.");
            leases.push(lease);
          } catch (error) {
            failedCommand = command;
            leaseError = error;
            break;
          }
        }
        if (failedCommand) {
          await release(leases.map((lease) => lease.requestId));
          update({
            type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
            requestIds: activeRequestIds,
            status: BULK_MARK_PAID_ITEM_STATUS.PENDING,
          });
          update({
            type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
            requestIds: [failedCommand.requestId],
            status: BULK_MARK_PAID_ITEM_STATUS.LEASE_FAILED,
            errorCode: "LEASE_ACQUIRE_FAILED",
            errorMessage:
              leaseError instanceof Error
                ? leaseError.message
                : "No se pudo adquirir la sesión PAYMENT.",
          });
          update({
            type: BULK_MARK_PAID_RUN_ACTION.PATCH,
            patch: { phase: BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE },
          });
          await refetch(true);
          return state;
        }
        if (state.cancelRequested) {
          await release(leases.map((lease) => lease.requestId));
          update({
            type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
            requestIds: activeRequestIds,
            status: BULK_MARK_PAID_ITEM_STATUS.PENDING,
          });
          update({ type: BULK_MARK_PAID_RUN_ACTION.CANCEL_PENDING });
          await refetch(true);
          return state;
        }
        const input: BulkMarkPaidInput = {
          items: commands.map((command) => {
            const lease = leases.find(
              (candidate) => candidate.requestId === command.requestId,
            );
            if (!lease)
              throw new Error("No se adquirieron todas las sesiones PAYMENT.");
            return {
              request_id: command.requestId,
              command_id: command.commandId,
              expected_original_amount: command.expectedOriginalAmount,
              expected_original_currency: command.expectedOriginalCurrency,
              paid_at: command.paidAt,
              assignment_version: lease.assignmentVersion,
              lease_token: lease.leaseToken,
            };
          }),
        };
        update({
          type: BULK_MARK_PAID_RUN_ACTION.PATCH,
          patch: { phase: BULK_MARK_PAID_RUN_PHASE.SUBMITTING },
        });
        update({
          type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
          requestIds: activeRequestIds,
          status: BULK_MARK_PAID_ITEM_STATUS.SUBMITTING,
        });
        try {
          const response = await dependencies.postChunk(input);
          const responseIds = new Set(
            response.items.map((item) => item.request_id),
          );
          const commandsByRequestId = new Map(
            commands.map((command) => [command.requestId, command]),
          );
          if (
            responseIds.size !== activeRequestIds.length ||
            activeRequestIds.some((requestId) => !responseIds.has(requestId)) ||
            response.items.some(
              (item) =>
                commandsByRequestId.get(item.request_id)?.commandId !==
                item.command_id,
            )
          )
            throw new Error("La respuesta del lote quedó incompleta.");
          update({
            type: BULK_MARK_PAID_RUN_ACTION.APPLY_RESULTS,
            results: response.items,
          });
          update({
            type: BULK_MARK_PAID_RUN_ACTION.PATCH,
            patch: {
              cursor: state.cursor + 1,
              phase: BULK_MARK_PAID_RUN_PHASE.RUNNING,
            },
          });
          await release(activeRequestIds);
          await refetch(false);
        } catch (error) {
          await release(activeRequestIds);
          const kind = (
            dependencies.classifyPostError ?? defaultClassifyPostError
          )(error);
          if (kind === BULK_MARK_PAID_POST_ERROR_KIND.AMBIGUOUS) {
            update({
              type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
              requestIds: activeRequestIds,
              status: BULK_MARK_PAID_ITEM_STATUS.AMBIGUOUS,
              errorCode: "AMBIGUOUS_TRANSPORT",
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "No se pudo confirmar la respuesta.",
            });
            update({
              type: BULK_MARK_PAID_RUN_ACTION.PATCH,
              patch: {
                phase: BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS,
                ambiguousIntent: {
                  chunkId: chunk.id,
                  fingerprint: chunk.fingerprint,
                  requestIds: [...activeRequestIds],
                },
              },
            });
          } else {
            update({
              type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
              requestIds: activeRequestIds,
              status: BULK_MARK_PAID_ITEM_STATUS.PENDING,
              errorCode: "CHUNK_REJECTED",
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "El lote fue rechazado.",
            });
            update({
              type: BULK_MARK_PAID_RUN_ACTION.PATCH,
              patch: { phase: BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE },
            });
          }
          await refetch(true);
          return state;
        }
      }
      update({
        type: BULK_MARK_PAID_RUN_ACTION.PATCH,
        patch: {
          phase: BULK_MARK_PAID_RUN_PHASE.COMPLETED,
          ambiguousIntent: null,
        },
      });
      await refetch(true);
      dependencies.removeRun(scope);
      return state;
    } finally {
      executing = false;
    }
  }

  async function resumeFrom(
    expectedPhase: string,
    preserveCancellation = false,
  ): Promise<BulkMarkPaidRunState> {
    if (state.phase !== expectedPhase) return state;
    const chunk = state.chunks[state.cursor];
    if (chunk)
      update({
        type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
        requestIds: chunk.requestIds.filter(
          (requestId) => !isTerminalItemStatus(state.items[requestId]?.status),
        ),
        status: BULK_MARK_PAID_ITEM_STATUS.PENDING,
      });
    update({
      type: BULK_MARK_PAID_RUN_ACTION.PATCH,
      patch: {
        phase: BULK_MARK_PAID_RUN_PHASE.READY,
        cancelRequested: preserveCancellation ? state.cancelRequested : false,
      },
    });
    return execute();
  }

  return {
    getState: () => state,
    start: () =>
      state.phase === BULK_MARK_PAID_RUN_PHASE.READY
        ? execute()
        : Promise.resolve(state),
    resumeSafe: () => resumeFrom(BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE),
    retryAmbiguous: () =>
      resumeFrom(BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS, true),
    resumeRecovery: async () => {
      if (state.phase !== BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED)
        return state;
      await refetch(true);
      if (dependencies.reconcileRun) {
        const reconciled = await dependencies.reconcileRun(state);
        if (reconciled.length > 0) {
          update({
            type: BULK_MARK_PAID_RUN_ACTION.APPLY_RESULTS,
            results: reconciled,
          });
          let cursor = state.cursor;
          while (
            cursor < state.chunks.length &&
            state.chunks[cursor].requestIds.every((requestId) =>
              isTerminalItemStatus(state.items[requestId]?.status),
            )
          )
            cursor += 1;
          update({
            type: BULK_MARK_PAID_RUN_ACTION.PATCH,
            patch: { cursor },
          });
        }
      }
      return resumeFrom(BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED);
    },
    cancel: () => {
      update({
        type: BULK_MARK_PAID_RUN_ACTION.PATCH,
        patch: { cancelRequested: true },
      });
      if (!executing) {
        if (state.phase === BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS) {
          const currentIds = new Set(
            state.chunks[state.cursor]?.requestIds ?? [],
          );
          const futureIds = state.commands
            .map((command) => command.requestId)
            .filter(
              (requestId) =>
                !currentIds.has(requestId) &&
                state.items[requestId]?.status ===
                  BULK_MARK_PAID_ITEM_STATUS.PENDING,
            );
          update({
            type: BULK_MARK_PAID_RUN_ACTION.ITEM_STATUS,
            requestIds: futureIds,
            status: BULK_MARK_PAID_ITEM_STATUS.CANCELLED,
          });
        } else {
          update({ type: BULK_MARK_PAID_RUN_ACTION.CANCEL_PENDING });
        }
      }
    },
    discard: () => dependencies.removeRun(scope),
  };
}
