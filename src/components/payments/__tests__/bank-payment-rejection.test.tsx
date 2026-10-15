import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentQueueTable } from "../payment-queue-table";
import { RejectApprovedPaymentModal } from "../reject-approved-payment-modal";
import { REQUEST_PAYMENT_STATUS, type PaymentRequest, type RejectBankPaymentResponse, type RequestPayment } from "@/types/requests";
import { useAuthStore } from "@/stores/auth-store";
import { rejectBankPayment } from "@/lib/requests";
import { clearCookie } from "@/test-utils/setup";
import { PaymentQueuePage } from "../payment-queue-page";
import type { AuthUser } from "@/types/auth";

const mocks = vi.hoisted(() => ({ post: vi.fn(), success: vi.fn(), error: vi.fn(), approved: vi.fn(), queue: vi.fn(), refetch: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/api-client", async (original) => ({
  ...await original<typeof import("@/lib/api-client")>(), api: { post: mocks.post },
}));
vi.mock("@/hooks/use-requests", () => ({ usePaymentQueue: mocks.queue,
  useRetryRexanActivation: () => ({ retryRexanActivation: vi.fn(), isLoading: false }),
  useRejectApprovedPayment: () => ({
  rejectApprovedPayment: mocks.approved, isLoading: false,
}) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=paid") }));
vi.mock("@/hooks/use-drive-projection-polling", () => ({ useDriveProjectionPolling: vi.fn() }));
vi.mock("@/hooks/use-giof-work", () => ({ useGiofWorkLeaseSet: () => ({ leases: [], release: vi.fn(), clearLocal: vi.fn() }) }));
vi.mock("@/components/giof-work/giof-work-controls", async (original) => ({
  ...await original<typeof import("@/components/giof-work/giof-work-controls")>(),
  GiofBulkAssignmentBar: () => null,
}));
vi.mock("../register-payment-modal", () => ({ RegisterPaymentModal: () => null }));
vi.mock("../complete-payment-details-modal", () => ({ CompletePaymentDetailsModal: () => null }));
vi.mock("../bulk-mark-paid-modal", () => ({ BulkMarkPaidModal: () => null }));
vi.mock("../payment-queue-filters", () => ({ PaymentQueueFilters: () => null }));
vi.mock("@/lib/query-tags", async (original) => ({
  ...await original<typeof import("@/lib/query-tags")>(), invalidateRequestDomain: mocks.invalidate,
}));

const initialAuth = useAuthStore.getState();
function actor(id = "giof1", code = "GIOF_MANAGER"): AuthUser {
  return { id, firstName: "Test", lastName: "Operator", email: null,
    documentNumber: "", onboardingCompleted: true, authSource: "LOCAL", role: { code, name: code } };
}

function row(status?: string | null): PaymentRequest {
  const paymentStatus = arguments.length ? status : "REGISTERED";
  const payment: RequestPayment = {
    id: "p1", payment_request_id: "r1", amount_paid: 100,
    paid_at: "2026-10-14", operation_reference: null, proof_document_id: null,
    completeness: "BOTH_PENDING", details_pending: true, proof_pending: true,
    bank_commission: null, notes: null, registered_by_id: "giof1",
    created_at: "2026-10-14", updated_at: "2026-10-14",
  };
  // Incluye lecturas desconocidas para probar la frontera de APIs anteriores.
  Object.assign(payment, { status: paymentStatus });
  return { id: "r1", request_code: "SOL-1", status: "PAID", request_type: "SUPPLIER_PAYMENT",
    currency: "PEN", requested_amount: 100, allocations: [],
    payment, sequential_number: null, fiscal_year: 2026, concept: "Pago proveedor",
    requester_id: "requester1", budget_planning_line_id: null, budget_month: 1,
    organizational_unit_id: null, scheduled_rendition_at: null, related_request_id: null,
    supplier_ruc: null, supplier_name: null, document_type: null, has_associated_contract: false,
    beneficiary_name: null, beneficiary_document_type: null, beneficiary_document_number: null,
    bank_code: null, bank_name: null, account_type: null, bank_account: null, bank_cci: null,
    submitted_at: null, observed_at: null, approved_at: "2026-10-14", rejected_at: null,
    paid_at: "2026-10-14", disbursed_at: null, amount_disbursed: null, notes: null,
    created_at: "2026-10-14", updated_at: "2026-10-14",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: actor(), accessToken: "test-token", isLoading: false });
  mocks.refetch.mockResolvedValue(undefined);
  mocks.queue.mockReturnValue({ requests: [row()], total: 1, limit: 50, page: 1,
    isLoading: false, isRefreshing: false, error: null, refetch: mocks.refetch });
});
afterEach(() => { act(() => useAuthStore.setState(initialAuth)); });

describe("existing payment queue bank controls", () => {
  it.each(["GIOF_MANAGER", "GIOF_GESTOR"])("shows terminal bank action for %s without work/lease or complete proof", (roleCode) => {
    const request = row(); const reject = vi.fn();
    render(<PaymentQueueTable requests={[request]} isLoading={false} onRegisterPayment={vi.fn()}
      roleCode={roleCode} canManagePayments={false} onRejectBankPayment={reject} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechazar por el banco" }));
    expect(reject).toHaveBeenCalledWith(request);
    expect(request.status).toBe("PAID");
  });
  it.each(["ADMIN_SISTEMA", "AUDITOR_DIRECCION", "SOLICITANTE_EPE", undefined])("hides bank control for %s", (roleCode) => {
    render(<PaymentQueueTable requests={[row()]} isLoading={false} onRegisterPayment={vi.fn()}
      roleCode={roleCode} onRejectBankPayment={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Rechazar por el banco" })).not.toBeInTheDocument();
  });
  it.each([undefined, null, "registered", "BANK_REJECTED"])("fails closed for payment state %s", (status) => {
    const request = row(status);
    render(<PaymentQueueTable requests={[request]} isLoading={false} onRegisterPayment={vi.fn()}
      roleCode="GIOF_MANAGER" onRejectBankPayment={vi.fn()} onCompletePaymentDetails={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Rechazar por el banco" })).not.toBeInTheDocument();
    if (status === "BANK_REJECTED") {
      expect(screen.getByText("Rechazado por el banco")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Completar pago|Registrar pago|Reintentar REXAN/ })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ver solicitud" })).toBeInTheDocument();
    }
    expect(request.status).toBe("PAID");
  });
});

function modal() {
  const props = { request: row(), lease: null, bankIntent: true, open: true,
    onOpenChange: vi.fn(), onSuccess: vi.fn(), onBankSuccess: vi.fn(), onFailureRefresh: vi.fn() };
  render(<RejectApprovedPaymentModal {...props} />); return props;
}

describe("reused bank reason modal", () => {
  it("does not automatically resend bank POST after 401 even when refresh could succeed", async () => {
    const realClient = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
    const authSnapshot = useAuthStore.getState();
    const cookieSnapshot = document.cookie;
    const ack: RejectBankPaymentResponse = {
      request_id: "r1", payment_id: "p1", status: REQUEST_PAYMENT_STATUS.BANK_REJECTED,
    };
    const calls: { url: string; options: RequestInit }[] = [];
    let bankPosts = 0;
    const fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
      calls.push({ url, options: { ...options, headers: new Headers(options.headers) } });
      if (url.endsWith("/auth/refresh")) {
        return new Response(JSON.stringify({ data: {
          accessToken: "refreshed-test-token", user: {
            id: "giof1", firstName: "Test", lastName: "Operator", email: null,
            epeDni: null, onboardingCompleted: true,
            role: { code: "GIOF_MANAGER", name: "Manager" },
          },
        } }), { status: 200 });
      }
      if (!url.endsWith("/requests/r1/reject-bank-payment")) throw new Error("Unexpected test URL");
      bankPosts += 1;
      return bankPosts === 1
        ? new Response(JSON.stringify({ statusCode: 401, message: "private auth detail", error: "Unauthorized" }), { status: 401 })
        : new Response(JSON.stringify({ data: ack }), { status: 200 });
    });
    try {
      useAuthStore.setState({ accessToken: "expired-test-token" });
      vi.stubGlobal("fetch", fetchMock);
      mocks.post.mockImplementation(realClient.api.post);
      const props = modal();
      fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "  Cuenta cerrada  " } });
      fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
      await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
      const outcome = await mocks.post.mock.results[0].value.catch((error: unknown) => error);
      expect(bankPosts).toBe(1);
      expect(calls.filter(({ url }) => url.endsWith("/auth/refresh"))).toHaveLength(0);
      expect(outcome).toBeInstanceOf(realClient.ApiRequestError);
      expect(outcome).toMatchObject({ status: 401 });
      expect(await screen.findByRole("alert")).toHaveTextContent("Tu sesión expiró. Actualiza para verificar");
      expect(screen.getByRole("alert")).not.toHaveTextContent("private auth detail");
      expect(props.onFailureRefresh).toHaveBeenCalledWith(outcome);
      expect(props.onBankSuccess).not.toHaveBeenCalled();
      expect(props.onOpenChange).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: /Motivo/ })).toHaveValue("  Cuenta cerrada  ");
      expect(screen.getByRole("button", { name: "Confirmar rechazo" })).toBeDisabled();
      expect(props.request.status).toBe("PAID");
      expect(props.request.payment?.status).toBe("REGISTERED");
      const first = calls[0].options;
      expect(first.method).toBe("POST");
      expect(first.credentials).toBe("include");
      expect(first.signal).toBeInstanceOf(AbortSignal);
      expect(first.signal?.aborted).toBe(false);
      expect(JSON.parse(first.body as string)).toEqual({ reason: "Cuenta cerrada" });
      expect(Object.fromEntries(new Headers(first.headers))).toEqual({
        authorization: "Bearer expired-test-token", "content-type": "application/json",
      });
      // Una nueva decisión manual autorizada conserva el ACK y la versión exacta.
      useAuthStore.setState({ accessToken: "authorized-test-token" });
      expect(await rejectBankPayment("r1", { reason: "  Cuenta cerrada  " }, "90071992547409931234")).toEqual(ack);
      expect(bankPosts).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(calls[1].options.body as string)).toEqual({ reason: "Cuenta cerrada" });
      expect(Object.fromEntries(new Headers(calls[1].options.headers))).toEqual({
        authorization: "Bearer authorized-test-token", "content-type": "application/json",
        "x-giof-assignment-version": "90071992547409931234",
      });
    } finally {
      mocks.post.mockReset();
      vi.unstubAllGlobals();
      useAuthStore.setState(authSnapshot);
      clearCookie();
      for (const cookie of cookieSnapshot.split("; ").filter(Boolean)) document.cookie = cookie;
    }
  });

  it("validates whitespace/1001, submits trimmed 1000 once and refreshes only after ACK", async () => {
    let resolve!: (value: RejectBankPaymentResponse) => void;
    mocks.post.mockReturnValue(new Promise<RejectBankPaymentResponse>((done) => { resolve = done; }));
    const props = modal(); const reason = screen.getByRole("textbox", { name: /Motivo/ });
    const confirm = screen.getByRole("button", { name: "Confirmar rechazo" });
    for (const value of ["   ", "x".repeat(1001)]) {
      fireEvent.change(reason, { target: { value } }); fireEvent.click(confirm);
      await screen.findByRole("alert"); expect(mocks.post).not.toHaveBeenCalled();
    }
    fireEvent.change(reason, { target: { value: ` ${"x".repeat(1000)} ` } });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(confirm).toBeDisabled(); expect(props.onBankSuccess).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith("/requests/r1/reject-bank-payment", { reason: "x".repeat(1000) }, { signal: expect.any(AbortSignal), retryUnauthorized: false, headers: {} });
    act(() => useAuthStore.setState({ user: { ...actor() }, accessToken: "rotated-token" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    resolve({ request_id: "r1", payment_id: "p1", status: REQUEST_PAYMENT_STATUS.BANK_REJECTED });
    await waitFor(() => expect(props.onBankSuccess).toHaveBeenCalled());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.success).toHaveBeenCalledWith("Pago rechazado por el banco. Notificación programada para el solicitante.");
    expect(mocks.approved).not.toHaveBeenCalled(); expect(props.request.status).toBe("PAID");
  });
  it("cancel sends no request", () => {
    const props = modal(); fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false); expect(mocks.post).not.toHaveBeenCalled();
  });
  it("reconciles ambiguous failure, retains reason and prevents blind resubmission", async () => {
    mocks.post.mockRejectedValue(new Error("private SQL detail")); const props = modal();
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "Cuenta cerrada" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Actualiza para verificar");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private SQL");
    expect(props.onFailureRefresh).toHaveBeenCalled(); expect(props.onBankSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /Motivo/ })).toHaveValue("Cuenta cerrada");
    expect(screen.getByRole("button", { name: "Confirmar rechazo" })).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
});

