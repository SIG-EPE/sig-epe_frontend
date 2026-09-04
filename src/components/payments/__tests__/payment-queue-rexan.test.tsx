import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterPaymentModal } from "@/components/payments/register-payment-modal";
import { PaymentQueuePage } from "@/components/payments/payment-queue-page";
import { PaymentQueueTable } from "@/components/payments/payment-queue-table";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_STORAGE_PROVIDER,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  REXAN_OUTCOME,
  type PaymentRequest,
  type RequestAllocation,
} from "@/types/requests";

const mocks = vi.hoisted(() => ({
  registerPayment: vi.fn(),
  attachPaymentProof: vi.fn(),
  registerPaymentLoading: vi.fn(() => false),
  attachPaymentProofLoading: vi.fn(() => false),
  usePaymentQueue: vi.fn(),
  retryRexanActivation: vi.fn(),
  roleCode: vi.fn(() => "GIOF_GESTOR"),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRegisterPayment: () => ({
    registerPayment: mocks.registerPayment,
    isLoading: mocks.registerPaymentLoading(),
    error: null,
  }),
  useAttachPaymentProof: () => ({
    attachPaymentProof: mocks.attachPaymentProof,
    isLoading: mocks.attachPaymentProofLoading(),
    error: null,
  }),
  useBulkMarkPaid: () => ({
    bulkMarkPaid: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useRetryRexanActivation: () => ({
    retryRexanActivation: mocks.retryRexanActivation,
    isLoading: false,
    error: null,
  }),
  useCompletePaymentDetails: () => ({
    completePaymentDetails: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useUploadRequestDocument: () => ({
    uploadDocument: vi.fn(),
    isLoading: false,
    error: null,
  }),
  usePaymentQueue: mocks.usePaymentQueue,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: { user: { role: { code: string } } | null }) => unknown,
  ) =>
    selector({
      user: mocks.roleCode() ? { role: { code: mocks.roleCode() } } : null,
    }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-giof-work", () => ({
  useGiofWorkLeaseSet: () => ({
    leases: [],
    acquire: vi.fn().mockResolvedValue({ token: "lease-token" }),
    release: vi.fn().mockResolvedValue(undefined),
    releaseAll: vi.fn().mockResolvedValue(undefined),
  }),
  fetchGiofAssignees: vi.fn().mockResolvedValue([]),
  useGiofAssignees: vi.fn(() => ({ data: [], isLoading: false, isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn() })),
  fetchGiofHistory: vi.fn().mockResolvedValue([]),
  bulkAssignGiofWork: vi.fn(),
  getGiofConflictMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Error",
}));

function makeAllocation(
  overrides: Partial<RequestAllocation> = {},
): RequestAllocation {
  return {
    id: "allocation-1",
    payment_request_id: "req-1",
    budget_planning_line_id: "line-1",
    amount: 60,
    currency: REQUEST_CURRENCY.PEN,
    budget_month: 1,
    fiscal_year: 2026,
    org_unit_id: "org-1",
    sort_order: 1,
    budgetPlanningLine: null,
    planning_line: {
      id: "line-1",
      line_code: "POA-001",
      resource_description: "Materiales educativos",
      total_cost: 100,
      status: "APPROVED",
      fiscal_year: { id: "fy-2026", year: 2026 },
      org_unit: { id: "org-1", name: "Unidad 1" },
      category: null,
      program: null,
      action: null,
      monthly_summary: [],
      funding_sources: [
        {
          id: "funding-1",
          funding_source_id: "source-1",
          code: "FF-1",
          name: "Tesoro Público",
          allocated_amount: 60,
          percentage: 100,
        },
      ],
    },
    org_unit: { id: "org-1", name: "Unidad 1" },
    financiers: [
      {
        id: "funding-1",
        funding_source_id: "source-1",
        code: "FF-1",
        name: "Tesoro Público",
        allocated_amount: 60,
        percentage: 100,
      },
    ],
    payment_execution: null,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "req-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.REIMBURSEMENT,
    status: REQUEST_STATUS.APPROVED,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Solicitud de prueba",
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
    beneficiary_name: "Beneficiario",
    beneficiary_document_type: null,
    beneficiary_document_number: null,
    bank_code: null,
    bank_name: null,
    account_type: null,
    bank_account: null,
    bank_cci: null,
    submitted_at: null,
    observed_at: null,
    approved_at: "2026-05-01T10:00:00.000Z",
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    giof_work: {
      pool: "PAYMENT",
      assigneeId: "giof-1",
      assigneeName: "Gestor Uno",
      assignmentVersion: "1",
      lease: null,
      canAssign: true,
      canAcquire: true,
      canEdit: false,
      readOnly: true,
    },
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("REXAN payment queue and modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerPayment.mockResolvedValue(makeRequest());
    mocks.attachPaymentProof.mockResolvedValue(makeRequest());
    mocks.registerPaymentLoading.mockReturnValue(false);
    mocks.attachPaymentProofLoading.mockReturnValue(false);
    mocks.usePaymentQueue.mockReturnValue({
      requests: [],
      total: 0,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      summary: null,
    });
    mocks.roleCode.mockReturnValue("GIOF_GESTOR");
  });

  it("permite asignar APPROVED y PAID con datos pendientes, pero deshabilita PAID completo", () => {
    const work = {
      pool: "PAYMENT" as const,
      assigneeId: null,
      assigneeName: null,
      assignmentVersion: "0",
      lease: null,
      canAcquire: false,
      canEdit: false,
      readOnly: true,
    };
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({
            id: "approved",
            request_code: "PAY-ACTIVE",
            giof_work: { ...work, canAssign: true },
          }),
          makeRequest({
            id: "paid-pending",
            request_code: "PAY-PENDING-DATA",
            status: REQUEST_STATUS.PAID,
            payment_proof_pending: true,
            giof_work: { ...work, canAssign: true },
          }),
          makeRequest({
            id: "paid-complete",
            request_code: "PAY-COMPLETE",
            status: REQUEST_STATUS.PAID,
            payment_proof_pending: false,
            payment_details_pending: false,
            giof_work: { ...work, canAssign: false },
          }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        isGiofManager
        onToggleAssignment={vi.fn()}
        onToggleAllAssignments={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Seleccionar PAY-ACTIVE para asignar",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Seleccionar PAY-PENDING-DATA para asignar",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", {
        name: "PAY-COMPLETE: trabajo de pago completo",
      }),
    ).toBeDisabled();
  });

  it("muestra el saldo REXAN para EXCESS y el monto normal para otros pagos", () => {
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({
            id: "rexan",
            request_code: "REXAN-1",
            request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
            requested_amount: 100,
            rexan_outcome: REXAN_OUTCOME.EXCESS,
            rexan_balance_amount: "25.55",
          }),
          makeRequest({
            id: "normal",
            request_code: "SOL-2",
            requested_amount: 80,
          }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId("payment-queue-row");
    expect(within(rows[0]).getByText("REXAN-1")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/25\.55/)).toBeInTheDocument();
    expect(within(rows[0]).getByText("Saldo REXAN")).toBeInTheDocument();
    expect(within(rows[1]).getByText("SOL-2")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/80\.00/)).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Saldo REXAN")).not.toBeInTheDocument();
  });

  it("muestra Registrado por y A nombre de con documento en la cola", () => {
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({
            created_by_display_name: "Steve Registrante",
            registered_party_name: "Proveedor SAC",
            registered_party_document_type: "RUC",
            registered_party_document_number: "20123456789",
          }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "A nombre de" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Proveedor SAC")).toBeInTheDocument();
    expect(screen.getByText("RUC 20123456789")).toBeInTheDocument();
    expect(
      screen.getByText("Registrado por: Steve Registrante"),
    ).toBeInTheDocument();
  });

  it("muestra guion para A nombre de sin usar el registrante como fallback", () => {
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({
            beneficiary_name: null,
            created_by_display_name: "Ana Registrante",
          }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Registrado por: Ana Registrante"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("Beneficiario")).not.toBeInTheDocument();
  });

  it("permite seleccionar pagos pendientes para acción masiva", async () => {
    const user = userEvent.setup();
    const onToggleRequest = vi.fn();
    const onToggleAll = vi.fn();

    render(
      <PaymentQueueTable
        requests={[
          makeRequest({ id: "req-1", request_code: "SOL-1" }),
          makeRequest({ id: "req-2", request_code: "SOL-2" }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        selectedRequestIds={["req-1"]}
        currentUserId="giof-1"
        onToggleRequest={onToggleRequest}
        onToggleAll={onToggleAll}
      />,
    );

    const checkboxes = screen.getAllByTestId("payment-row-checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    await user.click(checkboxes[1]);
    expect(onToggleRequest).toHaveBeenCalledWith("req-2", true);

    await user.click(screen.getByTestId("payment-select-all-checkbox"));
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it("mantiene independientes las selecciones simultáneas de pago masivo y asignación", async () => {
    const user = userEvent.setup();
    const onToggleRequest = vi.fn();
    const onToggleAssignment = vi.fn();
    const request = makeRequest({
      giof_work: {
        pool: "PAYMENT",
        assigneeId: "giof-1",
        assigneeName: "Gestor Uno",
        assignmentVersion: "0",
        lease: null,
        canAssign: true,
        canAcquire: true,
        canEdit: false,
        readOnly: true,
      },
    });

    render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        selectedRequestIds={[]}
        onToggleRequest={onToggleRequest}
        onToggleAll={vi.fn()}
        currentUserId="giof-1"
        isGiofManager
        selectedAssignmentIds={[]}
        onToggleAssignment={onToggleAssignment}
        onToggleAllAssignments={vi.fn()}
      />,
    );

    const paymentSelection = screen.getByRole("checkbox", {
      name: "Seleccionar SOL-1 para pago masivo",
    });
    const assignmentSelection = screen.getByRole("checkbox", {
      name: "Seleccionar SOL-1 para asignar",
    });
    await user.click(paymentSelection);
    expect(onToggleRequest).toHaveBeenCalledWith("req-1", true);
    expect(onToggleAssignment).not.toHaveBeenCalled();
    expect(assignmentSelection).not.toBeChecked();

    onToggleRequest.mockClear();
    await user.click(assignmentSelection);
    expect(onToggleAssignment).toHaveBeenCalledWith("req-1", true);
    expect(onToggleRequest).not.toHaveBeenCalled();
    expect(paymentSelection).not.toBeChecked();
  });

  it("usa controles del sistema visual y separa los selectores compactos en ambos encabezados", async () => {
    const user = userEvent.setup();
    const onToggleAll = vi.fn();
    const onToggleAllAssignments = vi.fn();

    render(
      <PaymentQueueTable
        requests={[
          makeRequest({ id: "req-1", request_code: "SOL-1" }),
          makeRequest({ id: "req-2", request_code: "SOL-2" }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        selectedRequestIds={["req-1"]}
        onToggleRequest={vi.fn()}
        onToggleAll={onToggleAll}
        currentUserId="giof-1"
        isGiofManager
        selectedAssignmentIds={["req-2"]}
        onToggleAssignment={vi.fn()}
        onToggleAllAssignments={onToggleAllAssignments}
      />,
    );

    const paymentSelectAll = screen.getByRole("checkbox", {
      name: "Seleccionar solicitudes elegibles de esta página para pago masivo",
    });
    const assignmentSelectAll = screen.getByRole("checkbox", {
      name: "Seleccionar esta página",
    });
    const assignmentHeader = screen.getByText("Asignación").closest("th");
    const paymentHeader = screen.getByText("Pago masivo").closest("th");

    expect(paymentSelectAll).toHaveAttribute("data-slot", "checkbox");
    expect(assignmentSelectAll).toHaveAttribute("data-slot", "checkbox");
    expect(paymentSelectAll.tagName).toBe("BUTTON");
    expect(assignmentSelectAll.tagName).toBe("BUTTON");
    expect(paymentSelectAll).toHaveAttribute("aria-checked", "mixed");
    expect(assignmentSelectAll).toHaveAttribute("aria-checked", "mixed");
    expect(paymentHeader).toHaveClass("min-w-28");
    expect(assignmentHeader).toHaveClass("min-w-40");
    expect(paymentHeader?.firstElementChild).toHaveClass("flex-col", "gap-1.5");
    expect(assignmentHeader?.firstElementChild).toHaveClass("flex-col", "gap-1.5");
    expect(
      screen
        .getByRole("checkbox", { name: "Seleccionar SOL-1 para asignar" })
        .closest("td")?.firstElementChild,
    ).toHaveClass("min-w-36", "items-start", "gap-2");
    expect(within(paymentHeader!).getByText("Máximo 5 de esta página")).toBeInTheDocument();
    expect(within(assignmentHeader!).getByText("Seleccionar esta página")).toBeInTheDocument();
    for (const control of screen.getAllByRole("checkbox")) {
      expect(control).toHaveAttribute("data-slot", "checkbox");
    }
    expect(screen.queryByText("Seleccionar trabajos asignables visibles")).not.toBeInTheDocument();

    assignmentSelectAll.focus();
    await user.keyboard(" ");
    expect(onToggleAllAssignments).toHaveBeenCalledWith(true);
    expect(onToggleAll).not.toHaveBeenCalled();
  });

  it("muestra badges pendientes y acción para completar datos sin editar monto", () => {
    const onCompletePaymentDetails = vi.fn();
    const paidRequest = makeRequest({
      id: "paid-1",
      request_code: "SOL-PAID",
      status: REQUEST_STATUS.PAID,
      payment_id: "payment-1",
      payment_proof_pending: true,
      payment_details_pending: true,
    });

    render(
      <PaymentQueueTable
        requests={[paidRequest]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onCompletePaymentDetails={onCompletePaymentDetails}
        currentUserId="giof-1"
      />,
    );

    expect(screen.getByText("Falta constancia")).toBeInTheDocument();
    expect(screen.getByText("Falta referencia")).toBeInTheDocument();
    screen.getByRole("button", { name: "Completar pago" }).click();
    expect(onCompletePaymentDetails).toHaveBeenCalledWith(paidRequest);
  });

  it("expone Ver solicitud y Ver constancia en historial pagado cuando hay URL usable", () => {
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({
            id: "paid-1",
            request_code: "SOL-PAID",
            status: REQUEST_STATUS.PAID,
            payment_id: "payment-1",
            payment: {
              id: "payment-1",
              payment_request_id: "paid-1",
              paid_at: "2026-06-08T20:00:00.000Z",
              operation_reference: "OP-PAID",
              amount_paid: 100,
              bank_commission: null,
              notes: null,
              proof_document_id: "proof-doc-1",
              proofDocument: {
                id: "proof-doc-1",
                payment_request_id: "paid-1",
                document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
                safe_filename: "constancia.pdf",
                original_filename: "constancia.pdf",
                mime_type: "application/pdf",
                size_bytes: 10,
                storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.DRIVE,
                upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
                drive_web_url: "https://drive.example/proof-doc-1",
                created_at: "2026-06-08T20:00:00.000Z",
              },
              registered_by_id: "user-1",
              created_at: "2026-06-08T20:00:00.000Z",
              updated_at: "2026-06-08T20:00:00.000Z",
              proof_entries: [],
            },
          }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Ver solicitud" })).toHaveAttribute(
      "href",
      "/requests/paid-1",
    );
    expect(
      screen.getByRole("link", { name: "Ver constancia" }),
    ).toHaveAttribute("href", "https://drive.example/proof-doc-1");
  });

  it("mantiene Ver solicitud y oculta Ver constancia si el historial pagado no tiene URL usable", () => {
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({
            id: "paid-1",
            request_code: "SOL-PAID",
            status: REQUEST_STATUS.PAID,
            payment_id: "payment-1",
            payment: {
              id: "payment-1",
              payment_request_id: "paid-1",
              paid_at: "2026-06-08T20:00:00.000Z",
              operation_reference: "OP-PAID",
              amount_paid: 100,
              bank_commission: null,
              notes: null,
              proof_document_id: "proof-doc-1",
              proofDocument: null,
              registered_by_id: "user-1",
              created_at: "2026-06-08T20:00:00.000Z",
              updated_at: "2026-06-08T20:00:00.000Z",
              proof_entries: [],
            },
          }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Ver solicitud" })).toHaveAttribute(
      "href",
      "/requests/paid-1",
    );
    expect(
      screen.queryByRole("link", { name: "Ver constancia" }),
    ).not.toBeInTheDocument();
  });

  it("mantiene visibilidad de lectura en historial pagado sin exponer acciones restringidas", () => {
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({
            id: "paid-readonly",
            request_code: "SOL-READONLY",
            status: REQUEST_STATUS.PAID,
            payment_id: "payment-readonly",
            allocation_count: 1,
            allocations: [
              makeAllocation({ payment_request_id: "paid-readonly" }),
            ],
            payment: {
              id: "payment-readonly",
              payment_request_id: "paid-readonly",
              paid_at: "2026-06-08T20:00:00.000Z",
              operation_reference: "OP-READONLY",
              amount_paid: 100,
              bank_commission: null,
              notes: null,
              proof_document_id: "proof-readonly",
              proofDocument: {
                id: "proof-readonly",
                payment_request_id: "paid-readonly",
                document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
                safe_filename: "constancia-readonly.pdf",
                original_filename: "constancia-readonly.pdf",
                mime_type: "application/pdf",
                size_bytes: 10,
                storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.DRIVE,
                upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
                drive_web_url: "https://drive.example/proof-readonly",
                created_at: "2026-06-08T20:00:00.000Z",
              },
              registered_by_id: "user-1",
              created_at: "2026-06-08T20:00:00.000Z",
              updated_at: "2026-06-08T20:00:00.000Z",
              proof_entries: [],
            },
          }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Ver solicitud" })).toHaveAttribute(
      "href",
      "/requests/paid-readonly",
    );
    expect(
      screen.getByRole("link", { name: "Ver constancia" }),
    ).toHaveAttribute("href", "https://drive.example/proof-readonly");
    expect(
      screen.queryByRole("button", { name: "Registrar pago" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Completar pago" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Agregar constancia de pago" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["PENDING", "REXAN: pendiente"],
    ["RETRYING", "REXAN: procesando"],
    ["FAILED", "REXAN: requiere atención"],
    ["CREATED", "REXAN: activada"],
  ] as const)(
    "muestra estado durable %s después de refrescar",
    (status, label) => {
      render(
        <PaymentQueueTable
          requests={[
            makeRequest({
              status: REQUEST_STATUS.PAID,
              rexan_activation: { job_id: "job-1", status },
            }),
          ]}
          isLoading={false}
          onRegisterPayment={vi.fn()}
        />,
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Registrar pago" }),
      ).not.toBeInTheDocument();
    },
  );

  it("expone retry de REXAN solo cuando el contenedor autoriza la acción", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      status: REQUEST_STATUS.PAID,
      rexan_activation: { job_id: "job-1", status: "FAILED" },
    });
    const retry = vi.fn();
    const { rerender } = render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Reintentar REXAN" }),
    ).not.toBeInTheDocument();

    rerender(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onRetryRexanActivation={retry}
        isGiofManager
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reintentar REXAN" }));
    expect(retry).toHaveBeenCalledWith(request);
  });

  it("muestra el importe completo sin edición y lo incluye al registrar pago", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      id: "rexan-excess",
      request_code: "REXAN-EXCESS",
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      requested_amount: 100,
      rexan_outcome: REXAN_OUTCOME.EXCESS,
      rexan_balance_amount: "25.55",
    });

    render(
      <RegisterPaymentModal
        request={request}
        open
        operationalContext={{
          pool: "PAYMENT",
          requestId: "rexan-excess",
          ownerId: "giof-1",
          token: "lease-token",
          assignmentVersion: "1",
          ttlSeconds: 60,
          heartbeatIntervalSeconds: 20,
          heartbeatAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("payment-amount-input")).not.toBeInTheDocument();
    expect(screen.getByText("Importe completo")).toBeInTheDocument();
    expect(screen.getByText(/No se admiten pagos parciales/)).toBeInTheDocument();

    await user.type(screen.getByTestId("payment-reference-input"), "OP-12345");
    expect(screen.queryByTestId("payment-source-account-select")).not.toBeInTheDocument();
    await user.upload(
      screen.getByTestId("payment-proof-input"),
      new File(["proof"], "constancia.pdf", { type: "application/pdf" }),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Registrar pago" }).at(-1)!,
    );

    await waitFor(() => {
      expect(mocks.registerPayment).toHaveBeenCalledWith(
        "rexan-excess",
        expect.objectContaining({
          operation_reference: "OP-12345",
          amount_paid: 25.55,
          proof: expect.any(File),
        }),
        expect.objectContaining({ token: "lease-token" }),
      );
    });
    expect(mocks.registerPayment.mock.calls[0][1]).not.toHaveProperty(
      "source_account_key",
    );
  });

  it("explica que la constancia inicial cubre todas las líneas POA", () => {
    const request = makeRequest({
      id: "multi-allocation",
      request_code: "SOL-MULTI",
      allocation_count: 2,
      allocations: [
        makeAllocation(),
        makeAllocation({
          id: "allocation-2",
          budget_planning_line_id: "line-2",
          amount: 40,
          sort_order: 2,
          planning_line: {
            ...makeAllocation().planning_line!,
            id: "line-2",
            line_code: "POA-002",
            resource_description: "Servicios logísticos",
          },
        }),
      ],
    });

    render(
      <RegisterPaymentModal
        request={request}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "La constancia que adjuntes en este pago cubrirá todas las líneas POA de la solicitud.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Se cubrirá con la constancia global"),
    ).toHaveLength(2);
    expect(
      screen.queryByText("Sin comprobante específico"),
    ).not.toBeInTheDocument();
  });

  it("muestra el desglose pendiente como vista previa del pago general", () => {
    const request = makeRequest({
      status: REQUEST_STATUS.APPROVED,
      allocation_count: 2,
      allocations: [
        makeAllocation(),
        makeAllocation({
          id: "allocation-2",
          budget_planning_line_id: "line-2",
          amount: 40,
          sort_order: 2,
          planning_line: {
            ...makeAllocation().planning_line!,
            id: "line-2",
            line_code: "POA-002",
            resource_description: "Servicios logísticos",
          },
        }),
      ],
    });

    render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Desglose de líneas POA incluidas en el pago"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La constancia que adjuntes en este pago cubrirá todas las líneas POA de la solicitud.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Se cubrirá con la constancia global"),
    ).toHaveLength(2);
    expect(
      screen.queryByText("Sin comprobante específico"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Líneas POA cubiertas por la constancia global"),
    ).not.toBeInTheDocument();
  });

  it("muestra desglose de asignaciones y cobertura de la constancia en la cola", () => {
    const request = makeRequest({
      status: REQUEST_STATUS.PAID,
      payment_id: "payment-1",
      allocation_count: 2,
      allocations: [
        makeAllocation(),
        makeAllocation({
          id: "allocation-2",
          budget_planning_line_id: "line-2",
          amount: 40,
          sort_order: 2,
          planning_line: {
            ...makeAllocation().planning_line!,
            id: "line-2",
            line_code: "POA-002",
            resource_description: "Servicios logísticos",
          },
        }),
      ],
      payment: {
        id: "payment-1",
        payment_request_id: "req-1",
        paid_at: "2026-06-08T20:00:00.000Z",
        operation_reference: "OP-GENERAL",
        amount_paid: 100,
        bank_commission: null,
        notes: null,
        proof_document_id: "proof-doc-1",
        proofDocument: null,
        registered_by_id: "user-1",
        created_at: "2026-06-08T20:00:00.000Z",
        updated_at: "2026-06-08T20:00:00.000Z",
        proof_entries: [
          {
            id: "proof-entry-1",
            request_payment_id: "payment-1",
            proof_document_id: "proof-doc-1",
            proof_document: {
              id: "proof-doc-1",
              payment_request_id: "req-1",
              document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
              safe_filename: "constancia.pdf",
              original_filename: "constancia.pdf",
              mime_type: "application/pdf",
              size_bytes: 10,
              storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.LOCAL,
              upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
              created_at: "2026-06-08T20:00:00.000Z",
            },
            operation_reference: "OP-LINEA-1",
            paid_at: "2026-06-08T20:00:00.000Z",
            amount_paid: 60,
            notes: null,
            allocations: [
              {
                id: "coverage-1",
                request_payment_proof_id: "proof-entry-1",
                request_allocation_id: "allocation-1",
                amount_covered: 60,
              },
            ],
            created_at: "2026-06-08T20:00:00.000Z",
            updated_at: "2026-06-08T20:00:00.000Z",
          },
        ],
      },
    });

    render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onAttachPaymentProof={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Líneas POA cubiertas por la constancia global"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La constancia que adjuntes en este pago cubrirá todas las líneas POA de la solicitud.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/POA-001/)).toBeInTheDocument();
    expect(screen.getAllByText(/Tesoro Público/)).toHaveLength(2);
    expect(screen.getAllByText("Cubierta por la constancia global")).toHaveLength(2);
    expect(screen.queryByText("Sin comprobante específico")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Agregar constancia de pago" }),
    ).not.toBeInTheDocument();
  });

  it("no muestra acción de agregar constancia por línea cuando la constancia global ya existe", () => {
    const allocations = [
      makeAllocation(),
      makeAllocation({
        id: "allocation-2",
        budget_planning_line_id: "line-2",
        amount: 40,
        sort_order: 2,
        planning_line: {
          ...makeAllocation().planning_line!,
          id: "line-2",
          line_code: "POA-002",
          resource_description: "Servicios logísticos",
        },
      }),
    ];
    const request = makeRequest({
      status: REQUEST_STATUS.PAID,
      payment_id: "payment-1",
      allocation_count: 2,
      allocations,
      payment: {
        id: "payment-1",
        payment_request_id: "req-1",
        paid_at: "2026-06-08T20:00:00.000Z",
        operation_reference: "OP-GENERAL",
        amount_paid: 100,
        bank_commission: null,
        notes: null,
        proof_document_id: "proof-doc-1",
        proofDocument: null,
        registered_by_id: "user-1",
        created_at: "2026-06-08T20:00:00.000Z",
        updated_at: "2026-06-08T20:00:00.000Z",
        proof_entries: [
          {
            id: "proof-entry-1",
            request_payment_id: "payment-1",
            proof_document_id: "proof-doc-1",
            proof_document: {
              id: "proof-doc-1",
              payment_request_id: "req-1",
              document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
              safe_filename: "constancia.pdf",
              original_filename: "constancia.pdf",
              mime_type: "application/pdf",
              size_bytes: 10,
              storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.LOCAL,
              upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
              created_at: "2026-06-08T20:00:00.000Z",
            },
            operation_reference: "OP-GENERAL",
            paid_at: "2026-06-08T20:00:00.000Z",
            amount_paid: 100,
            notes: null,
            allocations: allocations.map((allocation, index) => ({
              id: `coverage-${index + 1}`,
              request_payment_proof_id: "proof-entry-1",
              request_allocation_id: allocation.id!,
              amount_covered: allocation.amount,
            })),
            created_at: "2026-06-08T20:00:00.000Z",
            updated_at: "2026-06-08T20:00:00.000Z",
          },
        ],
      },
    });

    render(
      <PaymentQueueTable
        requests={[request]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onAttachPaymentProof={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Cubierta por la constancia global")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Agregar constancia de pago" }),
    ).not.toBeInTheDocument();
  });

  it("mantiene chrome fijo, un solo scroll interno, foco y error asociado en Registrar pago", async () => {
    const allocations = Array.from({ length: 12 }, (_, index) =>
      makeAllocation({
        id: `allocation-${index + 1}`,
        budget_planning_line_id: `line-${index + 1}`,
        sort_order: index,
      }),
    );
    render(
      <RegisterPaymentModal
        request={makeRequest({ allocations, allocation_count: allocations.length })}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Registrar pago" });
    const proofInput = screen.getByTestId("payment-proof-input");
    await waitFor(() => expect(document.activeElement).toBe(proofInput));
    expect(dialog.querySelectorAll(".overflow-y-auto")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Registrar pago" }).parentElement).toHaveClass("shrink-0");
    expect(screen.getAllByRole("button", { name: "Registrar pago" }).at(-1)?.parentElement).toHaveClass("shrink-0");

    fireEvent.change(proofInput, {
      target: {
        files: [new File(["invalid"], "constancia.txt", { type: "text/plain" })],
      },
    });
    await waitFor(() =>
      expect(proofInput).toHaveAttribute("aria-describedby", "payment-proof-error"),
    );
    expect(document.getElementById("payment-proof-error")).toHaveTextContent(/formato/i);
  });

  it("mantiene abierto el modal de registro mientras se carga la constancia", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mocks.registerPaymentLoading.mockReturnValue(true);

    render(
      <RegisterPaymentModal
        request={makeRequest()}
        open
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No cierres esta ventana mientras se carga el archivo"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

});
