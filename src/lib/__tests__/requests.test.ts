import { describe, expect, it } from "vitest";

import { ApiRequestError } from "@/lib/api-client";
import {
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_OPTIONS,
  REQUEST_LIST_SORT,
  REQUEST_LIST_SORT_OPTIONS,
  REQUEST_STATUS_SUMMARY_CARDS,
  canEditDraftRequest,
  canEditRequest,
  canCorrectObservedRequest,
  canReviewRequest,
  formatRequestDateTime,
  getBeneficiaryDocumentHelp,
  getBeneficiaryDocumentInputMode,
  getBeneficiaryDocumentMaxLength,
  getBeneficiaryDocumentPlaceholder,
  getApiErrorMessages,
  canManageRequestDocuments,
  formatRequestDocumentSize,
  getRequestDocumentCategoryLabel,
  validateRequestDocumentFile,
  getRequestListActions,
  getRequestStatusStepperItems,
  sortRequestsForList,
  sanitizeBeneficiaryDocumentNumber,
  sanitizeBudgetMessage,
  sanitizeDigits,
  isBudgetPreviewBlocking,
} from "@/lib/requests";
import { ROLE_CODE } from "@/lib/constants";
import { BENEFICIARY_DOCUMENT_TYPE, REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestBudgetPreview, type RequestStatusHistoryItem } from "@/types/requests";

function makeHistoryItem(overrides: Partial<RequestStatusHistoryItem>): RequestStatusHistoryItem {
  return {
    id: "history-1",
    payment_request_id: "req-1",
    from_status: REQUEST_STATUS.DRAFT,
    to_status: REQUEST_STATUS.SUBMITTED,
    actor_id: null,
    actor_role: null,
    reason: null,
    comment: null,
    created_at: "2026-05-02T10:00:00.000Z",
    ...overrides,
  };
}

function makePreview(overrides: Partial<RequestBudgetPreview>): RequestBudgetPreview {
  return {
    planning_line: {
      id: "line-1",
      line_code: "POA-1",
      resource_description: "Recurso",
      planning_type: "PROGRAMA",
      type_resource: "PROGRAMA",
      total_cost: 100,
      status: "APPROVED",
      fiscal_year: null,
      org_unit: null,
      category: null,
      program: null,
      action: null,
      monthly_summary: [],
    },
    month: 1,
    amount: 10,
    org_unit: null,
    org_unit_ceiling: 100,
    current_consumed_amount: 0,
    submitted_pending_amount: 0,
    remaining_ceiling: 100,
    willExceedOrgUnitCeiling: false,
    orgUnitBlockingErrors: [],
    planned_line_month_amount: 100,
    planned_line_month_executed_amount: 0,
    line_consumed_amount: 0,
    line_planned_remaining: 100,
    lineWarning: false,
    lineWarningMessage: null,
    warnings: [],
    ...overrides,
  };
}

