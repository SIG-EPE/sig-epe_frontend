import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BeneficiaryFields } from "@/components/requests/beneficiary-fields";
import { Form } from "@/components/ui/form";
import { getRequestSaveSuccessToast, getRequestSubmitFailureToast, getRequestSubmitSavingToast, getRequestSubmitSuccessToast, getScheduledRenditionMinDate, normalizeRequestAmountInput, REQUEST_BUDGET_CEILING_BLOCK_MESSAGE, RequestForm, requestFormSchema, toCreateRequestDto, toUpdateRequestDto, type RequestFormValues } from "@/components/requests/request-form";
import { BANK_OPTIONS, REQUEST_EDIT_STEP } from "@/lib/requests";
import { ACCOUNT_TYPE, BANK_CODE, BENEFICIARY_DOCUMENT_TYPE, REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_SCOPE_TYPE, REQUEST_STATUS, REQUEST_TYPE, type BeneficiaryDocumentType, type PaymentRequest, type RequestAllocation, type RequestBudgetPreview, type RequestDocument, type SettlementContextResponse } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  push: vi.fn(),
  refetchDocuments: vi.fn(),
  requestDocuments: [] as RequestDocument[],
  structuredReportReady: true,
  submitRequest: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateRequest: vi.fn(),
  budgetPreview: null as RequestBudgetPreview | null,
  useRequestPlanningLines: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useBudgetPreview: () => ({ canPreview: Boolean(mocks.budgetPreview), data: mocks.budgetPreview, error: null, isLoading: false, refetch: vi.fn() }),
  useCreateRequest: () => ({ createRequest: mocks.createRequest, isLoading: false }),
  useRequestPlanningLines: mocks.useRequestPlanningLines,
  useRequestDocuments: () => ({ documents: mocks.requestDocuments, error: null, isLoading: false, refetch: mocks.refetchDocuments }),
  useRequestReceiptReviews: () => ({ receipts: [], error: null, isLoading: false, isRefreshing: false, refetch: vi.fn(), upsertReceipt: vi.fn() }),
  useSubmitRequest: () => ({ submitRequest: mocks.submitRequest, isLoading: false }),
  useUpdateRequest: () => ({ updateRequest: mocks.updateRequest, isLoading: false }),
}));

vi.mock("@/components/requests/planning-line-selector", () => ({
  PlanningLineSelector: (props: { lines?: unknown[] }) => <div data-testid="planning-line-selector" data-lines-count={props.lines?.length ?? 0} />,
}));

vi.mock("@/components/requests/budget-preview-card", () => ({
  BudgetPreviewCard: () => <div data-testid="budget-preview-card" />,
}));

vi.mock("@/components/requests/request-documents-card", () => ({
  RequestDocumentsCard: (props: { documents?: RequestDocument[]; structuredReportLocked?: boolean; readOnly?: boolean; hideOptionalUploader?: boolean; onDocumentsChanged?: () => Promise<void> | void }) => (
    <div
      data-testid="request-documents-card"
      data-documents-count={props.documents?.length ?? 0}
      data-structured-report-locked={props.structuredReportLocked ? "true" : "false"}
      data-read-only={props.readOnly ? "true" : "false"}
      data-hide-optional-uploader={props.hideOptionalUploader ? "true" : "false"}
    >
      {props.onDocumentsChanged ? <button type="button" onClick={() => void props.onDocumentsChanged?.()}>Simular cambio de documentos</button> : null}
    </div>
  ),
}));

vi.mock("@/components/requests/structured-rendition-report-card", () => ({
  StructuredRenditionReportCard: (props: { refreshSignal?: number; onReadinessChange?: (ready: boolean, messages: string[]) => void; onLockChange?: (locked: boolean) => void }) => {
    useEffect(() => {
      props.onReadinessChange?.(mocks.structuredReportReady, mocks.structuredReportReady ? [] : ["Informe pendiente de generación: genera el Excel validado antes de enviar a revisión."]);
      props.onLockChange?.(mocks.structuredReportReady);
    }, []);
    return <div data-testid="structured-rendition-report-card" data-refresh-signal={props.refreshSignal ?? 0}>Informe de rendición estructurado</div>;
  },
}));

Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: vi.fn(() => false),
});

function makeValues(overrides: Partial<RequestFormValues> = {}): RequestFormValues {
  return {
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    budget_planning_line_id: "line-1",
    requested_amount: 250.5,
    allocations: [{ client_key: "allocation-1", budget_planning_line_id: "line-1", amount: 250.5 }],
    concept: "Rendición del anticipo pagado",
    scheduled_rendition_at: getScheduledRenditionMinDate(),
    beneficiary_name: "Ana Solicitante",
    beneficiary_document_type: BENEFICIARY_DOCUMENT_TYPE.DNI,
    beneficiary_document_number: "12345678",
    bank_code: BANK_CODE.BCP,
    bank_name: "Banco de Crédito del Perú",
    bank_account: "1234567890",
    bank_cci: "12345678901234567890",
    account_type: ACCOUNT_TYPE.SAVINGS,
    supplier_ruc: "",
    supplier_name: "",
    ...overrides,
  };
}

function makePaymentRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "request-1",
    request_code: "SOL-001",
    sequential_number: "1",
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    status: REQUEST_STATUS.DRAFT,
    fiscal_year: 2026,
    requested_amount: 250.5,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Rendición del anticipo pagado",
    requester_id: "user-1",
    budget_planning_line_id: "line-1",
    budgetPlanningLine: null,
    budget_month: null,
    organizational_unit_id: null,
    organizationalUnit: null,
    scheduled_rendition_at: null,
    related_request_id: null,
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: "Ana Solicitante",
    beneficiary_document_type: BENEFICIARY_DOCUMENT_TYPE.DNI,
    beneficiary_document_number: "12345678",
    bank_code: BANK_CODE.BCP,
    bank_name: "Banco de Crédito del Perú",
    account_type: ACCOUNT_TYPE.SAVINGS,
    bank_account: "1234567890",
    bank_cci: null,
    submitted_at: null,
    observed_at: null,
    approved_at: null,
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-05-27T00:00:00.000Z",
    updated_at: "2026-05-27T00:00:00.000Z",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<RequestDocument> = {}): RequestDocument {
  return {
    id: "doc-1",
    payment_request_id: "request-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT,
    safe_filename: "sustento.pdf",
    original_filename: "Sustento.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    sha256_hash: "hash",
    storage_provider: "DRIVE",
    upload_status: "PERMANENT",
    uploaded_by_id: "user-1",
    created_at: "2026-05-27T00:00:00.000Z",
    ...overrides,
  };
}

