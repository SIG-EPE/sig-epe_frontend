import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRequestDocuments } from "@/hooks/use-requests";
import { api } from "@/lib/api-client";
import {
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  type RequestDocument,
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
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function document(id: string, filename: string): RequestDocument {
  return {
    id,
    payment_request_id: "request-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    document_category_normalized: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    safe_filename: filename,
    original_filename: filename,
    mime_type: "application/pdf",
    size_bytes: 128,
    sha256_hash: `hash-${id}`,
    storage_provider: "DRIVE",
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    uploaded_by_id: "user-1",
    created_at: "2026-09-22T12:00:00.000Z",
  };
}

describe("supplier document refetch baseline characterization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores an older in-flight document response after a committed upsert", async () => {
    const stale = deferred<RequestDocument[]>();
    vi.mocked(api.get).mockReturnValueOnce(stale.promise);
    const { result } = renderHook(() => useRequestDocuments("request-1"));

    act(() => {
      result.current.upsertDocument(document("new-document", "visible.pdf"));
    });
    expect(result.current.documents.map((item) => item.id)).toEqual([
      "new-document",
    ]);

    await act(async () => {
      stale.resolve([document("old-document", "stale.pdf")]);
      await stale.promise;
    });

    await waitFor(() =>
      expect(result.current.documents.map((item) => item.id)).toEqual([
        "new-document",
      ]),
    );
  });
});