function makeRequest(overrides: Partial<PaymentRequest>): PaymentRequest {
  return {
    id: "req-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.ADVANCE,
    status: REQUEST_STATUS.DRAFT,
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
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("requests helpers", () => {
  it("etiqueta todos los tipos del contrato y mantiene Rexan fuera de opciones iniciales", () => {
    expect(Object.keys(REQUEST_TYPE_LABELS)).toEqual([
      REQUEST_TYPE.ADVANCE,
      REQUEST_TYPE.REIMBURSEMENT,
      REQUEST_TYPE.SUPPLIER_PAYMENT,
      REQUEST_TYPE.ADVANCE_SETTLEMENT,
    ]);
    expect(REQUEST_TYPE_OPTIONS.map((option) => option.value)).not.toContain(REQUEST_TYPE.ADVANCE_SETTLEMENT);
  });

  it("extrae mensajes de ApiRequestError", () => {
    const error = new ApiRequestError(400, {
      statusCode: 400,
      message: ["Campo requerido", "Monto inválido"],
      error: "Bad Request",
      timestamp: "2026-05-07T00:00:00.000Z",
      path: "/requests",
    });

    expect(getApiErrorMessages(error)).toEqual(["Campo requerido", "Monto inválido"]);
  });

  it("valida archivos adjuntos permitidos para solicitudes", () => {
    const validPdf = new File(["contenido"], "sustento.pdf", { type: "application/pdf" });
    const emptyPdf = new File([], "vacio.pdf", { type: "application/pdf" });
    const textFile = new File(["texto"], "nota.txt", { type: "text/plain" });

    expect(validateRequestDocumentFile(validPdf)).toBeNull();
    expect(validateRequestDocumentFile(emptyPdf)).toContain("vacío");
    expect(validateRequestDocumentFile(textFile)).toContain("Formato no permitido");
    expect(validateRequestDocumentFile(null)).toContain("Selecciona un archivo");
  });

  it("formatea metadatos de documentos adjuntos", () => {
    expect(formatRequestDocumentSize(512)).toBe("512 B");
    expect(formatRequestDocumentSize(2048)).toBe("2.0 KB");
    expect(formatRequestDocumentSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(getRequestDocumentCategoryLabel(REQUEST_DOCUMENT_CATEGORY.RECEIPT)).toBe("Comprobante");
  });

  it("aplica heurística frontend para gestionar documentos", () => {
    const draft = makeRequest({ status: REQUEST_STATUS.DRAFT, requester_id: "user-1" });
    const observed = makeRequest({ status: REQUEST_STATUS.OBSERVED, requester_id: "user-1" });
    const submitted = makeRequest({ status: REQUEST_STATUS.SUBMITTED, requester_id: "user-1" });

    expect(canManageRequestDocuments(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.DRAFT, draft, "user-1")).toBe(true);
    expect(canManageRequestDocuments(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.DRAFT, draft, "other-user")).toBe(false);
    expect(canManageRequestDocuments(ROLE_CODE.GIOF_GESTOR, REQUEST_STATUS.OBSERVED, observed, "giof-1")).toBe(true);
    expect(canManageRequestDocuments(ROLE_CODE.ADMIN_SISTEMA, REQUEST_STATUS.DRAFT, draft, "admin-1")).toBe(true);
    expect(canManageRequestDocuments(ROLE_CODE.ADMIN_SISTEMA, REQUEST_STATUS.SUBMITTED, submitted, "admin-1")).toBe(false);
  });

  it("bloquea solo cuando el techo de unidad orgánica excede", () => {
    expect(isBudgetPreviewBlocking(makePreview({ lineWarning: true }))).toBe(false);
    expect(isBudgetPreviewBlocking(makePreview({
      willExceedOrgUnitCeiling: true,
      orgUnitBlockingErrors: ["Techo excedido"],
    }))).toBe(true);
  });

  it("mantiene PEN como moneda base del flujo", () => {
    expect(REQUEST_CURRENCY.PEN).toBe("PEN");
  });

  it("muestra fecha y hora en formato de lista", () => {
    expect(formatRequestDateTime("2026-05-07T15:30:00.000Z")).toMatch(/2026/);
    expect(formatRequestDateTime("2026-05-07T15:30:00.000Z")).toMatch(/\d{1,2}:\d{2}/);
    expect(formatRequestDateTime(null)).toBe("—");
  });

  it("expone cards y opciones de orden para la bandeja de solicitudes", () => {
    expect(REQUEST_STATUS_SUMMARY_CARDS.map((card) => card.value)).toEqual([
      REQUEST_STATUS.DRAFT,
      REQUEST_STATUS.SUBMITTED,
      REQUEST_STATUS.OBSERVED,
      REQUEST_STATUS.APPROVED,
      REQUEST_STATUS.REJECTED,
    ]);
    expect(REQUEST_LIST_SORT_OPTIONS.map((option) => option.label)).toEqual([
      "Prioridad de revisión",
      "Más antiguas primero",
      "Más recientes primero",
    ]);
  });

  it("construye el avance de solicitud sin completar la ruta de aprobación para observadas", () => {
    const steps = getRequestStatusStepperItems(REQUEST_STATUS.OBSERVED, [
      makeHistoryItem({ to_status: REQUEST_STATUS.SUBMITTED, created_at: "2026-05-02T10:00:00.000Z" }),
      makeHistoryItem({ from_status: REQUEST_STATUS.SUBMITTED, to_status: REQUEST_STATUS.OBSERVED, created_at: "2026-05-03T10:00:00.000Z" }),
    ]);

    expect(steps.map((step) => step.label)).toEqual([
      "Borrador",
      "Enviada / En revisión",
      "Observada",
      "Aprobada",
      "Pagada",
      "Cerrada",
    ]);
    expect(steps.find((step) => step.status === REQUEST_STATUS.OBSERVED)?.state).toBe("current");
    expect(steps.find((step) => step.status === REQUEST_STATUS.APPROVED)?.state).toBe("pending");
  });

  it("usa una rama terminal para rechazadas sin mostrar aprobación como completada", () => {
    const steps = getRequestStatusStepperItems(REQUEST_STATUS.REJECTED, [
      makeHistoryItem({ to_status: REQUEST_STATUS.SUBMITTED }),
      makeHistoryItem({ from_status: REQUEST_STATUS.SUBMITTED, to_status: REQUEST_STATUS.REJECTED }),
    ]);

    expect(steps.map((step) => step.status)).toEqual([
      REQUEST_STATUS.DRAFT,
      REQUEST_STATUS.SUBMITTED,
      REQUEST_STATUS.REJECTED,
    ]);
    expect(steps.find((step) => step.status === REQUEST_STATUS.REJECTED)?.isBranch).toBe(true);
    expect(steps.some((step) => step.status === REQUEST_STATUS.APPROVED)).toBe(false);
  });

  it("incluye validación solo cuando el estado aparece en el flujo", () => {
    const steps = getRequestStatusStepperItems(REQUEST_STATUS.IN_VALIDATION, [
      makeHistoryItem({ to_status: REQUEST_STATUS.SUBMITTED }),
      makeHistoryItem({ from_status: REQUEST_STATUS.SUBMITTED, to_status: REQUEST_STATUS.IN_VALIDATION }),
    ]);

    expect(steps.map((step) => step.status)).toEqual([
      REQUEST_STATUS.DRAFT,
      REQUEST_STATUS.SUBMITTED,
      REQUEST_STATUS.IN_VALIDATION,
      REQUEST_STATUS.APPROVED,
      REQUEST_STATUS.PAID,
      REQUEST_STATUS.CLOSED,
    ]);
  });

  it("ordena por prioridad de revisión con enviadas FIFO primero", () => {
    const draft = makeRequest({ id: "draft", status: REQUEST_STATUS.DRAFT, created_at: "2026-05-08T10:00:00.000Z" });
    const newestSubmitted = makeRequest({ id: "new-submitted", status: REQUEST_STATUS.SUBMITTED, submitted_at: "2026-05-07T10:00:00.000Z" });
    const oldestSubmitted = makeRequest({ id: "old-submitted", status: REQUEST_STATUS.SUBMITTED, submitted_at: "2026-05-06T10:00:00.000Z" });

    expect(sortRequestsForList([draft, newestSubmitted, oldestSubmitted], REQUEST_LIST_SORT.REVIEW_PRIORITY).map((request) => request.id)).toEqual([
      "old-submitted",
      "new-submitted",
      "draft",
    ]);
  });

  it("ordena por antigüedad o recencia usando envío y creación", () => {
    const oldest = makeRequest({ id: "oldest", created_at: "2026-05-01T10:00:00.000Z" });
    const newest = makeRequest({ id: "newest", submitted_at: "2026-05-03T10:00:00.000Z", created_at: "2026-05-02T10:00:00.000Z" });

    expect(sortRequestsForList([newest, oldest], REQUEST_LIST_SORT.OLDEST_FIRST).map((request) => request.id)).toEqual(["oldest", "newest"]);
    expect(sortRequestsForList([oldest, newest], REQUEST_LIST_SORT.NEWEST_FIRST).map((request) => request.id)).toEqual(["newest", "oldest"]);
  });

  it("expone ayudas dinámicas por tipo de documento del beneficiario", () => {
    expect(getBeneficiaryDocumentPlaceholder(BENEFICIARY_DOCUMENT_TYPE.DNI)).toBe("8 dígitos");
    expect(getBeneficiaryDocumentPlaceholder(BENEFICIARY_DOCUMENT_TYPE.RUC)).toBe("11 dígitos");
    expect(getBeneficiaryDocumentHelp(BENEFICIARY_DOCUMENT_TYPE.CE)).toContain("6 a 12");
    expect(getBeneficiaryDocumentMaxLength(BENEFICIARY_DOCUMENT_TYPE.DNI)).toBe(8);
    expect(getBeneficiaryDocumentInputMode(BENEFICIARY_DOCUMENT_TYPE.RUC)).toBe("numeric");
    expect(getBeneficiaryDocumentInputMode(BENEFICIARY_DOCUMENT_TYPE.CE)).toBe("text");
  });

  it("sanitiza documentos de beneficiario según el tipo seleccionado", () => {
    expect(sanitizeBeneficiaryDocumentNumber("00000002aaa", BENEFICIARY_DOCUMENT_TYPE.DNI)).toBe("00000002");
    expect(sanitizeBeneficiaryDocumentNumber("20-123 456 789xxx", BENEFICIARY_DOCUMENT_TYPE.RUC)).toBe("20123456789");
    expect(sanitizeBeneficiaryDocumentNumber(" ab-12 ñ$cd 34567890 ", BENEFICIARY_DOCUMENT_TYPE.CE)).toBe("AB12CD345678");
  });

  it("sanitiza campos numéricos de pago con longitud máxima", () => {
    expect(sanitizeDigits("001-abc-234567890123456789012345678901", 30)).toBe("001234567890123456789012345678");
    expect(sanitizeDigits("002-abc", 20)).toBe("002");
  });

  it("oculta nombres técnicos en mensajes presupuestales", () => {
    expect(sanitizeBudgetMessage("budget_ceiling no configurado")).toBe("límite presupuestal no configurado");
  });

  it("habilita acciones de revisión solo para GIOF o admin en solicitudes enviadas", () => {
    expect(canReviewRequest(ROLE_CODE.GIOF_GESTOR, REQUEST_STATUS.SUBMITTED)).toBe(true);
    expect(canReviewRequest(ROLE_CODE.ADMIN_SISTEMA, REQUEST_STATUS.SUBMITTED)).toBe(true);
    expect(canReviewRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.SUBMITTED)).toBe(false);
    expect(canReviewRequest(ROLE_CODE.GIOF_GESTOR, REQUEST_STATUS.OBSERVED)).toBe(false);
  });

  it("habilita edición de borrador solo para solicitante", () => {
    expect(canEditDraftRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.DRAFT)).toBe(true);
    expect(canEditDraftRequest(ROLE_CODE.GIOF_GESTOR, REQUEST_STATUS.DRAFT)).toBe(false);
    expect(canEditDraftRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.SUBMITTED)).toBe(false);
  });

  it("habilita corrección solo para solicitante en solicitudes observadas", () => {
    expect(canCorrectObservedRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.OBSERVED)).toBe(true);
    expect(canCorrectObservedRequest(ROLE_CODE.GIOF_GESTOR, REQUEST_STATUS.OBSERVED)).toBe(false);
    expect(canCorrectObservedRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.SUBMITTED)).toBe(false);
  });

  it("consolida edición para borradores y solicitudes observadas", () => {
    expect(canEditRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.DRAFT)).toBe(true);
    expect(canEditRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.OBSERVED)).toBe(true);
    expect(canEditRequest(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.SUBMITTED)).toBe(false);
    expect(canEditRequest(ROLE_CODE.GIOF_GESTOR, REQUEST_STATUS.OBSERVED)).toBe(false);
  });

  it("expone acciones de lista según rol y estado", () => {
    expect(getRequestListActions(ROLE_CODE.GIOF_GESTOR, REQUEST_STATUS.SUBMITTED, "req-1").map((action) => action.label)).toEqual(["Gestionar"]);
    expect(getRequestListActions(ROLE_CODE.ADMIN_SISTEMA, REQUEST_STATUS.APPROVED, "req-1").map((action) => action.label)).toEqual(["Ver detalle"]);
    expect(getRequestListActions(ROLE_CODE.ADMIN_SISTEMA, REQUEST_STATUS.REJECTED, "req-1").map((action) => action.label)).toEqual(["Ver detalle"]);
    expect(getRequestListActions(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.DRAFT, "req-1").map((action) => action.label)).toEqual(["Editar", "Ver"]);
    expect(getRequestListActions(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.OBSERVED, "req-1").map((action) => action.label)).toEqual(["Corregir", "Ver"]);
  });
});
