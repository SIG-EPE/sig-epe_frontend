import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useRequestDocuments,
  useSupplierDocumentEvidence,
  useUploadRequestDocument,
} from "@/hooks/use-requests";
import { api } from "@/lib/api-client";
import {
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_TYPE,
  SUPPLIER_DOCUMENT_ACTIVITY_STATE,
  SUPPLIER_DOCUMENT_ELIGIBILITY_STATE,
  SUPPLIER_DOCUMENT_PROJECTION_REASON,
  SUPPLIER_DOCUMENT_PROJECTION_STATE,
  type RequestDocumentUploadResponse,
  type RequestType,
  type SupplierDocumentEvidenceProjection,
} from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: {
      isLoading: boolean;
      accessToken: string | null;
    }) => unknown,
  ) => selector({ isLoading: false, accessToken: "token" }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function evidence(
  primarySatisfied: boolean,
  id = primarySatisfied ? "document-ready" : "document-blocked",
): SupplierDocumentEvidenceProjection {
  return {
    state: primarySatisfied
      ? SUPPLIER_DOCUMENT_PROJECTION_STATE.READY
      : SUPPLIER_DOCUMENT_PROJECTION_STATE.BLOCKED,
    eligible: primarySatisfied,
    primary_satisfied: primarySatisfied,
    reason_code: primarySatisfied
      ? null
      : SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED,
    allowed_categories: [REQUEST_DOCUMENT_CATEGORY.INVOICE],
    documents: [
      {
        id,
        stored_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        effective_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        activity_state: primarySatisfied
          ? SUPPLIER_DOCUMENT_ACTIVITY_STATE.ACTIVE
          : SUPPLIER_DOCUMENT_ACTIVITY_STATE.INACTIVE,
        eligibility_state: primarySatisfied
          ? SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.ELIGIBLE
          : SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.INELIGIBLE,
        eligible: primarySatisfied,
        reason_code: primarySatisfied
          ? null
          : SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_NOT_PERMANENT,
      },
    ],
  };
}

describe("useSupplierDocumentEvidence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts committed evidence immediately and ignores the older GET", async () => {
    const stale = deferred<SupplierDocumentEvidenceProjection>();
    vi.mocked(api.get).mockReturnValueOnce(stale.promise);
    const { result } = renderHook(() =>
      useSupplierDocumentEvidence("request-1", REQUEST_TYPE.SUPPLIER_PAYMENT),
    );

    act(() => result.current.commitEvidence(evidence(true, "new-document")));
    expect(result.current.evidence?.documents[0]?.id).toBe("new-document");
    expect(result.current.isBlocking).toBe(false);

    await act(async () => {
      stale.resolve(evidence(false, "stale-document"));
      await stale.promise;
    });

    expect(result.current.evidence?.documents[0]?.id).toBe("new-document");
    expect(result.current.isBlocking).toBe(false);
  });

  it("keeps the newest delete/refetch generation when an older GET resolves last", async () => {
    const older = deferred<SupplierDocumentEvidenceProjection>();
    const newer = deferred<SupplierDocumentEvidenceProjection>();
    vi.mocked(api.get)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() =>
      useSupplierDocumentEvidence("request-1", REQUEST_TYPE.SUPPLIER_PAYMENT),
    );

    let retryPromise!: Promise<void>;
    act(() => {
      retryPromise = result.current.retry();
    });
    await act(async () => {
      newer.resolve(evidence(false, "after-delete"));
      await retryPromise;
    });
    await act(async () => {
      older.resolve(evidence(true, "deleted-document"));
      await older.promise;
    });

    expect(result.current.evidence?.documents[0]?.id).toBe("after-delete");
    expect(result.current.isBlocking).toBe(true);
  });

  it("exposes blocking unknown on a real failure and retry clears it", async () => {
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(evidence(true));
    const { result } = renderHook(() =>
      useSupplierDocumentEvidence("request-1", REQUEST_TYPE.SUPPLIER_PAYMENT),
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.evidence).toBeNull();
    expect(result.current.isBlocking).toBe(true);

    await act(async () => result.current.retry());

    expect(result.current.error).toBeNull();
    expect(result.current.isBlocking).toBe(false);
    expect(result.current.evidence?.primary_satisfied).toBe(true);
  });

  it("does not surface an aborted request as a business error", async () => {
    vi.mocked(api.get).mockImplementationOnce(
      (_path: string, options?: RequestInit) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const { result, rerender } = renderHook(
      ({ requestType }) =>
        useSupplierDocumentEvidence("request-1", requestType),
      {
        initialProps: {
          requestType: REQUEST_TYPE.SUPPLIER_PAYMENT as RequestType,
        },
      },
    );

    rerender({ requestType: REQUEST_TYPE.ADVANCE });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.isBlocking).toBe(false);
  });

  it("also ignores a cross-realm AbortError instead of exposing a business error", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    vi.mocked(api.get).mockRejectedValueOnce(abortError);
    const { result } = renderHook(() =>
      useSupplierDocumentEvidence("request-1", REQUEST_TYPE.SUPPLIER_PAYMENT),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
  });

  it("does not fetch evidence for non-supplier requests", () => {
    const { result } = renderHook(() =>
      useSupplierDocumentEvidence("request-1", REQUEST_TYPE.REIMBURSEMENT),
    );

    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.evidence).toBeNull();
    expect(result.current.isBlocking).toBe(false);
  });

  it("allows a parent-controlled document resource to disable the internal fetch", () => {
    renderHook(() => useRequestDocuments("request-1", { enabled: false }));

    expect(api.get).not.toHaveBeenCalled();
  });

  it("parses authoritative supplier evidence nested in a successful upload response", async () => {
    const authoritativeEvidence = evidence(false, "uploaded-document");
    const response = {
      id: "uploaded-document",
      payment_request_id: "request-1",
      scope_type: "REQUEST",
      request_allocation_id: null,
      document_section: null,
      document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
      document_category_normalized: REQUEST_DOCUMENT_CATEGORY.INVOICE,
      safe_filename: "factura.pdf",
      original_filename: "factura.pdf",
      mime_type: "application/pdf",
      size_bytes: 128,
      sha256_hash: "hash-uploaded-document",
      storage_provider: "DRIVE",
      storage_key: "requests/request-1/factura.pdf",
      drive_file_id: "drive-file-1",
      drive_web_url: "https://drive.example/file-1",
      upload_status: "PERMANENT",
      metadata_json: null,
      uploaded_by_id: "user-1",
      created_at: "2026-09-23T12:00:00.000Z",
      supplier_document_evidence: authoritativeEvidence,
    } satisfies RequestDocumentUploadResponse;
    vi.mocked(api.postForm).mockResolvedValueOnce(response);
    const { result } = renderHook(() => useUploadRequestDocument());

    let uploaded!: RequestDocumentUploadResponse;
    await act(async () => {
      uploaded = await result.current.uploadDocument("request-1", {
        file: new File(["invoice"], "factura.pdf", {
          type: "application/pdf",
        }),
        document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        idempotency_key: "supplier-upload-1",
      });
    });

    expect(uploaded.id).toBe("uploaded-document");
    expect(uploaded.supplier_document_evidence).toEqual(authoritativeEvidence);
    expect(uploaded.supplier_document_evidence?.primary_satisfied).toBe(false);
  });
});
