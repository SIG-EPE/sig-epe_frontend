import {
  GIOF_BULK_ASSIGNMENT_MODE,
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
} from "@/types/giof-work";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createBulkMarkPaidRun } from "@/hooks/use-bulk-mark-paid-orchestrator";
import {
  loadBulkMarkPaidRun,
  saveBulkMarkPaidRun,
} from "@/lib/bulk-mark-paid-run-storage";

import { PaymentQueueTable } from "@/components/payments/payment-queue-table";
import {
  getPaymentRegisteredToast,
  PaymentQueuePage,
} from "@/components/payments/payment-queue-page";
import {
  REQUEST_CURRENCY,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type BulkMarkPaidInput,
  type PaymentRequest,
} from "@/types/requests";

const mocks = vi.hoisted(() => ({
  bulkSelfAssign: vi.fn(),
  bulkMarkPaid: vi.fn(),
  completePaymentDetails: vi.fn(),
  uploadDocument: vi.fn(),
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
  usePaymentQueue: vi.fn(),
  useGiofClaimableWork: vi.fn(),
  useGiofSelfClaim: vi.fn(),
  apiGet: vi.fn(),
  rejectApprovedPayment: vi.fn(),
  invalidateRequestDomain: vi.fn(),
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
  useRejectApprovedPayment: () => ({
    rejectApprovedPayment: mocks.rejectApprovedPayment,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: {
      user: { id: string; role: { code: string } };
      sessionExpiresAt: string | null;
    }) => unknown,
  ) =>
    selector({
      user: { id: "user-1", role: { code: roleCode } },
      sessionExpiresAt: null,
    }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: { get: mocks.apiGet },
}));

vi.mock("@/lib/query-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/query-tags")>()),
  invalidateRequestDomain: mocks.invalidateRequestDomain,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock("@/hooks/use-giof-work", () => ({
  registerGiofClaimableRefetch: vi.fn(() => vi.fn()),
  useGiofOwnershipCommands: vi.fn(() => ({
    release: vi.fn(),
    take: vi.fn(),
    forceReassign: vi.fn(),
    isSubmitting: false,
    error: null,
    clearError: vi.fn(),
  })),
  useGiofWorkLeaseSet: () => ({
    leases: [],
    acquire: mocks.acquireLease,
    release: mocks.releaseLease,
    releaseAll: vi.fn(),
  }),
  fetchGiofAssignees: vi.fn().mockResolvedValue([]),
  useGiofAssignees: vi.fn(() => ({
    data: [],
    isLoading: false,
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    refetch: vi.fn(),
  })),
  fetchGiofHistory: vi.fn().mockResolvedValue([]),
  bulkAssignGiofWork: vi.fn(),
  getGiofConflictMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Error",
  useGiofClaimableWork: mocks.useGiofClaimableWork,
  useGiofSelfClaim: mocks.useGiofSelfClaim,
  useGiofBulkSelfAssignment: vi.fn(() => ({
    assign: mocks.bulkSelfAssign,
    isSubmitting: false,
    error: null,
    result: null,
    clearError: vi.fn(),
    clearResult: vi.fn(),
  })),
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

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture)
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  if (!HTMLElement.prototype.releasePointerCapture)
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!HTMLElement.prototype.scrollIntoView)
    HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("payment pending queue action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentQuery = "";
    roleCode = "GIOF_GESTOR";
    sessionStorage.clear();
    mocks.apiGet.mockReset();
    mocks.bulkSelfAssign.mockReset();
    mocks.bulkSelfAssign.mockResolvedValue({
      pool: "PAYMENT",
      total: 1,
      counts: { assigned: 1, unchangedSelf: 0, blocked: 0 },
      results: [{ requestId: "request-1", outcome: "ASSIGNED" }],
    });
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
    mocks.useGiofClaimableWork.mockReturnValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    mocks.useGiofSelfClaim.mockReturnValue({
      claim: vi.fn(),
      pendingRequestId: null,
      isSubmitting: false,
      error: null,
      clearError: vi.fn(),
    });
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"])(
    "integra PAYMENT claimable para %s sin confundirlo con marcar pagos",
    async (role) => {
      roleCode = role;
      const refetch = vi.fn().mockResolvedValue(undefined);
      mocks.usePaymentQueue.mockReturnValue({
        requests: [],
        total: 0,
        page: 1,
        limit: 20,
        isLoading: false,
        isRefreshing: false,
        error: null,
        refetch,
        summary: {
          count: 0,
          payable_amount_by_currency: {},
          status_counts: {},
        },
      });

      render(<PaymentQueuePage />);

      expect(screen.getByTestId("giof-claimable-PAYMENT")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Trabajos que puedes tomar" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Marcar pagos seleccionados/i }),
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: /^Tomar trabajo$/i }),
      ).not.toBeInTheDocument();
      const options = mocks.useGiofSelfClaim.mock.calls.at(-1)?.[0];
      await options.refetchPoolQueue({ force: true });
      expect(refetch).toHaveBeenCalledWith({ force: true });
      expect(mocks.acquireLease).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["GIOF_GESTOR", "Todos", ["Todos", "Mi trabajo"]],
    [
      "GIOF_MANAGER",
      "Todos",
      ["Todos", "Mi trabajo", "Sin asignar", "Por responsable"],
    ],
  ])(
    "muestra los alcances permitidos de Payment para %s",
    async (role, selected, expectedOptions) => {
      const user = userEvent.setup();
      roleCode = role;

      render(<PaymentQueuePage />);

      const scope = screen.getByRole("combobox", {
        name: "Alcance de trabajo GIOF",
      });
      expect(scope).toHaveTextContent(selected);
      await user.click(scope);
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(expectedOptions);
      expect(mocks.usePaymentQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          work_scope: "all",
        }),
        expect.anything(),
      );
      expect(screen.getByTestId("giof-claimable-PAYMENT")).toBeInTheDocument();
    },
  );

  it("oculta PAYMENT claimable en historial y para roles no operativos", () => {
    currentQuery = "tab=paid";
    roleCode = "GIOF_GESTOR";
    const { rerender } = render(<PaymentQueuePage />);
    expect(
      screen.queryByTestId("giof-claimable-PAYMENT"),
    ).not.toBeInTheDocument();

    currentQuery = "";
    roleCode = "ADMIN_SISTEMA";
    rerender(<PaymentQueuePage />);
    expect(
      screen.queryByTestId("giof-claimable-PAYMENT"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Alcance de trabajo GIOF" }),
    ).not.toBeInTheDocument();
  });

  it("adquiere el lease PAYMENT solo cuando el usuario entra explícitamente a Procesar", async () => {
    const row = {
      ...pendingSourceRequest(),
      status: REQUEST_STATUS.APPROVED,
      paid_at: null,
      payment: undefined,
      payment_id: undefined,
    };
    mocks.usePaymentQueue.mockReturnValue({
      requests: [row],
      total: 1,
      page: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      summary: {
        count: 1,
        payable_amount_by_currency: { PEN: "100.00" },
        status_counts: { APPROVED: 1 },
      },
    });
    mocks.acquireLease.mockResolvedValue({
      requestId: row.id,
      pool: "PAYMENT",
      assignmentVersion: "1",
      token: "lease-1",
      ownerId: "user-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const user = userEvent.setup();

    render(<PaymentQueuePage />);

    expect(screen.getByTestId("giof-claimable-PAYMENT")).toBeInTheDocument();
    expect(mocks.acquireLease).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Procesar" }));
    expect(mocks.acquireLease).toHaveBeenCalledWith(row.id, row.giof_work, [
      "",
    ]);
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

  it("conserva los tabs, consulta Pagos rechazados y traduce Datos pendientes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PaymentQueuePage />);

    expect(
      screen.getByRole("group", { name: "Vista de pagos" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("payment-filter-approved")).toHaveTextContent(
      "Pendientes",
    );
    expect(screen.getByTestId("payment-filter-paid")).toHaveTextContent(
      "Historial pagado",
    );
    expect(screen.getByTestId("payment-filter-pending-data")).toHaveTextContent(
      "Datos pendientes",
    );
    expect(screen.getByTestId("payment-filter-rejected")).toHaveTextContent(
      "Pagos rechazados",
    );
    expect(mocks.usePaymentQueue).toHaveBeenCalledWith(
      expect.objectContaining({ status: REQUEST_STATUS.APPROVED }),
      expect.anything(),
    );

    await user.click(screen.getByTestId("payment-filter-pending-data"));
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/payments?tab=pending-data&work_scope=all",
    );
    rerender(<PaymentQueuePage />);
    expect(mocks.usePaymentQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: REQUEST_STATUS.PAID,
        completeness: "any_missing",
      }),
      expect.anything(),
    );

    await user.click(screen.getByTestId("payment-filter-rejected"));
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/payments?tab=rejected&work_scope=all",
    );
    rerender(<PaymentQueuePage />);
    expect(mocks.usePaymentQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: REQUEST_STATUS.REJECTED }),
      expect.anything(),
    );
    expect(
      screen.queryByTestId("giof-claimable-PAYMENT"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Marcar pagos seleccionados/i }),
    ).not.toBeInTheDocument();
  });

  it("mantiene Pagos rechazados legible para un rol no operativo y sin controles de mutación", () => {
    currentQuery = "tab=rejected&page=2&sort=queue_date_asc";
    roleCode = "ADMIN_SISTEMA";

    render(<PaymentQueuePage />);

    expect(mocks.usePaymentQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        status: REQUEST_STATUS.REJECTED,
        page: 2,
        sort: "queue_date_asc",
        work_scope: undefined,
      }),
      { enabled: true },
    );
    expect(screen.getByText("Monto no pagado")).toBeInTheDocument();
    expect(screen.getByLabelText("Completitud del pago")).toBeDisabled();
    expect(
      screen.queryByTestId("giof-claimable-PAYMENT"),
    ).not.toBeInTheDocument();
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
      requests: [incomplete],
      total: 1,
      page: 1,
      limit: 20,
      summary: {
        count: 1,
        payable_amount_by_currency: { PEN: "100.00" },
        status_counts: { PAID: 1 },
      },
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch,
    });
    mocks.acquireLease.mockResolvedValue({ requestId: incomplete.id });
    mocks.releaseLease.mockResolvedValue(undefined);
    mocks.completePaymentDetails.mockResolvedValue(incomplete);
    const user = userEvent.setup();
    render(<PaymentQueuePage />);

    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Completar pago",
    });
    await user.type(
      within(dialog).getByLabelText(/Referencia de operación/),
      "OP-REFRESH",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Completar pago" }),
    );

    expect(mocks.completePaymentDetails).toHaveBeenCalledWith("payment-1", {
      command_id: expect.any(String),
      operation_reference: "OP-REFRESH",
      proof_document_id: undefined,
    });
    expect(refetch).toHaveBeenCalledWith({ force: true });
  });

  it("no retiene selección de pago ni asignación al cambiar página o identidad de vista", async () => {
    roleCode = "GIOF_MANAGER";
    const request = pendingSourceRequest();
    request.status = REQUEST_STATUS.APPROVED;
    request.payment = undefined;
    request.payment_id = undefined;
    request.giof_work = {
      ...request.giof_work!,
      pool: "PAYMENT",
      canAssign: true,
      assigneeId: "user-1",
    } as PaymentRequest["giof_work"];
    mocks.usePaymentQueue.mockReturnValue({
      requests: [request],
      total: 1,
      page: 1,
      limit: 20,
      summary: {
        count: 1,
        payable_amount_by_currency: { PEN: "100.00" },
        status_counts: { APPROVED: 1 },
      },
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    const { rerender } = render(<PaymentQueuePage />);

    const selectPage = screen.getByRole("checkbox", {
      name: "Seleccionar esta página",
    });
    await user.click(selectPage);
    await user.click(screen.getByTestId("payment-row-checkbox"));
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar SOL-1 para asignar" }),
    ).toBeChecked();
    expect(screen.getByTestId("payment-row-checkbox")).toBeChecked();

    currentQuery = "page=2";
    rerender(<PaymentQueuePage />);
    expect(screen.getByTestId("payment-row-checkbox")).not.toBeChecked();

    await user.click(screen.getByTestId("payment-filter-paid"));
    rerender(<PaymentQueuePage />);
    expect(
      screen.queryByRole("checkbox", { name: "Seleccionar SOL-1 para asignar" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/todos los filtrados/i)).not.toBeInTheDocument();
  });

  it("restaura URL avanzada y presenta summary server-side sin sumar la página", () => {
    currentQuery =
      "tab=paid&page=2&search=REXAN&approved_from=2026-08-01&approved_to=2026-08-28&source_account_key=BCP_PEN&completeness=complete&drive_status=SUCCEEDED&rexan_status=CREATED&currency=PEN&amount_min=10.00&amount_max=300.00&sort=payable_amount_desc";
    mocks.usePaymentQueue.mockReturnValue({
      requests: [],
      total: 2,
      page: 2,
      limit: 20,
      summary: {
        count: 2,
        payable_amount_by_currency: { PEN: "270.00" },
        status_counts: { PAID: 2 },
      },
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PaymentQueuePage />);

    expect(mocks.usePaymentQueue).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
      expect.anything(),
    );
    expect(screen.getByText("270.00")).toBeInTheDocument();
    expect(screen.getByText("2 resultados filtrados")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quitar filtro Búsqueda: REXAN" }),
    ).toBeInTheDocument();
  });

  it("reinicia página al cambiar filtros, limpia chips y recupera una URL inválida", async () => {
    currentQuery = "tab=paid&page=4&search=REXAN";
    const user = userEvent.setup();
    const { rerender } = render(<PaymentQueuePage />);

    await user.click(
      screen.getByRole("button", { name: "Quitar filtro Búsqueda: REXAN" }),
    );
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/payments?tab=paid&work_scope=all",
    );

    currentQuery = "tab=paid&status=VOIDED";
    rerender(<PaymentQueuePage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron aplicar los filtros de la URL",
    );
    expect(mocks.usePaymentQueue).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
    await user.click(
      screen.getByRole("button", { name: "Restablecer filtros" }),
    );
    expect(replaceMock).toHaveBeenLastCalledWith("/payments?work_scope=all");
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

    expect(
      screen.getByRole("generic", {
        name: "Estado de pago: Pendiente de pago",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pago completo")).not.toBeInTheDocument();
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"])(
    "muestra Rechazar pago solo para APPROVED PAYMENT operable a %s",
    (role) => {
      const request = pendingSourceRequest();
      request.status = REQUEST_STATUS.APPROVED;
      request.payment = undefined;
      request.payment_id = undefined;
      const onRejectPayment = vi.fn();
      const { rerender } = render(
        <PaymentQueueTable
          requests={[request]}
          isLoading={false}
          onRegisterPayment={vi.fn()}
          onRejectPayment={onRejectPayment}
          currentUserId="user-1"
          canManagePayments={role === "GIOF_GESTOR" || role === "GIOF_MANAGER"}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Rechazar pago" }),
      ).toBeInTheDocument();

      for (const status of [REQUEST_STATUS.PAID, REQUEST_STATUS.REJECTED]) {
        rerender(
          <PaymentQueueTable
            requests={[{ ...request, status }]}
            isLoading={false}
            onRegisterPayment={vi.fn()}
            onRejectPayment={onRejectPayment}
            currentUserId="user-1"
          />,
        );
        expect(
          screen.queryByRole("button", { name: "Rechazar pago" }),
        ).not.toBeInTheDocument();
      }

      rerender(
        <PaymentQueueTable
          requests={[
            {
              ...request,
              giof_work: { ...request.giof_work!, canAcquire: false },
            },
          ]}
          isLoading={false}
          onRegisterPayment={vi.fn()}
          onRejectPayment={onRejectPayment}
          currentUserId="user-1"
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Rechazar pago" }),
      ).not.toBeInTheDocument();

      rerender(
        <PaymentQueueTable
          requests={[request]}
          isLoading={false}
          onRegisterPayment={vi.fn()}
          onRejectPayment={onRejectPayment}
          currentUserId="user-1"
          canManagePayments={false}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Rechazar pago" }),
      ).not.toBeInTheDocument();
    },
  );

  it("renderiza el rechazo de pago como historial seguro y sin mutaciones", () => {
    const request = {
      ...pendingSourceRequest(),
      status: REQUEST_STATUS.REJECTED,
      payment: undefined,
      payment_id: undefined,
      payment_rejection: {
        reason: "Cuenta <cerrada>",
        rejected_at: "2026-09-15T12:00:00.000Z",
        actor: {
          id: "actor-1",
          first_name: "María",
          last_name: "Gestora",
        },
      },
    };
    render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onRejectPayment={vi.fn()}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Pago rechazado")).toBeInTheDocument();
    expect(screen.getByText("Motivo: Cuenta <cerrada>")).toBeInTheDocument();
    expect(screen.getByText("Actor: María Gestora")).toBeInTheDocument();
    expect(screen.getByText(/Rechazado:/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("adquiere lease al abrir rechazo, refetch autoritativo y limpia marcado masivo", async () => {
    const user = userEvent.setup();
    const request = {
      ...pendingSourceRequest(),
      status: REQUEST_STATUS.APPROVED,
      payment: undefined,
      payment_id: undefined,
    };
    const refetch = vi.fn().mockResolvedValue(undefined);
    mocks.usePaymentQueue.mockReturnValue({
      requests: [request],
      total: 1,
      page: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch,
      summary: {
        count: 1,
        payable_amount_by_currency: { PEN: "100.00" },
        status_counts: { APPROVED: 1 },
      },
    });
    mocks.acquireLease.mockResolvedValue({
      pool: "PAYMENT",
      requestId: request.id,
      ownerId: "user-1",
      token: "reject-token",
      assignmentVersion: "1",
      heartbeatAt: "2026-09-15T10:00:00.000Z",
      expiresAt: "2099-09-15T10:05:00.000Z",
      ttlSeconds: 300,
      heartbeatIntervalSeconds: 60,
    });
    mocks.rejectApprovedPayment.mockResolvedValue({
      ...request,
      status: REQUEST_STATUS.REJECTED,
      rejected_at: "2026-09-15T12:00:00.000Z",
    });
    render(<PaymentQueuePage />);

    const scope = {
      userId: "user-1",
      sessionId: "user-1:GIOF_GESTOR",
      pageIdentity: "work_scope=all",
    };
    const persistedRun = createBulkMarkPaidRun({
      scope,
      pageRequestIds: [request.id],
      selected: [
        {
          requestId: request.id,
          originalAmount: "100.00",
          originalCurrency: REQUEST_CURRENCY.PEN,
        },
      ],
      paidAt: "2026-09-15T11:00:00.000Z",
      createId: (() => {
        let id = 0;
        return () => `rejection-run-${++id}`;
      })(),
    });
    saveBulkMarkPaidRun(scope, persistedRun);

    await user.click(
      screen.getByRole("checkbox", { name: /SOL-1 para pago masivo/ }),
    );
    expect(
      screen.getByRole("button", { name: "Marcar pagos seleccionados" }),
    ).toBeEnabled();
    await user.click(screen.getByTestId("reject-payment-button"));
    expect(mocks.acquireLease).toHaveBeenCalledWith(
      request.id,
      request.giof_work,
    );
    await user.type(
      await screen.findByRole("textbox", { name: /motivo/i }),
      "Cuenta cerrada",
    );
    await user.type(
      screen.getByRole("textbox", { name: /escribe rechazar/i }),
      "RECHAZAR",
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Rechazar pago",
      }),
    );

    await waitFor(() => expect(refetch).toHaveBeenCalledWith({ force: true }));
    expect(mocks.releaseLease).toHaveBeenCalledWith(request.id);
    expect(mocks.invalidateRequestDomain).toHaveBeenCalledWith(request.id);
    expect(
      screen.getByRole("button", { name: "Marcar pagos seleccionados" }),
    ).toBeDisabled();
    expect(loadBulkMarkPaidRun(scope, { recover: false })).toBeNull();
  });

  it("muestra la completitud de pago cuando no hay datos pendientes", () => {
    const request = pendingSourceRequest();
    request.payment = {
      ...request.payment!,
      drive_projection_status: "SUCCEEDED",
    };

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
    expect(
      screen.getAllByRole("button", { name: "Completar pago" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Agregar constancia de pago" }),
    ).not.toBeInTheDocument();
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"])(
    "permite completar a %s y deja otros roles en lectura",
    (role) => {
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
      expect(
        screen.getByRole("button", { name: "Completar pago" }),
      ).toBeInTheDocument();

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
      expect(
        screen.queryByRole("button", { name: "Completar pago" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Ver solicitud" }),
      ).toBeInTheDocument();
    },
  );

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"])(
    "expone marcado independiente sin mutar para %s",
    (role) => {
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

      expect(
        screen.getAllByRole("checkbox", { name: /pago masivo/i }),
      ).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: /Marcar pagos seleccionados/i }),
      ).toBeDisabled();
      expect(mocks.bulkMarkPaid).not.toHaveBeenCalled();
    },
  );

  it("no ofrece marcado masivo a un rol de consulta", () => {
    roleCode = "ADMIN";
    render(<PaymentQueuePage />);
    expect(
      screen.queryByRole("button", { name: /Marcar pagos seleccionados/ }),
    ).not.toBeInTheDocument();
    expect(mocks.bulkMarkPaid).not.toHaveBeenCalled();
  });

  it("adquiere contexto PAYMENT solo tras confirmación y manda la versión por ítem", async () => {
    const row = {
      ...pendingSourceRequest(),
      status: REQUEST_STATUS.APPROVED,
      payment: undefined,
      payment_id: undefined,
    };
    const refetch = vi.fn();
    mocks.usePaymentQueue.mockReturnValue({
      requests: [row],
      total: 1,
      page: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch,
    });
    mocks.acquireLease.mockResolvedValueOnce({
      requestId: row.id,
      pool: "PAYMENT",
      assignmentVersion: "1",
      token: "lease-1",
      ownerId: "user-1",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    mocks.bulkMarkPaid.mockResolvedValueOnce({
      items: [
        { request_id: row.id, outcome: "SUCCESS", missing_fields: ["proof"] },
      ],
      amounts_by_currency: { PEN: "100.00" },
      totals_complete: true,
      unresolved_count: 0,
    });
    const user = userEvent.setup();
    render(<PaymentQueuePage />);
    await user.click(screen.getByTestId("payment-row-checkbox"));
    await user.click(
      screen.getByRole("button", { name: /Marcar pagos seleccionados/ }),
    );
    expect(mocks.acquireLease).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Fecha efectiva/), {
      target: { value: "2026-09-09T10:30" },
    });
    await user.click(screen.getByLabelText(/Confirmo que las transferencias/));
    await user.click(screen.getByRole("button", { name: "Marcar 1 pagos" }));
    await waitFor(() => expect(mocks.bulkMarkPaid).toHaveBeenCalledOnce());
    expect(mocks.bulkMarkPaid.mock.calls[0][0].items[0]).toMatchObject({
      request_id: row.id,
      assignment_version: 1,
      lease_token: "lease-1",
      expected_original_amount: "100.00",
      expected_original_currency: "PEN",
    });
    expect(refetch).toHaveBeenCalledWith({ force: true });
  });

  it("recupera desde sessionStorage, reconcilia el pago confirmado y reanuda solo el pendiente con su command_id estable", async () => {
    const paid = pendingSourceRequest();
    const pending = {
      ...pendingSourceRequest(),
      id: "request-2",
      request_code: "SOL-2",
      status: REQUEST_STATUS.APPROVED,
      paid_at: null,
      payment: undefined,
      payment_id: undefined,
    };
    const scope = {
      userId: "user-1",
      sessionId: "user-1:GIOF_GESTOR",
      pageIdentity: "work_scope=all",
    };
    const recovered = createBulkMarkPaidRun({
      scope,
      pageRequestIds: [paid.id, pending.id],
      selected: [
        {
          requestId: paid.id,
          originalAmount: "100.00",
          originalCurrency: REQUEST_CURRENCY.PEN,
        },
        {
          requestId: pending.id,
          originalAmount: "100.00",
          originalCurrency: REQUEST_CURRENCY.PEN,
        },
      ],
      paidAt: "2026-09-10T15:30:00.000Z",
      createId: (() => {
        let id = 0;
        return () => `recovery-id-${++id}`;
      })(),
    });
    saveBulkMarkPaidRun(scope, recovered);
    const refetch = vi.fn().mockResolvedValue(undefined);
    mocks.usePaymentQueue.mockReturnValue({
      requests: [pending],
      total: 1,
      page: 1,
      limit: 50,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch,
      summary: {
        count: 1,
        payable_amount_by_currency: { PEN: "100.00" },
        status_counts: { APPROVED: 1 },
      },
    });
    mocks.apiGet.mockImplementation(async (path: string) =>
      path.endsWith(paid.id) ? paid : pending,
    );
    mocks.acquireLease.mockResolvedValue({
      requestId: pending.id,
      pool: "PAYMENT",
      assignmentVersion: "1",
      token: "recovery-lease",
      ownerId: "user-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    mocks.bulkMarkPaid.mockImplementation(async (input: BulkMarkPaidInput) => ({
      items: input.items.map((item) => ({
        request_id: item.request_id,
        command_id: item.command_id,
        outcome: "SUCCESS",
        payment_id: "payment-2",
        code: "PAID",
        message: "Pago registrado",
        original: { amount: "100.00", currency: "PEN" },
        actual_disbursement: null,
        valuation: null,
        missing_fields: ["proof"],
        rexan_activation: null,
      })),
      amounts_by_currency: { PEN: "100.00" },
      totals_complete: true,
      unresolved_count: 0,
    }));
    const user = userEvent.setup();

    render(<PaymentQueuePage />);

    const recover = await screen.findByRole("button", {
      name: "Reconciliar y reanudar",
    });
    expect(
      screen.getByRole("button", { name: /Marcar pagos seleccionados/i }),
    ).toBeDisabled();
    await user.click(recover);

    await waitFor(() => expect(mocks.bulkMarkPaid).toHaveBeenCalledOnce());
    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
    expect(refetch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bulkMarkPaid.mock.invocationCallOrder[0],
    );
    expect(mocks.acquireLease).toHaveBeenCalledOnce();
    expect(mocks.acquireLease).toHaveBeenCalledWith(
      pending.id,
      pending.giof_work,
    );
    expect(mocks.bulkMarkPaid.mock.calls[0][0].items).toEqual([
      expect.objectContaining({
        request_id: pending.id,
        command_id: recovered.commands[1].commandId,
      }),
    ]);
    expect(
      mocks.bulkMarkPaid.mock.calls[0][0].items.find(
        (item: BulkMarkPaidInput["items"][number]) =>
          item.request_id === paid.id,
      ),
    ).toBeUndefined();
  });

  it("seleccionar asignación no selecciona pagos", () => {
    roleCode = "GIOF_MANAGER";
    const row = {
      ...pendingSourceRequest(),
      status: REQUEST_STATUS.APPROVED,
      payment: undefined,
      payment_id: undefined,
      giof_work: { ...pendingSourceRequest().giof_work!, canAssign: true },
    };
    mocks.usePaymentQueue.mockReturnValue({
      requests: [row],
      total: 1,
      page: 1,
      limit: 50,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PaymentQueuePage />);
    fireEvent.click(screen.getByTestId("assignment-select-all-checkbox"));

    expect(
      screen.getByRole("checkbox", {
        name: "Seleccionar SOL-1 para asignar",
      }),
    ).toBeChecked();
    expect(screen.getByTestId("payment-row-checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Marcar pagos seleccionados/ }),
    ).toBeDisabled();
  });

  it("integra autoasignación Gestor en Datos pendientes sin habilitar marcado de pagos", async () => {
    currentQuery = "tab=pending-data";
    const row = pendingSourceRequest();
    row.giof_work = {
      ...row.giof_work!,
      assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED,
      assignmentVersion: "11",
      leaseState: GIOF_WORK_LEASE_STATE.NONE,
      canAssign: true,
    };
    mocks.usePaymentQueue.mockReturnValue({
      requests: [row],
      total: 1,
      page: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
      summary: { count: 1, payable_amount_by_currency: {}, status_counts: {} },
    });
    const user = userEvent.setup();
    render(<PaymentQueuePage />);

    expect(
      screen.queryByRole("button", { name: /Marcar pagos seleccionados/i }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Seleccionar SOL-1 para asignar",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Asignarme seleccionados" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar asignación" }),
    );

    expect(mocks.bulkSelfAssign).toHaveBeenCalledWith([
      { requestId: "request-1", expectedAssignmentVersion: 11 },
    ]);
    expect(mocks.acquireLease).not.toHaveBeenCalled();
  });

  it("separa selección PAYMENT de autoasignación Gestor y excluye own, lease activo e ineligible", () => {
    const base = {
      ...pendingSourceRequest(),
      status: REQUEST_STATUS.APPROVED,
      payment: undefined,
      payment_id: undefined,
      giof_work: {
        ...pendingSourceRequest().giof_work!,
        pool: "PAYMENT" as const,
        assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED,
        assignmentVersion: "9",
        leaseState: GIOF_WORK_LEASE_STATE.NONE,
        canAssign: true,
      },
    };
    const onToggleAssignment = vi.fn();
    render(
      <PaymentQueueTable
        requests={[
          { ...base, id: "eligible", request_code: "PAY-ELIGIBLE" },
          { ...base, id: "own", request_code: "PAY-OWN", giof_work: { ...base.giof_work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.SELF } },
          { ...base, id: "leased", request_code: "PAY-LEASED", giof_work: { ...base.giof_work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.OTHER, leaseState: GIOF_WORK_LEASE_STATE.ACTIVE_OTHER } },
          { ...base, id: "ineligible", request_code: "PAY-INELIGIBLE", giof_work: { ...base.giof_work, canAssign: false } },
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        currentUserId="user-1"
        bulkAssignmentMode={GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF}
        selectedRequestIds={[]}
        onToggleRequest={vi.fn()}
        onToggleAll={vi.fn()}
        onToggleAssignment={onToggleAssignment}
        onToggleAllAssignments={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Seleccionar PAY-ELIGIBLE para asignar",
      }),
    );
    expect(onToggleAssignment).toHaveBeenCalledWith("eligible", true);
    expect(screen.queryByRole("checkbox", { name: /PAY-OWN.*asignar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /PAY-LEASED.*asignar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /PAY-INELIGIBLE.*asignar/i })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("checkbox", { name: /pago masivo/i }).length,
    ).toBeGreaterThan(1);
  });

  it("seleccionar todos admite como máximo cincuenta pagos", () => {
    roleCode = "GIOF_MANAGER";
    const rows = Array.from({ length: 51 }, (_, index) => ({
      ...pendingSourceRequest(),
      id: `r${index}`,
      request_code: `SOL-${index}`,
      status: REQUEST_STATUS.APPROVED,
      payment: undefined,
      payment_id: undefined,
      giof_work: { ...pendingSourceRequest().giof_work!, canAssign: true },
    }));
    mocks.usePaymentQueue.mockReturnValue({
      requests: rows,
      total: 51,
      page: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PaymentQueuePage />);
    fireEvent.click(screen.getByTestId("payment-select-all-checkbox"));

    expect(screen.getByText(/50\/50 para confirmar/)).toBeInTheDocument();
    const selectedPaymentCheckboxes = screen
      .getAllByTestId("payment-row-checkbox")
      .filter((checkbox) => checkbox.getAttribute("data-state") === "checked");
    expect(selectedPaymentCheckboxes).toHaveLength(50);
    expect(
      screen.getByRole("checkbox", {
        name: "Seleccionar SOL-50 para pago masivo",
      }),
    ).toBeDisabled();
    expect(mocks.acquireLease).not.toHaveBeenCalled();
    expect(mocks.bulkMarkPaid).not.toHaveBeenCalled();
  });

  it("limita a cincuenta visibles elegibles y excluye asignación o lease ajenos", () => {
    const ownRequests = Array.from({ length: 51 }, (_, index) => ({
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
        lease: {
          ownerId: "user-2",
          heartbeatAt: null,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    };

    render(
      <PaymentQueueTable
        requests={[...ownRequests, foreignAssignee, foreignLease]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        currentUserId="user-1"
        selectedRequestIds={ownRequests
          .slice(0, 50)
          .map((request) => request.id)}
        onToggleRequest={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Seleccionar SOL-51 para pago masivo",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("checkbox", {
        name: /SOL-FOREIGN-ASSIGNEE para pago masivo/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: /SOL-FOREIGN-LEASE para pago masivo/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Máximo 50 de esta página")).toBeInTheDocument();
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
