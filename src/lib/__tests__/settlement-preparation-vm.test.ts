import { describe, expect, it } from "vitest";

import {
  SETTLEMENT_LINE_TASK_STATE,
  SETTLEMENT_PREPARATION_CTA,
  SETTLEMENT_PREPARATION_STEP,
  buildSettlementPreparationVm,
} from "@/lib/settlement-preparation-vm";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_RENDITION_REPORT_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
  type RequestAllocation,
  type RequestDocument,
  type RequestReceiptReview,
  type RequestRenditionReport,
} from "@/types/requests";

function makeAllocation(id: string): RequestAllocation {
  return {
    id,
    payment_request_id: "rexan-1",
    budget_planning_line_id: `poa-${id}`,
    amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    budget_month: 7,
    fiscal_year: 2026,
    org_unit_id: "ou-1",
    sort_order: 1,
    budgetPlanningLine: null,
    planning_line: null,
    org_unit: null,
    documents: [],
    payment_execution: null,
  };
}

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "rexan-1",
    request_code: "REXAN-001",
    sequential_number: "1",
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    status: REQUEST_STATUS.DRAFT,
    fiscal_year: 2026,
    requested_amount: 200,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Rendición",
    requester_id: "user-1",
    budget_planning_line_id: null,
    budget_month: null,
    organizational_unit_id: null,
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
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    allocations: [makeAllocation("allocation-1"), makeAllocation("allocation-2")],
    ...overrides,
  };
}