function makeBudgetPreview(overrides: Partial<RequestBudgetPreview> = {}): RequestBudgetPreview {
  return {
    planning_line: {
      id: "line-1",
      line_code: "POA-001",
      resource_description: "Materiales operativos",
      planning_type: "POA",
      type_resource: "Bienes",
      unit_price: 100,
      quantity: 3,
      total_cost: 300,
      status: "APPROVED",
      fiscal_year: { id: "fy-2026", year: 2026, status: "OPEN" },
      org_unit: { id: "ou-1", code: "UO-01", name: "Unidad de Operaciones" },
      category: { id: "cat-1", code: "CAT", name: "Categoría operativa" },
      program: { id: "prog-1", code: "PROG", name: "Programa institucional" },
      action: { id: "act-1", name: "Acción de control" },
      territory: null,
      monthly_summary: [],
    },
    month: null,
    amount: 100,
    org_unit: { id: "ou-1", code: "UO-01", name: "Unidad de Operaciones" },
    org_unit_ceiling: 80,
    current_consumed_amount: 0,
    submitted_pending_amount: 0,
    remaining_ceiling: 80,
    willExceedOrgUnitCeiling: false,
    orgUnitBlockingErrors: [],
    planned_line_month_amount: null,
    planned_line_month_executed_amount: null,
    line_consumed_amount: 0,
    line_planned_remaining: null,
    lineWarning: false,
    lineWarningMessage: null,
    warnings: [],
    ...overrides,
  };
}

function makeSettlementAllocation(overrides: Partial<RequestAllocation> = {}): RequestAllocation {
  return {
    id: "alloc-1",
    payment_request_id: "advance-1",
    budget_planning_line_id: "line-1",
    amount: 500,
    currency: REQUEST_CURRENCY.PEN,
    budget_month: 1,
    fiscal_year: 2026,
    org_unit_id: "ou-1",
    sort_order: 1,
    budgetPlanningLine: null,
    planning_line: {
      id: "line-1",
      line_code: "POA-001",
      resource_description: "Taller regional",
      planning_type: "POA",
      type_resource: "Bienes",
      unit_price: 100,
      quantity: 5,
      total_cost: 500,
      status: "APPROVED",
      fiscal_year: { id: "fy-2026", year: 2026, status: "OPEN" },
      org_unit: { id: "ou-1", code: "UO-01", name: "Unidad de Operaciones" },
      category: null,
      program: null,
      action: null,
      territory: null,
      monthly_summary: [],
    },
    org_unit: { id: "ou-1", code: "UO-01", name: "Unidad de Operaciones" },
    documents: [],
    payment_execution: null,
    ...overrides,
  };
}

function makeSettlementContext(overrides: Partial<SettlementContextResponse> = {}): SettlementContextResponse {
  return {
    settlement: {
      id: "request-1",
      request_code: "REXAN-1",
      sequential_number: "1",
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.DRAFT,
      requested_amount: 250.5,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición del anticipo pagado",
      related_request_id: "advance-1",
    },
    original_advance: {
      id: "advance-1",
      request_code: "ANT-2026-001",
      sequential_number: "10",
      requested_amount: 1000,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Anticipo para taller regional",
      requester_id: "user-1",
      beneficiary_name: "Ana Solicitante",
      budget_planning_line_id: "line-1",
      scheduled_rendition_at: "2026-06-30",
      paid_at: "2026-06-01T10:00:00.000Z",
      disbursed_at: null,
      amount_disbursed: 1000,
      budgetPlanningLine: {
        id: "line-1",
        line_code: "POA-001",
        resource_description: "Taller regional",
        fiscalYear: { id: "fy-2026", year: 2026, status: "OPEN" },
        organizationalUnit: { id: "ou-1", code: "UO-01", name: "Unidad de Operaciones" },
      },
      organizationalUnit: null,
    },
    original_advance_documents: [{
      ...makeDocument({
      id: "original-doc-1",
      payment_request_id: "advance-1",
      document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
      original_filename: "POA original.xlsx",
      safe_filename: "poa-original.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      read_only: true,
    }],
    payment: {
      id: "payment-1",
      paid_at: "2026-06-01T10:00:00.000Z",
      amount_paid: 1000,
      proof_document_id: null,
      proof_pending: false,
      details_pending: false,
      operation_reference: "OP-001",
      proof_document: null,
    },
    due_date: {
      scheduled_rendition_at: "2026-06-30",
      due_date: "2026-06-30",
      days_until_due: 10,
      is_overdue: false,
    },
    rexan: {
      outcome: null,
      spent_amount: null,
      balance_amount: null,
      balance_locked_at: null,
      return_proof_document_id: null,
      classified_by_id: null,
    },
    settlement_documents: [],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.createRequest.mockReset();
  mocks.push.mockReset();
  mocks.refetchDocuments.mockReset();
  mocks.requestDocuments = [];
  mocks.structuredReportReady = true;
  mocks.submitRequest.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.updateRequest.mockReset();
  mocks.budgetPreview = null;
  mocks.useRequestPlanningLines.mockReturnValue({ lines: [], total: 0, isLoading: false, isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn() });
});

function BeneficiaryFieldsErrorHarness() {
  const form = useForm<RequestFormValues>({
    defaultValues: makeValues({
      bank_code: BANK_CODE.BBVA,
      bank_account: "",
      bank_cci: "",
      account_type: "",
    }),
  });

  useEffect(() => {
    form.setError("bank_code", { type: "manual", message: "Selecciona el banco del beneficiario." });
    form.setError("account_type", { type: "manual", message: "Selecciona el tipo de cuenta bancaria." });
    form.setError("bank_account", { type: "manual", message: "Ingresa una cuenta bancaria de 6 a 30 dígitos." });
    form.setError("bank_cci", { type: "manual", message: "Ingresa el CCI de 20 dígitos." });
  }, [form]);

  return (
    <Form {...form}>
      <BeneficiaryFields control={form.control} user={null} setValue={form.setValue} watch={form.watch} />
    </Form>
  );
}

function BeneficiaryFieldsOtherBankHarness() {
  const form = useForm<RequestFormValues>({
    defaultValues: makeValues({
      bank_code: BANK_CODE.OTROS_BANCOS,
      bank_name: "",
      bank_account: "1234567890",
      bank_cci: "",
    }),
  });

  return (
    <Form {...form}>
      <BeneficiaryFields control={form.control} user={null} setValue={form.setValue} watch={form.watch} />
    </Form>
  );
}

interface BeneficiaryFieldsDocumentErrorHarnessProps {
  documentType: BeneficiaryDocumentType;
  documentNumber: string;
  message: string;
}

function BeneficiaryFieldsDocumentErrorHarness({ documentType, documentNumber, message }: BeneficiaryFieldsDocumentErrorHarnessProps) {
  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: makeValues({
      beneficiary_document_type: documentType,
      beneficiary_document_number: documentNumber,
    }),
  });

  useEffect(() => {
    form.setError("beneficiary_document_number", { type: "manual", message });
  }, [form, message]);

  return (
    <Form {...form}>
      <BeneficiaryFields control={form.control} user={null} setValue={form.setValue} watch={form.watch} />
    </Form>
  );
}

