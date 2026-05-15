import { describe, expect, it } from "vitest";

import { ApiRequestError } from "@/lib/api-client";
import {
  ACTIVE_REVIEW_STATUSES,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_OPTIONS,
  REQUEST_LIST_SORT,
  REQUEST_LIST_SORT_OPTIONS,
  REQUEST_REVIEW_QUEUE,
  REQUEST_REVIEW_QUEUE_CARDS,
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
  canStartAdvanceSettlement,
  getAdvanceSettlementCta,
  formatRequestDocumentSize,
  getActiveAdvanceSettlement,
  getNewAdvancePendingSettlementBlockMessage,
  getRequestDocumentCategoryLabel,
  getRequestDocumentAccept,
  getRequestDocumentAcceptedFormatsLabel,
  getRequestDocumentMimeLabel,
  getRequestDocumentPermissionMessage,
  getRequestDocumentStorageProviderLabel,
  getRequestDocumentUploadStatusLabel,
  getRequestEditStep,
  getRequestEditStepperItems,
  getRequiredDocumentChecklist,
  getRequestReviewQueueCount,
  getRequestReviewQueueFilter,
  validateRequestDocumentFile,
  validatePaymentProofFile,
  getPaymentRequestParty,
  getPaymentQueueStatusLabel,
  getPaymentRequestRenditionStatus,
  getRenditionDueLabel,
  getRenditionStatusLabel,
  getRenditionSummaryCount,
  getRequestListActions,
  getRequestStatusStepperItems,
  sortRequestsForList,
  sanitizeBeneficiaryDocumentNumber,
  sanitizeBudgetMessage,
  sanitizeDigits,
  isBudgetPreviewBlocking,
  parseRequestListSort,
  parseRequestReviewQueue,
  parseRequestStatusFilter,
  parseRenditionSortDirection,
  parseRenditionSortField,
  parseRenditionStatusFilter,
  REQUEST_EDIT_STEP,
} from "@/lib/requests";
import { ROLE_CODE } from "@/lib/constants";
import { BENEFICIARY_DOCUMENT_TYPE, RENDITION_SORT_DIRECTION, RENDITION_SORT_FIELD, RENDITION_STATUS, REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_STORAGE_PROVIDER, REQUEST_DOCUMENT_UPLOAD_STATUS, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RenditionInboxCounts, type RenditionInboxRow, type RequestBudgetPreview, type RequestDocument, type RequestStatusHistoryItem } from "@/types/requests";

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

