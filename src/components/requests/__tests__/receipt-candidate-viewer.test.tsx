import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptCandidateViewer } from "@/components/requests/request-documents-card";
import { api, ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_CODE } from "@/lib/constants";
import type { AuthUser } from "@/types/auth";
import type { RequestReceiptReview } from "@/types/requests";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const snapshot = "a".repeat(64);
const review = {
  receipt: { id: "source-receipt", request_id: "source-request" },
  candidate_open_snapshot: snapshot,
  duplicate_candidates: [{ receipt_id: "candidate-receipt", request_id: "prior-request", document_id: "prior-doc" }],
} as RequestReceiptReview;
function auth(role = ROLE_CODE.GIOF_GESTOR as string) {
  useAuthStore.setState({ user: { id: "actor", role: { code: role } } as AuthUser, accessToken: "token" });
}

describe("ReceiptCandidateViewer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth();
    vi.spyOn(api, "documentBlob").mockResolvedValue({ blob: new Blob(["bytes"], { type: "application/pdf" }), filename: "backend.pdf" });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:candidate") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  it.each([ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER])("uses SOURCE IDs, candidate receipt and server snapshot for %s", async (role) => {
    auth(role);
    render(<ReceiptCandidateViewer review={review} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante candidato" }));
    await screen.findByTitle("Vista del comprobante candidato");
    expect(api.documentBlob).toHaveBeenCalledWith(`/requests/source-request/receipts/source-receipt/candidates/candidate-receipt/document?snapshot=${snapshot}`, { signal: expect.any(AbortSignal) });
    expect(screen.getByText("backend.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar comprobante candidato" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:candidate");
  });

  it.each([ROLE_CODE.SOLICITANTE_EPE, ROLE_CODE.ADMIN_SISTEMA, ROLE_CODE.AUDITOR_DIRECCION])("has no action for %s even with stale candidate data", (role) => {
    auth(role);
    render(<ReceiptCandidateViewer review={review} onRefresh={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Ver comprobante candidato" })).not.toBeInTheDocument();
  });

  it.each([{ duplicate_candidates: [] }, { candidate_open_snapshot: undefined }, { candidate_open_snapshot: "A".repeat(64) }])("has no action without server allowlist/snapshot %j", (overrides) => {
    render(<ReceiptCandidateViewer review={{ ...review, ...overrides }} onRefresh={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Ver comprobante candidato" })).not.toBeInTheDocument();
  });

  it.each(["image/jpeg", "image/png"])("renders %s as image and revokes on unmount", async (mime) => {
    vi.mocked(api.documentBlob).mockResolvedValue({ blob: new Blob(["bytes"], { type: mime }), filename: null });
    const { unmount } = render(<ReceiptCandidateViewer review={review} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante candidato" }));
    expect(await screen.findByAltText("Comprobante candidato")).toHaveAttribute("src", "blob:candidate");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("revokes an opened preview when the authorized candidate is replaced", async () => {
    const { rerender } = render(<ReceiptCandidateViewer review={review} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante candidato" }));
    await screen.findByTitle("Vista del comprobante candidato");
    rerender(<ReceiptCandidateViewer review={{ ...review, duplicate_candidates: [{ ...review.duplicate_candidates[0], receipt_id: "replacement" }] }} onRefresh={vi.fn()} />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:candidate");
    expect(screen.queryByTitle("Vista del comprobante candidato")).not.toBeInTheDocument();
  });

  it("real Blob helper rejects unsafe response MIME without creating a URL", async () => {
    vi.mocked(api.documentBlob).mockRestore();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>private</html>", { headers: { "Content-Type": "text/html" } })));
    render(<ReceiptCandidateViewer review={review} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante candidato" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Solo se admiten PDF, JPEG o PNG/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  });

  it.each(["close", "logout", "replace", "unmount"])("aborts and discards late bytes on %s", async (action) => {
    let finish!: (value: Awaited<ReturnType<typeof api.documentBlob>>) => void;
    vi.mocked(api.documentBlob).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const refresh = vi.fn();
    const { rerender, unmount } = render(<ReceiptCandidateViewer review={review} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante candidato" }));
    const signal = vi.mocked(api.documentBlob).mock.calls[0][1]?.signal;
    if (action === "close") fireEvent.click(screen.getByRole("button", { name: "Cerrar comprobante candidato" }));
    if (action === "logout") act(() => useAuthStore.getState().clearAuth());
    if (action === "replace") rerender(<ReceiptCandidateViewer review={{ ...review, candidate_open_snapshot: "b".repeat(64) }} onRefresh={refresh} />);
    if (action === "unmount") unmount();
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => finish({ blob: new Blob(["bytes"], { type: "application/pdf" }), filename: "late.pdf" }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Vista del comprobante candidato")).not.toBeInTheDocument();
  });

  it.each([403, 404])("refreshes receipt on %s and shows safe error, no fallback", async (status) => {
    vi.mocked(api.documentBlob).mockRejectedValue(new ApiRequestError(status, { message: "private storage error" } as ConstructorParameters<typeof ApiRequestError>[1]));
    const refresh = vi.fn();
    render(<ReceiptCandidateViewer review={review} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante candidato" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ya no está disponible/);
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("private storage error")).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(vi.mocked(api.documentBlob).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