function makeDocument(allocationId: string, overrides: Partial<RequestDocument> = {}): RequestDocument {
  return {
    id: `document-${allocationId}`,
    payment_request_id: "rexan-1",
    request_allocation_id: allocationId,
    document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    safe_filename: `${allocationId}.pdf`,
    original_filename: `${allocationId}.pdf`,
    mime_type: "application/pdf",
    size_bytes: 100,
    storage_provider: "DRIVE",
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    created_at: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function makeReceipt(allocationId: string, confirmed: boolean): RequestReceiptReview {
  return {
    receipt: {
      id: `receipt-${allocationId}`,
      request_id: "rexan-1",
      request_allocation_id: allocationId,
      document_id: `document-${allocationId}`,
      receipt_type: "INVOICE",
      issuer_document_type: null,
      issuer_document_number: null,
      issuer_name: "Proveedor",
      series: "F001",
      number: "1",
      issue_date: "2026-07-31",
      amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      duplicate_status: "CLEAR",
      ocr_status: "COMPLETED",
      corrected_fields: null,
      confirmed_by_id: confirmed ? "user-1" : null,
      confirmed_at: confirmed ? "2026-07-31T00:00:00.000Z" : null,
    },
    latest_extraction: null,
    duplicate_candidates: [],
  };
}

function makeReport(overrides: Partial<RequestRenditionReport> = {}): RequestRenditionReport {
  return {
    id: "report-1",
    request_id: "rexan-1",
    status: REQUEST_RENDITION_REPORT_STATUS.DRAFT,
    total_amount: 200,
    currency: REQUEST_CURRENCY.PEN,
    settlement_report_document_id: null,
    drive_sync_status: "PENDING",
    drive_sync_error: null,
    submitted_at: null,
    exported_at: null,
    rows: [
      {
        id: "row-1",
        report_id: "report-1",
        request_id: "rexan-1",
        request_allocation_id: "allocation-1",
        request_document_id: "document-allocation-1",
        request_receipt_id: "receipt-allocation-1",
        request_ocr_extraction_id: null,
        row_type: "OCR",
        purchase_date: "2026-07-31",
        provider_name: "Proveedor",
        receipt_number: "F001-1",
        detail: "Compra",
        amount: 100,
        currency: REQUEST_CURRENCY.PEN,
        review_status: "CONFIRMED",
        source_snapshot: null,
        created_at: "2026-07-31T00:00:00.000Z",
        updated_at: "2026-07-31T00:00:00.000Z",
      },
    ],
    totals: { total_amount: 100, by_allocation: [], missing_allocations: ["allocation-2"] },
    allocation_coverage: [
      { request_allocation_id: "allocation-1", planned_amount: 100, row_total_amount: 100, row_count: 1, has_rows: true },
      { request_allocation_id: "allocation-2", planned_amount: 100, row_total_amount: 0, row_count: 0, has_rows: false },
    ],
    ...overrides,
  };
}

describe("buildSettlementPreparationVm", () => {
  it("deriva exactamente tres pasos REXAN con etiquetas amigables", () => {
    const vm = buildSettlementPreparationVm({
      request: makeRequest(),
      activeStep: SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE,
      documents: [],
      receipts: [],
      report: null,
      resourcesReady: true,
      requestDataComplete: true,
      documentChecklistComplete: false,
    });

    expect(vm.steps.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE, label: "Revisa el anticipo" },
      { id: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS, label: "Registra comprobantes" },
      { id: SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT, label: "Genera y envía" },
    ]);
  });

  it("deriva estado y siguiente acción por línea desde documentos, recibos e informe", () => {
    const vm = buildSettlementPreparationVm({
      request: makeRequest(),
      activeStep: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS,
      documents: [makeDocument("allocation-1"), makeDocument("allocation-2")],
      receipts: [makeReceipt("allocation-1", true), makeReceipt("allocation-2", false)],
      report: makeReport(),
      resourcesReady: true,
      requestDataComplete: true,
      documentChecklistComplete: true,
    });

    expect(vm.lineTasks.map(({ id, state, nextAction }) => ({ id, state, nextAction }))).toEqual([
      { id: "allocation-1", state: SETTLEMENT_LINE_TASK_STATE.COMPLETE, nextAction: null },
      { id: "allocation-2", state: SETTLEMENT_LINE_TASK_STATE.NEEDS_CONFIRMATION, nextAction: "Confirma los datos del comprobante" },
    ]);
    expect(vm.pendingItems).toHaveLength(1);
    expect(vm.cta.kind).toBe(SETTLEMENT_PREPARATION_CTA.RESOLVE_PENDING);
    expect(vm.cta.targetStep).toBe(SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS);
    expect(vm.totals).toEqual({
      allocatedAmount: 200,
      reportedAmount: 100,
      differenceAmount: 100,
      currency: REQUEST_CURRENCY.PEN,
    });
  });

  it("dirige agregar al informe al paso Genera y envía sin mezclarlo con confirmar OCR", () => {
    const vm = buildSettlementPreparationVm({
      request: makeRequest({ allocations: [makeAllocation("allocation-1")] }),
      activeStep: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS,
      documents: [makeDocument("allocation-1")],
      receipts: [makeReceipt("allocation-1", true)],
      report: makeReport({ rows: [], totals: { total_amount: 0, by_allocation: [], missing_allocations: ["allocation-1"] }, allocation_coverage: [] }),
      resourcesReady: true,
      requestDataComplete: true,
      documentChecklistComplete: true,
    });

    expect(vm.lineTasks[0].state).toBe(SETTLEMENT_LINE_TASK_STATE.NEEDS_REPORT_ROW);
    expect(vm.pendingItems[0].targetStep).toBe(SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT);
  });

  it("mantiene generar y enviar bloqueados mientras los recursos autoritativos cargan", () => {
    const vm = buildSettlementPreparationVm({
      request: makeRequest(),
      activeStep: SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT,
      documents: [],
      receipts: [],
      report: null,
      resourcesReady: false,
      requestDataComplete: true,
      documentChecklistComplete: true,
    });

    expect(vm.readiness.isReady).toBe(false);
    expect(vm.locks.canGenerate).toBe(false);
    expect(vm.locks.canSubmit).toBe(false);
    expect(vm.cta.kind).toBe(SETTLEMENT_PREPARATION_CTA.WAIT_FOR_DATA);
  });

  it("mantiene el bloqueo de Extras separado de los pendientes principales", () => {
    const baseInput = {
      request: makeRequest(),
      activeStep: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS,
      documents: [],
      receipts: [],
      report: null,
      resourcesReady: false,
      requestDataComplete: true,
      documentChecklistComplete: false,
    };

    const withoutExtrasBlocker = buildSettlementPreparationVm(baseInput);
    const withExtrasBlocker = buildSettlementPreparationVm({ ...baseInput, extrasHasBlocker: true });

    expect(withoutExtrasBlocker.pendingItems.length).toBeGreaterThan(0);
    expect(withoutExtrasBlocker.extras.hasBlocker).toBe(false);
    expect(withExtrasBlocker.pendingItems).toEqual(withoutExtrasBlocker.pendingItems);
    expect(withExtrasBlocker.extras.hasBlocker).toBe(true);
  });

  it("preserva locks no editables y no ofrece mutaciones", () => {
    const vm = buildSettlementPreparationVm({
      request: makeRequest({ status: REQUEST_STATUS.SUBMITTED }),
      activeStep: SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT,
      documents: [],
      receipts: [],
      report: null,
      resourcesReady: true,
      requestDataComplete: true,
      documentChecklistComplete: true,
    });

    expect(vm.locks.isEditable).toBe(false);
    expect(vm.locks.canUpload).toBe(false);
    expect(vm.locks.canGenerate).toBe(false);
    expect(vm.locks.canSubmit).toBe(false);
    expect(vm.cta.kind).toBe(SETTLEMENT_PREPARATION_CTA.LOCKED);
  });

  it("habilita envío solo con informe exportado alineado y requisitos completos", () => {
    const report = makeReport({
      status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED,
      settlement_report_document_id: "settlement-report-1",
      rows: [
        ...makeReport().rows,
        { ...makeReport().rows[0], id: "row-2", request_allocation_id: "allocation-2", request_document_id: "document-allocation-2", request_receipt_id: "receipt-allocation-2" },
      ],
      totals: { total_amount: 200, by_allocation: [], missing_allocations: [] },
      allocation_coverage: [
        { request_allocation_id: "allocation-1", planned_amount: 100, row_total_amount: 100, row_count: 1, has_rows: true },
        { request_allocation_id: "allocation-2", planned_amount: 100, row_total_amount: 100, row_count: 1, has_rows: true },
      ],
    });
    const vm = buildSettlementPreparationVm({
      request: makeRequest(),
      activeStep: SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT,
      documents: [makeDocument("allocation-1"), makeDocument("allocation-2")],
      receipts: [makeReceipt("allocation-1", true), makeReceipt("allocation-2", true)],
      report,
      resourcesReady: true,
      requestDataComplete: true,
      documentChecklistComplete: true,
    });

    expect(vm.readiness.isReady).toBe(true);
    expect(vm.locks.canGenerate).toBe(false);
    expect(vm.locks.canSubmit).toBe(true);
    expect(vm.cta.kind).toBe(SETTLEMENT_PREPARATION_CTA.SUBMIT);
  });
});