function makeRenditionRow(overrides: Partial<RenditionInboxRow> = {}): RenditionInboxRow {
  return {
    advance_id: "advance-1",
    request_code: "SOL-1",
    requester: "Solicitante",
    org_unit: "Área",
    concept: "Anticipo",
    requested_amount: 100,
    amount_paid: 100,
    paid_at: "2026-05-01T00:00:00.000Z",
    scheduled_rendition_at: "2026-05-20",
    rendition_status: RENDITION_STATUS.PENDING,
    days_overdue: null,
    settlement_request_id: null,
    settlement_status: null,
    payment_proof_document_id: null,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<RequestDocument> = {}): RequestDocument {
  return {
    id: "doc-1",
    payment_request_id: "req-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    safe_filename: "comprobante.pdf",
    original_filename: "Comprobante.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.DRIVE,
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    created_at: "2026-05-01T10:00:00.000Z",
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

  it("habilita inicio de rendición solo para anticipos pagados y usuarios autorizados", () => {
    const paidAdvance = makeRequest({ status: REQUEST_STATUS.PAID, requester_id: "user-1" });

    expect(canStartAdvanceSettlement(ROLE_CODE.SOLICITANTE_EPE, paidAdvance, "user-1")).toBe(true);
    expect(canStartAdvanceSettlement(ROLE_CODE.GIOF_GESTOR, paidAdvance, "reviewer-1")).toBe(true);
    expect(canStartAdvanceSettlement(ROLE_CODE.ADMIN_SISTEMA, paidAdvance, "admin-1")).toBe(true);
    expect(canStartAdvanceSettlement(ROLE_CODE.SOLICITANTE_EPE, paidAdvance, "other-user")).toBe(false);
    expect(canStartAdvanceSettlement(ROLE_CODE.SOLICITANTE_EPE, makeRequest({ status: REQUEST_STATUS.APPROVED }), "user-1")).toBe(false);
    expect(canStartAdvanceSettlement(ROLE_CODE.SOLICITANTE_EPE, makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT, status: REQUEST_STATUS.PAID }), "user-1")).toBe(false);
  });

  it("detecta una rendición activa y evita duplicar el inicio", () => {
    const settlement = {
      id: "settlement-1",
      request_code: "REXAN-1",
      sequential_number: null,
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.DRAFT,
      requested_amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición",
      requester_id: "user-1",
      created_at: "2026-05-01T10:00:00.000Z",
    };
    const paidAdvance = makeRequest({ status: REQUEST_STATUS.PAID, advanceSettlements: [settlement] });

    expect(getActiveAdvanceSettlement(paidAdvance)).toEqual(settlement);
    expect(canStartAdvanceSettlement(ROLE_CODE.SOLICITANTE_EPE, paidAdvance, "user-1")).toBe(false);
  });

  it("deriva CTA de rendición para iniciar, continuar, reintentar y marcar completada", () => {
    const paidAdvance = makeRequest({ status: REQUEST_STATUS.PAID, requester_id: "user-1" });
    const draftSettlement = {
      id: "settlement-draft",
      request_code: "REXAN-1",
      sequential_number: null,
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.DRAFT,
      requested_amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición",
      requester_id: "user-1",
      created_at: "2026-05-01T10:00:00.000Z",
    };
    const submittedSettlement = { ...draftSettlement, id: "settlement-submitted", status: REQUEST_STATUS.SUBMITTED };
    const rejectedSettlement = { ...draftSettlement, id: "settlement-rejected", status: REQUEST_STATUS.REJECTED };
    const approvedSettlement = { ...draftSettlement, id: "settlement-approved", status: REQUEST_STATUS.APPROVED };

    expect(getAdvanceSettlementCta(ROLE_CODE.SOLICITANTE_EPE, paidAdvance, "user-1")).toMatchObject({
      state: "can-start",
      label: "Iniciar rendición",
      href: null,
      settlement: null,
    });
    expect(getAdvanceSettlementCta(ROLE_CODE.SOLICITANTE_EPE, makeRequest({ status: REQUEST_STATUS.PAID, advanceSettlements: [draftSettlement] }), "user-1")).toMatchObject({
      state: "continue-editable",
      label: "Continuar rendición",
      href: "/requests/settlement-draft/edit?step=documents",
      settlement: draftSettlement,
    });
    expect(getAdvanceSettlementCta(ROLE_CODE.SOLICITANTE_EPE, makeRequest({ status: REQUEST_STATUS.PAID, advanceSettlements: [submittedSettlement] }), "user-1")).toMatchObject({
      state: "view-existing",
      label: "Ver rendición",
      href: "/requests/settlement-submitted",
      settlement: submittedSettlement,
    });
    expect(getAdvanceSettlementCta(ROLE_CODE.SOLICITANTE_EPE, makeRequest({ status: REQUEST_STATUS.PAID, advanceSettlements: [rejectedSettlement] }), "user-1")).toMatchObject({
      state: "retry-after-rejected",
      label: "Iniciar nueva rendición",
      href: null,
      settlement: rejectedSettlement,
    });
    expect(getAdvanceSettlementCta(ROLE_CODE.SOLICITANTE_EPE, makeRequest({ status: REQUEST_STATUS.PAID, advanceSettlements: [approvedSettlement] }), "user-1")).toMatchObject({
      state: "completed",
      label: "Rendición completada",
      href: "/requests/settlement-approved",
      settlement: approvedSettlement,
    });
  });

  it("etiqueta y deriva estados de bandeja de rendiciones", () => {
    const counts: RenditionInboxCounts = {
      [RENDITION_STATUS.PENDING]: 2,
      [RENDITION_STATUS.OVERDUE]: 1,
      [RENDITION_STATUS.IN_REVIEW]: 1,
      [RENDITION_STATUS.OBSERVED]: 0,
      [RENDITION_STATUS.SETTLED]: 3,
    };
    const pendingDueSoon = makeRenditionRow({ scheduled_rendition_at: "2026-05-20" });
    const overdue = makeRenditionRow({ rendition_status: RENDITION_STATUS.OVERDUE, days_overdue: 2 });
    const paidAdvance = makeRequest({ status: REQUEST_STATUS.PAID, scheduled_rendition_at: "2026-05-20" });
    const observedSettlement = {
      id: "settlement-observed",
      request_code: "REXAN-1",
      sequential_number: null,
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.OBSERVED,
      requested_amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición",
      requester_id: "user-1",
      created_at: "2026-05-01T10:00:00.000Z",
    };

    expect(parseRenditionStatusFilter("OVERDUE")).toBe(RENDITION_STATUS.OVERDUE);
    expect(parseRenditionSortField("paid_at")).toBe(RENDITION_SORT_FIELD.PAID_AT);
    expect(parseRenditionSortDirection("desc")).toBe(RENDITION_SORT_DIRECTION.DESC);
    expect(getRenditionStatusLabel(RENDITION_STATUS.IN_REVIEW)).toBe("En revisión");
    expect(getRenditionDueLabel(overdue, new Date("2026-05-15T00:00:00.000Z"))).toBe("2 días vencida");
    expect(getRenditionSummaryCount({ key: "due-soon", label: "Próximas a vencer", description: "" }, counts, [pendingDueSoon, overdue])).toBe(1);
    expect(getPaymentRequestRenditionStatus(paidAdvance)).toBe(RENDITION_STATUS.PENDING);
    expect(getPaymentRequestRenditionStatus(makeRequest({ status: REQUEST_STATUS.PAID, advanceSettlements: [observedSettlement] }))).toBe(RENDITION_STATUS.OBSERVED);
  });

  it("aplica mensaje de bloqueo de nuevo anticipo sin bloquear corrección REXAN", () => {
    const backendError = new ApiRequestError(400, {
      statusCode: 400,
      message: "Tienes 2 anticipos pagados pendientes de rendición antes de crear un nuevo anticipo.",
      error: "Bad Request",
      timestamp: "2026-05-15T00:00:00.000Z",
      path: "/requests",
    });

    expect(getNewAdvancePendingSettlementBlockMessage(REQUEST_TYPE.ADVANCE, backendError)).toBe("Tienes 2 anticipos pagados pendientes de rendición antes de crear un nuevo anticipo.");
    expect(getNewAdvancePendingSettlementBlockMessage(REQUEST_TYPE.ADVANCE, null)).toContain("dos o más anticipos pagados pendientes de rendición");
    expect(getNewAdvancePendingSettlementBlockMessage(REQUEST_TYPE.ADVANCE_SETTLEMENT, backendError)).toBeNull();
  });

  it("valida archivos adjuntos permitidos para solicitudes", () => {
    const validPdf = new File(["contenido"], "sustento.pdf", { type: "application/pdf" });
    const validJpeg = new File(["contenido"], "foto.jpg", { type: "image/jpeg" });
    const validPng = new File(["contenido"], "captura.png", { type: "image/png" });
    const emptyPdf = new File([], "vacio.pdf", { type: "application/pdf" });
    const textFile = new File(["texto"], "nota.txt", { type: "text/plain" });
    const excelFile = new File(["contenido"], "pxq.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const excelFileWithoutMime = new File(["contenido"], "pxq.xls", { type: "" });
    const oversizedFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.pdf", { type: "application/pdf" });

    expect(validateRequestDocumentFile(validPdf)).toBeNull();
    expect(validateRequestDocumentFile(validJpeg)).toBeNull();
    expect(validateRequestDocumentFile(validPng)).toBeNull();
    expect(validateRequestDocumentFile(excelFile, REQUEST_DOCUMENT_CATEGORY.PXQ)).toBeNull();
    expect(validateRequestDocumentFile(excelFileWithoutMime, REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT)).toBeNull();
    expect(validateRequestDocumentFile(validPdf, REQUEST_DOCUMENT_CATEGORY.PXQ)).toContain("Formato no permitido");
    expect(validateRequestDocumentFile(excelFile, REQUEST_DOCUMENT_CATEGORY.RECEIPT)).toContain("Formato no permitido");
    expect(validateRequestDocumentFile(emptyPdf)).toContain("vacío");
    expect(validateRequestDocumentFile(textFile)).toContain("Formato no permitido");
    expect(validateRequestDocumentFile(oversizedFile)).toContain("10 MB");
    expect(validateRequestDocumentFile(null)).toContain("Selecciona un archivo");
  });

  it("define estados activos de revisión y valida constancias de pago PDF", () => {
    const validPdf = new File(["contenido"], "telecredito.pdf", { type: "application/pdf" });
    const validPdfWithoutMime = new File(["contenido"], "telecredito.pdf", { type: "" });
    const textFile = new File(["texto"], "telecredito.txt", { type: "text/plain" });
    const oversizedFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.pdf", { type: "application/pdf" });

    expect(ACTIVE_REVIEW_STATUSES).toEqual([
      REQUEST_STATUS.SUBMITTED,
      REQUEST_STATUS.IN_VALIDATION,
      REQUEST_STATUS.OBSERVED,
    ]);
    expect(ACTIVE_REVIEW_STATUSES).not.toContain(REQUEST_STATUS.DRAFT);
    expect(ACTIVE_REVIEW_STATUSES).not.toContain(REQUEST_STATUS.APPROVED);
    expect(ACTIVE_REVIEW_STATUSES).not.toContain(REQUEST_STATUS.PAID);
    expect(validatePaymentProofFile(validPdf)).toBeNull();
    expect(validatePaymentProofFile(validPdfWithoutMime)).toBeNull();
    expect(validatePaymentProofFile(textFile)).toContain("PDF");
    expect(validatePaymentProofFile(oversizedFile)).toContain("10 MB");
    expect(validatePaymentProofFile(null)).toContain("constancia");
  });

  it("formatea metadatos de documentos adjuntos", () => {
    expect(formatRequestDocumentSize(512)).toBe("512 B");
    expect(formatRequestDocumentSize(2048)).toBe("2.0 KB");
    expect(formatRequestDocumentSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(getRequestDocumentCategoryLabel(REQUEST_DOCUMENT_CATEGORY.RECEIPT)).toBe("Comprobante");
    expect(getRequestDocumentCategoryLabel(REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT)).toBe("Sustento de solicitud");
    expect(getRequestDocumentCategoryLabel("RAW_UNKNOWN")).toBe("Categoría no reconocida");
    expect(getRequestDocumentUploadStatusLabel(REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT)).toBe("Guardado");
    expect(getRequestDocumentUploadStatusLabel("RAW_UNKNOWN")).toBe("Estado no reconocido");
    expect(getRequestDocumentStorageProviderLabel(REQUEST_DOCUMENT_STORAGE_PROVIDER.DRIVE)).toBe("Google Drive");
    expect(getRequestDocumentStorageProviderLabel("RAW_UNKNOWN")).toBe("Proveedor no reconocido");
    expect(getRequestDocumentMimeLabel("image/png")).toBe("PNG");
    expect(getRequestDocumentMimeLabel("application/vnd.ms-excel")).toBe("XLS");
    expect(getRequestDocumentAcceptedFormatsLabel(REQUEST_DOCUMENT_CATEGORY.PXQ)).toBe("XLS o XLSX");
    expect(getRequestDocumentAcceptedFormatsLabel(REQUEST_DOCUMENT_CATEGORY.RECEIPT)).toBe("PDF, JPG o PNG");
    expect(getRequestDocumentAccept(REQUEST_DOCUMENT_CATEGORY.PXQ)).not.toContain("application/pdf");
    expect(getRequestDocumentAccept(REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT)).toContain(".xlsx");
  });

  it("construye el stepper de edición por query param", () => {
    expect(getRequestEditStep("documents")).toBe(REQUEST_EDIT_STEP.DOCUMENTS);
    expect(getRequestEditStep("review")).toBe(REQUEST_EDIT_STEP.REVIEW);
    expect(getRequestEditStep("unknown")).toBe(REQUEST_EDIT_STEP.DATA);

    const steps = getRequestEditStepperItems(REQUEST_EDIT_STEP.REVIEW);
    expect(steps.map((step) => step.label)).toEqual(["Datos", "Documentos", "Revisión/Envío"]);
    expect(steps.map((step) => step.state)).toEqual(["completed", "completed", "current"]);
  });

  it("evalúa checklist de documentos requeridos por tipo", () => {
    const advanceMissing = getRequiredDocumentChecklist(REQUEST_TYPE.ADVANCE, []);
    expect(advanceMissing.isComplete).toBe(false);
    expect(advanceMissing.missingMessages).toEqual(["Falta adjuntar Excel PxQ."]);

    const advanceComplete = getRequiredDocumentChecklist(REQUEST_TYPE.ADVANCE, [
      makeDocument({
        document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
        original_filename: "pxq.xlsx",
        safe_filename: "pxq.xlsx",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ]);
    expect(advanceComplete.isComplete).toBe(true);

    const reimbursement = getRequiredDocumentChecklist(REQUEST_TYPE.REIMBURSEMENT, [
      makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT }),
    ]);
    expect(reimbursement.missingMessages).toEqual(["Falta adjuntar informe de rendición Excel."]);

    const supplier = getRequiredDocumentChecklist(REQUEST_TYPE.SUPPLIER_PAYMENT, []);
    expect(supplier.missingMessages).toEqual(["Falta adjuntar comprobante factura/RH."]);
    expect(supplier.conditionalNotes.length).toBeGreaterThan(0);
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
    expect(getRequestDocumentPermissionMessage(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.SUBMITTED, submitted, "user-1")).toContain("borrador u observación");
    expect(getRequestDocumentPermissionMessage(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.DRAFT, draft, "other-user")).toContain("solicitante titular");
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

  it("mapea las colas operativas GIOF a filtros de la bandeja de revisión", () => {
    expect(REQUEST_REVIEW_QUEUE_CARDS.map((card) => card.value)).toEqual([
      REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1,
      REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2,
      REQUEST_REVIEW_QUEUE.OBSERVED_RETURNED,
      REQUEST_REVIEW_QUEUE.BLOCKED,
    ]);
    expect(getRequestReviewQueueFilter(REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1)).toMatchObject({
      status: REQUEST_STATUS.SUBMITTED,
      sort: REQUEST_LIST_SORT.REVIEW_PRIORITY,
    });
    expect(getRequestReviewQueueFilter(REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2)).toMatchObject({
      status: REQUEST_STATUS.IN_VALIDATION,
      sort: REQUEST_LIST_SORT.OLDEST_FIRST,
    });
    expect(getRequestReviewQueueFilter(REQUEST_REVIEW_QUEUE.OBSERVED_RETURNED)).toMatchObject({
      status: REQUEST_STATUS.OBSERVED,
      sort: REQUEST_LIST_SORT.NEWEST_FIRST,
    });
    expect(getRequestReviewQueueFilter(REQUEST_REVIEW_QUEUE.BLOCKED).unsupportedReason).toContain("Funcionalidad en preparación");
  });

  it("parsea filtros compartibles desde query params de revisión", () => {
    expect(parseRequestReviewQueue("pending-level-1")).toBe(REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1);
    expect(parseRequestReviewQueue("unknown")).toBeUndefined();
    expect(parseRequestStatusFilter("IN_VALIDATION")).toBe(REQUEST_STATUS.IN_VALIDATION);
    expect(parseRequestStatusFilter("unknown")).toBeUndefined();
    expect(parseRequestListSort("OLDEST_FIRST")).toBe(REQUEST_LIST_SORT.OLDEST_FIRST);
    expect(parseRequestListSort("unknown")).toBe(REQUEST_LIST_SORT.NEWEST_FIRST);
  });

  it("calcula conteos de tarjetas GIOF sin inventar bloqueos no soportados", () => {
    const submitted = makeRequest({ id: "submitted", status: REQUEST_STATUS.SUBMITTED });
    const validation = makeRequest({ id: "validation", status: REQUEST_STATUS.IN_VALIDATION });
    const observed = makeRequest({ id: "observed", status: REQUEST_STATUS.OBSERVED });

    expect(getRequestReviewQueueCount([submitted, validation, observed], REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1)).toBe(1);
    expect(getRequestReviewQueueCount([submitted, validation, observed], REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2)).toBe(1);
    expect(getRequestReviewQueueCount([submitted, validation, observed], REQUEST_REVIEW_QUEUE.OBSERVED_RETURNED)).toBe(1);
    expect(getRequestReviewQueueCount([submitted, validation, observed], REQUEST_REVIEW_QUEUE.BLOCKED)).toBe(0);
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

  it("obtiene etiqueta y contraparte para cola de pagos", () => {
    expect(getPaymentQueueStatusLabel(REQUEST_STATUS.APPROVED)).toBe("Pendiente de pago");
    expect(getPaymentQueueStatusLabel(REQUEST_STATUS.PAID)).toBe("Pagado");
    expect(getPaymentRequestParty(makeRequest({ supplier_name: "Proveedor SAC" }))).toBe("Proveedor SAC");
    expect(getPaymentRequestParty(makeRequest({ beneficiary_name: "Beneficiario" }))).toBe("Beneficiario");
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
