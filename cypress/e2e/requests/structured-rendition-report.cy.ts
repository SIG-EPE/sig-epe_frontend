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

function makeSettlementRequest(status: "DRAFT" | "SUBMITTED" | "CLOSED") {
  return {
    id: REQUEST_ID,
    request_code: "REXAN-CYP-001",
    sequential_number: "REXAN-CYP-001",
    request_type: "ADVANCE_SETTLEMENT",
    status,
    fiscal_year: 2026,
    requested_amount: 100,
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
    observed_at: null,
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
    allocations: [allocation],
    allocation_count: 1,
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
  const coverage = [{ request_allocation_id: ALLOCATION_ID, planned_amount: 100, row_total_amount: totalAmount, row_count: rows.length, has_rows: hasRows }];

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

function makeLoginResponse(user: MockUser) {
  return {
    accessToken: activeAccessToken,
    accessTokenExpiresAt: "2026-06-09T13:00:00.000Z",
    sessionExpiresAt: "2026-06-09T14:00:00.000Z",
    user,
    onboardingRequired: false,
  };
}

describe("Informe estructurado de rendición REXAN", () => {
  let currentUser: MockUser;
  let requestStatus: "DRAFT" | "SUBMITTED" | "CLOSED";
  let documents: MockDocument[];
  let reportRows: MockRenditionRow[];
  let reportStatus: string;

  beforeEach(() => {
    currentUser = requesterUser;
    requestStatus = "DRAFT";
    documents = [receiptDocument];
    reportRows = [];
    reportStatus = "DRAFT";

    cy.clearCookies();
    cy.clearLocalStorage();
    cy.task<string>("signTestJwt", { sub: requesterUser.id, role: requesterUser.role.code }).then((token) => {
      activeAccessToken = token;
      cy.setCookie("session_hint", "present");
      cy.setCookie("access_token", token);
    });

    cy.intercept("GET", `${API_BASE_URL}/auth/me`, () => ({ body: { data: currentUser } })).as("authMe");
    cy.intercept("POST", `${API_BASE_URL}/auth/refresh`, () => ({ body: { data: makeLoginResponse(currentUser) } })).as("refreshSession");
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}`, () => ({ body: { data: makeSettlementRequest(requestStatus) } })).as("getRequest");
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}/settlement-context`, () => ({
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
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}/documents`, () => ({ body: { data: documents } })).as("getDocuments");
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}/receipts`, () => ({
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
    cy.intercept("GET", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report`, () => ({
      body: { data: makeReport(reportRows, reportStatus, reportStatus === "EXPORTED" ? GENERATED_DOCUMENT_ID : null) },
    })).as("getReport");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/rows/from-receipt/${RECEIPT_ID}`, () => {
      reportRows = [makeOcrRow(), ...reportRows.filter((row) => row.request_receipt_id !== RECEIPT_ID)];
      return { body: { data: reportRows[0] } };
    }).as("addOcrRow");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/rows/manual`, () => {
      const row = makeManualRow(reportRows.length + 1, 20);
      reportRows = [...reportRows, row];
      return { body: { data: row } };
    }).as("addManualRow");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/validate`, () => {
      reportStatus = "READY";
      const report = makeReport(reportRows, reportStatus);
      return { body: { data: { ready: true, report, totals: report.totals, allocation_coverage: report.allocation_coverage, blockers: [] } } };
    }).as("validateReport");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/rendition-report/generate`, () => {
      reportStatus = "EXPORTED";
      documents = [receiptDocument, generatedDocument];
      return { body: { data: { report: makeReport(reportRows, reportStatus, GENERATED_DOCUMENT_ID), document: generatedDocument } } };
    }).as("generateReport");
    cy.intercept("PATCH", `${API_BASE_URL}/requests/${REQUEST_ID}`, () => ({ body: { data: makeSettlementRequest(requestStatus) } })).as("updateRequest");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/submit`, () => {
      requestStatus = "SUBMITTED";
      reportStatus = "SUBMITTED";
      return { body: { data: makeSettlementRequest(requestStatus) } };
    }).as("submitRequest");
    cy.intercept("POST", `${API_BASE_URL}/requests/${REQUEST_ID}/approve`, () => {
      requestStatus = "CLOSED";
      return { body: { data: makeSettlementRequest(requestStatus) } };
    }).as("approveRequest");
  });

  // @blocked — el detalle protegido redirige a /requests en el harness mockeado antes de montar la tarjeta.
  // Rehabilitar cuando el harness pueda hidratar una sesión aceptada por middleware + RouteAccessGuard sin backend real.
  it.skip("cubre contrato UI de filas OCR/manual generadas y aprobación exacta GIOF con API mockeada", () => {
    requestStatus = "SUBMITTED";
    reportRows = [makeOcrRow(), makeManualRow(1, 20)];
    reportStatus = "EXPORTED";
    documents = [receiptDocument, generatedDocument];

    cy.visit(`/requests/${REQUEST_ID}`);
    cy.wait(["@authMe", "@getRequest", "@getDocuments", "@getReport"]);

    cy.contains("REXAN-CYP-001", { timeout: 12000 }).should("be.visible");
    cy.get('[data-testid="structured-rendition-report-card"]').within(() => {
      cy.contains("Informe de rendición").should("be.visible");
      cy.contains("Proveedor OCR Cypress").should("be.visible");
      cy.contains("Lectura revisada").should("be.visible");
      cy.contains("Proveedor manual Cypress").should("be.visible");
      cy.contains("Ingreso manual").should("be.visible");
      cy.contains("Documento generado: Rendicion Cypress.xlsx").should("be.visible");
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
    cy.contains("Acciones de revisión", { timeout: 12000 }).should("be.visible");
    cy.contains("button", "Aprobar rendición").click();
    cy.get("#validated-spent-amount").type("100");
    cy.contains("Rendición exacta").should("be.visible");
    cy.get('[role="dialog"]').within(() => {
      cy.contains("button", "Aprobar rendición").click();
    });
    cy.wait("@approveRequest");
    cy.contains("Rendición aprobada correctamente", { timeout: 12000 }).should("be.visible");
    cy.contains("Resultado de rendición").should("be.visible");
  });
});
