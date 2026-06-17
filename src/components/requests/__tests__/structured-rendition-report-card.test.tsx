import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredRenditionReportCard } from "@/components/requests/structured-rendition-report-card";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_SCOPE_TYPE,
  LINE_RETURN_VALIDATION_STATUS,
  REQUEST_RECEIPT_DUPLICATE_STATUS,
  REQUEST_RECEIPT_OCR_STATUS,
  REQUEST_RENDITION_REPORT_STATUS,
  REQUEST_RENDITION_ROW_REVIEW_STATUS,
  REQUEST_RENDITION_ROW_TYPE,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
  type RequestAllocation,
  type RequestDocument,
  type RequestReceiptReview,
  type RequestRenditionReport,
  type RequestRenditionRow,
} from "@/types/requests";

const mocks = vi.hoisted(() => ({
  addReceiptRow: vi.fn(),
  createManualRow: vi.fn(),
  deleteLineReturn: vi.fn(),
  deleteRow: vi.fn(),
  documents: [] as RequestDocument[],
  generateReport: vi.fn(),
  receipts: [] as RequestReceiptReview[],
  refetchDocuments: vi.fn(),
  refetchReceipts: vi.fn(),
  refetchReport: vi.fn(),
  report: null as RequestRenditionReport | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  updateRow: vi.fn(),
  uploadDocument: vi.fn(),
  upsertLineReturn: vi.fn(),
  validateReport: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequestDocuments: () => ({ documents: mocks.documents, error: null, isLoading: false, isRefreshing: false, refetch: mocks.refetchDocuments }),
  useRequestReceiptReviews: () => ({ receipts: mocks.receipts, error: null, isLoading: false, isRefreshing: false, refetch: mocks.refetchReceipts }),
  useRequestRenditionReport: () => ({ report: mocks.report, error: null, isLoading: false, isRefreshing: false, refetch: mocks.refetchReport, upsertReportRow: vi.fn() }),
  useRequestRenditionReportActions: () => ({
    addReceiptRow: mocks.addReceiptRow,
    createManualRow: mocks.createManualRow,
    deleteLineReturn: mocks.deleteLineReturn,
    deleteRow: mocks.deleteRow,
    error: null,
    generateReport: mocks.generateReport,
    isLoading: false,
    updateRow: mocks.updateRow,
    upsertLineReturn: mocks.upsertLineReturn,
    validateReport: mocks.validateReport,
  }),
  useUploadRequestDocument: () => ({ uploadDocument: mocks.uploadDocument, isLoading: false, error: null }),
}));

function makeAllocation(overrides: Partial<RequestAllocation> = {}): RequestAllocation {
  return {
    id: "allocation-1",
    payment_request_id: "request-1",
    budget_planning_line_id: "line-1",
    amount: 300,
    currency: REQUEST_CURRENCY.PEN,
    budget_month: 6,
    fiscal_year: 2026,
    org_unit_id: "org-1",
    sort_order: 1,
    budgetPlanningLine: null,
    planning_line: {
      id: "line-1",
      line_code: "POA-001",
      resource_description: "Materiales de campo",
      total_cost: 300,
      status: "APPROVED",
      fiscal_year: { id: "fy-1", year: 2026, status: "OPEN" },
      org_unit: { id: "org-1", code: "UO", name: "Unidad" },
      category: { id: "cat-1", code: "CAT", name: "Categoría" },
      program: { id: "program-1", code: "PRG", name: "Programa" },
      action: { id: "action-1", name: "Acción" },
      territory: null,
      monthly_summary: [],
    },
    org_unit: { id: "org-1", code: "UO", name: "Unidad" },
    payment_execution: null,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "request-1",
    request_code: "SOL-001",
    sequential_number: "1",
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    status: REQUEST_STATUS.DRAFT,
    fiscal_year: 2026,
    requested_amount: 300,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Rendición de anticipo",
    requester_id: "user-1",
    budget_planning_line_id: null,
    budgetPlanningLine: null,
    budget_month: null,
    organizational_unit_id: null,
    organizationalUnit: null,
    scheduled_rendition_at: null,
    related_request_id: "advance-1",
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: null,
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
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    allocations: [makeAllocation()],
    ...overrides,
  };
}

function makeTwoAllocationRequest(): PaymentRequest {
  return makeRequest({
    requested_amount: 800,
    allocations: [
      makeAllocation({ id: "allocation-1", budget_planning_line_id: "line-1", amount: 300, sort_order: 1 }),
      makeAllocation({
        id: "allocation-2",
        budget_planning_line_id: "line-2",
        amount: 500,
        sort_order: 2,
        planning_line: {
          ...makeAllocation().planning_line!,
          id: "line-2",
          line_code: "POA-002",
          resource_description: "Pasajes regionales",
        },
      }),
    ],
  });
}

