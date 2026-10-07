import { describe, expect, it } from "vitest";

import {
  REQUEST_DOCUMENT_UPLOAD_BATCH_STATE,
  REQUEST_DOCUMENT_UPLOAD_FILE_STATE,
  createRequestDocumentUploadQueueState,
  enqueueRequestDocumentFiles,
  getRequestDocumentUploadQueueSummary,
  requestDocumentUploadQueueReducer,
} from "@/lib/request-document-upload-queue";
import {
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  type RequestDocument,
} from "@/types/requests";

function makeFiles(count: number): File[] {
  return Array.from(
    { length: count },
    (_, index) =>
      new File([`contenido-${index}`], `archivo-${index + 1}.pdf`, {
        type: "application/pdf",
      }),
  );
}

function makeDocument(
  overrides: Partial<RequestDocument> = {},
): RequestDocument {
  return {
    id: "document-1",
    payment_request_id: "request-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    safe_filename: "archivo-1.pdf",
    original_filename: "archivo-1.pdf",
    mime_type: "application/pdf",
    size_bytes: 100,
    sha256_hash: "hash",
    storage_provider: "DRIVE",
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    uploaded_by_id: "user-1",
    created_at: "2026-07-31T10:00:00.000Z",
    ...overrides,
  };
}

describe("requestDocumentUploadQueueReducer", () => {
  it("freezes independent OTHER titles for 20 files across removal and retry", () => {
    const files = makeFiles(20);
    const titles = files.map((_, index) => index === 1 ? "  " : `  Anexo ${index}  `);
    let state = enqueueRequestDocumentFiles(createRequestDocumentUploadQueueState(), files, {
      category: REQUEST_DOCUMENT_CATEGORY.OTHER,
      fileTitles: titles,
    }, (index) => `other-${index}`);
    titles[2] = "Cambiado";
    expect(state.items.map((item) => item.displayName)).toEqual(files.map((_, index) => index === 1 ? undefined : `Anexo ${index}`));
    expect(state.items[1].titleSource).toBe("ORIGINAL_FILENAME");
    state = requestDocumentUploadQueueReducer(state, { type: "remove-item", itemId: "other-0" });
    state = requestDocumentUploadQueueReducer(state, { type: "upload-failed", itemId: "other-2", message: "Temporal", retryable: true });
    state = requestDocumentUploadQueueReducer(state, { type: "retry-item", itemId: "other-2" });
    expect(state.items[1]).toMatchObject({ file: files[2], displayName: "Anexo 2", idempotencyKey: "other-2" });
  });

  it("rejects an explicit invalid OTHER title without queueing an upload and ignores non-OTHER titles", () => {
    const file = makeFiles(1);
    const invalid = enqueueRequestDocumentFiles(createRequestDocumentUploadQueueState(), file, { category: REQUEST_DOCUMENT_CATEGORY.OTHER, fileTitles: ["../bad"] });
    expect(invalid.items[0]).toMatchObject({ state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR, retryable: false });
    expect(invalid.items[0].errorMessage).toBeTruthy();
    const ordinary = enqueueRequestDocumentFiles(createRequestDocumentUploadQueueState(), file, { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT, fileTitles: ["Anexo válido"] });
    expect(ordinary.items[0].displayName).toBeUndefined();
  });
  it("characterizes the 20-file category/allocation snapshot and retry identity", () => {
    const files = makeFiles(21);
    const options = {
      category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      requiresAllocation: true,
      requestAllocationId: "alloc-1",
    };
    let state = enqueueRequestDocumentFiles(
      createRequestDocumentUploadQueueState(),
      files,
      options,
      (index) => `key-${index}`,
    );
    options.requestAllocationId = "alloc-2";
    expect(state.items).toHaveLength(20);
    expect(state.omittedCount).toBe(1);
    expect(state.items[1]).toMatchObject({
      file: files[1],
      documentCategory: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      scopeType: "ALLOCATION",
      requestAllocationId: "alloc-1",
      idempotencyKey: "key-1",
    });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-saved",
      itemId: "key-0",
      document: makeDocument(),
    });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-failed",
      itemId: "key-1",
      message: "Temporal",
      retryable: true,
    });
    state = requestDocumentUploadQueueReducer(state, { type: "retry-failed" });
    expect(state.items[0].state).toBe(REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED);
    expect(state.items[1]).toMatchObject({
      file: files[1],
      state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED,
      requestAllocationId: "alloc-1",
      idempotencyKey: "key-1",
    });
  });

  it("conserva como máximo 20 File y omite los excedentes sin renderizarlos ni retenerlos", () => {
    const selectedFiles = makeFiles(25);
    const state = enqueueRequestDocumentFiles(
      createRequestDocumentUploadQueueState(),
      selectedFiles,
      { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT },
      (index) => `queue-${index}`,
    );

    expect(state.items).toHaveLength(20);
    expect(state.omittedCount).toBe(5);
    expect(state.items.map((item) => item.file)).toEqual(
      selectedFiles.slice(0, 20),
    );
    expect(state.items.some((item) => item.file === selectedFiles[20])).toBe(
      false,
    );
  });

  it("modela En cola, Subiendo, Guardado, Procesando, Revisar y Error", () => {
    let state = enqueueRequestDocumentFiles(
      createRequestDocumentUploadQueueState(),
      makeFiles(3),
      { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT },
      (index) => `queue-${index}`,
    );

    expect(state.items[0].state).toBe(
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED,
    );
    state = requestDocumentUploadQueueReducer(state, { type: "start" });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-started",
      itemId: "queue-0",
    });
    expect(state.items[0].state).toBe(
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING,
    );
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-saved",
      itemId: "queue-0",
      document: makeDocument(),
    });
    expect(state.items[0].state).toBe(REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED);
    state = requestDocumentUploadQueueReducer(state, {
      type: "processing",
      itemId: "queue-0",
    });
    expect(state.items[0].state).toBe(
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING,
    );
    state = requestDocumentUploadQueueReducer(state, {
      type: "needs-review",
      itemId: "queue-0",
    });
    expect(state.items[0].state).toBe(
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW,
    );
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-started",
      itemId: "queue-1",
    });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-failed",
      itemId: "queue-1",
      message: "Sin conexión",
      retryable: true,
    });
    expect(state.items[1].state).toBe(REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR);
  });

  it("pausa después del archivo actual y reanuda sin iniciar otro automáticamente", () => {
    let state = enqueueRequestDocumentFiles(
      createRequestDocumentUploadQueueState(),
      makeFiles(2),
      { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT },
      (index) => `queue-${index}`,
    );
    state = requestDocumentUploadQueueReducer(state, { type: "start" });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-started",
      itemId: "queue-0",
    });
    state = requestDocumentUploadQueueReducer(state, {
      type: "pause-requested",
    });

    expect(state.batchState).toBe(
      REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSE_REQUESTED,
    );
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-saved",
      itemId: "queue-0",
      document: makeDocument(),
    });
    expect(state.batchState).toBe(REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSED);
    expect(state.items[1].state).toBe(
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED,
    );

    state = requestDocumentUploadQueueReducer(state, { type: "resume" });
    expect(state.batchState).toBe(REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.RUNNING);
  });

  it("reintenta solo errores retryable y nunca éxitos conocidos", () => {
    let state = enqueueRequestDocumentFiles(
      createRequestDocumentUploadQueueState(),
      makeFiles(3),
      { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT },
      (index) => `queue-${index}`,
    );
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-saved",
      itemId: "queue-0",
      document: makeDocument(),
    });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-failed",
      itemId: "queue-1",
      message: "Temporal",
      retryable: true,
    });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-failed",
      itemId: "queue-2",
      message: "Inválido",
      retryable: false,
    });
    state = requestDocumentUploadQueueReducer(state, { type: "retry-failed" });

    expect(state.items.map((item) => item.state)).toEqual([
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED,
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED,
      REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR,
    ]);
  });

  it("cuenta progreso por respuestas terminadas y conserva FAILED como Guardado con incidencia", () => {
    let state = enqueueRequestDocumentFiles(
      createRequestDocumentUploadQueueState(),
      makeFiles(2),
      { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT },
      (index) => `queue-${index}`,
    );
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-saved",
      itemId: "queue-0",
      document: makeDocument({
        upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED,
        storage_provider: "LOCAL",
      }),
    });
    state = requestDocumentUploadQueueReducer(state, {
      type: "upload-failed",
      itemId: "queue-1",
      message: "Temporal",
      retryable: true,
    });

    const summary = getRequestDocumentUploadQueueSummary(state);
    expect(summary).toMatchObject({
      total: 2,
      processed: 2,
      saved: 1,
      errors: 1,
      progressPercent: 100,
    });
    expect(state.items[0]).toMatchObject({
      state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED,
      hasPersistentWarning: true,
      retryable: false,
    });
  });
});