function openBankPage() {
  const view = render(<PaymentQueuePage />);
  fireEvent.click(screen.getByRole("button", { name: "Rechazar por el banco" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "Cuenta cerrada" } });
  return view;
}

describe("bank modal current session", () => {
  it.each(["downgrade", "different-user", "logout"])("closes and clears the selected bank command on %s before POST", async (transition) => {
    openBankPage();
    const oldConfirm = screen.getByRole("button", { name: "Confirmar rechazo" });
    act(() => useAuthStore.setState({ user: transition === "logout" ? null :
      transition === "downgrade" ? actor("giof1", "SOLICITANTE_EPE") : actor("giof2") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(oldConfirm);
    expect(mocks.post).not.toHaveBeenCalled();
    act(() => useAuthStore.setState({ user: actor() }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar por el banco" }));
    expect(screen.getByRole("textbox", { name: /Motivo/ })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await screen.findByRole("alert");
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("aborts the real fetch and suppresses late completion after actor change without touching a new dialog", async () => {
    const realClient = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn((_url: string, _options: RequestInit) => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.post.mockImplementation(realClient.api.post);
    try {
      openBankPage();
      fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      expect(options.signal?.aborted).toBe(false);
      expect(JSON.parse(options.body as string)).toEqual({ reason: "Cuenta cerrada" });
      act(() => useAuthStore.setState({ user: actor("giof2") }));
      expect(options.signal?.aborted).toBe(true);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Rechazar por el banco" }));
      fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "Nueva decisión" } });
      await act(async () => {
        resolve(new Response(JSON.stringify({ data: {
          request_id: "r1", payment_id: "p1", status: "BANK_REJECTED",
        } }), { status: 200 }));
        await mocks.post.mock.results[0].value.catch(() => undefined);
      });
      expect(screen.getByRole("textbox", { name: /Motivo/ })).toHaveValue("Nueva decisión");
      expect(screen.getByRole("button", { name: "Confirmar rechazo" })).toBeEnabled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.error).not.toHaveBeenCalled();
      expect(mocks.invalidate).not.toHaveBeenCalled();
      expect(mocks.refetch).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      mocks.post.mockReset();
      vi.unstubAllGlobals();
    }
  });

  it.each(["actor-change", "unmount"])("ignores an ACK even when the transport resolves despite abort after %s", async (transition) => {
    let resolve!: (value: RejectBankPaymentResponse) => void;
    mocks.post.mockReturnValue(new Promise<RejectBankPaymentResponse>((done) => { resolve = done; }));
    const props = { request: row(), lease: null, bankIntent: true, open: true,
      onOpenChange: vi.fn(), onSuccess: vi.fn(), onBankSuccess: vi.fn(), onFailureRefresh: vi.fn() };
    const view = render(<RejectApprovedPaymentModal {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "Cuenta cerrada" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    if (transition === "unmount") {
      view.unmount();
    } else {
      act(() => useAuthStore.setState({ user: actor("giof2") }));
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
      view.rerender(<RejectApprovedPaymentModal {...props} open={false} />);
      view.rerender(<RejectApprovedPaymentModal {...props} />);
      fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "Nueva decisión" } });
      props.onOpenChange.mockClear();
    }
    await act(async () => {
      resolve({ request_id: "r1", payment_id: "p1", status: REQUEST_PAYMENT_STATUS.BANK_REJECTED });
      await mocks.post.mock.results[0].value;
    });
    expect(props.onBankSuccess).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(props.onFailureRefresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    if (transition === "actor-change") {
      expect(screen.getByRole("textbox", { name: /Motivo/ })).toHaveValue("Nueva decisión");
      expect(screen.getByRole("button", { name: "Confirmar rechazo" })).toBeEnabled();
      expect(mocks.post).toHaveBeenCalledTimes(1);
    }
  });

  it("closes a saved REGISTERED selection when the current queue payment is revoked", () => {
    const view = openBankPage();
    mocks.queue.mockReturnValue({ requests: [row("BANK_REJECTED")], total: 1, limit: 50, page: 1,
      isLoading: false, isRefreshing: false, error: null, refetch: mocks.refetch });
    view.rerender(<PaymentQueuePage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Rechazar por el banco" })).not.toBeInTheDocument();
  });
});
