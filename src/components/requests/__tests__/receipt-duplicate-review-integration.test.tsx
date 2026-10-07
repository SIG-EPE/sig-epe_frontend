import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestDocumentsCard } from "@/components/requests/request-documents-card";
import { ROLE_CODE } from "@/lib/constants";
import { bindGiofLeaseCredential, clearGiofLeaseCredentials } from "@/lib/giof-work-lease-session";
import { clearQueryCache } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";
import type { PaymentRequest, RequestDocument, RequestReceiptReview } from "@/types/requests";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const root = "/requests/source-request/receipts/source-receipt";
const decisionSnapshot = "b".repeat(64);
const openSnapshot = "a".repeat(64);
const request = { id: "source-request", request_type: "REIMBURSEMENT", status: "DRAFT", requester_id: "actor", fiscal_year: 2026, currency: "PEN", requested_amount: 120 } as PaymentRequest;
const sourceDocument = { id: "source-document", payment_request_id: request.id, document_category: "RECEIPT", safe_filename: "source.pdf", original_filename: "source.pdf", mime_type: "application/pdf", size_bytes: 50, upload_status: "PERMANENT", drive_web_url: "https://drive.google.com/file/d/source/view" } as RequestDocument;
const review = {
  receipt: { id: "source-receipt", request_id: request.id, document_id: sourceDocument.id, receipt_type: "INVOICE", issuer_document_number: "20123456789", issuer_name: "Supplier", series: "F001", number: "1", issue_date: "2026-10-01", amount: 120, currency: "PEN", duplicate_status: "POSSIBLE_DUPLICATE", ocr_status: "SUCCESS", confirmed_at: null },
  latest_extraction: null, candidate_open_snapshot: openSnapshot,
  duplicate_review_snapshot: decisionSnapshot, can_resolve_duplicate: true,
  duplicate_candidates: [{ receipt_id: "candidate-receipt", request_id: "candidate-request", document_id: "candidate-document", issuer_document_number: "20123456789", series: "F001", number: "1", issue_date: "2026-10-01", amount: 120 }],
} as RequestReceiptReview;

function json(data: unknown) {
  return new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });
}

