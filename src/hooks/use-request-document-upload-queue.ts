"use client";

import { useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";

import { useUploadRequestDocument } from "@/hooks/use-requests";
import {
  REQUEST_DOCUMENT_UPLOAD_BATCH_STATE,
  REQUEST_DOCUMENT_UPLOAD_FILE_STATE,
  createRequestDocumentUploadQueueState,
  enqueueRequestDocumentFiles,
  getRequestDocumentUploadQueueSummary,
  requestDocumentUploadQueueReducer,
  type EnqueueRequestDocumentFilesOptions,
  type RequestDocumentUploadQueueAction,
  type RequestDocumentUploadQueueItem,
  type RequestDocumentUploadQueueState,
  type RequestDocumentUploadQueueSummary,
} from "@/lib/request-document-upload-queue";
import {
  getReconciledRequestDocumentUploadFileState,
  getRequestDocumentUploadRetryDelayMs,
} from "@/lib/request-document-upload-runtime";
import {
  REQUEST_DOCUMENT_UPLOAD_QUEUE_DELAY_MS,
  getApiErrorMessage,
  isRetryableRequestDocumentUploadError,
} from "@/lib/requests";
import {
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  type RequestDocument,
  type RequestReceiptReview,
  type UploadRequestDocumentInput,
} from "@/types/requests";

interface UseRequestDocumentUploadQueueOptions {
  requestId?: string;
  uploadDocument?: (requestId: string, input: UploadRequestDocumentInput) => Promise<RequestDocument>;
  documents?: RequestDocument[];
  receipts?: RequestReceiptReview[];
  upsertDocument?: (document: RequestDocument) => void;
  refreshDocuments?: () => Promise<void> | void;
  refreshReceipts?: () => Promise<void> | void;
  interFileDelayMs?: number;
}

export interface RequestDocumentUploadQueueController {
  state: RequestDocumentUploadQueueState;
  items: RequestDocumentUploadQueueItem[];
  summary: RequestDocumentUploadQueueSummary;
  isRunning: boolean;
  isNavigationBlocked: boolean;
  enqueue: (files: File[], options: EnqueueRequestDocumentFilesOptions) => void;
  start: () => void;
  pauseAfterCurrent: () => void;
  resume: () => void;
  retry: (itemId: string) => void;
  retryFailed: () => void;
  remove: (itemId: string) => void;
  minimize: () => void;
  restore: () => void;
  reset: () => void;
}

function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function useRequestDocumentUploadQueue({
  requestId,
  uploadDocument: injectedUploadDocument,
  documents = [],
  receipts = [],
  upsertDocument,
  refreshDocuments,
  refreshReceipts,
  interFileDelayMs = REQUEST_DOCUMENT_UPLOAD_QUEUE_DELAY_MS,
}: UseRequestDocumentUploadQueueOptions): RequestDocumentUploadQueueController {
  const uploadMutation = useUploadRequestDocument();
  const uploadDocument = injectedUploadDocument
    ?? ((id: string, input: UploadRequestDocumentInput) => uploadMutation.uploadDocument(id, input));
  const [state, dispatch] = useReducer(requestDocumentUploadQueueReducer, undefined, createRequestDocumentUploadQueueState);
  const stateRef = useRef(state);
  const runningRef = useRef(false);
  const pauseRequestedRef = useRef(false);

  function commit(action: RequestDocumentUploadQueueAction): void {
    stateRef.current = requestDocumentUploadQueueReducer(stateRef.current, action);
    dispatch(action);
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    state.items.forEach((item) => {
      const reconciledState = getReconciledRequestDocumentUploadFileState(item, documents, receipts);
      if (!reconciledState || reconciledState === item.state) return;
      if (reconciledState === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING) {
        commit({ type: "processing", itemId: item.id });
      } else if (reconciledState === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW) {
        commit({ type: "needs-review", itemId: item.id });
      } else {
        const document = documents.find((candidate) => candidate.id === item.persistedDocumentId);
        if (document) commit({ type: "upload-saved", itemId: item.id, document });
      }
    });
  }, [documents, receipts, state.items]);

  async function refreshAuthoritativeResources(): Promise<void> {
    await Promise.all([
      Promise.resolve(refreshDocuments?.()),
      Promise.resolve(refreshReceipts?.()),
    ]);
  }

  async function processItems(itemIds: string[]): Promise<void> {
    if (!requestId || runningRef.current || itemIds.length === 0) return;
    runningRef.current = true;
    pauseRequestedRef.current = false;
    commit({ type: "start" });
    let savedCount = 0;
    let failedCount = 0;
    let warningCount = 0;

    try {
      for (const [index, itemId] of itemIds.entries()) {
        if (pauseRequestedRef.current) {
          commit({ type: "pause-reached" });
          break;
        }
        const item = stateRef.current.items.find((candidate) => candidate.id === itemId);
        const canUpload = item?.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED
          || (item?.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR && item.retryable);
        if (!item || !canUpload) continue;

        commit({ type: "upload-started", itemId });
        let nextDelayMs = interFileDelayMs;
        try {
          const uploaded = await uploadDocument(requestId, {
            file: item.file,
            document_category: item.documentCategory,
            scope_type: item.scopeType,
            request_allocation_id: item.requestAllocationId,
          });
          upsertDocument?.(uploaded);
          commit({ type: "upload-saved", itemId, document: uploaded });
          savedCount += 1;
          if (uploaded.upload_status === REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED) warningCount += 1;
        } catch (uploadError) {
          failedCount += 1;
          nextDelayMs = Math.max(getRequestDocumentUploadRetryDelayMs(uploadError), interFileDelayMs);
          commit({
            type: "upload-failed",
            itemId,
            message: getApiErrorMessage(uploadError),
            retryable: isRetryableRequestDocumentUploadError(uploadError),
          });
        }

        if (pauseRequestedRef.current) {
          commit({ type: "pause-reached" });
          break;
        }
        if (index < itemIds.length - 1) await wait(nextDelayMs);
      }

      await refreshAuthoritativeResources();
      if (!pauseRequestedRef.current) commit({ type: "settled" });

      if (failedCount > 0) {
        toast.error(`${failedCount} archivo${failedCount === 1 ? "" : "s"} no se pudieron adjuntar.`);
      } else if (warningCount > 0) {
        toast.error(`${warningCount} documento${warningCount === 1 ? " quedó" : "s quedaron"} guardado${warningCount === 1 ? "" : "s"} con una incidencia de almacenamiento.`);
      } else if (savedCount > 0) {
        toast.success(`${savedCount} documento${savedCount === 1 ? " adjuntado" : "s adjuntados"} correctamente.`);
      }
    } finally {
      runningRef.current = false;
    }
  }

  function enqueue(files: File[], options: EnqueueRequestDocumentFilesOptions): void {
    const currentState = stateRef.current.batchState === REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.SETTLED
      ? {
        ...stateRef.current,
        items: stateRef.current.items.filter((item) => (
          item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR || item.hasPersistentWarning
        )),
        omittedCount: 0,
      }
      : stateRef.current;
    const previousOmittedCount = currentState.omittedCount;
    const nextState = enqueueRequestDocumentFiles(currentState, files, options);
    commit({ type: "enqueue", state: nextState });
    const newlyOmittedCount = nextState.omittedCount - previousOmittedCount;
    if (newlyOmittedCount > 0) {
      toast.error(`${newlyOmittedCount} archivo${newlyOmittedCount === 1 ? " fue omitido" : "s fueron omitidos"}. Solo se conservan 20 archivos por tanda.`);
    }
  }

  function start(): void {
    const itemIds = stateRef.current.items
      .filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED)
      .map((item) => item.id);
    void processItems(itemIds);
  }

  function pauseAfterCurrent(): void {
    pauseRequestedRef.current = true;
    commit({ type: "pause-requested" });
  }

  function resume(): void {
    pauseRequestedRef.current = false;
    commit({ type: "resume" });
    start();
  }

  function retry(itemId: string): void {
    const item = stateRef.current.items.find((candidate) => candidate.id === itemId);
    if (!item || item.state !== REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR || !item.retryable) return;
    commit({ type: "retry-item", itemId });
    void processItems([itemId]);
  }

  function retryFailed(): void {
    const itemIds = stateRef.current.items
      .filter((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR && item.retryable)
      .map((item) => item.id);
    if (itemIds.length === 0) return;
    commit({ type: "retry-failed" });
    void processItems(itemIds);
  }

  function remove(itemId: string): void {
    commit({ type: "remove-item", itemId });
  }

  function minimize(): void {
    commit({ type: "minimize" });
  }

  function restore(): void {
    commit({ type: "restore" });
  }

  function reset(): void {
    if (runningRef.current) return;
    commit({ type: "reset" });
  }

  const summary = getRequestDocumentUploadQueueSummary(state);
  const isRunning = state.batchState === REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.RUNNING
    || state.batchState === REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSE_REQUESTED;
  const isNavigationBlocked = state.items.some((item) => (
    item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED
    || item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING
    || item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR
    || item.hasPersistentWarning
  ));

  return {
    state,
    items: state.items,
    summary,
    isRunning,
    isNavigationBlocked,
    enqueue,
    start,
    pauseAfterCurrent,
    resume,
    retry,
    retryFailed,
    remove,
    minimize,
    restore,
    reset,
  };
}
