import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRequest, useUploadExtraRequestDocument } from "@/hooks/use-requests";
import { useRequestDocumentUploadQueue } from "@/hooks/use-request-document-upload-queue";
import { RequestExtraDocumentsModal } from "@/components/requests/request-extra-documents-modal";
import {
  deleteExtraRequestDocument,
  uploadExtraRequestDocument,
} from "@/lib/requests";
import {
  bindGiofLeaseCredential,
  clearGiofLeaseCredentials,
} from "@/lib/giof-work-lease-session";
import { useAuthStore } from "@/stores/auth-store";
import { getExtraDocumentMutationContext } from "@/lib/request-extra-document-context";
import {
  REQUEST_DOCUMENT_CATEGORY,
  type RequestDocumentUploadResponse,
  type PaymentRequest,
  type GiofExtraDocumentContext,
} from "@/types/requests";

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn() }));
vi.mock("@/lib/auth/refresh-session", () => ({ refreshSession }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const context = { assignmentVersion: "7", token: "live-token" };
const file = new File(["evidence"], "evidence.pdf", {
  type: "application/pdf",
});
const input = {
  file,
  document_category: REQUEST_DOCUMENT_CATEGORY.OTHER,
  display_name: "Anexo personalizado",
  idempotency_key: "stable-file-key",
};
const document: RequestDocumentUploadResponse = {
  id: "extra-1",
  payment_request_id: "request-1",
  document_category: "OTHER",
  document_purpose: "EXTRA",
  safe_filename: file.name,
  original_filename: file.name,
  mime_type: file.type,
  size_bytes: file.size,
  storage_provider: "DRIVE",
  upload_status: "PERMANENT",
  created_at: "2026-10-05T00:00:00Z",
};
function response(status = 201): Response {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data: document }
        : { statusCode: status, message: "Denied" },
    ),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
function request(index = 0): RequestInit {
  return vi.mocked(fetch).mock.calls[index][1]!;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => response()),
  );
  refreshSession.mockReset();
  clearGiofLeaseCredentials();
  useAuthStore.setState({
    accessToken: "access-token",
    user: null,
    isLoading: false,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearGiofLeaseCredentials();
});