function makeDocument(overrides: Partial<RequestDocument> = {}): RequestDocument {
  return {
    id: "document-1",
    payment_request_id: "request-1",
    request_allocation_id: "allocation-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    safe_filename: "comprobante.pdf",
    original_filename: "Comprobante.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024,
    storage_provider: "DRIVE",
    upload_status: "PERMANENT",
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRow(overrides: Partial<RequestRenditionRow> = {}): RequestRenditionRow {
  return {
    id: "row-1",
    report_id: "report-1",
    request_id: "request-1",
    request_allocation_id: "allocation-1",
    request_document_id: "document-1",
    request_receipt_id: "receipt-1",
    request_ocr_extraction_id: "ocr-1",
    row_type: REQUEST_RENDITION_ROW_TYPE.OCR_RECEIPT,
    purchase_date: "2026-06-02",
    provider_name: "Proveedor SAC",
    receipt_number: "F001-123",
    detail: "Compra de materiales",
    amount: 125.5,
    currency: REQUEST_CURRENCY.PEN,
    review_status: REQUEST_RENDITION_ROW_REVIEW_STATUS.SUBMIT_READY,
    source_snapshot: null,
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeReceiptReview(overrides: Partial<RequestReceiptReview> = {}): RequestReceiptReview {
  return {
    receipt: {
      id: "receipt-1",
      request_id: "request-1",
      request_allocation_id: null,
      document_id: "document-1",
      receipt_type: "INVOICE",
      issuer_document_type: "RUC",
      issuer_document_number: "20123456789",
      issuer_name: "Proveedor SAC",
      series: "F001",
      number: "123",
      issue_date: "2026-06-02",
      amount: 125.5,
      currency: REQUEST_CURRENCY.PEN,
      duplicate_status: REQUEST_RECEIPT_DUPLICATE_STATUS.UNIQUE,
      ocr_status: REQUEST_RECEIPT_OCR_STATUS.SUCCESS,
      corrected_fields: null,
      confirmed_by_id: null,
      confirmed_at: null,
    },
    latest_extraction: {
      id: "ocr-1",
      provider: "LOCAL",
      status: REQUEST_RECEIPT_OCR_STATUS.SUCCESS,
      confidence: 0.92,
      error_message: null,
      extracted_fields: null,
      created_at: "2026-06-02T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
    },
    duplicate_candidates: [],
    ...overrides,
  };
}

function makeReport(overrides: Partial<RequestRenditionReport> = {}): RequestRenditionReport {
  const rows = overrides.rows ?? [makeRow()];
  return {
    id: "report-1",
    request_id: "request-1",
    status: REQUEST_RENDITION_REPORT_STATUS.READY,
    total_amount: 125.5,
    currency: REQUEST_CURRENCY.PEN,
    settlement_report_document_id: null,
    drive_sync_status: "SYNC_PENDING",
    drive_sync_error: null,
    submitted_at: null,
    exported_at: null,
    rows,
    totals: {
      total_amount: 125.5,
      by_allocation: [{ request_allocation_id: "allocation-1", planned_amount: 300, row_total_amount: 125.5, row_count: 1, has_rows: true }],
      missing_allocations: [],
    },
    allocation_coverage: [{ request_allocation_id: "allocation-1", planned_amount: 300, row_total_amount: 125.5, row_count: 1, has_rows: true }],
    ...overrides,
  };
}

describe("StructuredRenditionReportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { value: vi.fn(), configurable: true });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
    mocks.documents = [makeDocument()];
    mocks.receipts = [];
    mocks.report = makeReport();
  });

  it("renderiza filas, totales y cobertura por línea POA", () => {
    mocks.report = makeReport({ rows: [makeRow({ purchase_date: "2026-06-01" })] });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Informe de rendición")).toBeInTheDocument();
    expect(screen.getByText("Proveedor SAC")).toBeInTheDocument();
    expect(screen.getByText("Compra de materiales")).toBeInTheDocument();
    expect(screen.getByText("Comprobante.pdf")).toBeInTheDocument();
    expect(screen.getByText("Con comprobante")).toBeInTheDocument();
    expect(screen.getByText(/1 jun/)).toBeInTheDocument();
    expect(screen.getAllByText(/125/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 fila/)).toBeInTheDocument();
  });

  it("renderiza metadatos de clasificación enviados por backend sin exponer IDs", () => {
    const rawAllocationId = "07815479-97ed-4392-b3a1-5e30f44ce858";
    mocks.report = makeReport({
      allocation_coverage: [{
        request_allocation_id: rawAllocationId,
        request_allocation_label: "Línea 1: POA-777 · Materiales",
        planned_amount: 300,
        row_total_amount: 125.5,
        row_count: 1,
        has_rows: true,
        classification_label: "Operativo",
        budget_category_label: "Bienes y servicios",
        area_label: "Área de Operaciones",
        org_unit_label: "Unidad Logística",
        cost_center_label: "CC-090 Operaciones",
        line_code: "POA-777",
        resource_description: "Materiales para taller",
        program_label: "Programa institucional",
        operative_action_label: "Acción formativa",
        importance_label: "Alta",
        frequency_label: "Mensual",
        budget_month: 6,
        fiscal_year: 2026,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest({ allocations: [] })} />);

    expect(screen.getByText("Clasificación presupuestal")).toBeInTheDocument();
    expect(screen.getByText("Operativo / Bienes y servicios")).toBeInTheDocument();
    expect(screen.getByText("Área de Operaciones / Unidad Logística")).toBeInTheDocument();
    expect(screen.getByText("CC-090 Operaciones")).toBeInTheDocument();
    expect(screen.getByText("POA-777 · Materiales para taller")).toBeInTheDocument();
    expect(screen.getByText("Programa institucional / Acción formativa")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(rawAllocationId))).not.toBeInTheDocument();
  });

  it("muestra el formulario manual solo en un modal y valida obligatorios", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.queryByLabelText("Fecha *")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Proveedor *")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Agregar comprobante adicional" }));
    expect(screen.getByRole("dialog", { name: "Agregar comprobante adicional" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar comprobante" }));

    expect(mocks.createManualRow).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Completa documento, línea POA, fecha, proveedor, detalle y monto.");
  });

  it("crea una fila manual desde el modal con línea POA y sustento", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT });
    mocks.createManualRow.mockResolvedValue(makeRow({ row_type: REQUEST_RENDITION_ROW_TYPE.MANUAL_EXTRA }));

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    await user.click(screen.getByRole("button", { name: "Agregar comprobante adicional" }));
    fireEvent.change(screen.getByLabelText("Fecha *"), { target: { value: "2026-06-05" } });
    fireEvent.change(screen.getByLabelText("Proveedor *"), { target: { value: "Proveedor adicional" } });
    fireEvent.change(screen.getByLabelText("Nro. comprobante"), { target: { value: "B001-777" } });
    fireEvent.change(screen.getByLabelText("Monto *"), { target: { value: "75.50" } });

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: /POA-001/ }));
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Comprobante.pdf" }));
    fireEvent.change(screen.getByLabelText("Detalle *"), { target: { value: "Movilidad adicional" } });
    await user.click(screen.getByRole("button", { name: "Guardar comprobante" }));

    await waitFor(() => {
      expect(mocks.createManualRow).toHaveBeenCalledWith("request-1", {
        request_document_id: "document-1",
        request_allocation_id: "allocation-1",
        purchase_date: "2026-06-05",
        provider_name: "Proveedor adicional",
        receipt_number: "B001-777",
        detail: "Movilidad adicional",
        amount: 75.5,
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Agregar comprobante adicional" })).not.toBeInTheDocument());
  }, 10_000);

  it("habilita el modal manual con dos líneas POA aunque aún falte adjuntar sustento", async () => {
    mocks.documents = [];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1", "allocation-2"] }, allocation_coverage: [] });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeTwoAllocationRequest()} />);

    const addManualButton = screen.getByRole("button", { name: "Agregar comprobante adicional" });
    expect(addManualButton).toBeEnabled();
    expect(screen.getByText(/primero adjunta el documento de sustento/i)).toBeInTheDocument();

    await user.click(addManualButton);

    expect(screen.getByRole("dialog", { name: "Agregar comprobante adicional" })).toBeInTheDocument();
    expect(screen.getByText(/adjunta primero el documento de sustento/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar comprobante" })).toBeDisabled();
  });

  it("renderiza dos líneas POA de cobertura y bloquea el comprobante en su línea asignada", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      rows: [],
      totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1", "allocation-2"] },
      allocation_coverage: [
        { request_allocation_id: "allocation-1", planned_amount: 300, row_total_amount: 0, row_count: 0, has_rows: false },
        { request_allocation_id: "allocation-2", planned_amount: 500, row_total_amount: 0, row_count: 0, has_rows: false },
      ],
    });
    mocks.receipts = [makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        confirmed_by_id: "user-1",
        confirmed_at: "2026-06-02T12:00:00.000Z",
      },
    })];

    render(<StructuredRenditionReportCard request={makeTwoAllocationRequest()} />);

    expect(screen.getAllByText(/POA-001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/POA-002/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText("Este comprobante pertenece a esta línea POA.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("muestra guía obligatoria para comprobantes OCR sin confirmar y no permite agregarlos", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview()];

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Comprobantes por revisar")).toBeInTheDocument();
    expect(screen.getByText("Hay 1 comprobante pendiente de revisión. Confirma sus datos o elimínalo si no corresponde antes de generar el informe.")).toBeInTheDocument();
    expect(screen.getByText(/confirma los datos detectados para usar estos comprobantes en el informe/i)).toBeInTheDocument();
    expect(screen.getByText("Pendiente de confirmación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar al informe" })).toBeDisabled();
    expect(mocks.addReceiptRow).not.toHaveBeenCalled();
  });

  it("usa advertencia al validar cuando hay pendientes y no muestra toast de éxito", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] });
    mocks.validateReport.mockResolvedValue({
      ready: false,
      report: mocks.report,
      totals: mocks.report.totals,
      allocation_coverage: mocks.report.allocation_coverage,
      blockers: [{ code: "ALLOCATION_WITHOUT_ROWS", message: "Cada línea POA debe tener al menos un comprobante registrado.", request_allocation_id: "allocation-1" }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    await user.click(screen.getByRole("button", { name: "Validar informe" }));

    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledWith("Hay pendientes del informe por resolver antes de continuar."));
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith("El informe tiene pendientes por resolver");
    expect(await screen.findByText(/Falta al menos un comprobante para Línea 1: POA-001.*Materiales de campo/)).toBeInTheDocument();
    expect(screen.queryByText(/allocation-1/)).not.toBeInTheDocument();
  });

  it("muestra etiquetas de negocio para cobertura pendiente sin exponer UUID", () => {
    const rawAllocationId = "07815479-97ed-4392-b3a1-5e30f44ce858";
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      rows: [],
      totals: { total_amount: 0, by_allocation: [], missing_allocations: [rawAllocationId] },
      allocation_coverage: [{ request_allocation_id: rawAllocationId, request_allocation_label: "Línea 2: AGT-POA-009 · Pasajes", planned_amount: 500, row_total_amount: 0, row_count: 0, has_rows: false }],
    });

    render(<StructuredRenditionReportCard request={makeRequest({ allocations: [] })} />);

    expect(screen.getByText("Falta al menos un comprobante para Línea 2: AGT-POA-009 · Pasajes.")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(rawAllocationId))).not.toBeInTheDocument();
  });

  it("refresca informe, documentos y comprobantes cuando cambia la señal externa", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: [] }, allocation_coverage: [] });

    const { rerender } = render(<StructuredRenditionReportCard request={makeRequest()} refreshSignal={0} />);
    rerender(<StructuredRenditionReportCard request={makeRequest()} refreshSignal={1} />);

    await waitFor(() => {
      expect(mocks.refetchReport).toHaveBeenCalled();
      expect(mocks.refetchDocuments).toHaveBeenCalled();
      expect(mocks.refetchReceipts).toHaveBeenCalled();
    });
  });

  it("mantiene un solo resumen de pendientes para comprobantes por revisar", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview()];

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Estado para enviar a revisión")).toBeInTheDocument();
    expect(screen.getByText("Comprobantes pendientes de revisión")).toBeInTheDocument();
    expect(screen.getAllByText("Hay 1 comprobante pendiente de revisión. Confirma sus datos o elimínalo si no corresponde antes de generar el informe.")).toHaveLength(1);
    expect(screen.getByText("Comprobantes por revisar")).toBeInTheDocument();
  });

  it("guía el foco al primer comprobante pendiente sin recargar la sección", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview()];

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    await user.click(screen.getByRole("button", { name: "Ir al primer pendiente" }));

    await waitFor(() => expect(document.activeElement).toHaveTextContent("Proveedor SAC"));
    expect(screen.getByText(/La página se mantiene en esta sección/i)).toBeInTheDocument();
    expect(screen.getByText("Comprobantes por revisar")).toBeInTheDocument();
  });

  it("muestra el bloqueo backend de comprobantes pendientes con conteo y mantiene generación deshabilitada", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: [] }, allocation_coverage: [] });
    mocks.validateReport.mockResolvedValue({
      ready: false,
      report: mocks.report,
      totals: mocks.report.totals,
      allocation_coverage: mocks.report.allocation_coverage,
      blockers: [{
        code: "UNCONFIRMED_RECEIPT_EVIDENCE",
        message: "Hay 2 comprobantes pendientes de revisión para Línea 1: POA-001. Confirma sus datos o elimínalos antes de generar el informe.",
        request_allocation_id: "allocation-1",
        request_allocation_label: "Línea 1: POA-001",
        pending_count: 2,
      }],
    });
    mocks.receipts = [
      makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, id: "receipt-1", document_id: "document-1" } }),
      makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, id: "receipt-2", document_id: "document-2" } }),
    ];
    mocks.documents = [
      makeDocument({ id: "document-1", original_filename: "Comprobante 1.pdf" }),
      makeDocument({ id: "document-2", original_filename: "Comprobante 2.pdf" }),
    ];

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    await user.click(screen.getByRole("button", { name: "Validar informe" }));

    expect(await screen.findByText("Hay 2 comprobantes pendientes de revisión para Línea 1: POA-001. Confirma sus datos o elimínalos antes de generar el informe.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
  });

  it("deshabilita generar informe mientras existen bloqueos de cobertura POA", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [{ request_allocation_id: "allocation-1", planned_amount: 300, row_total_amount: 0, row_count: 0, has_rows: false }] });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
  });

  it("muestra checklist único con responsables y CTA para generar", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByTestId("rendition-readiness-checklist")).toBeInTheDocument();
    expect(screen.getByText("Estado para enviar a revisión")).toBeInTheDocument();
    expect(screen.getByText("Validación sin bloqueos")).toBeInTheDocument();
    expect(screen.getByText("Informe pendiente de generación")).toBeInTheDocument();
    expect(screen.getByText("Solicitante")).toBeInTheDocument();
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByText("Siguiente paso: genera el informe final desde la validación actual.")).toBeInTheDocument();
  });

  it("muestra generar informe habilitado cuando no hay documento generado ni bloqueos", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.READY, settlement_report_document_id: null });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Informe pendiente de generación")).toBeInTheDocument();
    expect(screen.getByText("Documento generado pendiente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeEnabled();
  });

  it("distingue exceso rendido como advertencia de revisión GIOF sin bloquear generación", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 350,
        paid_base_amount: 300,
        rendered_amount: 350,
        expected_return_amount: 0,
        returned_amount: 0,
        excess_amount: 50,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.EXCESS,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getAllByText("Exceso rendido para revisión GIOF").length).toBeGreaterThan(0);
    expect(screen.getByText(/No requiere constancia de devolución/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeEnabled();
  });

  it("muestra saldo estimado sin pedir devolución durante la preparación inicial", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125.5,
        paid_base_amount: 300,
        rendered_amount: 125.5,
        expected_return_amount: 174.5,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.NOT_REQUIRED,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Saldo estimado")).toBeInTheDocument();
    expect(screen.getByText(/En esta preparación inicial no se solicita constancia de devolución/i)).toBeInTheDocument();
    expect(screen.queryByText("Devolución requerida")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Constancia de devolución \*/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeEnabled();
  });

  it("requiere constancia de devolución cuando la rendición fue observada", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.OBSERVED,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125.5,
        paid_base_amount: 300,
        rendered_amount: 125.5,
        expected_return_amount: 174.5,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    expect(screen.getAllByText("Devolución requerida").length).toBeGreaterThan(0);
    expect(screen.getByText(/Debes devolver/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar devolución" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Monto devuelto \*/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Constancia de devolución \*/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Justificación \*/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
  });

  it("abre el formulario dedicado para registrar devolución en una rendición observada", async () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.OBSERVED,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125.5,
        paid_base_amount: 300,
        rendered_amount: 125.5,
        expected_return_amount: 174.5,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING,
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

    expect(screen.getByLabelText(/Monto devuelto \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Constancia de devolución \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Justificación \*/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar devolución de línea" })).toBeInTheDocument();
  });

  it("mantiene visible la validación de una devolución ya registrada aunque la solicitud siga en draft", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125.5,
        paid_base_amount: 300,
        rendered_amount: 125.5,
        expected_return_amount: 174.5,
        returned_amount: 174.5,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: {
          id: "line-return-1",
          returned_amount: 174.5,
          justification: "Saldo no utilizado",
          return_proof_document_id: "",
          return_proof_filename: null,
          status: "DRAFT",
          validated_at: null,
        },
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Falta constancia")).toBeInTheDocument();
    expect(screen.getByText("Devolución registrada")).toBeInTheDocument();
    expect(screen.getByText("Constancia: pendiente de identificar")).toBeInTheDocument();
    expect(screen.getByText("Justificación: Saldo no utilizado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar devolución" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Constancia de devolución \*/i)).not.toBeInTheDocument();
  });

  it("abre edición para una devolución registrada en draft", async () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125.5,
        paid_base_amount: 300,
        rendered_amount: 125.5,
        expected_return_amount: 174.5,
        returned_amount: 174.5,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: {
          id: "line-return-1",
          returned_amount: 174.5,
          justification: "Saldo no utilizado",
          return_proof_document_id: "",
          return_proof_filename: null,
          status: "DRAFT",
          validated_at: null,
        },
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF,
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    await user.click(screen.getByRole("button", { name: "Editar devolución" }));

    expect(screen.getByLabelText(/Constancia de devolución \*/i)).toBeInTheDocument();
  });

  it("abre confirmación antes de generar y llama API solo al confirmar", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT });
    mocks.generateReport.mockResolvedValue({ report: makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED, settlement_report_document_id: "generated-document" }), document: makeDocument({ id: "generated-document" }) });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    await user.click(screen.getByRole("button", { name: "Generar informe" }));

    expect(mocks.generateReport).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Generar informe de rendición" })).toBeInTheDocument();
    expect(screen.getByText(/bloqueará los comprobantes, documentos y filas/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sí, generar informe" }));

    await waitFor(() => expect(mocks.generateReport).toHaveBeenCalledWith("request-1"));
  });

  it("permite agregar al informe solo comprobantes confirmados", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        confirmed_by_id: "user-1",
        confirmed_at: "2026-06-02T12:00:00.000Z",
      },
    })];
    mocks.addReceiptRow.mockResolvedValue(makeReport());

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Comprobantes revisados por agregar")).toBeInTheDocument();
    expect(screen.getByText(/Cada comprobante confirmado se agrega únicamente a su línea POA asignada/i)).toBeInTheDocument();
    expect(screen.queryByText("Comprobantes por revisar")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Agregar al informe" }));

    await waitFor(() => {
      expect(mocks.addReceiptRow).toHaveBeenCalledWith("request-1", "receipt-1", "allocation-1");
    });
  });

  it("selecciona todos los comprobantes agregables y los agrega secuencialmente", async () => {
    mocks.documents = [
      makeDocument({ id: "document-1", request_allocation_id: "allocation-1", original_filename: "Comprobante 1.pdf" }),
      makeDocument({ id: "document-2", request_allocation_id: "allocation-2", original_filename: "Comprobante 2.pdf" }),
      makeDocument({ id: "document-3", request_allocation_id: null, original_filename: "Comprobante sin línea.pdf" }),
    ];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1", "allocation-2"] }, allocation_coverage: [] });
    mocks.receipts = [
      makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, id: "receipt-1", document_id: "document-1", confirmed_by_id: "user-1", confirmed_at: "2026-06-02T12:00:00.000Z" } }),
      makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, id: "receipt-2", document_id: "document-2", confirmed_by_id: "user-1", confirmed_at: "2026-06-02T12:00:00.000Z" } }),
      makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, id: "receipt-3", document_id: "document-3", confirmed_by_id: "user-1", confirmed_at: "2026-06-02T12:00:00.000Z" } }),
    ];
    mocks.addReceiptRow
      .mockResolvedValueOnce(makeRow({ id: "row-1", request_receipt_id: "receipt-1", request_allocation_id: "allocation-1" }))
      .mockResolvedValueOnce(makeRow({ id: "row-2", request_receipt_id: "receipt-2", request_document_id: "document-2", request_allocation_id: "allocation-2" }));

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeTwoAllocationRequest()} />);

    await user.click(screen.getByLabelText(/Seleccionar todos/i));

    const receiptCheckboxes = screen.getAllByRole("checkbox");
    expect(receiptCheckboxes[1]).toBeChecked();
    expect(receiptCheckboxes[2]).toBeChecked();
    expect(receiptCheckboxes[3]).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Agregar seleccionados al informe" }));

    await waitFor(() => expect(mocks.addReceiptRow).toHaveBeenCalledTimes(2));
    expect(mocks.addReceiptRow.mock.calls).toEqual([
      ["request-1", "receipt-1", "allocation-1"],
      ["request-1", "receipt-2", "allocation-2"],
    ]);
    expect(await screen.findByText("2 de 2 comprobantes agregados")).toBeInTheDocument();
    expect(mocks.refetchReport).toHaveBeenCalledTimes(1);
  });

  it("mantiene resultados por comprobante cuando el agregado masivo tiene fallas parciales", async () => {
    mocks.documents = [
      makeDocument({ id: "document-1", request_allocation_id: "allocation-1", original_filename: "Comprobante 1.pdf" }),
      makeDocument({ id: "document-2", request_allocation_id: "allocation-2", original_filename: "Comprobante 2.pdf" }),
    ];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1", "allocation-2"] }, allocation_coverage: [] });
    mocks.receipts = [
      makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, id: "receipt-1", document_id: "document-1", confirmed_by_id: "user-1", confirmed_at: "2026-06-02T12:00:00.000Z" } }),
      makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, id: "receipt-2", document_id: "document-2", confirmed_by_id: "user-1", confirmed_at: "2026-06-02T12:00:00.000Z" } }),
    ];
    mocks.addReceiptRow
      .mockResolvedValueOnce(makeRow({ id: "row-1", request_receipt_id: "receipt-1", request_allocation_id: "allocation-1" }))
      .mockRejectedValueOnce(new Error("Backend temporalmente no disponible"));

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeTwoAllocationRequest()} />);

    await user.click(screen.getByLabelText(/Seleccionar todos/i));
    await user.click(screen.getByRole("button", { name: "Agregar seleccionados al informe" }));

    expect(await screen.findByText("1 de 2 comprobantes agregados · 1 con error")).toBeInTheDocument();
    expect(screen.getByText("Backend temporalmente no disponible")).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith("1 de 2 comprobantes no se pudieron agregar. Revisa los resultados y reintenta.");
    expect(mocks.refetchReport).toHaveBeenCalledTimes(1);
  });

  it("preselecciona la línea del comprobante confirmado y muestra la fila después de refrescar", async () => {
    mocks.documents = [makeDocument({ request_allocation_id: "allocation-2" })];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1", "allocation-2"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        confirmed_by_id: "user-1",
        confirmed_at: "2026-06-02T12:00:00.000Z",
      },
    })];
    mocks.addReceiptRow.mockImplementation(async () => {
      mocks.report = makeReport({
        status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
        rows: [makeRow({ request_allocation_id: "allocation-2" })],
        totals: {
          total_amount: 125.5,
          by_allocation: [{ request_allocation_id: "allocation-2", planned_amount: 500, row_total_amount: 125.5, row_count: 1, has_rows: true }],
          missing_allocations: ["allocation-1"],
        },
        allocation_coverage: [
          { request_allocation_id: "allocation-1", planned_amount: 300, row_total_amount: 0, row_count: 0, has_rows: false },
          { request_allocation_id: "allocation-2", planned_amount: 500, row_total_amount: 125.5, row_count: 1, has_rows: true },
        ],
      });
      mocks.receipts = [];
      return makeRow({ request_allocation_id: "allocation-2" });
    });

    function Harness() {
      const [refreshCount, setRefreshCount] = useState(0);
      return <StructuredRenditionReportCard request={makeTwoAllocationRequest()} onChanged={() => setRefreshCount((current) => current + 1)} key={refreshCount} />;
    }

    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Agregar al informe" }));

    await waitFor(() => {
      expect(mocks.addReceiptRow).toHaveBeenCalledWith("request-1", "receipt-1", "allocation-2");
    });
    expect(await screen.findByText("Proveedor SAC")).toBeInTheDocument();
    expect(screen.getByText("Compra de materiales")).toBeInTheDocument();
    expect(screen.getAllByText(/POA-002/).length).toBeGreaterThan(0);
  });

  it("preselecciona la línea guardada en el comprobante confirmado aunque el documento no la traiga", async () => {
    mocks.documents = [makeDocument({ request_allocation_id: null })];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-2"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        request_allocation_id: "allocation-2",
        confirmed_by_id: "user-1",
        confirmed_at: "2026-06-02T12:00:00.000Z",
      },
    })];
    mocks.addReceiptRow.mockResolvedValue(makeRow({ request_allocation_id: "allocation-2" }));

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeTwoAllocationRequest()} />);

    await user.click(screen.getByRole("button", { name: "Agregar al informe" }));

    await waitFor(() => {
      expect(mocks.addReceiptRow).toHaveBeenCalledWith("request-1", "receipt-1", "allocation-2");
    });
  });

  it("no envía una línea POA preseleccionada si no pertenece a las opciones disponibles", () => {
    mocks.documents = [makeDocument({ request_allocation_id: "allocation-from-other-request" })];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        confirmed_by_id: "user-1",
        confirmed_at: "2026-06-02T12:00:00.000Z",
      },
    })];

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByRole("button", { name: "Agregar al informe" })).toBeDisabled();
    expect(mocks.addReceiptRow).not.toHaveBeenCalled();
  });

  it("deshabilita comprobantes confirmados sin línea POA asignada para evitar agregado ambiguo", () => {
    mocks.documents = [makeDocument({ request_allocation_id: null })];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] });
    mocks.receipts = [makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        request_allocation_id: null,
        confirmed_by_id: "user-1",
        confirmed_at: "2026-06-02T12:00:00.000Z",
      },
    })];

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText(/no tiene una línea POA válida/i)).toBeInTheDocument();
    expect(screen.getByText("Línea POA no asignada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar al informe" })).toBeDisabled();
    expect(mocks.addReceiptRow).not.toHaveBeenCalled();
  });

  it("carga opciones POA desde la cobertura del informe cuando la solicitud no trae allocations", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [{ request_allocation_id: "allocation-from-coverage", planned_amount: 500, row_total_amount: 0, row_count: 0, has_rows: false }], missing_allocations: ["allocation-from-coverage"] }, allocation_coverage: [{ request_allocation_id: "allocation-from-coverage", planned_amount: 500, row_total_amount: 0, row_count: 0, has_rows: false }] });
    mocks.receipts = [makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        request_allocation_id: "allocation-from-coverage",
        confirmed_by_id: "user-1",
        confirmed_at: "2026-06-02T12:00:00.000Z",
      },
    })];
    mocks.addReceiptRow.mockResolvedValue(makeReport());

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest({ allocations: [] })} />);

    expect(screen.getByText("Este comprobante pertenece a esta línea POA.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agregar al informe" }));

    await waitFor(() => {
      expect(mocks.addReceiptRow).toHaveBeenCalledWith("request-1", "receipt-1", "allocation-from-coverage");
    });
    expect(screen.queryByText("allocation-from-coverage")).not.toBeInTheDocument();
  });

  it("muestra estado vacío solo cuando no hay líneas en solicitud, informe ni contexto", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT, rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: [] }, allocation_coverage: [] });

    const { rerender } = render(<StructuredRenditionReportCard request={makeRequest({ allocations: [] })} />);

    expect(screen.getByText("Aún no se cargaron líneas POA para esta rendición.")).toBeInTheDocument();
    expect(screen.getByText("No hay líneas POA disponibles para asociar comprobantes.")).toBeInTheDocument();

    rerender(<StructuredRenditionReportCard request={makeRequest({ allocations: [] })} guidanceAllocations={makeTwoAllocationRequest().allocations ?? []} />);

    expect(screen.queryByText("Aún no se cargaron líneas POA para esta rendición.")).not.toBeInTheDocument();
    expect(screen.getByText("Líneas del anticipo original como referencia")).toBeInTheDocument();
    expect(screen.getByText(/Estamos actualizando las líneas POA de esta rendición/i)).toBeInTheDocument();
  });

  it("oculta acciones de mutación y generación en vista de solo lectura", () => {
    render(<StructuredRenditionReportCard request={makeRequest()} readOnly />);

    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar comprobante adicional" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar informe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar informe" })).not.toBeInTheDocument();
  });

  it("oculta controles editables cuando el informe ya fue generado", () => {
    mocks.documents = [
      makeDocument(),
      makeDocument({ id: "generated-document", document_category: REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT, original_filename: "Rendicion.xlsx" }),
    ];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED, settlement_report_document_id: "generated-document" });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar comprobante adicional" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar informe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar informe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerar informe actualizado" })).not.toBeInTheDocument();
    expect(screen.getByText(/El informe generado bloquea los comprobantes, documentos y filas/i)).toBeInTheDocument();
  });

  it("habilita edición y regeneración cuando la rendición observada conserva un informe generado", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED, settlement_report_document_id: "generated-document" });

    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    expect(screen.getByText(/La rendición fue observada; puedes actualizar sustentos y regenerar el informe antes de reenviar/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Editar" })[0]).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Quitar" })[0]).toBeEnabled();
    expect(screen.getByRole("button", { name: "Agregar comprobante adicional" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Validar informe" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Regenerar informe actualizado" })).toBeEnabled();
    expect(screen.queryByText(/El informe generado bloquea los comprobantes, documentos y filas/i)).not.toBeInTheDocument();
  });

  it("solo permite regenerar cuando falló la generación", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.EXPORT_FAILED });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar comprobante adicional" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar informe" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerar informe actualizado" })).toBeEnabled();
  });

  it("renderiza el estado de informe generado y su documento", () => {
    mocks.documents = [
      makeDocument(),
      makeDocument({
        id: "generated-document",
        document_category: REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT,
        safe_filename: "rendicion.xlsx",
        original_filename: "Rendicion.xlsx",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ];
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED,
      settlement_report_document_id: "generated-document",
      exported_at: "2026-06-03T00:00:00.000Z",
    });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Informe generado")).toBeInTheDocument();
    expect(screen.getByText(/Documento generado: Rendicion\.xlsx/)).toBeInTheDocument();
    expect(screen.getByText(/Generado:/)).toBeInTheDocument();
    expect(screen.getByText(/El informe generado bloquea los comprobantes, documentos y filas/i)).toBeInTheDocument();
    expect(screen.getByText("Listo para enviar a revisión: el informe generado está alineado con la validación actual.")).toBeInTheDocument();
  });

  it("explica bloqueo futuro cuando la generación está pendiente pero todavía no existe documento", () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING, settlement_report_document_id: null });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Generando informe")).toBeInTheDocument();
    expect(screen.getByText(/La generación del informe está en proceso/i)).toBeInTheDocument();
    expect(screen.getByText(/Actualiza el estado en unos minutos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
    expect(screen.queryByText(/El informe generado bloquea los comprobantes/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar informe" })).not.toBeInTheDocument();
  });

  it("muestra retry cuando EXPORT_PENDING está atascado y no oculta la acción", async () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING,
      settlement_report_document_id: null,
      export_pending_state: "STALE_RETRY_AVAILABLE",
      can_retry_generation: true,
      export_pending_stale_at: "2026-06-02T00:10:00.000Z",
    });
    mocks.generateReport.mockResolvedValue({ report: makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED, settlement_report_document_id: "generated-document" }), document: makeDocument({ id: "generated-document" }) });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Generación atascada")).toBeInTheDocument();
    expect(screen.getByText(/La generación anterior quedó atascada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reintentar generación" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Reintentar generación" }));
    expect(screen.getByRole("dialog", { name: "Reintentar generación del informe" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sí, reintentar generación" }));

    await waitFor(() => expect(mocks.generateReport).toHaveBeenCalledWith("request-1"));
  });

  it("mantiene bloqueada la generación stale si hay blockers del backend", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING,
      settlement_report_document_id: null,
      export_pending_state: "STALE_RETRY_AVAILABLE",
      can_retry_generation: true,
      totals: { total_amount: 125.5, by_allocation: [], missing_allocations: ["allocation-1"] },
      allocation_coverage: [{ request_allocation_id: "allocation-1", planned_amount: 300, row_total_amount: 0, row_count: 0, has_rows: false }],
    });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText(/La generación anterior quedó atascada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar generación" })).toBeDisabled();
    expect(screen.getByText(/Falta al menos un comprobante/i)).toBeInTheDocument();
  });

  it("mantiene read-only cuando EXPORT_PENDING ya tiene documento", () => {
    mocks.documents = [
      makeDocument(),
      makeDocument({ id: "generated-document", document_category: REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT, original_filename: "Rendicion.xlsx" }),
    ];
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING, settlement_report_document_id: "generated-document", can_retry_generation: true });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText(/Documento generado: Rendicion\.xlsx/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar generación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar informe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar comprobante adicional" })).not.toBeInTheDocument();
  });

  it("no reporta listo para enviar si el documento generado quedó desalineado con pendientes actuales", async () => {
    const onReadinessChange = vi.fn();
    mocks.documents = [
      makeDocument(),
      makeDocument({
        id: "generated-document",
        document_category: REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT,
        original_filename: "Rendicion.xlsx",
        safe_filename: "rendicion.xlsx",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ];
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED,
      settlement_report_document_id: "generated-document",
      rows: [],
      totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] },
      allocation_coverage: [{ request_allocation_id: "allocation-1", planned_amount: 300, row_total_amount: 0, row_count: 0, has_rows: false }],
    });

    render(<StructuredRenditionReportCard request={makeRequest()} onReadinessChange={onReadinessChange} />);

    await waitFor(() => expect(onReadinessChange).toHaveBeenCalledWith(false, ["Informe generado desactualizado: el Excel no coincide con la validación actual. Revisa los pendientes y regenera el informe actualizado antes de enviar."]));
    expect(screen.getByText(/Documento generado: Rendicion\.xlsx/)).toBeInTheDocument();
    expect(screen.getAllByText(/Informe generado desactualizado/i).length).toBeGreaterThan(0);
  });

  it("muestra panel de devolución por línea con importes y pendiente de constancia", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        request_allocation_label: "Línea 1: POA-001 · Materiales",
        planned_amount: 300,
        row_total_amount: 125,
        paid_base_amount: 300,
        rendered_amount: 125,
        expected_return_amount: 175,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    expect(screen.getByText("Saldos por línea POA")).toBeInTheDocument();
    expect(screen.getByText("Devolución requerida")).toBeInTheDocument();
    expect(screen.getByText(/Devolución requerida: la base pagada es mayor al monto rendido/i)).toBeInTheDocument();
    expect(screen.getByText(/registra el saldo exacto no utilizado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar devolución" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Constancia de devolución/i)).not.toBeInTheDocument();
  });

  it("no muestra devolución requerida antes de gestionar comprobantes y orienta el siguiente paso", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      rows: [],
      totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] },
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        request_allocation_label: "Línea 1: POA-001 · Materiales",
        planned_amount: 300,
        row_total_amount: 0,
        paid_base_amount: 300,
        rendered_amount: 0,
        expected_return_amount: 300,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 0,
        has_rows: false,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.queryByText("Saldos por línea POA")).not.toBeInTheDocument();
    expect(screen.getByText("Agrega y revisa comprobantes para calcular saldos por línea POA.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Monto devuelto *")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Constancia de devolución/i)).not.toBeInTheDocument();
  });

  it("mantiene visible la devolución observada aunque no haya filas actuales", async () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.OBSERVED,
      rows: [],
      totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] },
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        request_allocation_label: "Línea 1: POA-001 · Materiales",
        planned_amount: 300,
        row_total_amount: 0,
        paid_base_amount: 300,
        rendered_amount: 0,
        expected_return_amount: 300,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 0,
        has_rows: false,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF,
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    expect(screen.getByText("Saldos por línea POA")).toBeInTheDocument();
    expect(screen.getByText("Falta constancia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar devolución" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
    expect(screen.getByLabelText("Monto devuelto *")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Constancia de devolución/i).length).toBeGreaterThan(0);
  });

  it("muestra falta de base pagada como aviso administrativo no ingresable en rendición", () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        request_allocation_label: "Línea 1: POA-001 · Materiales",
        planned_amount: 300,
        row_total_amount: 502.22,
        paid_base_amount: 0,
        rendered_amount: 502.22,
        expected_return_amount: 0,
        returned_amount: 0,
        excess_amount: 502.22,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION,
      }],
    });

    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getAllByText("Pendiente administrativo GIOF").length).toBeGreaterThan(0);
    expect(screen.getByText(/no se encontró la base efectivamente pagada/i)).toBeInTheDocument();
    expect(screen.getByText(/no se ingresa en la rendición/i)).toBeInTheDocument();
    expect(screen.getByText(/Exceso rendido para revisión GIOF: los gastos superan la base pagada/i)).toBeInTheDocument();
    expect(screen.getByText(/no hay saldo a devolver/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Monto devuelto *")).not.toBeInTheDocument();
  });

  it("valida que el monto devuelto coincida exactamente antes de guardar", async () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125,
        paid_base_amount: 300,
        rendered_amount: 125,
        expected_return_amount: 175,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISMATCH,
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
    const amountInput = screen.getByLabelText("Monto devuelto *");
    await user.clear(amountInput);
    await user.type(amountInput, "170");
    await user.click(screen.getByRole("button", { name: "Guardar devolución de línea" }));

    expect(mocks.upsertLineReturn).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("El monto devuelto debe coincidir exactamente con el saldo esperado de la línea POA.");
  });

  it("exige constancia y justificación antes de guardar la devolución", async () => {
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125,
        paid_base_amount: 300,
        rendered_amount: 125,
        expected_return_amount: 175,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF,
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
    await user.click(screen.getByRole("button", { name: "Guardar devolución de línea" }));
    expect(mocks.toastError).toHaveBeenCalledWith("Selecciona o adjunta la constancia de devolución de esta línea POA.");
    expect(mocks.upsertLineReturn).not.toHaveBeenCalled();
  });

  it("guarda y elimina una devolución por línea con constancia existente", async () => {
    const proof = makeDocument({
      id: "return-proof-1",
      document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
      original_filename: "Constancia.pdf",
      safe_filename: "constancia.pdf",
      request_allocation_id: "allocation-1",
    });
    mocks.documents = [makeDocument(), proof];
    const lineReturn = {
      id: "line-return-1",
      returned_amount: 175,
      justification: "Saldo no utilizado en la línea POA.",
      return_proof_document_id: proof.id,
      return_proof_filename: "Constancia.pdf",
      status: "DRAFT",
      validated_at: null,
    };
    const report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125,
        paid_base_amount: 300,
        rendered_amount: 125,
        expected_return_amount: 175,
        returned_amount: 175,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: lineReturn,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.VALID,
      }],
    });
    mocks.report = report;
    mocks.upsertLineReturn.mockResolvedValue(report);
    mocks.deleteLineReturn.mockResolvedValue({ deleted: true });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    expect(screen.getByText("Devolución registrada")).toBeInTheDocument();
    expect(screen.getByText("Constancia: Constancia.pdf")).toBeInTheDocument();
    expect(screen.getByText("Justificación: Saldo no utilizado en la línea POA.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar devolución" }));
    await user.click(screen.getByRole("button", { name: "Guardar devolución de línea" }));
    expect(mocks.upsertLineReturn).toHaveBeenCalledWith("request-1", "allocation-1", {
      returned_amount: 175,
      justification: "Saldo no utilizado en la línea POA.",
      return_proof_document_id: "return-proof-1",
    });

    await user.click(screen.getAllByRole("button", { name: "Quitar devolución" })[0]);
    expect(mocks.deleteLineReturn).toHaveBeenCalledWith("request-1", "allocation-1");
  });

  it("adjunta constancia de devolución con alcance de la misma línea y la autoselecciona al guardar", async () => {
    const uploadedProof = makeDocument({
      id: "uploaded-return-proof-1",
      document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
      original_filename: "Constancia subida.pdf",
      safe_filename: "constancia-subida.pdf",
      request_allocation_id: "allocation-1",
    });
    mocks.documents = [makeDocument()];
    mocks.uploadDocument.mockResolvedValue(uploadedProof);
    mocks.upsertLineReturn.mockResolvedValue(makeReport());
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.OBSERVED,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125,
        paid_base_amount: 300,
        rendered_amount: 125,
        expected_return_amount: 175,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF,
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
    const proofFile = new File(["constancia"], "constancia.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/Adjuntar constancia de devolución para/i), proofFile);
    fireEvent.change(screen.getByLabelText("Justificación *"), { target: { value: "Saldo no utilizado." } });
    await user.click(screen.getByRole("button", { name: "Guardar devolución de línea" }));

    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith("request-1", {
      file: proofFile,
      document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
      scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
      request_allocation_id: "allocation-1",
    }));
    await waitFor(() => expect(mocks.upsertLineReturn).toHaveBeenCalledWith("request-1", "allocation-1", {
      returned_amount: 175,
      justification: "Saldo no utilizado.",
      return_proof_document_id: "uploaded-return-proof-1",
    }));
  });

  it("no ofrece constancias de otra línea en el registro de devolución", async () => {
    mocks.documents = [
      makeDocument(),
      makeDocument({
        id: "return-proof-other-line",
        document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        original_filename: "Constancia otra línea.pdf",
        request_allocation_id: "allocation-2",
      }),
    ];
    mocks.report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.OBSERVED,
      allocation_coverage: [{
        request_allocation_id: "allocation-1",
        planned_amount: 300,
        row_total_amount: 125,
        paid_base_amount: 300,
        rendered_amount: 125,
        expected_return_amount: 175,
        returned_amount: 0,
        excess_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
        return_validation_status: LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF,
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest({ status: REQUEST_STATUS.OBSERVED })} />);

    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

    expect(screen.queryByText("Constancia otra línea.pdf")).not.toBeInTheDocument();
    expect(screen.getByText(/Aún no hay constancia activa para esta línea POA/i)).toBeInTheDocument();
  });

  it("bloquea generación cuando backend reporta pendiente de devolución por línea", async () => {
    mocks.report = makeReport({ status: REQUEST_RENDITION_REPORT_STATUS.DRAFT });
    mocks.validateReport.mockResolvedValue({
      ready: false,
      report: mocks.report,
      totals: mocks.report.totals,
      allocation_coverage: mocks.report.allocation_coverage,
      blockers: [{
        code: "LINE_RETURN_PROOF_REQUIRED",
        message: "Adjunta una constancia RETURN_PROOF activa para esta línea POA.",
        request_allocation_id: "allocation-1",
        request_allocation_label: "Línea 1",
      }],
    });

    const user = userEvent.setup();
    render(<StructuredRenditionReportCard request={makeRequest()} />);

    await user.click(screen.getByRole("button", { name: "Validar informe" }));

    expect(await screen.findByText(/La devolución ya requiere constancia/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
  });

  it("notifica la preparación una sola vez aunque el padre use un callback inline", async () => {
    function ParentWithInlineReadinessCallback() {
      const [notificationCount, setNotificationCount] = useState(0);
      const [, setReadinessMessages] = useState<string[]>([]);

      return (
        <>
          <span data-testid="readiness-notification-count">{notificationCount}</span>
          <StructuredRenditionReportCard
            request={makeRequest()}
            onReadinessChange={(_, messages) => {
              setNotificationCount((current) => current + 1);
              setReadinessMessages(messages);
            }}
          />
        </>
      );
    }

    render(<ParentWithInlineReadinessCallback />);

    await waitFor(() => expect(screen.getByTestId("readiness-notification-count")).toHaveTextContent("1"));
  });
});
