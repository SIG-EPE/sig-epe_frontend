// cypress/e2e/requests/structured-rendition-report.cy.ts
// Smoke E2E con API interceptada para informe estructurado de rendición REXAN.

export {};

interface MockRole {
  code: string;
  name: string;
}

interface MockUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  epeDni: string;
  onboardingCompleted: boolean;
  authSource: "LOCAL";
  role: MockRole;
  roles: MockRole[];
}

interface MockDocument {
  id: string;
  payment_request_id: string;
  document_category: string;
  safe_filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_provider: string;
  upload_status: string;
  created_at: string;
}

interface MockRenditionRow {
  id: string;
  report_id: string;
  request_id: string;
  request_allocation_id: string;
  request_document_id: string;
  request_receipt_id: string | null;
  request_ocr_extraction_id: string | null;
  row_type: string;
  purchase_date: string;
  provider_name: string;
  receipt_number: string | null;
  detail: string;
  amount: number;
  currency: string;
  review_status: string;
  source_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface MockReport {
  id: string;
  request_id: string;
  status: string;
  total_amount: number;
  currency: string;
  settlement_report_document_id: string | null;
  drive_sync_status: string;
  drive_sync_error: string | null;
  submitted_at: string | null;
  exported_at: string | null;
  rows: MockRenditionRow[];
  totals: {
    total_amount: number;
    by_allocation: Array<{ request_allocation_id: string; planned_amount: number; row_total_amount: number; row_count: number; has_rows: boolean }>;
    missing_allocations: string[];
  };
  allocation_coverage: Array<{ request_allocation_id: string; planned_amount: number; row_total_amount: number; row_count: number; has_rows: boolean }>;
  export_pending_state?: string;
  can_retry_generation?: boolean;
}

const REQUEST_ID = "rexan-cypress-structured-1";
const ADVANCE_ID = "advance-cypress-structured-1";
const ALLOCATION_ID = "allocation-cypress-structured-1";
const RECEIPT_DOCUMENT_ID = "document-receipt-cypress-1";
const GENERATED_DOCUMENT_ID = "document-report-cypress-1";
const RECEIPT_ID = "receipt-cypress-1";
const TODAY = "2026-06-09T12:00:00.000Z";
const API_BASE_URL = "http://localhost:3001";
let activeAccessToken = "cypress-access-token";

const requesterUser: MockUser = {
  id: "user-requester-cypress",
  firstName: "Solicitante",
  lastName: "Cypress",
  email: "solicitante.cypress@example.test",
  epeDni: "00000002",
  onboardingCompleted: true,
  authSource: "LOCAL",
  role: { code: "SOLICITANTE_EPE", name: "Solicitante EPE" },
  roles: [{ code: "SOLICITANTE_EPE", name: "Solicitante EPE" }],
};

const giofUser: MockUser = {
  id: "user-giof-cypress",
  firstName: "Gestor",
  lastName: "Cypress",
  email: "giof.cypress@example.test",
  epeDni: "00000005",
  onboardingCompleted: true,
  authSource: "LOCAL",
  role: { code: "GIOF_GESTOR", name: "GIOF Gestor" },
  roles: [{ code: "GIOF_GESTOR", name: "GIOF Gestor" }],
};

const receiptDocument: MockDocument = {
  id: RECEIPT_DOCUMENT_ID,
  payment_request_id: REQUEST_ID,
  document_category: "RECEIPT",
  safe_filename: "comprobante-cypress.pdf",
  original_filename: "Comprobante Cypress.pdf",
  mime_type: "application/pdf",
  size_bytes: 2048,
  storage_provider: "LOCAL",
  upload_status: "PERMANENT",
  created_at: TODAY,
};

const generatedDocument: MockDocument = {
  id: GENERATED_DOCUMENT_ID,
  payment_request_id: REQUEST_ID,
  document_category: "SETTLEMENT_REPORT",
  safe_filename: "rendicion-cypress.xlsx",
  original_filename: "Rendicion Cypress.xlsx",
  mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size_bytes: 4096,
  storage_provider: "LOCAL",
  upload_status: "PERMANENT",
  created_at: TODAY,
};

const planningLine = {
  id: "planning-line-cypress-1",
  line_code: "POA-CYP-001",
  resource_description: "Materiales para taller Cypress",
  total_cost: 1000,
  status: "ACTIVE",
  fiscal_year: { id: "fy-2026", year: 2026, status: "ACTIVE" },
  org_unit: { id: "ou-cypress", code: "OU-CYP", name: "Unidad Cypress" },
  category: { id: "cat-cypress", code: "CAT", name: "Categoría Cypress" },
  program: { id: "program-cypress", code: "PROG", name: "Programa Cypress" },
  action: { id: "action-cypress", name: "Acción Cypress" },
  territory: { id: "territory-cypress", name: "Territorio Cypress" },
  monthly_summary: [],
  funding_sources: [{ id: "fs-cypress", funding_source_id: "fs-cypress", code: "F1", name: "Fuente Cypress", allocated_amount: 100, percentage: 100 }],
  financiers: [{ id: "fs-cypress", funding_source_id: "fs-cypress", code: "F1", name: "Fuente Cypress", allocated_amount: 100, percentage: 100 }],
};

const allocation = {
  id: ALLOCATION_ID,
  payment_request_id: REQUEST_ID,
  budget_planning_line_id: planningLine.id,
  amount: 100,
  currency: "PEN",
  budget_month: 6,
  fiscal_year: 2026,
  org_unit_id: "ou-cypress",
  sort_order: 1,
  budgetPlanningLine: planningLine,
  planning_line: planningLine,
  org_unit: { id: "ou-cypress", code: "OU-CYP", name: "Unidad Cypress" },
  funding_sources: planningLine.funding_sources,
  financiers: planningLine.financiers,
  payment_execution: null,
};

const secondAllocation = {
  ...allocation,
  id: "allocation-cypress-structured-2",
  budget_planning_line_id: "planning-line-cypress-2",
  amount: 50,
  sort_order: 2,
  budgetPlanningLine: { ...planningLine, id: "planning-line-cypress-2", line_code: "POA-CYP-002", resource_description: "Movilidad regional Cypress" },
  planning_line: { ...planningLine, id: "planning-line-cypress-2", line_code: "POA-CYP-002", resource_description: "Movilidad regional Cypress" },
};

const originalAdvance = {
  id: ADVANCE_ID,
  request_code: "ANT-CYP-001",
  sequential_number: "ANT-CYP-001",
  request_type: "ADVANCE",
  status: "PAID",
  requested_amount: 100,
  currency: "PEN",
  concept: "Anticipo original para smoke Cypress",
  requester_id: requesterUser.id,
  created_at: TODAY,
};

function makeSettlementRequest(status: "DRAFT" | "OBSERVED" | "SUBMITTED" | "CLOSED", requestType = "ADVANCE_SETTLEMENT") {
  return {
    id: REQUEST_ID,
    request_code: "REXAN-CYP-001",
    sequential_number: "REXAN-CYP-001",
    request_type: requestType,
    status,
    fiscal_year: 2026,
    requested_amount: 150,
    currency: "PEN",
    concept: "Rendición estructurada Cypress",
    requester_id: requesterUser.id,
    requester: { id: requesterUser.id, firstName: requesterUser.firstName, lastName: requesterUser.lastName, email: requesterUser.email },
    budget_planning_line_id: planningLine.id,
    budgetPlanningLine: planningLine,
    budget_month: 6,
    organizational_unit_id: "ou-cypress",
    organizationalUnit: { id: "ou-cypress", code: "OU-CYP", name: "Unidad Cypress" },
    scheduled_rendition_at: "2026-06-30",
    related_request_id: ADVANCE_ID,
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: "Solicitante Cypress",
    beneficiary_document_type: "DNI",
    beneficiary_document_number: "00000002",
    bank_code: "BCP",
    bank_name: "Banco de Crédito del Perú",
    account_type: "SAVINGS",
    bank_account: "1912345678901",
    bank_cci: "00219100123456789012",
    submitted_at: status === "DRAFT" ? null : TODAY,
    observed_at: status === "OBSERVED" ? TODAY : null,
    approved_at: status === "CLOSED" ? TODAY : null,
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    rexan_outcome: status === "CLOSED" ? "EXACT" : null,
    rexan_spent_amount: status === "CLOSED" ? 100 : null,
    rexan_balance_amount: status === "CLOSED" ? 0 : null,
    rexan_balance_locked_at: status === "CLOSED" ? TODAY : null,
    rexan_return_proof_document_id: null,
    notes: null,
    created_at: TODAY,
    updated_at: TODAY,
    documents: [receiptDocument],
    allocations: [allocation, secondAllocation],
    allocation_count: 2,
    statusHistory: [],
    observations: [],
    payment: null,
    relatedRequest: originalAdvance,
    advanceSettlements: [],
  };
}

function makeReport(rows: MockRenditionRow[], status = "DRAFT", settlementReportDocumentId: string | null = null): MockReport {
  const totalAmount = rows.reduce((total, row) => total + row.amount, 0);
  const hasRows = rows.length > 0;
  const coverage = [{
    request_allocation_id: ALLOCATION_ID,
    planned_amount: 100,
    row_total_amount: totalAmount,
    row_count: rows.length,
    has_rows: hasRows,
    return_validation_status: "MISSING_EXECUTION",
    expected_return_amount: 0,
    returned_amount: 0,
    line_return: null,
  }];

  return {
    id: "report-cypress-1",
    request_id: REQUEST_ID,
    status,
    total_amount: totalAmount,
    currency: "PEN",
    settlement_report_document_id: settlementReportDocumentId,
    drive_sync_status: "SYNCED",
    drive_sync_error: null,
    submitted_at: status === "SUBMITTED" ? TODAY : null,
    exported_at: status === "EXPORTED" ? TODAY : null,
    rows,
    totals: { total_amount: totalAmount, by_allocation: coverage, missing_allocations: hasRows ? [] : [ALLOCATION_ID] },
    allocation_coverage: coverage,
  };
}

function makeManualRow(index: number, amount: number): MockRenditionRow {
  return {
    id: `manual-row-cypress-${index}`,
    report_id: "report-cypress-1",
    request_id: REQUEST_ID,
    request_allocation_id: ALLOCATION_ID,
    request_document_id: RECEIPT_DOCUMENT_ID,
    request_receipt_id: null,
    request_ocr_extraction_id: null,
    row_type: "MANUAL_EXTRA",
    purchase_date: "2026-06-09",
    provider_name: "Proveedor manual Cypress",
    receipt_number: `M-${index}`,
    detail: "Material adicional registrado manualmente",
    amount,
    currency: "PEN",
    review_status: "REVIEWED",
    source_snapshot: null,
    created_at: TODAY,
    updated_at: TODAY,
  };
}

function makeOcrRow(): MockRenditionRow {
  return {
    id: "ocr-row-cypress-1",
    report_id: "report-cypress-1",
    request_id: REQUEST_ID,
    request_allocation_id: ALLOCATION_ID,
    request_document_id: RECEIPT_DOCUMENT_ID,
    request_receipt_id: RECEIPT_ID,
    request_ocr_extraction_id: "ocr-extraction-cypress-1",
    row_type: "OCR_RECEIPT",
    purchase_date: "2026-06-08",
    provider_name: "Proveedor OCR Cypress",
    receipt_number: "F001-123",
    detail: "Compra detectada por OCR",
    amount: 80,
    currency: "PEN",
    review_status: "REVIEWED",
    source_snapshot: { source: "cypress" },
    created_at: TODAY,
    updated_at: TODAY,
  };
}

function selectFirstOptionInSection(sectionText: string): void {
  cy.contains(sectionText)
    .parents("section")
    .first()
    .within(() => {
      cy.get("button").contains("Selecciona").first().click();
    });
  cy.get('[role="option"]').first().click();
}

function fillManualRow(): void {
  cy.get("#manual-row-date").type("2026-06-09");
  cy.get("#manual-row-provider").type("Proveedor manual Cypress");
  cy.get("#manual-row-receipt").type("M-1");
  cy.get("#manual-row-amount").type("20");
  selectFirstOptionInSection("Agregar fila manual");
  selectFirstOptionInSection("Agregar fila manual");
  cy.get("#manual-row-detail").type("Material adicional registrado manualmente");
}

function selectReceiptUploadContext(): void {
  cy.get("#document-category").click();
  cy.contains('[role="option"]', "Comprobante").click();
  cy.get("#receipt-allocation").click();
  cy.get('[role="option"]').contains("POA-CYP-001").click();
}

function makeUploadFiles(count: number, prefix = "comprobante") {
  return Array.from({ length: count }, (_, index) => ({
    contents: Cypress.Buffer.from(`pdf-${index + 1}`),
    fileName: `${prefix}-${index + 1}.pdf`,
    mimeType: "application/pdf",
  }));
}

function makeLoginResponse(user: MockUser) {
  return {
    accessToken: activeAccessToken,
    accessTokenExpiresAt: "2027-06-09T13:00:00.000Z",
    sessionExpiresAt: "2027-06-09T14:00:00.000Z",
    user,
    onboardingRequired: false,
  };
}

describe("Informe estructurado de rendición REXAN", () => {
  let currentUser: MockUser;
  let requestStatus: "DRAFT" | "OBSERVED" | "SUBMITTED" | "CLOSED";
  let documents: MockDocument[];
  let reportRows: MockRenditionRow[];
  let reportStatus: string;
  let reportExportPendingState: string | undefined;
  let reportCanRetryGeneration: boolean | undefined;
  let validationBlockers: Array<{ code: string; message: string; request_allocation_id?: string }>;
  let uploadAttempts: Record<string, number>;
  let uploadRequestCount: number;
  let requestType: string;
  let controlledFailureRequestNumbers: number[];
  let failedStorageFilenames: Set<string>;
  let uploadResponseDelayMs: number;

  beforeEach(() => {
    currentUser = requesterUser;
    requestStatus = "DRAFT";
    documents = [receiptDocument];
    reportRows = [];
    reportStatus = "DRAFT";
    reportExportPendingState = undefined;
    reportCanRetryGeneration = undefined;
    validationBlockers = [];
    uploadAttempts = {};
    uploadRequestCount = 0;
    requestType = "ADVANCE_SETTLEMENT";
    controlledFailureRequestNumbers = [5, 12];
    failedStorageFilenames = new Set();
    uploadResponseDelayMs = 0;

    cy.clearCookies();
    cy.clearLocalStorage();
    cy.task<string>("signTestJwt", { sub: requesterUser.id, role: requesterUser.role.code }).then((token) => {
      activeAccessToken = token;
      cy.setCookie("session_hint", "present");
      cy.setCookie("access_token", token);
    });

    cy.intercept("GET", `${API_BASE_URL}/auth/me`, (interception) => interception.reply({ body: { data: currentUser } })).as("authMe");
    cy.intercept("POST", `${API_BASE_URL}/auth/refresh`, (interception) => interception.reply({ body: { data: makeLoginResponse(currentUser) } })).as("refreshSession");
    cy.intercept("GET", new RegExp(`${API_BASE_URL}/requests/[^/]+$`), (interception) => interception.reply({ body: { data: makeSettlementRequest(requestStatus, requestType) } })).as("getRequest");
    cy.intercept("GET", new RegExp(`${API_BASE_URL}/requests/[^/]+/settlement-context$`), (interception) => interception.reply({
      body: {
        data: {
          settlement: makeSettlementRequest(requestStatus),
          original_advance: originalAdvance,
          original_advance_documents: [],
          payment: { paid_at: "2026-06-01", amount_paid: 100, proof_document_id: null, proof_pending: false, details_pending: false, operation_reference: "OP-CYP" },
          due_date: { scheduled_rendition_at: "2026-06-30", due_date: "2026-06-30", days_until_due: 21, is_overdue: false },
          rexan: { outcome: null, spent_amount: null, balance_amount: null, balance_locked_at: null, return_proof_document_id: null, classified_by_id: null },
          settlement_documents: documents,
        },
      },
    })).as("getSettlementContext");
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}/documents`, (interception) => interception.reply({ body: { data: documents } })).as("getDocuments");
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}/receipts`, (interception) => interception.reply({
      body: {
        data: reportRows.some((row) => row.request_receipt_id === RECEIPT_ID)
          ? []
          : [{
            receipt: {
              id: RECEIPT_ID,
              request_id: REQUEST_ID,
              document_id: RECEIPT_DOCUMENT_ID,
              receipt_type: "INVOICE",
              issuer_document_type: "RUC",
              issuer_document_number: "20123456789",
              issuer_name: "Proveedor OCR Cypress",
              series: "F001",
              number: "123",
              issue_date: "2026-06-08",
              amount: 80,
              currency: "PEN",
              duplicate_status: "UNIQUE",
              ocr_status: "SUCCESS",
              corrected_fields: null,
              confirmed_by_id: requesterUser.id,
              confirmed_at: TODAY,
            },
            latest_extraction: { id: "ocr-extraction-cypress-1", provider: "mock", status: "SUCCESS", confidence: 0.98, error_message: null, extracted_fields: {}, created_at: TODAY, updated_at: TODAY },
            duplicate_candidates: [],
          }],
      },
    })).as("getReceipts");
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report`, (interception) => interception.reply({
      body: { data: { ...makeReport(reportRows, reportStatus, reportStatus === "EXPORTED" ? GENERATED_DOCUMENT_ID : null), export_pending_state: reportExportPendingState, can_retry_generation: reportCanRetryGeneration } },
    })).as("getReport");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/rows/from-receipt/${RECEIPT_ID}`, (interception) => {
      reportRows = [makeOcrRow(), ...reportRows.filter((row) => row.request_receipt_id !== RECEIPT_ID)];
      interception.reply({ body: { data: reportRows[0] } });
    }).as("addOcrRow");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/rows/manual`, (interception) => {
      const row = makeManualRow(reportRows.length + 1, 20);
      reportRows = [...reportRows, row];
      interception.reply({ body: { data: row } });
    }).as("addManualRow");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/validate`, (interception) => {
      reportStatus = validationBlockers.length === 0 ? "READY" : "DRAFT";
      const report = makeReport(reportRows, reportStatus);
      interception.reply({ body: { data: { ready: validationBlockers.length === 0, report, totals: report.totals, allocation_coverage: report.allocation_coverage, blockers: validationBlockers } } });
    }).as("validateReport");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/generate`, (interception) => {
      reportStatus = "EXPORTED";
      documents = [receiptDocument, generatedDocument];
      interception.reply({ body: { data: { report: makeReport(reportRows, reportStatus, GENERATED_DOCUMENT_ID), document: generatedDocument } } });
    }).as("generateReport");
    cy.intercept("PATCH", `${API_BASE_URL}/requests/${REQUEST_ID}`, (interception) => interception.reply({ body: { data: makeSettlementRequest(requestStatus) } })).as("updateRequest");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/submit`, (interception) => {
      requestStatus = "SUBMITTED";
      reportStatus = "SUBMITTED";
      interception.reply({ body: { data: makeSettlementRequest(requestStatus) } });
    }).as("submitRequest");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/approve`, (interception) => {
      requestStatus = "CLOSED";
      interception.reply({ body: { data: makeSettlementRequest(requestStatus) } });
    }).as("approveRequest");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/documents`, (request) => {
      uploadRequestCount += 1;
      const formDataText = String(request.body);
      const nameMatch = formDataText.match(/name="file"; filename="([^"]+)"/);
      const filename = nameMatch?.[1] ?? `comprobante-${Object.keys(uploadAttempts).length + 1}.pdf`;
      uploadAttempts[filename] = (uploadAttempts[filename] ?? 0) + 1;
      const index = Number(filename.match(/(\d+)/)?.[1] ?? 0);
      if (controlledFailureRequestNumbers.includes(uploadRequestCount)) {
        request.reply({
          delay: uploadResponseDelayMs,
          statusCode: uploadRequestCount === controlledFailureRequestNumbers[0] ? 429 : 500,
          headers: uploadRequestCount === controlledFailureRequestNumbers[0] ? { "Retry-After": "0" } : {},
          body: { statusCode: uploadRequestCount === controlledFailureRequestNumbers[0] ? 429 : 500, code: uploadRequestCount === controlledFailureRequestNumbers[0] ? "DRIVE_RATE_LIMITED" : "UPLOAD_FAILED", message: "Fallo temporal controlado", error: "Upload error", retryable: true, retry_after_ms: 0 },
        });
        return;
      }
      const document = {
        ...receiptDocument,
        id: `uploaded-${filename}-${uploadAttempts[filename]}`,
        original_filename: filename,
        safe_filename: filename,
        request_allocation_id: ALLOCATION_ID,
        upload_status: failedStorageFilenames.has(filename) ? "FAILED" : "PERMANENT",
      };
      documents = [...documents, document];
      request.reply({ delay: uploadResponseDelayMs, statusCode: 201, body: { data: document } });
    }).as("uploadDocument");
  });

  it("integra shell V2, multi-línea, responsive/zoom y estados MISSING_EXECUTION/EXPORT sin credenciales reales", () => {
    validationBlockers = [{ code: "LINE_RETURN_MISSING_EXECUTION", message: "Falta base pagada", request_allocation_id: ALLOCATION_ID }];
    reportRows = [makeOcrRow()];
    cy.viewport(320, 720);
    cy.visit(`/requests/${REQUEST_ID}/edit?step=review`);
    cy.wait(["@authMe", "@getRequest", "@getSettlementContext", "@getDocuments", "@getReceipts", "@getReport"]);

    cy.get('form[data-settlement-preparation-experience="v2-foundation"]').should("be.visible");
    cy.contains("button", "Revisa el anticipo").should("have.css", "min-height", "44px");
    cy.contains("button", "Registra comprobantes").should("be.visible");
    cy.contains("button", "Genera y envía").should("be.visible");
    cy.get('[data-testid^="settlement-line-task-"]').should("have.length", 2);
    cy.contains("Falta registrar o vincular la base efectivamente pagada del anticipo").scrollIntoView().should("be.visible");
    cy.screenshot("rexan-smoke-320-shell", { capture: "viewport" });

    cy.viewport(375, 812);
    cy.get('[aria-label="Preparación de rendición"]').scrollIntoView().should("be.visible");
    cy.screenshot("rexan-smoke-375-shell", { capture: "viewport" });
    cy.viewport(1280, 900);
    cy.window().then((window) => { window.document.documentElement.style.zoom = "2"; });
    cy.contains("button", "Genera y envía").scrollIntoView().should("be.visible");
    cy.window().then((window) => { window.document.documentElement.style.zoom = ""; });

    reportStatus = "EXPORT_PENDING";
    reportExportPendingState = "STALE_RETRY_AVAILABLE";
    reportCanRetryGeneration = true;
    cy.reload();
    cy.wait(["@authMe", "@getRequest", "@getReport"]);
    cy.contains("La generación anterior quedó atascada").scrollIntoView().should("be.visible");
    cy.contains("button", "Reintentar generación").scrollIntoView().should("be.visible");
  });

  it("procesa 20 uploads secuenciales, conserva parcial 429/500 y reintenta solo fallidos", () => {
    cy.viewport(1280, 900);
    cy.visit(`/requests/${REQUEST_ID}/edit?step=documents`);
    cy.wait(["@authMe", "@getRequest", "@getDocuments", "@getReceipts"]);

    selectReceiptUploadContext();
    cy.get("#request-document-file").selectFile(makeUploadFiles(20));
    cy.contains("button", "Adjuntar").click();

    cy.contains("18/20 archivos guardados", { timeout: 90000 }).should("be.visible");
    cy.contains("2 con error").should("be.visible");
    cy.screenshot("rexan-smoke-desktop-partial", { capture: "viewport" });
    cy.contains("button", "Reintentar fallidos").click();
    cy.contains("20/20 archivos guardados", { timeout: 90000 }).should("be.visible");
    cy.get("@uploadDocument.all").should("have.length", 22);
  });

  it("pausa después del archivo activo, protege navegación y reanuda en móvil", () => {
    controlledFailureRequestNumbers = [];
    uploadResponseDelayMs = 500;
    cy.viewport(375, 812);
    cy.visit(`/requests/${REQUEST_ID}/edit?step=documents`);
    cy.wait(["@authMe", "@getRequest", "@getDocuments", "@getReceipts"]);

    selectReceiptUploadContext();
    cy.get("#request-document-file").selectFile(makeUploadFiles(3, "pausa"));
    cy.contains("button", "Adjuntar").click();
    cy.contains("button", "Pausar después del actual").click();
    cy.contains("1/3 archivos guardados", { timeout: 15000 }).should("be.visible");
    cy.contains("2 en cola").should("be.visible");
    cy.contains("button", "Continuar cargas").should("be.visible");

    cy.document().then((document) => {
      const link = document.createElement("a");
      link.href = "/requests";
      link.textContent = "Salir de preparación";
      link.style.position = "fixed";
      link.style.left = "1rem";
      link.style.top = "1rem";
      link.style.zIndex = "9999";
      document.body.append(link);
    });
    cy.contains("a", "Salir de preparación").click();
    cy.get('[role="dialog"]').within(() => {
      cy.contains("¿Salir mientras hay archivos pendientes?").should("be.visible");
      cy.contains("button", "Seguir aquí").click();
    });
    cy.screenshot("rexan-smoke-375-pause-navigation-guard", { capture: "viewport" });

    cy.contains("button", "Continuar cargas").click();
    cy.contains("3/3 archivos guardados", { timeout: 15000 }).should("be.visible");
  });

  it("muestra éxito real en desktop y mantiene FAILED como incidencia en 320 px", () => {
    controlledFailureRequestNumbers = [];
    cy.viewport(1280, 900);
    cy.visit(`/requests/${REQUEST_ID}/edit?step=documents`);
    cy.wait(["@authMe", "@getRequest", "@getDocuments", "@getReceipts"]);
    selectReceiptUploadContext();
    cy.get("#request-document-file").selectFile(makeUploadFiles(1, "exito"));
    cy.contains("button", "Adjuntar").click();
    cy.contains("1/1 archivos guardados", { timeout: 15000 }).should("be.visible");
    cy.contains("1 documento adjuntado correctamente.").should("be.visible");
    cy.screenshot("rexan-smoke-desktop-success", { capture: "viewport" });

    cy.get('button[aria-label="Cerrar progreso de carga"]').click();
    cy.viewport(320, 720);
    failedStorageFilenames.add("drive-failed-1.pdf");
    selectReceiptUploadContext();
    cy.get("#request-document-file").selectFile(makeUploadFiles(1, "drive-failed"));
    cy.contains("button", "Adjuntar").click();
    cy.contains("1/1 archivos guardados", { timeout: 15000 }).should("be.visible");
    cy.contains("1 con incidencia").should("be.visible");
    cy.contains(/quedó guardado localmente.*incidencia.*Google Drive/i).should("be.visible");
    cy.screenshot("rexan-smoke-320-upload-status-failed", { capture: "viewport" });
  });

  it("mantiene fallback legacy y retorno observado editable por elegibilidad", () => {
    requestType = "ADVANCE";
    requestStatus = "DRAFT";
    cy.intercept("GET", `${API_BASE_URL}/requests/advance-cypress-legacy`, {
      body: { data: makeSettlementRequest("DRAFT", "ADVANCE") },
    }).as("getLegacyRequest");
    cy.visit("/requests/advance-cypress-legacy/edit?step=data");
    cy.wait(["@authMe", "@getLegacyRequest"]);
    cy.get('form[data-settlement-preparation-experience="legacy"]').should("be.visible");
    cy.get('[aria-label="Pasos de edición"]').should("be.visible");

    requestType = "ADVANCE_SETTLEMENT";
    requestStatus = "OBSERVED";
    reportStatus = "EXPORTED";
    documents = [receiptDocument, generatedDocument];
    cy.intercept("GET", `${API_BASE_URL}/requests/rexan-cypress-observed`, {
      body: { data: makeSettlementRequest("OBSERVED") },
    }).as("getObservedRequest");
    cy.visit("/requests/rexan-cypress-observed/edit?step=review");
    cy.wait(["@authMe", "@getObservedRequest", "@getReport"]);
    cy.get('form[data-settlement-preparation-experience="v2-foundation"]').should("be.visible");
    cy.contains("La rendición fue observada; puedes actualizar sustentos y regenerar el informe").scrollIntoView().should("be.visible");
    cy.contains("button", "Enviar corrección").should("be.visible");
  });

  it("cubre contrato UI de filas OCR/manual generadas y aprobación exacta GIOF con API mockeada", () => {
    requestStatus = "SUBMITTED";
    reportRows = [makeOcrRow(), makeManualRow(1, 20)];
    reportStatus = "EXPORTED";
    documents = [receiptDocument, generatedDocument];

    cy.visit(`/requests/${REQUEST_ID}`);
    cy.wait(["@authMe", "@getRequest", "@getDocuments", "@getReport"]);

    cy.contains("REXAN-CYP-001", { timeout: 12000 }).should("be.visible");
    cy.get('[data-testid="structured-rendition-report-card"]').scrollIntoView().within(() => {
      cy.contains("Informe de rendición").should("exist");
      cy.contains("Proveedor OCR Cypress").should("exist");
      cy.contains("Lectura revisada").should("exist");
      cy.contains("Proveedor manual Cypress").should("exist");
      cy.contains("Ingreso manual").should("exist");
    });

    currentUser = giofUser;
    requestStatus = "SUBMITTED";
    reportStatus = "SUBMITTED";
    cy.clearCookies();
    cy.task<string>("signTestJwt", { sub: giofUser.id, role: giofUser.role.code }).then((token) => {
      activeAccessToken = token;
      cy.setCookie("session_hint", "present");
      cy.setCookie("access_token", token);
      cy.visit(`/requests/${REQUEST_ID}`);
    });
    cy.wait(["@authMe", "@getRequest"]);
    cy.contains("Acciones de revisión", { timeout: 12000 }).scrollIntoView().should("be.visible");
    cy.contains("button", "Aprobar rendición").click();
    cy.get("#validated-spent-amount").type("150");
    cy.contains("Rendición exacta").should("be.visible");
    cy.get('[role="dialog"]').within(() => {
      cy.contains("button", "Aprobar rendición").click();
    });
    cy.wait("@approveRequest");
    cy.contains("Cerrada", { timeout: 12000 }).should("be.visible");
    cy.contains("Resultado de rendición").scrollIntoView().should("be.visible");
  });
});