describe("scoped EXTRA document contracts", () => {
  const authoritative: GiofExtraDocumentContext = {
    requestId: "request-1", pool: "PAYMENT", assigneeId: "actor", assignmentState: "SELF",
    assignmentVersion: "7", leaseState: "NONE", leaseRequired: false, canMutate: true, readOnly: false,
  };
  async function loadDetail(extra: GiofExtraDocumentContext | undefined, status = "PAID", requestType = "ADVANCE") {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: {
      id: "request-1", status, request_type: requestType, extra_document_context: extra,
      giof_work: { requestId: "request-1", pool: "REQUEST", assigneeId: "other", assignmentState: "OTHER", assignmentVersion: "99", leaseState: "ACTIVE_OTHER", canEdit: false, readOnly: true },
    } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const hook = renderHook(() => useRequest("request-1"));
    await waitFor(() => expect(hook.result.current.request?.id).toBe("request-1"));
    const detail = hook.result.current.request!;
    hook.unmount();
    expect(detail.giof_work?.assignmentVersion).toBe("99");
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/requests\/request-1$/);
    vi.mocked(fetch).mockClear();
    return detail;
  }
  it.each(["GIOF_MANAGER", "GIOF_GESTOR"].flatMap(role =>
    [null, "foreign"].map(assignee => [role, assignee] as const),
  ))("connects PAID detail for %s/assignee %s without version or lease headers", async (role, assignee) => {
    const detail = await loadDetail({ ...authoritative, assigneeId: assignee, assignmentState: assignee ? "OTHER" : "UNASSIGNED", leaseState: "ACTIVE_OTHER" });
    bindGiofLeaseCredential({ requestId: detail.id, pool: "PAYMENT", assignmentVersion: "99", ownerId: "foreign", token: "ambient-token", heartbeatAt: null, expiresAt: "2099-01-01T00:00:00Z", ttlSeconds: 300, heartbeatIntervalSeconds: 60 });
    const adapted = getExtraDocumentMutationContext(detail, "actor", role);
    expect(adapted).toEqual({});
    await uploadExtraRequestDocument(detail.id, input, adapted);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteExtraRequestDocument(detail.id, "extra-1", adapted);
    for (const index of [0, 1]) {
      const headers = new Headers(request(index).headers);
      expect(headers.has("x-giof-assignment-version")).toBe(false);
      expect(headers.has("x-giof-lease-token")).toBe(false);
    }
  });
  it.each([
    ["APPROVED", "ADVANCE", "PAYMENT", true],
    ["PAID", "ADVANCE", "PAYMENT", false],
    ["SUBMITTED", "ADVANCE_SETTLEMENT", "REXAN", true],
    ["CLOSED", "ADVANCE_SETTLEMENT", "REXAN", false],
    ["SUBMITTED", "ADVANCE", "REQUEST", true],
    ["REJECTED", "ADVANCE", "REQUEST", false],
  ] as const)("connects real detail %s/%s to authoritative %s transport", async (status, type, pool, live) => {
    const detail = await loadDetail({ ...authoritative, pool, leaseRequired: live, leaseState: live ? "ACTIVE_SELF" : "NONE" }, status, type);
    bindGiofLeaseCredential({ requestId: "request-1", pool, assignmentVersion: live ? "7" : "6", ownerId: "actor", token: "memory-token", heartbeatAt: null, expiresAt: "2099-01-01T00:00:00Z", ttlSeconds: 300, heartbeatIntervalSeconds: 60 });
    const adapted = getExtraDocumentMutationContext(detail, "actor", "GIOF_GESTOR");
    expect(adapted).toEqual({});
    expect(Object.hasOwn(adapted!, "token")).toBe(false);
    await uploadExtraRequestDocument(detail.id, input, adapted);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteExtraRequestDocument(detail.id, "extra-1", adapted);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const index of [0, 1]) {
      expect(new Headers(request(index).headers).get("x-giof-assignment-version")).toBeNull();
      expect(new Headers(request(index).headers).get("x-giof-lease-token")).toBeNull();
    }
  });
  it.each([
    undefined,
    { ...authoritative, canMutate: false, readOnly: true },
  ] satisfies (GiofExtraDocumentContext | undefined)[])("denies unavailable authoritative detail before mutation fetch %j", async (extra) => {
    const detail = await loadDetail(extra);
    const adapted = getExtraDocumentMutationContext(detail, "actor", "GIOF_MANAGER");
    expect(adapted).toBeUndefined();
    await expect(uploadExtraRequestDocument(detail.id, input, adapted)).rejects.toThrow();
    await expect(deleteExtraRequestDocument(detail.id, "extra-1", adapted)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["missing", "request", "pool", "version", "owner", "expired"])("ignores %s financial credentials for EXTRA", async (mismatch) => {
    const detail = await loadDetail({ ...authoritative, leaseRequired: true, leaseState: "ACTIVE_SELF" }, "APPROVED");
    if (mismatch !== "missing") bindGiofLeaseCredential({ requestId: mismatch === "request" ? "different" : "request-1", pool: mismatch === "pool" ? "REQUEST" : "PAYMENT", assignmentVersion: mismatch === "version" ? "6" : "7", ownerId: mismatch === "owner" ? "other" : "actor", token: "token", heartbeatAt: null, expiresAt: mismatch === "expired" ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z", ttlSeconds: 300, heartbeatIntervalSeconds: 60 }, ["request-1"]);
    const adapted = getExtraDocumentMutationContext(detail, "actor", "GIOF_GESTOR");
    expect(adapted).toEqual({});
    await uploadExtraRequestDocument(detail.id, input, adapted);
    expect(new Headers(request().headers).has("x-giof-lease-token")).toBe(false);
  });
  it("never promotes ordinary SELF finance metadata when EXTRA context is missing", async () => {
    const detail = await loadDetail(undefined);
    detail.giof_work = { requestId: detail.id, pool: "PAYMENT", assigneeId: "actor", assignmentState: "SELF", assignmentVersion: "7", leaseState: "ACTIVE_SELF", canEdit: true, canAcquire: true, readOnly: false };
    bindGiofLeaseCredential({ requestId: detail.id, pool: "PAYMENT", assignmentVersion: "7", ownerId: "actor", token: "token", heartbeatAt: null, expiresAt: "2099-01-01T00:00:00Z", ttlSeconds: 300, heartbeatIntervalSeconds: 60 });
    expect(getExtraDocumentMutationContext(detail, "actor", "GIOF_MANAGER")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not require or reuse credentials for terminal ACTIVE_SELF", async () => {
    const detail = await loadDetail({ ...authoritative, leaseState: "ACTIVE_SELF" });
    expect(getExtraDocumentMutationContext(detail, "actor", "GIOF_GESTOR")).toEqual({});
    bindGiofLeaseCredential({ requestId: detail.id, pool: "PAYMENT", assignmentVersion: "7", ownerId: "actor", token: "token", heartbeatAt: null, expiresAt: "2099-01-01T00:00:00Z", ttlSeconds: 300, heartbeatIntervalSeconds: 60 });
    const adapted = getExtraDocumentMutationContext(detail, "actor", "GIOF_GESTOR");
    await uploadExtraRequestDocument(detail.id, input, adapted);
    expect(new Headers(request().headers).get("x-giof-lease-token")).toBeNull();
  });
  it.each(["REJECTED", "CLOSED", "VOIDED", "PAID"])("connects terminal %s adapter to real POST and DELETE without an ambient lease", async (status) => {
    const terminal = {
      id: "request-1", status, request_type: "ADVANCE",
       extra_document_context: { requestId: "request-1", pool: status === "PAID" ? "PAYMENT" : "REQUEST", assignmentState: "SELF", assigneeId: "actor", assignmentVersion: "7", leaseState: "NONE", leaseRequired: false, canMutate: true, readOnly: false },
    } as PaymentRequest;
    bindGiofLeaseCredential({ requestId: "request-1", pool: "REQUEST", assignmentVersion: "6", ownerId: "actor", token: "ambient-old-token", heartbeatAt: null, expiresAt: "2099-01-01T00:00:00Z", ttlSeconds: 300, heartbeatIntervalSeconds: 60 });
    const terminalContext = getExtraDocumentMutationContext(terminal, "actor", "GIOF_GESTOR");
    expect(terminalContext).toEqual({});
    await uploadExtraRequestDocument("request-1", input, terminalContext);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteExtraRequestDocument("request-1", "extra-1", terminalContext);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [index, method] of ["POST", "DELETE"].entries()) {
      expect(request(index).method).toBe(method);
      const headers = new Headers(request(index).headers);
      expect(headers.get("x-giof-assignment-version")).toBeNull();
      expect(headers.get("x-giof-lease-token")).toBeNull();
    }
  });
  it("uses exact multipart route, explicit context, stable key and backend-only purpose", async () => {
    const spoofed = {
      ...input,
      metadata_json: {
        note: "keep",
        document_purpose: "EXTRA",
        giof_extra_document_v1: true,
        document_upload_provenance_v1: true,
      },
      document_purpose: "EXTRA",
    };
    const result = await uploadExtraRequestDocument(
      "request-1",
      spoofed,
      context,
    );
    expect(result.document_purpose).toBe("EXTRA");
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(
      /\/requests\/request-1\/documents\/extra$/,
    );
    const init = request();
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe(input.idempotency_key);
    expect(headers.get("x-giof-assignment-version")).toBeNull();
    expect(headers.get("x-giof-lease-token")).toBeNull();
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    const body = init.body as FormData;
    expect([...body.keys()]).toEqual([
      "file",
      "document_category",
      "display_name",
      "metadata_json",
    ]);
    expect(body.get("file")).toBe(file);
    expect(body.get("document_category")).toBe("OTHER");
    expect(body.get("display_name")).toBe(input.display_name);
    expect(JSON.parse(String(body.get("metadata_json")))).toEqual({
      note: "keep",
    });
  });

  it("leaves OTHER/title and category decisions to the server; no non-OTHER title", async () => {
    await uploadExtraRequestDocument(
      "request-1",
      { ...input, display_name: undefined },
      context,
    );
    expect((request().body as FormData).has("display_name")).toBe(false);
    await uploadExtraRequestDocument(
      "request-1",
      { ...input, document_category: REQUEST_DOCUMENT_CATEGORY.EVIDENCE },
      context,
    );
    expect((request(1).body as FormData).has("display_name")).toBe(false);
  });

  it("prepares DELETE as void/204 without the ordinary endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      deleteExtraRequestDocument("request-1", "extra-1", context),
    ).resolves.toBeUndefined();
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(
      /\/requests\/request-1\/documents\/extra\/extra-1$/,
    );
    expect(request().method).toBe("DELETE");
    expect(
      new Headers(request().headers).get("x-giof-assignment-version"),
    ).toBeNull();
    expect(new Headers(request().headers).get("x-giof-lease-token")).toBe(
      null,
    );
    expect(request().body).toBeUndefined();
  });

  it("retains the DELETE 204 contract after the existing 401 refresh", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    refreshSession.mockResolvedValue({ accessToken: "renewed" });
    await expect(
      deleteExtraRequestDocument("request-1", "extra-1", context),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    undefined,
  ])("fails closed before fetch for invalid context %j", async (invalid) => {
    await expect(
      uploadExtraRequestDocument("request-1", input, invalid),
    ).rejects.toThrow();
    await expect(
      deleteExtraRequestDocument("request-1", "extra-1", invalid),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a caller-owned upload identity", async () => {
    await expect(
      uploadExtraRequestDocument(
        "request-1",
        { ...input, idempotency_key: "" },
        context,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not borrow an ambient lease for assignment-only terminal context", async () => {
    bindGiofLeaseCredential({
      requestId: "request-1",
      pool: "REQUEST",
      token: "stale-token",
      assignmentVersion: "2",
      ownerId: "other",
      expiresAt: "2099-01-01T00:00:00Z",
      ttlSeconds: 300,
      heartbeatIntervalSeconds: 60,
      heartbeatAt: "2026-10-05T00:00:00Z",
    });
    await uploadExtraRequestDocument("request-1", input, {
      assignmentVersion: "7",
    });
    expect(new Headers(request().headers).get("x-giof-lease-token")).toBeNull();
    expect(
      new Headers(request().headers).get("x-giof-assignment-version"),
    ).toBeNull();
  });

  it.each([403, 409])(
    "does not retry state-changing status %s",
    async (status) => {
      vi.mocked(fetch).mockResolvedValue(response(status));
      await expect(
        uploadExtraRequestDocument("request-1", input, context),
      ).rejects.toMatchObject({ status });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("retains identity and explicit context on the existing 401 refresh retry", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response());
    refreshSession.mockResolvedValue({ accessToken: "renewed" });
    await uploadExtraRequestDocument("request-1", input, context);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(request(1).body).toBe(request().body);
    expect(new Headers(request(1).headers).get("Idempotency-Key")).toBe(
      input.idempotency_key,
    );
    expect(
      new Headers(request(1).headers).get("x-giof-assignment-version"),
    ).toBeNull();
  });

  it("cancels during refresh without retrying the mutation", async () => {
    let finish!: (value: { accessToken: string }) => void;
    refreshSession.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(fetch).mockResolvedValue(response(401));
    const controller = new AbortController();
    const pending = uploadExtraRequestDocument("request-1", input, {
      ...context,
      signal: controller.signal,
    });
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    controller.abort();
    finish({ accessToken: "renewed" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects a pre-aborted command without sending it", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadExtraRequestDocument("request-1", input, {
        ...context,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("actual EXTRA modal retry through real hooks and transport", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: {
      id: "actor", firstName: "Giof", lastName: "Gestor", email: "giof@example.test",
      documentNumber: "12345678", role: { code: "GIOF_GESTOR", name: "GIOF Gestor" },
      onboardingCompleted: true, authSource: "LOCAL",
    } });
  });

  function detail(): PaymentRequest {
    return { id: "request-1", status: "CLOSED", request_type: "ADVANCE",
      extra_document_context: { requestId: "request-1", pool: "REQUEST", assigneeId: "actor",
        assignmentState: "SELF", assignmentVersion: "7", leaseState: "NONE",
        leaseRequired: false, canMutate: true, readOnly: false },
    } as PaymentRequest;
  }

  function enqueueAndStart() {
    fireEvent.click(screen.getByRole("button", { name: "Gestionar documentos extra" }));
    fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "OTHER" } });
    fireEvent.change(screen.getByLabelText("Archivos extra"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(`Título de ${file.name}`), { target: { value: input.display_name } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la cola" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
  }

  it.each(["PAID", "REJECTED", "CLOSED", "VOIDED"])(
    "uploads two custom OTHER files in StrictMode on %s with role-only context",
    async (status) => {
      const value = { ...detail(), status, extra_document_context: {
        requestId: "request-1", canMutate: true, readOnly: false, leaseRequired: false,
      } } as PaymentRequest;
      const sheet = new File(["sheet"], "original.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const files = [sheet, file];
      const titles = ["  Informe Ａ  ", "  Evidencia PDF  "];
      const refresh = vi.fn().mockResolvedValue(undefined);
      render(<RequestExtraDocumentsModal request={value} documents={[]} onRefresh={refresh} />, { reactStrictMode: true });
      fireEvent.click(screen.getByRole("button", { name: "Gestionar documentos extra" }));
      fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "OTHER" } });
      fireEvent.change(screen.getByLabelText("Archivos extra"), { target: { files } });
      files.forEach((selected, index) => fireEvent.change(screen.getByLabelText(`Título de ${selected.name}`), { target: { value: titles[index] } }));
      fireEvent.click(screen.getByRole("button", { name: "Agregar a la cola" }));
      expect(screen.getAllByText("En cola")).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 4000 });
      await waitFor(() => expect(screen.getAllByText("Guardado")).toHaveLength(2));
      const keys = new Set<string | null>();
      vi.mocked(fetch).mock.calls.forEach((call, index) => {
        expect(call[0]).toMatch(/\/requests\/request-1\/documents\/extra$/);
        const init = call[1]!;
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.has("x-giof-assignment-version")).toBe(false);
        expect(headers.has("x-giof-lease-token")).toBe(false);
        keys.add(headers.get("Idempotency-Key"));
        const body = init.body as FormData;
        expect(body.get("file")).toBe(files[index]);
        expect(body.get("display_name")).toBe(titles[index].normalize("NFKC").trim());
        expect(body.get("document_category")).toBe("OTHER");
        expect(init.signal?.aborted).toBe(false);
      });
      expect(keys.size).toBe(2);
      expect(keys.has(null)).toBe(false);
    },
  );

  it("renders sanitized custom titles as primary queue names without renaming native files", () => {
    render(<RequestExtraDocumentsModal request={detail()} documents={[]} onRefresh={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Gestionar documentos extra" }));
    fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "OTHER" } });
    fireEvent.change(screen.getByLabelText("Archivos extra"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(`Título de ${file.name}`), { target: { value: "  Anexo Ａ  " } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la cola" }));
    expect(screen.getByText("Anexo A")).toHaveClass("font-medium");
    expect(screen.getByText(file.name)).toHaveClass("text-muted-foreground");
    expect(file.name).toBe("evidence.pdf");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])("waits for real detail authority refresh midqueue (revoked=%s)", async (revoked) => {
    const minimal = { ...detail(), extra_document_context: {
      requestId: "request-1", canMutate: true, readOnly: false, leaseRequired: false,
      assigneeId: "foreign", assignmentState: "OTHER",
    } } as PaymentRequest;
    let finishUpload!: (value: Response) => void;
    let finishRead!: (value: Response) => void;
    let refreshDetail!: () => Promise<void>;
    let reads = 0;
    let posts = 0;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        posts += 1;
        if (posts === 1) return new Promise<Response>((resolve) => { finishUpload = resolve; });
        return response();
      }
      reads += 1;
      if (reads === 2) return new Promise<Response>((resolve) => { finishRead = resolve; });
      return new Response(JSON.stringify({ data: minimal }), { status: 200 });
    });
    function RealDetailModal() {
      const resource = useRequest("request-1");
      refreshDetail = () => resource.refetch({ background: true });
      return resource.request ? <RequestExtraDocumentsModal request={resource.request} documents={[]} refreshing={resource.isRefreshing} onRefresh={refreshDetail} /> : null;
    }
    render(<RealDetailModal />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar documentos extra" }));
    const second = new File(["sheet"], "second.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "OTHER" } });
    fireEvent.change(screen.getByLabelText("Archivos extra"), { target: { files: [file, second] } });
    [file, second].forEach((selected, index) => fireEvent.change(screen.getByLabelText(`Título de ${selected.name}`), { target: { value: `Anexo ${index + 1}` } }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la cola" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
    await waitFor(() => expect(posts).toBe(1));
    let refreshing!: Promise<void>;
    act(() => { refreshing = refreshDetail(); });
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => { finishUpload(response()); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    expect(posts).toBe(1);
    expect(screen.queryAllByText(/el contexto ya no está vigente/)).toHaveLength(0);
    const updated = { ...minimal, extra_document_context: {
      ...minimal.extra_document_context!, canMutate: !revoked, readOnly: revoked,
      assigneeId: null, assignmentState: "UNASSIGNED", pool: "PAYMENT", assignmentVersion: "999",
    } };
    await act(async () => { finishRead(new Response(JSON.stringify({ data: updated }), { status: 200 })); await refreshing; });
    if (revoked) {
      await waitFor(() => expect(screen.getByLabelText("Archivos extra")).toBeDisabled());
      expect(posts).toBe(1);
    } else {
      await waitFor(() => expect(posts).toBe(2));
      await waitFor(() => expect(screen.getAllByText("Guardado")).toHaveLength(2));
      const postCalls = vi.mocked(fetch).mock.calls.filter((call) => call[1]?.method === "POST");
      expect((postCalls[1][1]!.body as FormData).get("display_name")).toBe("Anexo 2");
      expect((postCalls[1][1]!.body as FormData).get("file")).toBe(second);
    }
  });

  it("stops subsequent queued POSTs after an authorization denial", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(403));
    render(<RequestExtraDocumentsModal request={detail()} documents={[]} onRefresh={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Gestionar documentos extra" }));
    fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "OTHER" } });
    const second = new File(["second"], "second.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Archivos extra"), { target: { files: [file, second] } });
    [file, second].forEach((selected) => fireEvent.change(screen.getByLabelText(`Título de ${selected.name}`), { target: { value: "Anexo personalizado" } }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la cola" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
    await waitFor(() => expect(screen.getAllByText("Error")).toHaveLength(2), { timeout: 4000 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reports actual named-title validation instead of an expired-context diagnosis", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      statusCode: 400, code: "OTHER_DISPLAY_NAME_INVALID", message: "The OTHER document business title is invalid.",
    }), { status: 400 }));
    render(<RequestExtraDocumentsModal request={detail()} documents={[]} onRefresh={async () => {}} />);
    enqueueAndStart();
    await waitFor(() => expect(screen.getByText("Error")).toBeInTheDocument());
    expect(screen.getAllByText(/El nombre personalizado de Otro documento no es válido/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/el contexto ya no está vigente/)).toHaveLength(0);
    expect(fetch).toHaveBeenCalledOnce();
    expect((request().body as FormData).get("display_name")).toBe(input.display_name);
  });

  it.each([503, 429, "network", "drive-conflict"] as const)("preserves identity after %s and same-context refresh; only explicit retry POSTs", async (failure) => {
    if (failure === "network") vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    else if (failure === "drive-conflict") vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 409, message: "Storage temporarily unavailable", code: "DRIVE_RATE_LIMITED", retryable: true }), { status: 409, headers: { "Content-Type": "application/json" } }));
    else vi.mocked(fetch).mockResolvedValueOnce(response(failure));
    let finish!: () => void;
    const refresh = vi.fn().mockResolvedValue(undefined).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = render(<RequestExtraDocumentsModal request={detail()} documents={[]} onRefresh={refresh} />);
    enqueueAndStart();
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    view.rerender(<RequestExtraDocumentsModal request={detail()} documents={[]} refreshing onRefresh={refresh} />);
    expect(screen.getByLabelText("Archivos extra")).toBeDisabled();
    expect(fetch).toHaveBeenCalledOnce();
    const first = request();
    const key = new Headers(first.headers).get("Idempotency-Key");
    expect(key).toBeTruthy();
    const refreshed = detail();
    Object.assign(refreshed.extra_document_context!, { pool: "PAYMENT", assignmentVersion: "999", assignmentState: "OTHER", assigneeId: "foreign", leaseState: "ACTIVE_OTHER" });
    view.rerender(<RequestExtraDocumentsModal request={refreshed} documents={[]} onRefresh={refresh} />);
    await act(async () => finish());
    const retry = await screen.findByRole("button", { name: `Reintentar ${file.name}` });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText("Guardado")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [index, call] of vi.mocked(fetch).mock.calls.entries()) {
      expect(call[0]).toMatch(/\/requests\/request-1\/documents\/extra$/);
      expect(request(index).method).toBe("POST");
      expect(new Headers(request(index).headers).get("Idempotency-Key")).toBe(key);
      expect(new Headers(request(index).headers).get("x-giof-assignment-version")).toBeNull();
      expect(new Headers(request(index).headers).get("x-giof-lease-token")).toBeNull();
      const body = request(index).body as FormData;
      expect(body.get("file")).toBe(file);
      expect(body.get("document_category")).toBe("OTHER");
      expect(body.get("display_name")).toBe(input.display_name);
    }
    // La respuesta ambigua puede representar un documento ya completado: se recupera con la misma identidad.
    expect(screen.getAllByText("Guardado")).toHaveLength(1);
  });

  it.each([401, 403, 409])("keeps denied/conflicting %s blocked even after identical refresh", async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(status === 409
      ? new Response(JSON.stringify({ statusCode: 409, message: "Payload conflict", code: "IDEMPOTENCY_PAYLOAD_CONFLICT", retryable: false }), { status: 409, headers: { "Content-Type": "application/json" } })
      : response(status));
    refreshSession.mockResolvedValue(null);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const view = render(<RequestExtraDocumentsModal request={detail()} documents={[]} onRefresh={refresh} />);
    enqueueAndStart();
    if (status === 401) {
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(useAuthStore.getState().user).toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
      return;
    }
    await waitFor(() => expect(screen.getByRole("button", { name: `Retirar ${file.name}` })).toBeDisabled());
    view.rerender(<RequestExtraDocumentsModal request={detail()} documents={[]} onRefresh={refresh} />);
    expect(screen.queryByRole("button", { name: `Reintentar ${file.name}` })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Archivos extra")).toBeDisabled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["read-rights", "draft", "actor", "role", "logout", "abort"])("does not revive a transient failure after %s revokes the session", async (change) => {
    vi.mocked(fetch).mockResolvedValueOnce(response(503));
    let finish!: () => void;
    const refresh = vi.fn().mockResolvedValue(undefined).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const value = detail();
    const view = render(<RequestExtraDocumentsModal request={value} documents={[]} onRefresh={refresh} />);
    enqueueAndStart();
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const signal = request().signal!;
    if (change === "read-rights") value.extra_document_context!.canMutate = false;
    if (change === "draft") value.status = "DRAFT";
    if (change === "actor") useAuthStore.setState({ user: { ...useAuthStore.getState().user!, id: "different" } });
    if (change === "role") useAuthStore.setState({ user: { ...useAuthStore.getState().user!, role: { code: "ADMIN_SISTEMA", name: "Admin" } } });
    if (change === "logout") useAuthStore.setState({ user: null, accessToken: null });
    if (change === "abort") fireEvent.click(screen.getByRole("button", { name: "Cancelar carga pendiente" }));
    view.rerender(<RequestExtraDocumentsModal request={{ ...value }} documents={[]} onRefresh={refresh} />);
    await act(async () => finish());
    if (change === "role" || change === "logout") {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(signal.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
      return;
    }
    await waitFor(() => expect(screen.getByRole("button", { name: `Reintentar ${file.name}` })).toBeDisabled());
    expect(signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps retry blocked when authoritative refresh fails, without losing the transport classification", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(503));
    const refresh = vi.fn().mockRejectedValueOnce(new Error("Refresh unavailable")).mockResolvedValue(undefined);
    render(<RequestExtraDocumentsModal request={detail()} documents={[]} onRefresh={refresh} />);
    enqueueAndStart();
    const retry = await screen.findByRole("button", { name: `Reintentar ${file.name}` });
    await waitFor(() => expect(retry).toBeDisabled());
    expect(screen.getByText("Actualiza la vista: no se pudo refrescar el estado de los documentos.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("EXTRA upload through the unchanged queue", () => {
  it("keeps per-file identity on explicit retry and uses the existing queue state", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(503))
      .mockResolvedValue(response());
    const { result } = renderHook(() => {
      const mutation = useUploadExtraRequestDocument(context);
      return useRequestDocumentUploadQueue({
        requestId: "request-1",
        uploadDocument: mutation.uploadDocument,
        interFileDelayMs: 0,
      });
    });
    act(() => {
      result.current.enqueue([file], {
        category: REQUEST_DOCUMENT_CATEGORY.OTHER,
        fileTitles: [input.display_name],
      });
      result.current.start();
    });
    await waitFor(() => expect(result.current.items[0].state).toBe("error"));
    const key = new Headers(request().headers).get("Idempotency-Key");
    expect(fetch).toHaveBeenCalledOnce();
    act(() => result.current.retry(result.current.items[0].id));
    await waitFor(() =>
      expect(result.current.items[0].persistedDocumentId).toBe(document.id),
    );
    expect(new Headers(request(1).headers).get("Idempotency-Key")).toBe(key);
    expect(new Headers(request(1).headers).get("x-giof-lease-token")).toBe(
      null,
    );
    expect((request(1).body as FormData).get("display_name")).toBe(
      input.display_name,
    );
  });

  it.each([undefined, { ...context, signal: AbortSignal.abort() }])(
    "invalid context or abort become nonretryable queue errors, not ordinary uploads",
    async (invalid) => {
      const { result } = renderHook(() => {
        const mutation = useUploadExtraRequestDocument(invalid);
        return useRequestDocumentUploadQueue({
          requestId: "request-1",
          uploadDocument: mutation.uploadDocument,
          interFileDelayMs: 0,
        });
      });
      act(() => {
        result.current.enqueue([file], {
          category: REQUEST_DOCUMENT_CATEGORY.EVIDENCE,
        });
        result.current.start();
      });
      await waitFor(() => expect(result.current.items[0].state).toBe("error"));
      expect(result.current.items[0].retryable).toBe(false);
      act(() => result.current.retryFailed());
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
