import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentQueueTable } from "@/components/payments/payment-queue-table";
import { getPaymentRegisteredToast, PaymentQueuePage } from "@/components/payments/payment-queue-page";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  bulkMarkPaid: vi.fn(),
  completePaymentDetails: vi.fn(),
  uploadDocument: vi.fn(),
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
  usePaymentQueue: vi.fn(),
}));
let currentQuery = "";
let roleCode = "GIOF_GESTOR";
const replaceMock = vi.fn((href: string) => {
  currentQuery = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
});

vi.mock("@/hooks/use-requests", () => ({
  usePaymentQueue: mocks.usePaymentQueue,
  useBulkMarkPaid: () => ({
    bulkMarkPaid: mocks.bulkMarkPaid,
    isLoading: false,
    error: null,
  }),
  useRegisterPayment: () => ({
    registerPayment: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useCompletePaymentDetails: () => ({
    completePaymentDetails: mocks.completePaymentDetails,
    isLoading: false,
    error: null,
  }),
  useUploadRequestDocument: () => ({
    uploadDocument: mocks.uploadDocument,
    isLoading: false,
    error: null,
  }),
  useRetryRexanActivation: () => ({
    retryRexanActivation: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: { user: { id: string; role: { code: string } } }) => unknown,
  ) => selector({ user: { id: "user-1", role: { code: roleCode } } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock("@/hooks/use-giof-work", () => ({
  useGiofWorkLeaseSet: () => ({
    leases: [],
    acquire: mocks.acquireLease,
    release: mocks.releaseLease,
    releaseAll: vi.fn(),
  }),
  fetchGiofAssignees: vi.fn().mockResolvedValue([]),
  useGiofAssignees: vi.fn(() => ({ data: [], isLoading: false, isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn() })),
  fetchGiofHistory: vi.fn().mockResolvedValue([]),
  bulkAssignGiofWork: vi.fn(),
  getGiofConflictMessage: (error: unknown) => error instanceof Error ? error.message : "Error",
}));

vi.mock("@/hooks/use-drive-projection-polling", () => ({
  useDriveProjectionPolling: vi.fn(),
}));

function pendingSourceRequest(): PaymentRequest {
  return {
    id: "request-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.REIMBURSEMENT,
    status: REQUEST_STATUS.PAID,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Prueba",
    requester_id: "user-1",
    budget_planning_line_id: null,
    budget_month: 1,
    organizational_unit_id: null,
    scheduled_rendition_at: null,
    related_request_id: null,
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: "Persona",
    beneficiary_document_type: null,
    beneficiary_document_number: null,
    bank_code: null,
    bank_name: null,
    account_type: null,
    bank_account: null,
    bank_cci: null,
    submitted_at: null,
    observed_at: null,
    approved_at: null,
    rejected_at: null,
    paid_at: "2026-05-14T15:30:00.000Z",
    disbursed_at: null,
    amount_disbursed: 100,
    notes: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-14T15:30:00.000Z",
    payment_id: "payment-1",
    payment: {
      id: "payment-1",
      payment_request_id: "request-1",
      paid_at: "2026-05-14T15:30:00.000Z",
      operation_reference: "OP-1",
      amount_paid: 100,
      bank_commission: null,
      notes: null,
      drive_projection_status: "SOURCE_REQUIRED",
      proof_document_id: "proof-1",
      proof_pending: false,
      details_pending: false,
      registered_by_id: "user-1",
      created_at: "2026-05-14T15:30:00.000Z",
      updated_at: "2026-05-14T15:30:00.000Z",
    },
    giof_work: {
      pool: "PAYMENT",
      assigneeId: "user-1",
      assignmentVersion: "1",
      lease: null,
      canAcquire: true,
      canEdit: true,
      readOnly: false,
    } as PaymentRequest["giof_work"],
  };
}

function failedRexanRequest(canAcquire: boolean): PaymentRequest {
  return {
    ...pendingSourceRequest(),
    rexan_activation: {
      status: "FAILED",
      attempt_count: 1,
      next_attempt_at: null,
      settlement_request_id: null,
    },
    giof_work: {
      assigneeId: "user-1",
      canAcquire,
    } as PaymentRequest["giof_work"],
  };
}

describe("payment pending queue action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentQuery = "";
    roleCode = "GIOF_GESTOR";
    mocks.usePaymentQueue.mockReturnValue({
      requests: [],
      total: 0,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      summary: {
        count: 0,
        payable_amount_by_currency: {},
        status_counts: {},
      },
    });
  });

  it("keeps the REXAN success title and explains asynchronous Drive organization", () => {
    expect(
      getPaymentRegisteredToast({
        request: pendingSourceRequest(),
        payment_id: "payment-1",
        rexan_activation: { status: "CREATED" },
      }),
    ).toEqual({
      title: "Pago registrado. REXAN: activada.",
      description:
        "La carpeta de la solicitud se organizará en Drive en segundo plano; puede tardar algunos minutos.",
    });
  });

  it("conserva los tres tabs y traduce Datos pendientes al contrato canónico", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PaymentQueuePage />);

    expect(screen.getByRole("group", { name: "Vista de pagos" })).toBeInTheDocument();
    expect(screen.getByTestId("payment-filter-approved")).toHaveTextContent("Pendientes");
    expect(screen.getByTestId("payment-filter-paid")).toHaveTextContent("Historial pagado");
    expect(screen.getByTestId("payment-filter-pending-data")).toHaveTextContent("Datos pendientes");
    expect(mocks.usePaymentQueue).toHaveBeenCalledWith(expect.objectContaining({ status: REQUEST_STATUS.APPROVED }), expect.anything());

    await user.click(screen.getByTestId("payment-filter-pending-data"));
    expect(replaceMock).toHaveBeenLastCalledWith("/payments?tab=pending-data");
    rerender(<PaymentQueuePage />);
    expect(mocks.usePaymentQueue).toHaveBeenLastCalledWith(expect.objectContaining({
      status: REQUEST_STATUS.PAID,
      completeness: "any_missing",
    }), expect.anything());
  });

  it("refresca la cola forzadamente después de completar una referencia", async () => {
    currentQuery = "tab=pending-data";
    const incomplete = pendingSourceRequest();
    incomplete.payment = {
      ...incomplete.payment!,
      operation_reference: null,
      details_pending: true,
      missing_fields: ["operation_reference"],
      completeness: "REFERENCE_PENDING",
    };
    const refetch = vi.fn().mockResolvedValue(undefined);
    mocks.usePaymentQueue.mockReturnValue({
      requests: [incomplete], total: 1, page: 1, limit: 20,
      summary: { count: 1, payable_amount_by_currency: { PEN: "100.00" }, status_counts: { PAID: 1 } },
      isLoading: false, isRefreshing: false, error: null, refetch,
    });
    mocks.acquireLease.mockResolvedValue({ requestId: incomplete.id });
    mocks.releaseLease.mockResolvedValue(undefined);
    mocks.completePaymentDetails.mockResolvedValue(incomplete);
    const user = userEvent.setup();
    render(<PaymentQueuePage />);

    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    const dialog = await screen.findByRole("dialog", { name: "Completar pago" });
    await user.type(within(dialog).getByLabelText(/Referencia de operación/), "OP-REFRESH");
    await user.click(within(dialog).getByRole("button", { name: "Completar pago" }));

    expect(mocks.completePaymentDetails).toHaveBeenCalledWith("payment-1", {
      operation_reference: "OP-REFRESH",
      proof_document_id: undefined,
    });
    expect(refetch).toHaveBeenCalledWith({ force: true });
  });

  it("selecciona solo esta página asignable y limpia la selección al cambiar la identidad de vista", async () => {
    roleCode = "GIOF_MANAGER";
    const request = pendingSourceRequest();
    request.status = REQUEST_STATUS.APPROVED;
    request.payment = undefined;
    request.payment_id = undefined;
    request.giof_work = {
      ...request.giof_work!,
      pool: "PAYMENT",
      canAssign: true,
      assigneeId: null,
    } as PaymentRequest["giof_work"];
    mocks.usePaymentQueue.mockReturnValue({
      requests: [request], total: 1, page: 1, limit: 20,
      summary: { count: 1, payable_amount_by_currency: { PEN: "100.00" }, status_counts: { APPROVED: 1 } },
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
    });
    const user = userEvent.setup();
    const { rerender } = render(<PaymentQueuePage />);

    const selectPage = screen.getByRole("checkbox", { name: "Seleccionar esta página" });
    await user.click(selectPage);
    expect(screen.getByRole("checkbox", { name: "Seleccionar SOL-1 para asignar" })).toBeChecked();

    await user.click(screen.getByTestId("payment-filter-paid"));
    rerender(<PaymentQueuePage />);
    expect(screen.getByRole("checkbox", { name: "Seleccionar SOL-1 para asignar" })).not.toBeChecked();
    expect(screen.queryByText(/todos los filtrados/i)).not.toBeInTheDocument();
  });

  it("restaura URL avanzada y presenta summary server-side sin sumar la página", () => {
    currentQuery = "tab=paid&page=2&search=REXAN&approved_from=2026-08-01&approved_to=2026-08-28&source_account_key=BCP_PEN&completeness=complete&drive_status=SUCCEEDED&rexan_status=CREATED&currency=PEN&amount_min=10.00&amount_max=300.00&sort=payable_amount_desc";
    mocks.usePaymentQueue.mockReturnValue({
      requests: [], total: 2, page: 2, limit: 20,
      summary: { count: 2, payable_amount_by_currency: { PEN: "270.00" }, status_counts: { PAID: 2 } },
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
    });

    render(<PaymentQueuePage />);

    expect(mocks.usePaymentQueue).toHaveBeenCalledWith(expect.objectContaining({
      status: REQUEST_STATUS.PAID,
      page: 2,
      search: "REXAN",
      approved_from: "2026-08-01",
      source_account_key: "BCP_PEN",
      completeness: "complete",
      drive_status: "SUCCEEDED",
      rexan_status: "CREATED",
      amount_min: "10.00",
      amount_max: "300.00",
      sort: "payable_amount_desc",
    }), expect.anything());
    expect(screen.getByText("270.00")).toBeInTheDocument();
    expect(screen.getByText("2 resultados filtrados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar filtro Búsqueda: REXAN" })).toBeInTheDocument();
  });

  it("reinicia página al cambiar filtros, limpia chips y recupera una URL inválida", async () => {
    currentQuery = "tab=paid&page=4&search=REXAN";
    const user = userEvent.setup();
    const { rerender } = render(<PaymentQueuePage />);

    await user.click(screen.getByRole("button", { name: "Quitar filtro Búsqueda: REXAN" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/payments?tab=paid");

    currentQuery = "tab=paid&status=VOIDED";
    rerender(<PaymentQueuePage />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron aplicar los filtros de la URL");
    expect(mocks.usePaymentQueue).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ enabled: false }));
    await user.click(screen.getByRole("button", { name: "Restablecer filtros" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/payments");
  });

  it("muestra lifecycle Payment y completitud backend sin SOURCE_REQUIRED", () => {
    render(
      <PaymentQueueTable
        requests={[failedRexanRequest(true)]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Pago registrado")).toBeInTheDocument();
    expect(screen.getByText("REXAN: requiere atención")).toBeInTheDocument();
    expect(screen.getByText("Pago completo")).toBeInTheDocument();
  });

  it("no presenta completitud de pago antes de que el pago esté registrado", () => {
    const request = pendingSourceRequest();
    request.status = REQUEST_STATUS.APPROVED;
    request.paid_at = null;
    request.payment_id = undefined;
    request.payment = undefined;

    render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByRole("generic", { name: "Estado de pago: Pendiente de pago" })).toBeInTheDocument();
    expect(screen.queryByText("Pago completo")).not.toBeInTheDocument();
  });

  it("muestra la completitud de pago cuando no hay datos pendientes", () => {
    const request = pendingSourceRequest();
    request.payment = { ...request.payment!, drive_projection_status: "SUCCEEDED" };

    render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Pago registrado")).toBeInTheDocument();
    expect(screen.getByText("Pago completo")).toBeInTheDocument();
  });

  it("shows canonical missing badges and exactly one Completar pago action", () => {
    const incomplete = pendingSourceRequest();
    incomplete.payment = {
      ...incomplete.payment!,
      operation_reference: null,
      proof_document_id: null,
      proof_pending: true,
      details_pending: true,
      missing_fields: ["operation_reference", "proof"],
      completeness: "BOTH_PENDING",
    };
    render(
      <PaymentQueueTable
        requests={[incomplete]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onCompletePaymentDetails={vi.fn()}
        onAttachPaymentProof={vi.fn()}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Falta referencia")).toBeInTheDocument();
    expect(screen.getByText("Falta constancia")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Completar pago" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Agregar constancia de pago" })).not.toBeInTheDocument();
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"])("permite completar a %s y deja otros roles en lectura", (role) => {
    const incomplete = pendingSourceRequest();
    incomplete.payment = {
      ...incomplete.payment!,
      operation_reference: null,
      details_pending: true,
      missing_fields: ["operation_reference"],
      completeness: "REFERENCE_PENDING",
    };
    const { rerender } = render(
      <PaymentQueueTable
        requests={[incomplete]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onCompletePaymentDetails={vi.fn()}
        currentUserId="user-1"
        canManagePayments={role === "GIOF_GESTOR" || role === "GIOF_MANAGER"}
      />,
    );
    expect(screen.getByRole("button", { name: "Completar pago" })).toBeInTheDocument();

    rerender(
      <PaymentQueueTable
        requests={[incomplete]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onCompletePaymentDetails={vi.fn()}
        currentUserId="user-1"
        canManagePayments={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Completar pago" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver solicitud" })).toBeInTheDocument();
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"])("habilita pago masivo visible para %s", async (role) => {
    roleCode = role;
    mocks.usePaymentQueue.mockReturnValue({
      requests: [
        {
          ...pendingSourceRequest(),
          status: REQUEST_STATUS.APPROVED,
          paid_at: null,
          payment_id: undefined,
          payment: undefined,
        },
      ],
      total: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PaymentQueuePage />);

    expect(screen.getByRole("checkbox", { name: /seleccionar solicitudes elegibles de esta página para pago masivo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /registrar pagos seleccionados/i })).toBeDisabled();
    expect(mocks.bulkMarkPaid).not.toHaveBeenCalled();
  });

  it("limita a cinco visibles elegibles y excluye asignación o lease ajenos", () => {
    const ownRequests = Array.from({ length: 6 }, (_, index) => ({
      ...pendingSourceRequest(),
      id: `request-${index + 1}`,
      request_code: `SOL-${index + 1}`,
      status: REQUEST_STATUS.APPROVED,
      payment: undefined,
      payment_id: undefined,
    }));
    const foreignAssignee = {
      ...ownRequests[0],
      id: "request-foreign-assignee",
      request_code: "SOL-FOREIGN-ASSIGNEE",
      giof_work: { ...ownRequests[0].giof_work!, assigneeId: "user-2" },
    };
    const foreignLease = {
      ...ownRequests[0],
      id: "request-foreign-lease",
      request_code: "SOL-FOREIGN-LEASE",
      giof_work: {
        ...ownRequests[0].giof_work!,
        assigneeId: null,
        lease: { ownerId: "user-2", heartbeatAt: null, expiresAt: "2099-01-01T00:00:00.000Z" },
      },
    };

    render(
      <PaymentQueueTable
        requests={[...ownRequests, foreignAssignee, foreignLease]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        currentUserId="user-1"
        selectedRequestIds={ownRequests.slice(0, 5).map((request) => request.id)}
        onToggleRequest={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Seleccionar SOL-6 para pago masivo" })).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /SOL-FOREIGN-ASSIGNEE para pago masivo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /SOL-FOREIGN-LEASE para pago masivo/ })).not.toBeInTheDocument();
    expect(screen.getByText("Máximo 5 de esta página")).toBeInTheDocument();
  });

  it.each([
    { canAcquire: true, hasRetryCapability: true, visible: true },
    { canAcquire: false, hasRetryCapability: true, visible: false },
    { canAcquire: true, hasRetryCapability: false, visible: false },
  ])(
    "gates REXAN retry by capability and server work state: $canAcquire/$hasRetryCapability",
    ({ canAcquire, hasRetryCapability, visible }) => {
      render(
        <PaymentQueueTable
          requests={[failedRexanRequest(canAcquire)]}
          isLoading={false}
          onRegisterPayment={vi.fn()}
          onRetryRexanActivation={hasRetryCapability ? vi.fn() : undefined}
          currentUserId="user-1"
        />,
      );

      const retry = screen.queryByRole("button", { name: "Reintentar REXAN" });
      expect(Boolean(retry)).toBe(visible);
    },
  );
});
