import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestExtraDocumentsModal } from "../request-extra-documents-modal";
import { getExtraDocumentMutationContext } from "@/lib/request-extra-document-context";
import { bindGiofLeaseCredential, clearGiofLeaseCredentials } from "@/lib/giof-work-lease-session";
import type { PaymentRequest, RequestDocument } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  role: "GIOF_GESTOR", actorId: "actor", upload: vi.fn(), remove: vi.fn(), refresh: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: mocks.actorId, role: { code: mocks.role } } }) }));
vi.mock("@/hooks/use-requests", () => ({
  useUploadExtraRequestDocument: () => ({ uploadDocument: mocks.upload }),
  useUploadRequestDocument: () => ({ uploadDocument: vi.fn() }),
}));
vi.mock("@/lib/requests", async (original) => ({ ...await original<typeof import("@/lib/requests")>(), deleteExtraRequestDocument: mocks.remove }));
vi.mock("@/lib/query-tags", async (original) => ({ ...await original<typeof import("@/lib/query-tags")>(), invalidateRequestDomain: mocks.invalidate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function request(status = "CLOSED", pool = "REQUEST", assignmentState = "SELF"): PaymentRequest {
  return { id: "request", status, request_type: "ADVANCE", extra_document_context: { requestId: "request", pool, assigneeId: "actor", assignmentState, assignmentVersion: "7", leaseState: "NONE", leaseRequired: false, canMutate: status !== "DRAFT", readOnly: status === "DRAFT" } } as PaymentRequest;
}
function document(id: string, purpose: "EXTRA" | null): RequestDocument {
  return { id, payment_request_id: "request", document_purpose: purpose, safe_filename: `${id}.pdf`, original_filename: `${id}.pdf`, mime_type: "application/pdf", size_bytes: 3, storage_provider: "DRIVE", created_at: "2026-10-06T00:00:00Z", document_category: "OTHER", drive_web_url: "https://drive.google.com/file/d/example/view", upload_status: "PERMANENT", provenance_label: "Agregado por GIOF", metadata_json: { giof_extra_document_v1: true } };
}
function renderModal(value = request(), documents = [document("extra", "EXTRA"), document("normal", null)]) {
  return render(<RequestExtraDocumentsModal request={value} documents={documents} onRefresh={mocks.refresh} />);
}
function open() { fireEvent.click(screen.getByRole("button", { name: "Gestionar documentos extra" })); }

describe("EXTRA context read adapter", () => {
  beforeEach(() => clearGiofLeaseCredentials());
  it.each(["GIOF_MANAGER", "GIOF_GESTOR"])("allows assigned %s terminal without inventing a lease", (role) => {
    for (const status of ["REJECTED", "VOIDED", "CLOSED", "PAID"]) {
      expect(getExtraDocumentMutationContext(request(status, status === "PAID" ? "PAYMENT" : "REQUEST"), "actor", role)).toEqual({});
    }
  });
  it.each(["SOLICITANTE_EPE", "ADMIN_SISTEMA", "AUDITOR_DIRECCION"])("denies role %s", (role) => expect(getExtraDocumentMutationContext(request(), "actor", role)).toBeUndefined());
  it.each(["OTHER", "UNASSIGNED"])("permits assignment %s for manager with read rights", (state) => expect(getExtraDocumentMutationContext(request("CLOSED", "REQUEST", state), "actor", "GIOF_MANAGER")).toEqual({}));
  it("denies draft/missing authority but ignores financial lease fields", () => {
    expect(getExtraDocumentMutationContext(request("DRAFT"), "actor", "GIOF_GESTOR")).toBeUndefined();
    const missing = request();
    delete missing.extra_document_context;
    expect(getExtraDocumentMutationContext(missing, "actor", "GIOF_GESTOR")).toBeUndefined();
    const active = request("SUBMITTED");
    active.extra_document_context!.leaseRequired = true;
    expect(getExtraDocumentMutationContext(active, "actor", "GIOF_GESTOR")).toEqual({});
    bindGiofLeaseCredential({ requestId: "request", pool: "REQUEST", assignmentVersion: "7", ownerId: "actor", token: "real", heartbeatAt: null, expiresAt: "2099-01-01T00:00:00Z", ttlSeconds: 300, heartbeatIntervalSeconds: 60 });
    active.extra_document_context!.leaseState = "ACTIVE_SELF";
    expect(getExtraDocumentMutationContext(active, "actor", "GIOF_GESTOR")).toEqual({});
    active.extra_document_context!.leaseState = "ACTIVE_OTHER";
    expect(getExtraDocumentMutationContext(active, "actor", "GIOF_GESTOR")).toEqual({});
  });
});

describe("RequestExtraDocumentsModal", () => {
  it("shows persisted OTHER custom title in saved row and both confirmations", () => {
    const saved = document("extra", "EXTRA");
    saved.metadata_json = { request_other_document_v1: { display_name: "Evidencia personalizada", title_source: "CUSTOM" } };
    renderModal(request(), [saved]); open();
    expect(screen.getByRole("link", { name: "Ver Evidencia personalizada" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar extra Evidencia personalizada" }));
    const confirmation = screen.getByRole("region", { name: "Confirmación de eliminación extra" });
    expect(confirmation).toHaveTextContent("Evidencia personalizada");
    fireEvent.click(screen.getByRole("button", { name: "Continuar eliminación" }));
    expect(confirmation).toHaveTextContent("Evidencia personalizada");
    expect(confirmation).not.toHaveTextContent(/permanente|físicamente/);
  });
  beforeEach(() => {
    vi.clearAllMocks(); clearGiofLeaseCredentials(); mocks.role = "GIOF_GESTOR"; mocks.actorId = "actor";
    mocks.refresh.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
    mocks.upload.mockResolvedValue(document("saved", "EXTRA"));
  });
  it("allows an unassigned operator to open directly from detail", () => {
    renderModal(request("CLOSED", "REQUEST", "UNASSIGNED"));
    expect(screen.getByRole("button", { name: "Gestionar documentos extra" })).toBeEnabled();
    open();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("reuses the modal when opened by row navigation, without starting uploads", () => {
    render(
      <RequestExtraDocumentsModal
        request={request("PAID", "PAYMENT", "OTHER")}
        documents={[]}
        onRefresh={mocks.refresh}
        initialOpen
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("selects category before files, excludes canonical categories and requires each OTHER title", async () => {
    renderModal(); open();
    const files = screen.getByLabelText("Archivos extra");
    expect(files).toBeDisabled();
    for (const label of ["Constancia de pago", "Constancia de devolución", "Informe de rendición"]) expect(screen.queryByRole("option", { name: label })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "OTHER" } });
    fireEvent.change(files, { target: { files: [new File(["pdf"], "one.pdf", { type: "application/pdf" }), new File(["pdf"], "two.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("button", { name: "Agregar a la cola" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Título de one.pdf"), { target: { value: "Evidencia uno" } });
    fireEvent.change(screen.getByLabelText("Título de two.pdf"), { target: { value: "Evidencia dos" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la cola" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.upload.mock.calls[0][1]).toMatchObject({ document_category: "OTHER", display_name: "Evidencia uno", idempotency_key: expect.any(String) });
  });
  it("offers safe view for all documents but delete only persisted EXTRA, with two cancellable confirmations", async () => {
    renderModal(); open();
    expect(screen.getAllByRole("link", { name: /Ver / })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Eliminar extra normal.pdf" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar extra extra.pdf" }));
    expect(screen.getByRole("region", { name: "Confirmación de eliminación extra" })).toHaveTextContent("Se enviará el archivo a la papelera de Drive");
    fireEvent.click(screen.getByRole("button", { name: "Continuar eliminación" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar eliminación" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar extra extra.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar eliminación" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación extra" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith("request", "extra", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mocks.invalidate).toHaveBeenCalledWith("request");
    expect(screen.getByRole("link", { name: "Ver extra.pdf" })).toBeInTheDocument();
  });
  it("keeps documents on errors and requires reopening after conflict", async () => {
    mocks.remove.mockRejectedValue(new Error("Conflicto de asignación"));
    renderModal(); open();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar extra extra.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar eliminación" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación extra" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(screen.getByRole("alert")).toHaveTextContent(/Conflicto/);
    expect(screen.getByRole("link", { name: "Ver extra.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar eliminación extra" })).toBeDisabled();
  });
  it("resumes a ready queue after the connected refresh returns the same assignment", async () => {
    const value = request();
    const documents = [document("extra", "EXTRA")];
    const view = renderModal(value, documents); open();
    fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "EVIDENCE" } });
    fireEvent.change(screen.getByLabelText("Archivos extra"), { target: { files: [new File(["pdf"], "one.pdf", { type: "application/pdf" }), new File(["pdf"], "two.pdf", { type: "application/pdf" })] } });
    view.rerender(<RequestExtraDocumentsModal request={value} documents={documents} refreshing onRefresh={mocks.refresh} />);
    expect(screen.getByRole("button", { name: "Subir documentos extra" })).toBeDisabled();
    expect(mocks.upload).not.toHaveBeenCalled();
    const refreshed = { ...value, extra_document_context: { ...value.extra_document_context! }, giof_work: { requestId: "request", pool: "PAYMENT", assignmentVersion: "99", assignmentState: "OTHER", leaseState: "ACTIVE_OTHER", canAcquire: false, canEdit: false, readOnly: true } } satisfies PaymentRequest;
    view.rerender(<RequestExtraDocumentsModal request={refreshed} documents={documents} onRefresh={mocks.refresh} />);
    expect(screen.getByRole("button", { name: "Subir documentos extra" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("survives its own queue refresh and can upload another file without reopening", async () => {
    let finishRefresh!: () => void;
    function ConnectedModal() {
      const [refreshing, setRefreshing] = useState(false);
      return <RequestExtraDocumentsModal request={request()} documents={[]} refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true);
        await new Promise<void>((resolve) => { finishRefresh = resolve; });
        setRefreshing(false);
      }} />;
    }
    render(<ConnectedModal />); open();
    fireEvent.change(screen.getByLabelText("Categoría extra"), { target: { value: "EVIDENCE" } });
    const enqueue = (name: string) => fireEvent.change(screen.getByLabelText("Archivos extra"), { target: { files: [new File(["pdf"], name, { type: "application/pdf" })] } });
    enqueue("one.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
    await waitFor(() => expect(finishRefresh).toBeTypeOf("function"));
    expect(screen.getByLabelText("Archivos extra")).toBeDisabled();
    await act(async () => finishRefresh());
    await waitFor(() => expect(screen.getByLabelText("Archivos extra")).toBeEnabled());
    enqueue("two.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Subir documentos extra" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    await act(async () => finishRefresh());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each(["read-rights", "draft", "actor", "unavailable"])("revokes pending deletion on genuine %s change, even during refresh", async (change) => {
    let finish!: () => void;
    mocks.remove.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = renderModal(); open();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar extra extra.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar eliminación" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación extra" }));
    const signal: AbortSignal = mocks.remove.mock.calls[0][2].signal;
    const changed = request();
    if (change === "read-rights") changed.extra_document_context!.canMutate = false;
    if (change === "draft") changed.status = "DRAFT";
    if (change === "actor") mocks.actorId = "different-actor";
    view.rerender(<RequestExtraDocumentsModal request={changed} documents={[document("extra", "EXTRA")]} refreshing unavailable={change === "unavailable"} onRefresh={mocks.refresh} />);
    expect(signal.aborted).toBe(true);
    await act(async () => finish());
    view.rerender(<RequestExtraDocumentsModal request={changed} documents={[document("extra", "EXTRA")]} onRefresh={mocks.refresh} />);
    expect(screen.getByRole("button", { name: "Confirmar eliminación extra" })).toBeDisabled();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it("aborts the session signal when closed", async () => {
    renderModal(); open();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar extra extra.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar eliminación" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación extra" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const signal: AbortSignal = mocks.remove.mock.calls[0][2].signal;
    fireEvent.click(screen.getByRole("button", { name: "Cerrar gestión" }));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("blocks duplicate pending deletion and revoked read authority", async () => {
    let finish!: () => void;
    mocks.remove.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = renderModal(); open();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar extra extra.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar eliminación" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación extra" }));
    expect(screen.getByRole("button", { name: "Confirmar eliminación extra" })).toBeDisabled();
    const denied = request();
    denied.extra_document_context!.canMutate = false;
    view.rerender(<RequestExtraDocumentsModal request={denied} documents={[document("extra", "EXTRA")]} onRefresh={mocks.refresh} />);
    finish();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(/Actualiza/);
  });
});
