import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BeneficiaryFields } from "@/components/requests/beneficiary-fields";
import { Form } from "@/components/ui/form";
import { getScheduledRenditionMinDate, RequestForm, requestFormSchema, toCreateRequestDto, toUpdateRequestDto, type RequestFormValues } from "@/components/requests/request-form";
import { REQUEST_EDIT_STEP } from "@/lib/requests";
import { ACCOUNT_TYPE, BANK_CODE, BENEFICIARY_DOCUMENT_TYPE, REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestDocument } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  push: vi.fn(),
  refetchDocuments: vi.fn(),
  requestDocuments: [] as RequestDocument[],
  submitRequest: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateRequest: vi.fn(),
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
  useBudgetPreview: () => ({ canPreview: false, data: null, error: null, isLoading: false, refetch: vi.fn() }),
  useCreateRequest: () => ({ createRequest: mocks.createRequest, isLoading: false }),
  useRequestDocuments: () => ({ documents: mocks.requestDocuments, error: null, isLoading: false, refetch: mocks.refetchDocuments }),
  useSubmitRequest: () => ({ submitRequest: mocks.submitRequest, isLoading: false }),
  useUpdateRequest: () => ({ updateRequest: mocks.updateRequest, isLoading: false }),
}));

vi.mock("@/components/requests/planning-line-selector", () => ({
  PlanningLineSelector: () => <div data-testid="planning-line-selector" />,
}));

vi.mock("@/components/requests/budget-preview-card", () => ({
  BudgetPreviewCard: () => <div data-testid="budget-preview-card" />,
}));

vi.mock("@/components/requests/request-documents-card", () => ({
  RequestDocumentsCard: (props: { documents?: RequestDocument[] }) => (
    <div data-testid="request-documents-card" data-documents-count={props.documents?.length ?? 0} />
  ),
}));

function makeValues(overrides: Partial<RequestFormValues> = {}): RequestFormValues {
  return {
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    budget_planning_line_id: "line-1",
    requested_amount: 250.5,
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

beforeEach(() => {
  mocks.createRequest.mockReset();
  mocks.push.mockReset();
  mocks.refetchDocuments.mockReset();
  mocks.requestDocuments = [];
  mocks.submitRequest.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.updateRequest.mockReset();
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

describe("RequestForm payload helpers", () => {
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

  it("preserva ADVANCE_SETTLEMENT en creación cuando el backend inicia una REXAN", () => {
    const dto = toCreateRequestDto(makeValues());

    expect(dto).toMatchObject({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      budget_planning_line_id: "line-1",
      requested_amount: 250.5,
      currency: REQUEST_CURRENCY.PEN,
    });
    expect(dto).not.toHaveProperty("budget_month");
  });

  it("no envía request_type ni la convierte a ADVANCE al editar una REXAN existente", () => {
    const dto = toUpdateRequestDto(
      makeValues({ request_type: REQUEST_TYPE.ADVANCE, scheduled_rendition_at: "2026-06-15" }),
      REQUEST_TYPE.ADVANCE_SETTLEMENT,
    );

    expect(dto).not.toHaveProperty("request_type");
    expect(dto).not.toHaveProperty("scheduled_rendition_at");
    expect(dto).toMatchObject({
      budget_planning_line_id: "line-1",
      requested_amount: 250.5,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición del anticipo pagado",
    });
    expect(dto).not.toHaveProperty("budget_month");
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
    expect(toUpdateRequestDto(makeValues({ bank_code: BANK_CODE.BCP }))).not.toHaveProperty("bank_cci");
    expect(toCreateRequestDto(makeValues({ bank_code: "", bank_cci: "stale-invalid-cci" }))).not.toHaveProperty("bank_cci");
    expect(toUpdateRequestDto(makeValues({ bank_code: "", bank_cci: "stale-invalid-cci" }))).not.toHaveProperty("bank_cci");

    expect(toCreateRequestDto(makeValues({
      bank_code: BANK_CODE.BBVA,
      bank_name: "BBVA Perú",
      bank_cci: "12345678901234567890",
    })).bank_cci).toBe("12345678901234567890");
    expect(toUpdateRequestDto(makeValues({
      bank_code: BANK_CODE.PICHINCHA,
      bank_name: "Banco Pichincha",
      bank_cci: "12345678901234567890",
    })).bank_cci).toBe("12345678901234567890");
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

  it("vuelve desde Documentos a Datos con Corregir datos y muestra errores en los campos", async () => {
    const user = userEvent.setup();
    const invalidRequest = makePaymentRequest({
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
});
