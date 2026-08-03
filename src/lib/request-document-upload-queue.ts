import {
  REQUEST_DOCUMENT_MAX_BATCH_FILES,
  validateRequestDocumentFile,
} from "@/lib/requests";
import {
  REQUEST_DOCUMENT_SCOPE_TYPE,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  type RequestDocument,
  type RequestDocumentCategory,
  type RequestDocumentScopeType,
} from "@/types/requests";

export const REQUEST_DOCUMENT_UPLOAD_FILE_STATE = {
  QUEUED: "queued",
  UPLOADING: "uploading",
  SAVED: "saved",
  PROCESSING: "processing",
  NEEDS_REVIEW: "needs-review",
  ERROR: "error",
} as const;

export type RequestDocumentUploadFileState = (typeof REQUEST_DOCUMENT_UPLOAD_FILE_STATE)[keyof typeof REQUEST_DOCUMENT_UPLOAD_FILE_STATE];

export const REQUEST_DOCUMENT_UPLOAD_BATCH_STATE = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSE_REQUESTED: "pause-requested",
  PAUSED: "paused",
  SETTLED: "settled",
} as const;

export type RequestDocumentUploadBatchState = (typeof REQUEST_DOCUMENT_UPLOAD_BATCH_STATE)[keyof typeof REQUEST_DOCUMENT_UPLOAD_BATCH_STATE];

export interface RequestDocumentUploadQueueItem {
  id: string;
  file: File;
  documentCategory: RequestDocumentCategory;
  scopeType?: RequestDocumentScopeType;
  requestAllocationId?: string;
  state: RequestDocumentUploadFileState;
  retryable: boolean;
  errorMessage?: string;
  persistedDocumentId?: string;
  hasPersistentWarning: boolean;
  warningMessage?: string;
}

export interface RequestDocumentUploadQueueState {
  items: RequestDocumentUploadQueueItem[];
  batchState: RequestDocumentUploadBatchState;
  minimized: boolean;
  omittedCount: number;
}

export interface RequestDocumentUploadQueueSummary {
  total: number;
  processed: number;
  saved: number;
  queued: number;
  uploading: number;
  processing: number;
  needsReview: number;
  errors: number;
  retryableErrors: number;
  persistentWarnings: number;
  progressPercent: number;
}

export interface EnqueueRequestDocumentFilesOptions {
  category: RequestDocumentCategory;
  requiresAllocation?: boolean;
  requestAllocationId?: string;
}

export type RequestDocumentUploadQueueIdFactory = (index: number) => string;

interface StartAction { type: "start" }
interface UploadStartedAction { type: "upload-started"; itemId: string }
interface UploadSavedAction { type: "upload-saved"; itemId: string; document: RequestDocument }
interface ProcessingAction { type: "processing"; itemId: string }
interface NeedsReviewAction { type: "needs-review"; itemId: string }
interface UploadFailedAction { type: "upload-failed"; itemId: string; message: string; retryable: boolean }
interface PauseRequestedAction { type: "pause-requested" }
interface PauseReachedAction { type: "pause-reached" }
interface ResumeAction { type: "resume" }
interface SettledAction { type: "settled" }
interface RetryItemAction { type: "retry-item"; itemId: string }
interface RetryFailedAction { type: "retry-failed" }
interface RemoveItemAction { type: "remove-item"; itemId: string }
interface MinimizeAction { type: "minimize" }
interface RestoreAction { type: "restore" }
interface ResetAction { type: "reset" }
interface EnqueueAction { type: "enqueue"; state: RequestDocumentUploadQueueState }

export type RequestDocumentUploadQueueAction =
  | StartAction
  | UploadStartedAction
  | UploadSavedAction
  | ProcessingAction
  | NeedsReviewAction
  | UploadFailedAction
  | PauseRequestedAction
  | PauseReachedAction
  | ResumeAction
  | SettledAction
  | RetryItemAction
  | RetryFailedAction
  | RemoveItemAction
  | MinimizeAction
  | RestoreAction
  | ResetAction
  | EnqueueAction;

function defaultIdFactory(): string {
  return crypto.randomUUID();
}

function updateItem(
  state: RequestDocumentUploadQueueState,
  itemId: string,
  update: (item: RequestDocumentUploadQueueItem) => RequestDocumentUploadQueueItem,
): RequestDocumentUploadQueueState {
  return {
    ...state,
    items: state.items.map((item) => item.id === itemId ? update(item) : item),
  };
}

function settlePauseAfterCurrent(state: RequestDocumentUploadQueueState): RequestDocumentUploadBatchState {
  return state.batchState === REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSE_REQUESTED
    ? REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSED
    : state.batchState;
}

export function createRequestDocumentUploadQueueState(): RequestDocumentUploadQueueState {
  return {
    items: [],
    batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.IDLE,
    minimized: false,
    omittedCount: 0,
  };
}

