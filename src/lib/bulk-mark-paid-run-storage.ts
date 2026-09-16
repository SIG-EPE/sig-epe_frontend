import type { MarkPaidItemResult, RequestCurrency } from "@/types/requests";

export const BULK_MARK_PAID_RUN_STORAGE_VERSION = 1 as const;
export const BULK_MARK_PAID_RUN_STORAGE_PREFIX = "sig-epe:bulk-mark-paid:v1:";

export const BULK_MARK_PAID_RUN_PHASE = {
  READY: "READY",
  ACQUIRING: "ACQUIRING",
  SUBMITTING: "SUBMITTING",
  RUNNING: "RUNNING",
  PAUSED_SAFE: "PAUSED_SAFE",
  PAUSED_AMBIGUOUS: "PAUSED_AMBIGUOUS",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;

export type BulkMarkPaidRunPhase =
  (typeof BULK_MARK_PAID_RUN_PHASE)[keyof typeof BULK_MARK_PAID_RUN_PHASE];

export const BULK_MARK_PAID_ITEM_STATUS = {
  PENDING: "PENDING",
  ACQUIRING: "ACQUIRING",
  SUBMITTING: "SUBMITTING",
  SUCCESS: "SUCCESS",
  ALREADY_PROCESSED: "ALREADY_PROCESSED",
  FAILED: "FAILED",
  LEASE_FAILED: "LEASE_FAILED",
  AMBIGUOUS: "AMBIGUOUS",
  CANCELLED: "CANCELLED",
} as const;

export type BulkMarkPaidItemStatus =
  (typeof BULK_MARK_PAID_ITEM_STATUS)[keyof typeof BULK_MARK_PAID_ITEM_STATUS];

export interface BulkMarkPaidRunScope {
  userId: string;
  sessionId: string;
  pageIdentity: string;
}

export interface BulkMarkPaidCommand {
  requestId: string;
  commandId: string;
  expectedOriginalAmount: string;
  expectedOriginalCurrency: RequestCurrency;
  paidAt: string;
  fingerprint: string;
}

export interface BulkMarkPaidChunk {
  id: string;
  index: number;
  requestIds: string[];
  fingerprint: string;
}

export interface BulkMarkPaidItemState {
  requestId: string;
  status: BulkMarkPaidItemStatus;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface BulkMarkPaidAmbiguousIntent {
  chunkId: string;
  fingerprint: string;
  requestIds: string[];
}

export interface BulkMarkPaidRunState {
  version: typeof BULK_MARK_PAID_RUN_STORAGE_VERSION;
  scopeFingerprint: string;
  runId: string;
  pageFingerprint: string;
  createdAt: string;
  updatedAt: string;
  phase: BulkMarkPaidRunPhase;
  cursor: number;
  cancelRequested: boolean;
  commands: BulkMarkPaidCommand[];
  chunks: BulkMarkPaidChunk[];
  items: Record<string, BulkMarkPaidItemState>;
  results: Record<string, MarkPaidItemResult>;
  ambiguousIntent: BulkMarkPaidAmbiguousIntent | null;
}

interface LoadBulkMarkPaidRunOptions {
  recover?: boolean;
  storage?: Storage;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function createBulkMarkPaidCommandFingerprint(
  command: Omit<BulkMarkPaidCommand, "fingerprint">,
): string {
  return hash(
    JSON.stringify([
      command.requestId,
      command.commandId,
      command.expectedOriginalAmount,
      command.expectedOriginalCurrency,
      command.paidAt,
    ]),
  );
}

export function createBulkMarkPaidChunkFingerprint(
  commands: BulkMarkPaidCommand[],
): string {
  return hash(JSON.stringify(commands.map((command) => command.fingerprint)));
}

export function getBulkMarkPaidPageFingerprint(pageIdentity: string): string {
  return hash(pageIdentity);
}

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function getBulkMarkPaidScopeFingerprint(
  scope: BulkMarkPaidRunScope,
): string {
  return hash(
    JSON.stringify([scope.userId, scope.sessionId, scope.pageIdentity]),
  );
}

export function createBulkMarkPaidRunStorageKey(
  scope: BulkMarkPaidRunScope,
): string {
  return `${BULK_MARK_PAID_RUN_STORAGE_PREFIX}${getBulkMarkPaidScopeFingerprint(scope)}`;
}

function cloneResult(result: MarkPaidItemResult): MarkPaidItemResult {
  return {
    request_id: result.request_id,
    command_id: result.command_id,
    outcome: result.outcome,
    payment_id: result.payment_id,
    code: result.code,
    message: result.message,
    original: result.original
      ? { amount: result.original.amount, currency: result.original.currency }
      : null,
    actual_disbursement: null,
    valuation: null,
    missing_fields: [...result.missing_fields],
    rexan_activation: result.rexan_activation
      ? { status: result.rexan_activation.status }
      : null,
  };
}

function sanitizeRun(
  scope: BulkMarkPaidRunScope,
  run: BulkMarkPaidRunState,
): BulkMarkPaidRunState {
  return {
    version: BULK_MARK_PAID_RUN_STORAGE_VERSION,
    scopeFingerprint: getBulkMarkPaidScopeFingerprint(scope),
    runId: run.runId,
    pageFingerprint: run.pageFingerprint,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    phase: run.phase,
    cursor: run.cursor,
    cancelRequested: run.cancelRequested,
    commands: run.commands.map((command) => ({ ...command })),
    chunks: run.chunks.map((chunk) => ({
      ...chunk,
      requestIds: [...chunk.requestIds],
    })),
    items: Object.fromEntries(
      Object.entries(run.items).map(([requestId, item]) => [
        requestId,
        {
          requestId: item.requestId,
          status: item.status,
          errorCode: item.errorCode,
          errorMessage: item.errorMessage,
        },
      ]),
    ),
    results: Object.fromEntries(
      Object.entries(run.results).map(([requestId, result]) => [
        requestId,
        cloneResult(result),
      ]),
    ),
    ambiguousIntent: run.ambiguousIntent
      ? {
          chunkId: run.ambiguousIntent.chunkId,
          fingerprint: run.ambiguousIntent.fingerprint,
          requestIds: [...run.ambiguousIntent.requestIds],
        }
      : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRun(
  value: unknown,
  scopeFingerprint: string,
  pageFingerprint: string,
): value is BulkMarkPaidRunState {
  if (!isRecord(value)) return false;
  if (
    value.version !== BULK_MARK_PAID_RUN_STORAGE_VERSION ||
    value.scopeFingerprint !== scopeFingerprint ||
    typeof value.runId !== "string" ||
    value.pageFingerprint !== pageFingerprint ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Object.values(BULK_MARK_PAID_RUN_PHASE).includes(
      value.phase as BulkMarkPaidRunPhase,
    ) ||
    !Number.isInteger(value.cursor) ||
    typeof value.cancelRequested !== "boolean" ||
    !Array.isArray(value.commands) ||
    !Array.isArray(value.chunks) ||
    !isRecord(value.items) ||
    !isRecord(value.results)
  )
    return false;

  const commandsValid = value.commands.every(
    (candidate) =>
      isRecord(candidate) &&
      typeof candidate.requestId === "string" &&
      typeof candidate.commandId === "string" &&
      typeof candidate.expectedOriginalAmount === "string" &&
      (candidate.expectedOriginalCurrency === "PEN" ||
        candidate.expectedOriginalCurrency === "USD") &&
      typeof candidate.paidAt === "string" &&
      typeof candidate.fingerprint === "string",
  );
  const chunksValid = value.chunks.every(
    (candidate) =>
      isRecord(candidate) &&
      typeof candidate.id === "string" &&
      Number.isInteger(candidate.index) &&
      isStringArray(candidate.requestIds) &&
      candidate.requestIds.length >= 1 &&
      candidate.requestIds.length <= 5 &&
      typeof candidate.fingerprint === "string",
  );
  const itemsValid = Object.values(value.items).every(
    (candidate) =>
      isRecord(candidate) &&
      typeof candidate.requestId === "string" &&
      Object.values(BULK_MARK_PAID_ITEM_STATUS).includes(
        candidate.status as BulkMarkPaidItemStatus,
      ),
  );
  const resultsValid = Object.values(value.results).every(
    (candidate) =>
      isRecord(candidate) &&
      typeof candidate.request_id === "string" &&
      typeof candidate.command_id === "string" &&
      (candidate.outcome === "SUCCESS" ||
        candidate.outcome === "ALREADY_PROCESSED" ||
        candidate.outcome === "FAILED") &&
      typeof candidate.code === "string" &&
      typeof candidate.message === "string" &&
      Array.isArray(candidate.missing_fields),
  );
  const ambiguousValid =
    value.ambiguousIntent === null ||
    (isRecord(value.ambiguousIntent) &&
      typeof value.ambiguousIntent.chunkId === "string" &&
      typeof value.ambiguousIntent.fingerprint === "string" &&
      isStringArray(value.ambiguousIntent.requestIds));
  if (
    !commandsValid ||
    !chunksValid ||
    !itemsValid ||
    !resultsValid ||
    !ambiguousValid
  )
    return false;

  const commands = value.commands as BulkMarkPaidCommand[];
  const chunks = value.chunks as BulkMarkPaidChunk[];
  if (
    commands.length < 1 ||
    commands.length > 50 ||
    new Set(commands.map((command) => command.requestId)).size !==
      commands.length ||
    new Set(commands.map((command) => command.commandId)).size !==
      commands.length ||
    commands.some(
      (command) =>
        command.fingerprint !== createBulkMarkPaidCommandFingerprint(command),
    ) ||
    (value.cursor as number) < 0 ||
    (value.cursor as number) > chunks.length ||
    chunks.length !== Math.ceil(commands.length / 5)
  )
    return false;

  for (const [index, chunk] of chunks.entries()) {
    const expectedCommands = commands.slice(index * 5, (index + 1) * 5);
    if (
      chunk.id !== `${value.runId}:${index}` ||
      chunk.index !== index ||
      chunk.requestIds.join("\u0000") !==
        expectedCommands.map((command) => command.requestId).join("\u0000") ||
      chunk.fingerprint !== createBulkMarkPaidChunkFingerprint(expectedCommands)
    )
      return false;
  }

  const commandByRequestId = new Map(
    commands.map((command) => [command.requestId, command]),
  );
  if (
    Object.keys(value.items).length !== commands.length ||
    Object.entries(value.items).some(
      ([requestId, item]) =>
        !commandByRequestId.has(requestId) ||
        (item as BulkMarkPaidItemState).requestId !== requestId,
    ) ||
    Object.entries(value.results).some(
      ([requestId, result]) =>
        !commandByRequestId.has(requestId) ||
        (result as MarkPaidItemResult).request_id !== requestId ||
        (result as MarkPaidItemResult).command_id !==
          commandByRequestId.get(requestId)?.commandId,
    )
  )
    return false;
  return true;
}

function requiresRecovery(phase: BulkMarkPaidRunPhase): boolean {
  return (
    phase === BULK_MARK_PAID_RUN_PHASE.READY ||
    phase === BULK_MARK_PAID_RUN_PHASE.ACQUIRING ||
    phase === BULK_MARK_PAID_RUN_PHASE.SUBMITTING ||
    phase === BULK_MARK_PAID_RUN_PHASE.RUNNING ||
    phase === BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE ||
    phase === BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS
  );
}

export function saveBulkMarkPaidRun(
  scope: BulkMarkPaidRunScope,
  run: BulkMarkPaidRunState,
  storage?: Storage,
): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(
    createBulkMarkPaidRunStorageKey(scope),
    JSON.stringify(sanitizeRun(scope, run)),
  );
}

export function loadBulkMarkPaidRun(
  scope: BulkMarkPaidRunScope,
  options: LoadBulkMarkPaidRunOptions = {},
): BulkMarkPaidRunState | null {
  const target = getStorage(options.storage);
  if (!target) return null;
  const key = createBulkMarkPaidRunStorageKey(scope);
  const raw = target.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRun(
        parsed,
        getBulkMarkPaidScopeFingerprint(scope),
        getBulkMarkPaidPageFingerprint(scope.pageIdentity),
      )
    ) {
      target.removeItem(key);
      return null;
    }
    const recovered = sanitizeRun(scope, parsed);
    if (recovered.phase === BULK_MARK_PAID_RUN_PHASE.COMPLETED) {
      target.removeItem(key);
      return null;
    }
    if (options.recover !== false && requiresRecovery(recovered.phase)) {
      recovered.phase = BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED;
      recovered.commands.forEach((command) => {
        const item = recovered.items[command.requestId];
        if (
          item &&
          (item.status === BULK_MARK_PAID_ITEM_STATUS.ACQUIRING ||
            item.status === BULK_MARK_PAID_ITEM_STATUS.SUBMITTING)
        )
          item.status = BULK_MARK_PAID_ITEM_STATUS.PENDING;
      });
      saveBulkMarkPaidRun(scope, recovered, target);
    }
    return recovered;
  } catch {
    target.removeItem(key);
    return null;
  }
}

export function removeBulkMarkPaidRun(
  scope: BulkMarkPaidRunScope,
  storage?: Storage,
): void {
  getStorage(storage)?.removeItem(createBulkMarkPaidRunStorageKey(scope));
}

export function clearBulkMarkPaidRunStorage(storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  const keys = Array.from({ length: target.length }, (_, index) =>
    target.key(index),
  );
  for (const key of keys) {
    if (key?.startsWith(BULK_MARK_PAID_RUN_STORAGE_PREFIX))
      target.removeItem(key);
  }
}

export function synchronizeBulkMarkPaidRunScope(
  scope: BulkMarkPaidRunScope | null,
  storage?: Storage,
): void {
  const target = getStorage(storage);
  if (!target) return;
  const retainedKey = scope ? createBulkMarkPaidRunStorageKey(scope) : null;
  const keys = Array.from({ length: target.length }, (_, index) =>
    target.key(index),
  );
  for (const key of keys) {
    if (
      key?.startsWith(BULK_MARK_PAID_RUN_STORAGE_PREFIX) &&
      key !== retainedKey
    )
      target.removeItem(key);
  }
}
