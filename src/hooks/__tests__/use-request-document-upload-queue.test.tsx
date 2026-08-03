import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRequestDocumentUploadQueue } from "@/hooks/use-request-document-upload-queue";
import { ApiRequestError } from "@/lib/api-client";
import { REQUEST_DOCUMENT_UPLOAD_BATCH_STATE, REQUEST_DOCUMENT_UPLOAD_FILE_STATE } from "@/lib/request-document-upload-queue";
import { REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_UPLOAD_STATUS, type RequestDocument } from "@/types/requests";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock("@/hooks/use-requests", () => ({
  useUploadRequestDocument: () => ({ uploadDocument: vi.fn(), isLoading: false, error: null }),
}));

function makeFile(name: string): File {
  return new File([name], name, { type: "application/pdf" });
}

function makeDocument(id: string, overrides: Partial<RequestDocument> = {}): RequestDocument {
  return {
    id,
    payment_request_id: "request-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    safe_filename: `${id}.pdf`,
    original_filename: `${id}.pdf`,
    mime_type: "application/pdf",
    size_bytes: 100,
    sha256_hash: `hash-${id}`,
    storage_provider: "DRIVE",
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    uploaded_by_id: "user-1",
    created_at: "2026-07-31T10:00:00.000Z",
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("useRequestDocumentUploadQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ejecuta una sola secuencia, refresca recursos y conserva progreso entre renders", async () => {
    const first = createDeferred<RequestDocument>();
    const second = createDeferred<RequestDocument>();
    const uploadDocument = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const refreshDocuments = vi.fn().mockResolvedValue(undefined);
    const refreshReceipts = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(() => useRequestDocumentUploadQueue({
      requestId: "request-1",
      uploadDocument,
      refreshDocuments,
      refreshReceipts,
      interFileDelayMs: 0,
    }));

    act(() => {
      result.current.enqueue([makeFile("uno.pdf"), makeFile("dos.pdf")], { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT });
      result.current.start();
    });

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    expect(result.current.items[0].state).toBe(REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING);
    rerender();
    expect(result.current.summary.total).toBe(2);

    await act(async () => first.resolve(makeDocument("document-1")));
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(makeDocument("document-2")));

    await waitFor(() => expect(result.current.state.batchState).toBe(REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.SETTLED));
    expect(result.current.summary).toMatchObject({ total: 2, saved: 2, processed: 2, progressPercent: 100 });
    expect(refreshDocuments).toHaveBeenCalledTimes(1);
    expect(refreshReceipts).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("2 documentos adjuntados correctamente.");
  });

  it("pausa después del activo y reanuda desde el siguiente en cola", async () => {
    const first = createDeferred<RequestDocument>();
    const uploadDocument = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(makeDocument("document-2"));
    const { result } = renderHook(() => useRequestDocumentUploadQueue({
      requestId: "request-1",
      uploadDocument,
      interFileDelayMs: 0,
    }));

    act(() => {
      result.current.enqueue([makeFile("uno.pdf"), makeFile("dos.pdf")], { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT });
      result.current.start();
    });
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    act(() => result.current.pauseAfterCurrent());
    await act(async () => first.resolve(makeDocument("document-1")));

    await waitFor(() => expect(result.current.state.batchState).toBe(REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSED));
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    expect(result.current.items[1].state).toBe(REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED);

    act(() => result.current.resume());
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state.batchState).toBe(REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.SETTLED));
  });

  it("mantiene 201/FAILED como incidencia guardada y no anuncia éxito pleno ni lo reintenta", async () => {
    const uploadDocument = vi.fn().mockResolvedValue(makeDocument("document-local", {
      storage_provider: "LOCAL",
      upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED,
    }));
    const { result } = renderHook(() => useRequestDocumentUploadQueue({
      requestId: "request-1",
      uploadDocument,
      interFileDelayMs: 0,
    }));

    act(() => {
      result.current.enqueue([makeFile("local.pdf")], { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT });
      result.current.start();
    });

    await waitFor(() => expect(result.current.state.batchState).toBe(REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.SETTLED));
    expect(result.current.items[0]).toMatchObject({
      state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED,
      hasPersistentWarning: true,
      retryable: false,
    });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("1 documento quedó guardado con una incidencia de almacenamiento.");

    act(() => result.current.retryFailed());
    expect(uploadDocument).toHaveBeenCalledTimes(1);
  });

  it("respeta Retry-After antes del siguiente archivo y permite retry global solo de fallos elegibles", async () => {
    vi.useFakeTimers();
    const rateLimitError = new ApiRequestError(429, {
      statusCode: 429,
      message: "Espera antes de reintentar",
      error: "Too Many Requests",
      timestamp: "2026-07-31T10:00:00.000Z",
      path: "/requests/request-1/documents",
    }, new Headers({ "Retry-After": "2" }));
    const uploadDocument = vi.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(makeDocument("document-2"))
      .mockResolvedValueOnce(makeDocument("document-retry"));
    const { result } = renderHook(() => useRequestDocumentUploadQueue({
      requestId: "request-1",
      uploadDocument,
      interFileDelayMs: 0,
    }));

    act(() => {
      result.current.enqueue([makeFile("uno.pdf"), makeFile("dos.pdf")], { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT });
      result.current.start();
    });
    await act(async () => Promise.resolve());
    expect(uploadDocument).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(1_999));
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(uploadDocument).toHaveBeenCalledTimes(2);
    await act(async () => vi.runAllTimersAsync());

    act(() => result.current.retryFailed());
    await act(async () => vi.runAllTimersAsync());
    expect(uploadDocument).toHaveBeenCalledTimes(3);
    expect(uploadDocument.mock.calls[2][1].file.name).toBe("uno.pdf");
    vi.useRealTimers();
  });

  it("respeta retry_after_ms del contrato antes de continuar la cola", async () => {
    vi.useFakeTimers();
    const rateLimitError = new ApiRequestError(429, {
      statusCode: 429,
      code: "DRIVE_RATE_LIMITED",
      message: "Espera antes de reintentar",
      error: "Too Many Requests",
      timestamp: "2026-07-31T10:00:00.000Z",
      path: "/requests/request-1/documents",
      retryable: true,
      retry_after_ms: 1_250,
    });
    const uploadDocument = vi.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(makeDocument("document-2"));
    const { result } = renderHook(() => useRequestDocumentUploadQueue({
      requestId: "request-1",
      uploadDocument,
      interFileDelayMs: 0,
    }));

    act(() => {
      result.current.enqueue([makeFile("uno.pdf"), makeFile("dos.pdf")], { category: REQUEST_DOCUMENT_CATEGORY.RECEIPT });
      result.current.start();
    });
    await act(async () => Promise.resolve());

    await act(async () => vi.advanceTimersByTimeAsync(1_249));
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(uploadDocument).toHaveBeenCalledTimes(2);
    await act(async () => vi.runAllTimersAsync());
    vi.useRealTimers();
  });
});