export function enqueueRequestDocumentFiles(
  currentState: RequestDocumentUploadQueueState,
  files: File[],
  options: EnqueueRequestDocumentFilesOptions,
  idFactory: RequestDocumentUploadQueueIdFactory = defaultIdFactory,
): RequestDocumentUploadQueueState {
  const availableSlots = Math.max(REQUEST_DOCUMENT_MAX_BATCH_FILES - currentState.items.length, 0);
  const retainedFiles = files.slice(0, availableSlots);
  const omittedCount = Math.max(files.length - retainedFiles.length, 0);
  const requiresAllocation = options.requiresAllocation === true;

  const nextItems = retainedFiles.map<RequestDocumentUploadQueueItem>((file, index) => {
    const validationError = validateRequestDocumentFile(file, options.category);
    const allocationError = requiresAllocation && !options.requestAllocationId
      ? "Selecciona la línea POA a la que corresponden los comprobantes."
      : null;
    const errorMessage = validationError ?? allocationError;

    return {
      id: idFactory(index),
      file,
      documentCategory: options.category,
      scopeType: requiresAllocation ? REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION : undefined,
      requestAllocationId: requiresAllocation ? options.requestAllocationId : undefined,
      state: errorMessage ? REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR : REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED,
      retryable: !errorMessage,
      errorMessage: errorMessage ?? undefined,
      hasPersistentWarning: false,
    };
  });

  return {
    ...currentState,
    items: [...currentState.items, ...nextItems],
    batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.IDLE,
    minimized: false,
    omittedCount: currentState.omittedCount + omittedCount,
  };
}

export function getRequestDocumentUploadQueueSummary(state: RequestDocumentUploadQueueState): RequestDocumentUploadQueueSummary {
  const savedStates = new Set<RequestDocumentUploadFileState>([
    REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED,
    REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING,
    REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW,
  ]);
  const processedStates = new Set<RequestDocumentUploadFileState>([
    ...savedStates,
    REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR,
  ]);
  const total = state.items.length;
  const processed = state.items.filter((item) => processedStates.has(item.state)).length;

  return {
    total,
    processed,
    saved: state.items.filter((item) => savedStates.has(item.state)).length,
    queued: state.items.filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED).length,
    uploading: state.items.filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING).length,
    processing: state.items.filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING).length,
    needsReview: state.items.filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW).length,
    errors: state.items.filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR).length,
    retryableErrors: state.items.filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR && item.retryable).length,
    persistentWarnings: state.items.filter((item) => item.hasPersistentWarning).length,
    progressPercent: total === 0 ? 0 : Math.round((processed / total) * 100),
  };
}

export function requestDocumentUploadQueueReducer(
  state: RequestDocumentUploadQueueState,
  action: RequestDocumentUploadQueueAction,
): RequestDocumentUploadQueueState {
  if (action.type === "enqueue") return action.state;
  if (action.type === "start") return { ...state, batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.RUNNING };
  if (action.type === "upload-started") {
    return updateItem({ ...state, batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.RUNNING }, action.itemId, (item) => ({
      ...item,
      state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING,
      errorMessage: undefined,
    }));
  }
  if (action.type === "upload-saved") {
    const hasPersistentWarning = action.document.upload_status === REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED;
    const nextState = updateItem(state, action.itemId, (item) => ({
      ...item,
      state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED,
      persistedDocumentId: action.document.id,
      retryable: false,
      errorMessage: undefined,
      hasPersistentWarning,
      warningMessage: hasPersistentWarning
        ? "El archivo quedó guardado localmente, pero tuvo una incidencia al enviarse a Google Drive."
        : undefined,
    }));
    return { ...nextState, batchState: settlePauseAfterCurrent(state) };
  }
  if (action.type === "processing") {
    return updateItem(state, action.itemId, (item) => ({ ...item, state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING }));
  }
  if (action.type === "needs-review") {
    return updateItem(state, action.itemId, (item) => ({ ...item, state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW }));
  }
  if (action.type === "upload-failed") {
    const nextState = updateItem(state, action.itemId, (item) => ({
      ...item,
      state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR,
      retryable: action.retryable,
      errorMessage: action.message,
      hasPersistentWarning: false,
      warningMessage: undefined,
    }));
    return { ...nextState, batchState: settlePauseAfterCurrent(state) };
  }
  if (action.type === "pause-requested") {
    const hasActiveUpload = state.items.some((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING);
    return {
      ...state,
      batchState: hasActiveUpload
        ? REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSE_REQUESTED
        : REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSED,
    };
  }
  if (action.type === "pause-reached") return { ...state, batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSED };
  if (action.type === "resume") return { ...state, batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.RUNNING };
  if (action.type === "settled") return { ...state, batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.SETTLED };
  if (action.type === "retry-item") {
    return updateItem(state, action.itemId, (item) => (
      item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR && item.retryable
        ? { ...item, state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED, errorMessage: undefined }
        : item
    ));
  }
  if (action.type === "retry-failed") {
    return {
      ...state,
      items: state.items.map((item) => (
        item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR && item.retryable
          ? { ...item, state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED, errorMessage: undefined }
          : item
      )),
    };
  }
  if (action.type === "remove-item") {
    return {
      ...state,
      items: state.items.filter((item) => (
        item.id !== action.itemId
        || (item.state !== REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED && item.state !== REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR)
      )),
    };
  }
  if (action.type === "minimize") return { ...state, minimized: true };
  if (action.type === "restore") return { ...state, minimized: false };
  if (action.type === "reset") return createRequestDocumentUploadQueueState();
  return state;
}