describe("RequestForm payload helpers", () => {
  it("usa copy contextual para guardado y envío de borradores versus correcciones", () => {
    const draftRequest = makePaymentRequest({ status: REQUEST_STATUS.DRAFT });
    const observedRequest = makePaymentRequest({ status: REQUEST_STATUS.OBSERVED });

    expect(getRequestSaveSuccessToast(draftRequest)).toBe("Borrador guardado: SOL-001");
    expect(getRequestSaveSuccessToast(observedRequest)).toBe("Corrección guardada: SOL-001");
    expect(getRequestSubmitSavingToast(REQUEST_STATUS.DRAFT)).toBe("Borrador guardado. Enviando solicitud...");
    expect(getRequestSubmitSavingToast(REQUEST_STATUS.OBSERVED)).toBe("Corrección guardada. Enviando corrección...");
    expect(getRequestSubmitSuccessToast(REQUEST_STATUS.DRAFT)).toBe("Solicitud enviada a revisión");
    expect(getRequestSubmitSuccessToast(REQUEST_STATUS.OBSERVED)).toBe("Corrección enviada a revisión");
    expect(getRequestSubmitFailureToast("Error", REQUEST_STATUS.DRAFT)).toBe("El borrador fue guardado, pero el envío falló: Error");
    expect(getRequestSubmitFailureToast("Error", REQUEST_STATUS.OBSERVED)).toBe("La corrección fue guardada, pero el envío falló: Error");
  });

  it("rechaza fechas límite de rendición anteriores a hoy", () => {
    const [year, month, day] = getScheduledRenditionMinDate().split("-").map(Number);
    const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);

    const result = requestFormSchema.safeParse(makeValues({
      request_type: REQUEST_TYPE.ADVANCE,
      scheduled_rendition_at: yesterday,
    }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["scheduled_rendition_at"], message: "La fecha límite de rendición no puede ser anterior a hoy" }),
      ]));
    }
  });

  it("acepta la fecha límite de rendición de hoy", () => {
    expect(requestFormSchema.safeParse(makeValues({
      request_type: REQUEST_TYPE.ADVANCE,
      scheduled_rendition_at: getScheduledRenditionMinDate(),
    })).success).toBe(true);
  });

  it("normaliza ceros iniciales en el monto sin romper decimales o vacío", () => {
    expect(normalizeRequestAmountInput("0123")).toBe("123");
    expect(normalizeRequestAmountInput("01.50")).toBe("1.5");
    expect(normalizeRequestAmountInput("")).toBe("");
  });

  it("normaliza visualmente el monto al salir del campo", async () => {
    const user = userEvent.setup();

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE })} mode="edit" />);
    const amountInput = screen.getByTestId("request-amount-input");

    await user.clear(amountInput);
    expect(amountInput).toHaveValue(null);

    await user.type(amountInput, "01.50");
    await user.tab();

    expect(amountInput).toHaveValue(1.5);
  });

  it("permite agregar y quitar bloques de línea POA", async () => {
    const user = userEvent.setup();

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE })} mode="edit" />);

    expect(screen.getAllByTestId("request-allocation-block")).toHaveLength(1);

    await user.click(screen.getByTestId("request-add-allocation-button"));

    expect(screen.getAllByTestId("request-allocation-block")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Quitar bloque" })[0]);

    expect(screen.getAllByTestId("request-allocation-block")).toHaveLength(1);
  });

  it("comparte una sola búsqueda POA precargada entre todos los selectores de asignación", async () => {
    const user = userEvent.setup();
    mocks.useRequestPlanningLines.mockReturnValue({ lines: [{ id: "line-1" }], total: 1, isLoading: false, isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn() });

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE })} mode="edit" />);

    await user.click(screen.getByTestId("request-add-allocation-button"));
    await user.click(screen.getByTestId("request-add-allocation-button"));

    expect(screen.getAllByTestId("request-allocation-block")).toHaveLength(3);
    expect(screen.getAllByTestId("planning-line-selector").map((selector) => selector.getAttribute("data-lines-count"))).toEqual(["1", "1", "1"]);
  });

  it("limita el concepto a 120 caracteres y muestra contador visible", () => {
    render(<RequestForm />);
    const conceptInput = screen.getByTestId("request-concept-input");

    expect(conceptInput).toHaveAttribute("maxLength", "120");
    expect(screen.getByTestId("request-concept-counter")).toHaveTextContent("0/120");

    fireEvent.change(conceptInput, { target: { value: "Justificación operativa" } });

    expect(screen.getByTestId("request-concept-counter")).toHaveTextContent("23/120");
  });

  it("valida que el concepto no supere 120 caracteres", () => {
    const validConcept = "a".repeat(120);
    const invalidConcept = "a".repeat(121);

    expect(requestFormSchema.safeParse(makeValues({ concept: validConcept })).success).toBe(true);

    const result = requestFormSchema.safeParse(makeValues({ concept: invalidConcept }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["concept"], message: "El concepto o justificación debe tener máximo 120 caracteres." }),
      ]));
    }
  });

  it("muestra ayuda de fecha límite para rendición de anticipos", () => {
    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE })} mode="edit" />);

    expect(screen.getByText("Fecha límite para presentar la rendición una vez pagado el anticipo.")).toBeInTheDocument();
  });

  it("preserva ADVANCE_SETTLEMENT en creación cuando el backend inicia una REXAN", () => {
    const dto = toCreateRequestDto(makeValues());

    expect(dto).toMatchObject({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      budget_planning_line_id: "line-1",
      requested_amount: 250.5,
      allocations: [{ client_key: "allocation-1", budget_planning_line_id: "line-1", amount: 250.5 }],
      currency: REQUEST_CURRENCY.PEN,
    });
    expect(dto).not.toHaveProperty("budget_month");
  });

  it("no envía request_type ni la convierte a ADVANCE al editar una REXAN existente", () => {
    const dto = toUpdateRequestDto(
      makeValues({ request_type: REQUEST_TYPE.ADVANCE, scheduled_rendition_at: "2026-06-15" }),
      REQUEST_TYPE.ADVANCE_SETTLEMENT,
    );

    expect(dto).toEqual({});
  });

  it("mantiene la fecha límite solo para edición de anticipos", () => {
    const dto = toUpdateRequestDto(
      makeValues({ request_type: REQUEST_TYPE.ADVANCE, scheduled_rendition_at: "2026-06-15" }),
      REQUEST_TYPE.ADVANCE,
    );

    expect(dto).not.toHaveProperty("request_type");
    expect(dto.scheduled_rendition_at).toBe("2026-06-15");
  });

  it("omite el CCI para BCP y lo conserva para otros bancos", () => {
    expect(toCreateRequestDto(makeValues({ bank_code: BANK_CODE.BCP }))).not.toHaveProperty("bank_cci");
    expect(toCreateRequestDto(makeValues({ bank_code: BANK_CODE.BCP, bank_name: "Banco personalizado" }))).not.toHaveProperty("bank_name");
    expect(toUpdateRequestDto(makeValues({ bank_code: BANK_CODE.BCP }))).not.toHaveProperty("bank_cci");
    expect(toCreateRequestDto(makeValues({ bank_code: "", bank_cci: "stale-invalid-cci" }))).not.toHaveProperty("bank_cci");
    expect(toUpdateRequestDto(makeValues({ bank_code: "", bank_cci: "stale-invalid-cci" }))).not.toHaveProperty("bank_cci");

    expect(toCreateRequestDto(makeValues({
      bank_code: BANK_CODE.BBVA,
      bank_name: "BBVA Perú",
      bank_cci: "12345678901234567890",
    })).bank_cci).toBe("12345678901234567890");
    expect(toUpdateRequestDto(makeValues({
      request_type: REQUEST_TYPE.REIMBURSEMENT,
      bank_code: BANK_CODE.PICHINCHA,
      bank_name: "Banco Pichincha",
      bank_cci: "12345678901234567890",
    })).bank_cci).toBe("12345678901234567890");
  });

  it("mapea varias líneas POA al arreglo allocations y deriva el monto total", () => {
    const values = makeValues({
      request_type: REQUEST_TYPE.ADVANCE,
      allocations: [
        { client_key: "allocation-1", budget_planning_line_id: "line-1", amount: 100.25 },
        { client_key: "allocation-2", budget_planning_line_id: "line-2", amount: 200.75 },
      ],
    });

    expect(toCreateRequestDto(values)).toMatchObject({
      budget_planning_line_id: "line-1",
      requested_amount: 301,
      allocations: [
        { client_key: "allocation-1", budget_planning_line_id: "line-1", amount: 100.25 },
        { client_key: "allocation-2", budget_planning_line_id: "line-2", amount: 200.75 },
      ],
    });
    expect(toUpdateRequestDto(values)).toMatchObject({
      budget_planning_line_id: "line-1",
      requested_amount: 301,
      allocations: [
        { client_key: "allocation-1", budget_planning_line_id: "line-1", amount: 100.25 },
        { client_key: "allocation-2", budget_planning_line_id: "line-2", amount: 200.75 },
      ],
    });
  });

  it("rechaza líneas POA duplicadas en el formulario", () => {
    const result = requestFormSchema.safeParse(makeValues({
      allocations: [
        { client_key: "allocation-1", budget_planning_line_id: "line-1", amount: 100 },
        { client_key: "allocation-2", budget_planning_line_id: "line-1", amount: 50 },
      ],
    }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: "Esta línea POA ya fue agregada; edite el monto del bloque existente." }),
      ]));
    }
  });

  it("envía nombre personalizado y CCI para Otros Bancos", () => {
    const values = makeValues({
      request_type: REQUEST_TYPE.REIMBURSEMENT,
      bank_code: BANK_CODE.OTROS_BANCOS,
      bank_name: "Caja Rural Regional",
      bank_cci: "12345678901234567890",
    });

    expect(BANK_OPTIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: BANK_CODE.OTROS_BANCOS, label: "Otros Bancos" }),
    ]));
    expect(toCreateRequestDto(values)).toMatchObject({
      bank_code: BANK_CODE.OTROS_BANCOS,
      bank_name: "Caja Rural Regional",
      bank_cci: "12345678901234567890",
    });
    expect(toUpdateRequestDto(values)).toMatchObject({
      bank_code: BANK_CODE.OTROS_BANCOS,
      bank_name: "Caja Rural Regional",
      bank_cci: "12345678901234567890",
    });
  });

  it("ignora CCI oculto inválido para BCP o sin banco en la validación del formulario", () => {
    expect(requestFormSchema.safeParse(makeValues({
      bank_code: BANK_CODE.BCP,
      bank_cci: "stale-invalid-cci",
    })).success).toBe(true);

    expect(requestFormSchema.safeParse(makeValues({
      bank_code: "",
      bank_cci: "stale-invalid-cci",
    })).success).toBe(true);
  });

  it("requiere CCI válido en el formulario para bancos distintos a BCP", () => {
    const invalidResult = requestFormSchema.safeParse(makeValues({
      bank_code: BANK_CODE.BBVA,
      bank_cci: "123",
    }));
    const missingResult = requestFormSchema.safeParse(makeValues({
      bank_code: BANK_CODE.BBVA,
      bank_cci: "",
    }));

    expect(invalidResult.success).toBe(false);
    expect(missingResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["bank_cci"], message: "El CCI debe tener exactamente 20 dígitos" }),
      ]));
    }
    if (!missingResult.success) {
      expect(missingResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["bank_cci"], message: "Ingresa el CCI de 20 dígitos." }),
      ]));
    }
  });

  it("muestra estado visual de error en banco, tipo de cuenta, cuenta y CCI", async () => {
    render(<BeneficiaryFieldsErrorHarness />);

    expect(screen.getAllByText("Selecciona el banco del beneficiario.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Selecciona el tipo de cuenta bancaria.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ingresa una cuenta bancaria de 6 a 30 dígitos.").length).toBeGreaterThan(0);
    expect(screen.getByText("Ingresa el CCI de 20 dígitos.")).toBeInTheDocument();

    expect(screen.getByTestId("request-bank-select")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-bank-select")).toHaveClass("aria-invalid:border-destructive");
    expect(screen.getByTestId("request-account-type-select")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-account-type-select")).toHaveClass("aria-invalid:border-destructive");
    expect(screen.getByTestId("request-bank-account-input")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-bank-account-input")).toHaveClass("aria-invalid:border-destructive");
    expect(screen.getByTestId("request-bank-cci-input")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-bank-cci-input")).toHaveClass("aria-invalid:border-destructive");
  });

  it("bloquea Datos -> Documentos y marca en rojo los campos bancarios requeridos", async () => {
    const user = userEvent.setup();
    const invalidRequest = makePaymentRequest({
      request_type: REQUEST_TYPE.ADVANCE,
      account_type: null,
      bank_account: null,
      bank_code: null,
      bank_name: null,
    });

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={invalidRequest} mode="edit" />);
    await user.click(screen.getByTestId("request-save-draft-button"));

    expect(mocks.updateRequest).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Completa los datos obligatorios antes de continuar a documentos.");

    expect(screen.getAllByText("Selecciona el banco del beneficiario.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Selecciona el tipo de cuenta bancaria.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ingresa una cuenta bancaria de 6 a 30 dígitos.").length).toBeGreaterThan(0);
    expect(screen.getByTestId("request-bank-select")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-account-type-select")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-bank-account-input")).toHaveAttribute("aria-invalid", "true");
  });

  it("requiere nombre de banco y CCI válido para Otros Bancos", () => {
    const missingResult = requestFormSchema.safeParse(makeValues({
      bank_code: BANK_CODE.OTROS_BANCOS,
      bank_name: "",
      bank_cci: "",
    }));
    const longNameResult = requestFormSchema.safeParse(makeValues({
      bank_code: BANK_CODE.OTROS_BANCOS,
      bank_name: "a".repeat(101),
      bank_cci: "12345678901234567890",
    }));
    const validResult = requestFormSchema.safeParse(makeValues({
      bank_code: BANK_CODE.OTROS_BANCOS,
      bank_name: "Caja Rural Regional",
      bank_cci: "12345678901234567890",
    }));

    expect(missingResult.success).toBe(false);
    expect(longNameResult.success).toBe(false);
    expect(validResult.success).toBe(true);
    if (!missingResult.success) {
      expect(missingResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["bank_name"], message: "Ingresa el nombre del banco." }),
        expect.objectContaining({ path: ["bank_cci"], message: "Ingresa el CCI de 20 dígitos." }),
      ]));
    }
    if (!longNameResult.success) {
      expect(longNameResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["bank_name"], message: "El nombre del banco debe tener máximo 100 caracteres." }),
      ]));
    }
  });

  it("muestra campo de nombre de banco y CCI para Otros Bancos", () => {
    render(<BeneficiaryFieldsOtherBankHarness />);

    expect(screen.getByText("Nombre del banco *")).toBeInTheDocument();
    expect(screen.getByTestId("request-bank-name-input")).toHaveAttribute("maxLength", "100");
    expect(screen.getByTestId("request-bank-cci-input")).toBeInTheDocument();
    expect(screen.getByText("Requerido cuando seleccionas Otros Bancos. Máximo 100 caracteres.")).toBeInTheDocument();
  });

  it("limpia el error manual obsoleto de RUC cuando se corrige a 11 dígitos", async () => {
    const user = userEvent.setup();
    render(
      <BeneficiaryFieldsDocumentErrorHarness
        documentType={BENEFICIARY_DOCUMENT_TYPE.RUC}
        documentNumber="2036653262"
        message="El RUC debe tener 11 dígitos"
      />,
    );

    expect(await screen.findByText("El RUC debe tener 11 dígitos")).toBeInTheDocument();

    const documentInput = screen.getByTestId("request-beneficiary-document-number-input");
    await user.clear(documentInput);
    await user.type(documentInput, "20366532626");

    await waitFor(() => expect(screen.queryByText("El RUC debe tener 11 dígitos")).not.toBeInTheDocument());
    expect(documentInput).toHaveValue("20366532626");
  });

  it("limpia el error manual obsoleto de DNI cuando se corrige a 8 dígitos", async () => {
    const user = userEvent.setup();
    render(
      <BeneficiaryFieldsDocumentErrorHarness
        documentType={BENEFICIARY_DOCUMENT_TYPE.DNI}
        documentNumber="1234567"
        message="El DNI debe tener 8 dígitos"
      />,
    );

    expect(await screen.findByText("El DNI debe tener 8 dígitos")).toBeInTheDocument();

    const documentInput = screen.getByTestId("request-beneficiary-document-number-input");
    await user.clear(documentInput);
    await user.type(documentInput, "12345678");

    await waitFor(() => expect(screen.queryByText("El DNI debe tener 8 dígitos")).not.toBeInTheDocument());
    expect(documentInput).toHaveValue("12345678");
  });

  it("al cambiar tipo de documento limpia error de longitud obsoleto y aplica nuevo máximo", async () => {
    const user = userEvent.setup();
    render(
      <BeneficiaryFieldsDocumentErrorHarness
        documentType={BENEFICIARY_DOCUMENT_TYPE.RUC}
        documentNumber="2036653262"
        message="El RUC debe tener 11 dígitos"
      />,
    );

    expect(await screen.findByText("El RUC debe tener 11 dígitos")).toBeInTheDocument();

    const documentTypeSelect = screen.getByTestId("request-beneficiary-document-type-select");
    documentTypeSelect.focus();
    fireEvent.keyDown(documentTypeSelect, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "DNI" }), { key: "Enter" });

    const documentInput = screen.getByTestId("request-beneficiary-document-number-input");
    await waitFor(() => expect(screen.queryByText("El RUC debe tener 11 dígitos")).not.toBeInTheDocument());
    expect(documentInput).toHaveAttribute("maxLength", "8");
    expect(documentInput).toHaveValue("20366532");
  });

  it("bloquea Datos -> Documentos cuando el monto supera el techo presupuestal", async () => {
    const user = userEvent.setup();
    mocks.budgetPreview = makeBudgetPreview({
      willExceedOrgUnitCeiling: true,
      orgUnitBlockingErrors: ["Techo presupuestal excedido"],
    });
    const request = makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE });

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={request} mode="edit" />);
    await user.click(screen.getByTestId("request-save-draft-button"));

    expect(mocks.updateRequest).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(REQUEST_BUDGET_CEILING_BLOCK_MESSAGE);
    expect(screen.getByText("No se puede continuar a documentos")).toBeInTheDocument();
    expect(screen.getByText(REQUEST_BUDGET_CEILING_BLOCK_MESSAGE)).toBeInTheDocument();
  });

  it("vuelve desde Documentos a Datos con Corregir datos y muestra errores en los campos", async () => {
    const user = userEvent.setup();
    const invalidRequest = makePaymentRequest({
      request_type: REQUEST_TYPE.ADVANCE,
      account_type: null,
      bank_account: null,
      bank_code: BANK_CODE.BBVA,
      bank_name: "BBVA Perú",
      bank_cci: "",
    });
    const { rerender } = render(<RequestForm activeStep={REQUEST_EDIT_STEP.DOCUMENTS} initialRequest={invalidRequest} mode="edit" />);

    await user.click(screen.getByRole("button", { name: "Corregir datos" }));

    expect(mocks.push).toHaveBeenCalledWith("/requests/request-1/edit?step=data");
    expect(mocks.toastError).toHaveBeenCalledWith("Completa los datos obligatorios antes de pasar a revisión.");

    rerender(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={invalidRequest} mode="edit" />);

    expect(screen.getAllByText("Selecciona el tipo de cuenta bancaria.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ingresa una cuenta bancaria de 6 a 30 dígitos.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ingresa el CCI de 20 dígitos.").length).toBeGreaterThan(0);
    expect(screen.getByTestId("request-account-type-select")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-bank-account-input")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("request-bank-cci-input")).toHaveAttribute("aria-invalid", "true");
  });

  it("usa los documentos adjuntos como fuente única para no mostrar PxQ faltante", () => {
    mocks.requestDocuments = [makeDocument({
      document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
      original_filename: "POA_ALL_CONTROL INTERNO.xlsx",
      safe_filename: "poa_all_control_interno.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })];
    const advanceRequest = makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE });

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DOCUMENTS} initialRequest={advanceRequest} mode="edit" />);

    expect(screen.getByTestId("request-documents-card")).toHaveAttribute("data-documents-count", "1");
    expect(screen.queryByText("Falta adjuntar Excel PxQ.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar a revisión" })).toBeEnabled();
  });

  it("muestra resumen completo y CTA claro al revisar un borrador", () => {
    mocks.requestDocuments = [makeDocument({
      document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
      original_filename: "POA.xlsx",
      safe_filename: "poa.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })];
    const draftRequest = makePaymentRequest({
      request_type: REQUEST_TYPE.ADVANCE,
      concept: "Compra de materiales para actividad institucional",
      scheduled_rendition_at: "2026-06-15",
      budget_month: 6,
      budgetPlanningLine: {
        id: "line-1",
        line_code: "POA-001",
        resource_description: "Materiales operativos",
        planning_type: "POA",
        type_resource: "Bienes",
        unit_price: 100,
        quantity: 3,
        total_cost: 300,
        fiscalYear: { id: "fy-2026", year: 2026, status: "OPEN" },
        organizationalUnit: { id: "ou-1", code: "UO-01", name: "Unidad de Operaciones" },
        budgetCategory: { id: "cat-1", code: "CAT", name: "Categoría operativa" },
        territory: { id: "ter-1", name: "Territorio Norte" },
        program: { id: "prog-1", code: "PROG", name: "Programa institucional" },
        operativeAction: { id: "act-1", name: "Acción de control" },
      },
    });

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.REVIEW} initialRequest={draftRequest} mode="edit" />);

    expect(screen.getByText("Resumen para revisión")).toBeInTheDocument();
    expect(screen.getByText("Datos de la solicitud")).toBeInTheDocument();
    expect(screen.getByText("Planificación y POA")).toBeInTheDocument();
    expect(screen.getByText("Beneficiario y pago")).toBeInTheDocument();
    expect(screen.getByText("POA-001 — Materiales operativos")).toBeInTheDocument();
    expect(screen.getByText("Compra de materiales para actividad institucional")).toBeInTheDocument();
    expect(screen.getByTestId("request-documents-card")).toHaveAttribute("data-documents-count", "1");
    expect(screen.getByTestId("request-documents-card")).toHaveAttribute("data-read-only", "true");
    expect(screen.getByTestId("request-documents-card")).toHaveAttribute("data-hide-optional-uploader", "true");
    expect(screen.getByRole("button", { name: "Enviar a revisión" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reenviar solicitud" })).not.toBeInTheDocument();
  });

  it("usa CTA de corrección para solicitudes observadas", () => {
    mocks.requestDocuments = [makeDocument({
      document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
      original_filename: "POA.xlsx",
      safe_filename: "poa.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })];
    const observedRequest = makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE, status: REQUEST_STATUS.OBSERVED });

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.REVIEW} initialRequest={observedRequest} mode="edit" />);

    expect(screen.getByRole("button", { name: "Enviar corrección" })).toBeEnabled();
  });

  it("muestra toast de corrección guardada al guardar una solicitud observada sin enviarla", async () => {
    const user = userEvent.setup();
    const observedRequest = makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE, status: REQUEST_STATUS.OBSERVED });
    mocks.updateRequest.mockResolvedValue(observedRequest);

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={observedRequest} mode="edit" />);
    await user.click(screen.getByTestId("request-save-draft-button"));

    await waitFor(() => expect(mocks.updateRequest).toHaveBeenCalledWith("request-1", expect.any(Object)));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Corrección guardada: SOL-001");
    expect(mocks.push).toHaveBeenCalledWith("/requests/request-1/edit?step=documents");
  });

  it("muestra feedback de corrección enviada al enviar una solicitud observada", async () => {
    const user = userEvent.setup();
    mocks.requestDocuments = [makeDocument({
      document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
      original_filename: "POA.xlsx",
      safe_filename: "poa.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })];
    const observedRequest = makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE, status: REQUEST_STATUS.OBSERVED });
    const submittedRequest = makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE, status: REQUEST_STATUS.SUBMITTED });
    mocks.updateRequest.mockResolvedValue(observedRequest);
    mocks.submitRequest.mockResolvedValue(submittedRequest);

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.REVIEW} initialRequest={observedRequest} mode="edit" />);
    await user.click(screen.getByRole("button", { name: "Enviar corrección" }));

    await waitFor(() => expect(mocks.submitRequest).toHaveBeenCalledWith("request-1"));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Corrección guardada. Enviando corrección...");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Corrección enviada a revisión");
    expect(mocks.push).toHaveBeenCalledWith("/requests/request-1");
  });

  it("muestra stepper y contexto original diferenciados para REXAN", () => {
    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest()} mode="edit" settlementContext={makeSettlementContext()} />);

    expect(screen.getAllByText("Datos del anticipo").length).toBeGreaterThan(0);
    expect(screen.getByText("Sustentos de rendición")).toBeInTheDocument();
    expect(screen.getByText("Revisión de rendición")).toBeInTheDocument();
    expect(screen.getByText("Resumen del anticipo original")).toBeInTheDocument();
    expect(screen.getByText("ANT-2026-001")).toBeInTheDocument();
    expect(screen.getByText("Anticipo para taller regional")).toBeInTheDocument();
    expect(screen.getByText("Líneas del anticipo original")).toBeInTheDocument();
    expect(screen.getByText(/El anticipo puede incluir una o más líneas POA/i)).toBeInTheDocument();
    expect(screen.getByText("Cantidad de líneas POA")).toBeInTheDocument();
    expect(screen.queryByText("Beneficiario")).not.toBeInTheDocument();
    expect(screen.queryByText("Unidad organizacional")).not.toBeInTheDocument();
    expect(screen.getByText("Documentos del anticipo original")).toBeInTheDocument();
    expect(screen.getByText("POA original.xlsx")).toBeInTheDocument();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adjuntar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Eliminar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Datos del anticipo" })).toBeInTheDocument();
    expect(screen.getByText(/no se editan desde este formulario/i)).toBeInTheDocument();
    expect(screen.queryByTestId("request-amount-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("planning-line-selector")).not.toBeInTheDocument();
    expect(screen.queryByTestId("budget-preview-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("request-use-my-data-button")).not.toBeInTheDocument();
    expect(screen.queryByText("Nombre del beneficiario *")).not.toBeInTheDocument();
    expect(screen.queryByText("Número de documento *")).not.toBeInTheDocument();
    expect(screen.queryByText("Banco *")).not.toBeInTheDocument();
    expect(screen.queryByTestId("request-bank-account-input")).not.toBeInTheDocument();
  });

  it("agrupa documentos del anticipo original por línea POA cuando tienen alcance", () => {
    const allocationOne = makeSettlementAllocation({ id: "alloc-1" });
    const allocationTwo = makeSettlementAllocation({
      id: "alloc-2",
      budget_planning_line_id: "line-2",
      amount: 300,
      sort_order: 2,
      planning_line: {
        ...makeSettlementAllocation().planning_line!,
        id: "line-2",
        line_code: "POA-002",
        resource_description: "Pasajes regionales",
      },
    });
    const context = makeSettlementContext({
      original_advance: {
        ...makeSettlementContext().original_advance,
        allocations: [allocationOne, allocationTwo],
      },
      original_advance_documents: [
        {
          ...makeDocument({
            id: "pxq-1",
            payment_request_id: "advance-1",
            document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
            original_filename: "POA equipos.xlsx",
            safe_filename: "poa-equipos.xlsx",
            mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
            request_allocation_id: "alloc-1",
          }),
          read_only: true,
        },
        {
          ...makeDocument({
            id: "pxq-2",
            payment_request_id: "advance-1",
            document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
            original_filename: "POA pasajes.xlsx",
            safe_filename: "poa-pasajes.xlsx",
            mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
            request_allocation_id: "alloc-2",
          }),
          read_only: true,
        },
        {
          ...makeDocument({ id: "general-doc", payment_request_id: "advance-1", original_filename: "Sustento general.pdf" }),
          read_only: true,
        },
      ],
    });

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest()} mode="edit" settlementContext={context} />);

    const groups = screen.getAllByTestId("original-advance-allocation-documents");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("POA-001");
    expect(groups[0]).toHaveTextContent("POA equipos.xlsx");
    expect(groups[1]).toHaveTextContent("POA-002");
    expect(groups[1]).toHaveTextContent("POA pasajes.xlsx");
    expect(screen.getByTestId("original-advance-general-documents")).toHaveTextContent("Sustento general.pdf");
  });

  it("mantiene campos editables normales en borradores no REXAN", () => {
    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest({ request_type: REQUEST_TYPE.ADVANCE })} mode="edit" />);

    expect(screen.getByText("Datos")).toBeInTheDocument();
    expect(screen.getByText("Documentos")).toBeInTheDocument();
    expect(screen.getByText("Revisión/Envío")).toBeInTheDocument();
    expect(screen.queryByText("Datos del anticipo")).not.toBeInTheDocument();
    expect(screen.getByTestId("request-amount-input")).toBeInTheDocument();
    expect(screen.getByTestId("planning-line-selector")).toBeInTheDocument();
    expect(screen.getByTestId("budget-preview-card")).toBeInTheDocument();
    expect(screen.getByTestId("request-use-my-data-button")).toBeInTheDocument();
    expect(screen.getByText("Nombre del beneficiario *")).toBeInTheDocument();
    expect(screen.getByText("Banco *")).toBeInTheDocument();
  });

  it("continúa a documentos en REXAN sin enviar campos heredados al update", async () => {
    const user = userEvent.setup();
    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DATA} initialRequest={makePaymentRequest({ beneficiary_name: null, bank_code: null, bank_account: null })} mode="edit" settlementContext={makeSettlementContext()} />);

    await user.click(screen.getByTestId("request-save-draft-button"));

    expect(mocks.updateRequest).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/requests/request-1/edit?step=documents");
  });

  it("mantiene la etapa de documentos REXAN editable para adjuntar sustentos", () => {
    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DOCUMENTS} initialRequest={makePaymentRequest()} mode="edit" settlementContext={makeSettlementContext()} />);

    expect(screen.getByText("Resumen del anticipo original")).toBeInTheDocument();
    expect(screen.getByTestId("request-documents-card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar a revisión" })).toBeEnabled();
  });

  it("emite una señal de refresco del informe estructurado cuando cambian documentos REXAN", async () => {
    const user = userEvent.setup();
    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DOCUMENTS} initialRequest={makePaymentRequest()} mode="edit" settlementContext={makeSettlementContext()} />);

    expect(screen.getByTestId("structured-rendition-report-card")).toHaveAttribute("data-refresh-signal", "0");

    await user.click(screen.getByRole("button", { name: "Simular cambio de documentos" }));

    await waitFor(() => expect(screen.getByTestId("structured-rendition-report-card")).toHaveAttribute("data-refresh-signal", "1"));
    expect(mocks.refetchDocuments).toHaveBeenCalled();
  });

  it("bloquea continuar a revisión REXAN hasta que el informe esté generado", async () => {
    mocks.structuredReportReady = false;
    const user = userEvent.setup();

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DOCUMENTS} initialRequest={makePaymentRequest()} mode="edit" settlementContext={makeSettlementContext()} />);

    expect(await screen.findByRole("button", { name: "Ir a generar informe" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Ir a generar informe" }));

    expect(mocks.push).not.toHaveBeenCalledWith("/requests/request-1/edit?step=review");
    expect(mocks.toastError).toHaveBeenCalledWith("Informe pendiente de generación: genera el Excel validado antes de enviar a revisión.");
    expect(screen.getByText("Informe pendiente de generación: genera el Excel validado antes de enviar a revisión.")).toBeInTheDocument();
  });

  it("permite continuar a revisión REXAN cuando el informe ya fue generado", async () => {
    mocks.structuredReportReady = true;
    const user = userEvent.setup();

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.DOCUMENTS} initialRequest={makePaymentRequest()} mode="edit" settlementContext={makeSettlementContext()} />);

    await user.click(screen.getByRole("button", { name: "Continuar a revisión" }));

    expect(mocks.push).toHaveBeenCalledWith("/requests/request-1/edit?step=review");
  });

  it("incluye contexto original en revisión REXAN sin mezclar documentos propios", () => {
    mocks.requestDocuments = [
      makeDocument({ id: "settlement-report", document_category: REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT, original_filename: "Informe REXAN.xlsx", safe_filename: "informe-rexan.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      makeDocument({ id: "receipt", document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT, original_filename: "Comprobante.pdf", safe_filename: "comprobante.pdf", mime_type: "application/pdf" }),
    ];

    render(<RequestForm activeStep={REQUEST_EDIT_STEP.REVIEW} initialRequest={makePaymentRequest()} mode="edit" settlementContext={makeSettlementContext()} />);

    expect(screen.getByText("Resumen del anticipo original")).toBeInTheDocument();
    expect(screen.queryByText("Documentos del anticipo original")).not.toBeInTheDocument();
    expect(screen.getByText("Rendición en preparación")).toBeInTheDocument();
    expect(screen.getByTestId("request-documents-card")).toHaveAttribute("data-documents-count", "2");
  });
});