function server(
  initial = review,
  mutation?: () => Promise<Response>,
  listWithoutReviewAuthority = false,
) {
  let current = structuredClone(initial);
  const calls: { path: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    calls.push({ path, init });
    if (path === root && (!init?.method || init.method === "GET")) return json(current);
    if (path === `${root}/duplicate-review`) {
      if (mutation) return mutation();
      const body = JSON.parse(String(init?.body)) as { action: "NOT_DUPLICATE" | "DUPLICATE_CONFIRMED"; reason: string };
      current = { ...current, receipt: { ...current.receipt, duplicate_status: body.action === "NOT_DUPLICATE" ? "NOT_DUPLICATE_REVIEWED" : "DUPLICATE_CONFIRMED", confirmed_at: null }, can_resolve_duplicate: false,
        duplicate_resolution: { ...body, actor_id: "actor", actor_role: ROLE_CODE.GIOF_GESTOR, decided_at: "2026-10-06T12:00:00Z", fresh: true } };
      return json(current);
    }
    if (path === `${root}/confirm`) {
      current = { ...current, receipt: { ...current.receipt, confirmed_at: "2026-10-06T12:10:00Z", confirmed_by_id: "actor" } };
      return json(current);
    }
    if (path === root && init?.method === "PATCH") {
      current = { ...review, receipt: { ...review.receipt, ...JSON.parse(String(init.body)) }, duplicate_resolution: undefined, duplicate_review_snapshot: "c".repeat(64) };
      return json(current);
    }
    if (path === `${root}/retry-ocr`) {
      current = { ...review, receipt: { ...review.receipt, confirmed_at: null }, duplicate_resolution: undefined };
      return json(current);
    }
    if (path.startsWith(`${root}/candidates/`)) return new Response("%PDF-1.4\nCANDIDATE\n%%EOF", { headers: { "Content-Type": "application/pdf" } });
    if (path === `/requests/${request.id}/receipts`) {
      const listReview = listWithoutReviewAuthority
        ? { ...current, duplicate_review_snapshot: undefined, can_resolve_duplicate: undefined, duplicate_resolution: undefined }
        : current;
      return json([listReview]);
    }
    if (path === `/requests/${request.id}/documents`) return json([sourceDocument]);
    throw new Error(`Unexpected fixture route: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, setCurrent: (next: RequestReceiptReview) => { current = next; } };
}

async function openReview() {
  render(<RequestDocumentsCard request={request} />);
  fireEvent.click(await screen.findByRole("button", { name: "Revisar duplicado" }));
  return screen.getByRole("dialog");
}

async function enterReason(value = "  Facturas distintas verificadas  ") {
  fireEvent.change(await screen.findByLabelText("Motivo de la decisión"), { target: { value } });
}

describe("duplicate decision through existing dialog, real hook and API wrapper", () => {
  beforeEach(() => {
    clearQueryCache();
    clearGiofLeaseCredentials();
    useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser, accessToken: "fixture-token", isLoading: false });
    bindGiofLeaseCredential({
      requestId: request.id,
      pool: "REQUEST",
      assignmentVersion: "version-7",
      ownerId: "actor",
      token: "lease-token",
      expiresAt: "2099-01-01T00:00:00Z",
      ttlSeconds: 300,
      heartbeatIntervalSeconds: 30,
      heartbeatAt: "2026-10-06T12:00:00Z",
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:comparison") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); clearQueryCache(); clearGiofLeaseCredentials(); useAuthStore.getState().clearAuth(); });

  it("posts exact SOURCE route, trimmed reason, review token and existing lease; requires separate fresh confirmation", async () => {
    const { calls } = server();
    await openReview();
    await enterReason();
    fireEvent.click(screen.getByRole("button", { name: "No es duplicado" }));
    await within(screen.getByRole("dialog")).findByText(/La decisión no aprueba/);
    const post = calls.find((call) => call.path === `${root}/duplicate-review`)!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ action: "NOT_DUPLICATE", reason: "Facturas distintas verificadas", snapshot: decisionSnapshot });
    expect(post.init?.method).toBe("POST");
    const headers = new Headers(post.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer fixture-token");
    expect(headers.get("x-giof-assignment-version")).toBe("version-7");
    expect(headers.get("x-giof-lease-token")).toBe("lease-token");
    expect(calls.filter((call) => call.path.endsWith("/confirm"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar datos" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar comprobante" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.filter((call) => call.path === `${root}/confirm`)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver documento source.pdf/ })).toHaveAttribute("href", sourceDocument.drive_web_url);
    expect(calls.some((call) => call.init?.method === "DELETE")).toBe(false);
  });

  it("retains true duplicate and suppresses financial confirmation without deleting the source", async () => {
    const { calls } = server();
    await openReview(); await enterReason();
    fireEvent.click(screen.getByRole("button", { name: "Duplicado confirmado" }));
    await within(screen.getByRole("dialog")).findByText("El archivo se conserva y no es evidencia financiera.");
    expect(JSON.parse(String(calls.find((call) => call.path.endsWith("/duplicate-review"))?.init?.body)).action).toBe("DUPLICATE_CONFIRMED");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
    expect(calls.some((call) => call.init?.method === "DELETE" || call.path.endsWith("/confirm"))).toBe(false);
    expect(screen.getByRole("link", { name: /Ver documento source.pdf/ })).toHaveAttribute("href", sourceDocument.drive_web_url);
  });

  it.each(["", "short", " ".repeat(12), "x".repeat(1001)])("blocks invalid trimmed reason %j before a request", async (reason) => {
    const { calls } = server(); await openReview(); await enterReason(reason);
    const button = screen.getByRole("button", { name: "No es duplicado" });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(calls.some((call) => call.path.endsWith("/duplicate-review"))).toBe(false);
  });

  it.each([undefined, false])("has no decision actions without explicit server can_resolve_duplicate=%s", async (flag) => {
    const { calls } = server({ ...review, can_resolve_duplicate: flag }); await openReview();
    await waitFor(() => expect(calls.some((call) => call.path === root)).toBe(true));
    expect(screen.queryByRole("button", { name: "No es duplicado" })).not.toBeInTheDocument();
  });

  it("shows no decision affordance for non-GIOF even if a fixture advertises authority", async () => {
    useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.SOLICITANTE_EPE } } as AuthUser });
    server(); render(<RequestDocumentsCard request={request} />);
    await screen.findByRole("link", { name: /Ver documento source.pdf/ });
    expect(screen.queryByRole("button", { name: "Revisar duplicado" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revisar datos del comprobante/ }));
    expect(screen.queryByLabelText("Motivo de la decisión")).not.toBeInTheDocument();
  });

  it.each([401, 403, 409])("refreshes after %s without silently accepting or retrying POST, preserving reason for unchanged actor", async (status) => {
    const fixture = server(review, async () => {
      fixture.setCurrent({ ...review, duplicate_review_snapshot: "c".repeat(64) });
      return new Response(JSON.stringify({ message: "Revisión cambió", statusCode: status }), { status, headers: { "Content-Type": "application/json" } });
    });
    await openReview(); await enterReason("Motivo que se conserva");
    fireEvent.click(screen.getByRole("button", { name: "No es duplicado" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByLabelText("Motivo de la decisión")).toHaveValue("Motivo que se conserva"));
    expect(fixture.calls.filter((call) => call.path === root)).toHaveLength(2);
    expect(fixture.calls.filter((call) => call.path.endsWith("/duplicate-review"))).toHaveLength(1);
    expect(screen.queryByText(/La decisión no aprueba/)).not.toBeInTheDocument();
  });

  it("fails closed if refresh repeats a rejected token", async () => {
    server(review, async () => new Response(JSON.stringify({ message: "STALE" }), { status: 409 }));
    await openReview(); await enterReason(); fireEvent.click(screen.getByRole("button", { name: "No es duplicado" }));
    await screen.findByText("Sin autorización vigente para resolver el duplicado.");
    expect(screen.queryByRole("button", { name: "No es duplicado" })).not.toBeInTheDocument();
  });

  it("aborts on close and ignores a late successful mutation", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const { calls } = server(review, () => pending);
    await openReview(); await enterReason(); fireEvent.click(screen.getByRole("button", { name: "No es duplicado" }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith("/duplicate-review"))).toBe(true));
    const signal = calls.find((call) => call.path.endsWith("/duplicate-review"))?.init?.signal;
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(json({ ...review, receipt: { ...review.receipt, duplicate_status: "NOT_DUPLICATE_REVIEWED" } })); await pending; });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver documento source.pdf/ })).toHaveAttribute("href", sourceDocument.drive_web_url);
  });

  it("can compare candidate bytes inside the review dialog using only the OPEN snapshot", async () => {
    const { calls } = server(); const dialog = await openReview();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Ver comprobante candidato" }));
    await screen.findByTitle("Vista del comprobante candidato");
    expect(calls.some((call) => call.path === `${root}/candidates/candidate-receipt/document?snapshot=${openSnapshot}`)).toBe(true);
    expect(calls.some((call) => call.path.endsWith("/duplicate-review"))).toBe(false);
  });

  it("shows stale server summary but does not allow confirming it", async () => {
    server({ ...review, receipt: { ...review.receipt, duplicate_status: "NOT_DUPLICATE_REVIEWED" }, duplicate_resolution: { action: "NOT_DUPLICATE", reason: "Antes era distinto", actor_id: "actor", actor_role: ROLE_CODE.GIOF_GESTOR, decided_at: "2026-10-01", fresh: false } });
    render(<RequestDocumentsCard request={request} />);
    await screen.findByText(/La decisión anterior ya no está vigente/);
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
  });

  it("omits missing audit details for true duplicate without inventing an actor or reason", async () => {
    server({ ...review, receipt: { ...review.receipt, duplicate_status: "DUPLICATE_CONFIRMED" }, duplicate_resolution: undefined, can_resolve_duplicate: false });
    render(<RequestDocumentsCard request={request} />);
    await screen.findByText(/Detalle de decisión no disponible/);
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
  });

  it.each([undefined, "A".repeat(64), "abc"])("fails closed with missing/invalid review snapshot %s even with a valid OPEN token", async (snapshot) => {
    server({ ...review, duplicate_review_snapshot: snapshot });
    await openReview();
    await screen.findByText("Sin autorización vigente para resolver el duplicado.");
    expect(screen.queryByRole("button", { name: "No es duplicado" })).not.toBeInTheDocument();
  });

  it("disables decisions for unsaved fiscal edits and replaces old summary with correction response", async () => {
    server({ ...review, receipt: { ...review.receipt, duplicate_status: "NOT_DUPLICATE_REVIEWED" }, duplicate_resolution: { action: "NOT_DUPLICATE", reason: "Decisión anterior", actor_id: "actor", actor_role: ROLE_CODE.GIOF_GESTOR, decided_at: "2026-10-01", fresh: true } });
    await openReview();
    await enterReason();
    fireEvent.change(screen.getByLabelText("Total"), { target: { value: "121" } });
    expect(screen.getByRole("button", { name: "No es duplicado" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Decisión anterior")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
  });

  it("replaces old decision after OCR retry with the terminal server response", async () => {
    const { calls } = server({ ...review, receipt: { ...review.receipt, ocr_status: "REQUIRES_REVIEW", duplicate_status: "NOT_DUPLICATE_REVIEWED" }, duplicate_resolution: { action: "NOT_DUPLICATE", reason: "Decisión anterior", actor_id: "actor", actor_role: ROLE_CODE.GIOF_GESTOR, decided_at: "2026-10-01", fresh: true } });
    render(<RequestDocumentsCard request={request} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar lectura" }));
    await waitFor(() => expect(screen.queryByText("Decisión anterior")).not.toBeInTheDocument());
    expect(calls.filter((call) => call.path === `${root}/retry-ocr`)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
  });

  it("aborts on actor change, clears the reason and waits for new server authority", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fixture = server(review, () => pending);
    await openReview();
    await enterReason("Motivo del actor anterior");
    fireEvent.click(screen.getByRole("button", { name: "No es duplicado" }));
    await waitFor(() => expect(fixture.calls.some((call) => call.path.endsWith("/duplicate-review"))).toBe(true));
    const signal = fixture.calls.find((call) => call.path.endsWith("/duplicate-review"))?.init?.signal;
    fixture.setCurrent({ ...review, can_resolve_duplicate: false });
    act(() => useAuthStore.setState({ user: { id: "other-actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser }));
    expect(signal?.aborted).toBe(true);
    await screen.findByText("Sin autorización vigente para resolver el duplicado.");
    await act(async () => { finish(json(review)); await pending; });
    expect(screen.queryByDisplayValue("Motivo del actor anterior")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No es duplicado" })).not.toBeInTheDocument();
  });

  it("obtains decision authority from detail when list contains only candidate OPEN fields", async () => {
    const { calls } = server(review, undefined, true);
    await openReview();
    await enterReason();
    fireEvent.click(screen.getByRole("button", { name: "No es duplicado" }));
    await within(screen.getByRole("dialog")).findByText(/La decisión no aprueba/);
    expect(calls.filter((call) => call.path === root)).toHaveLength(1);
    const body = JSON.parse(String(calls.find((call) => call.path.endsWith("/duplicate-review"))?.init?.body));
    expect(body.snapshot).toBe(decisionSnapshot);
    expect(body.snapshot).not.toBe(openSnapshot);
  });
});
