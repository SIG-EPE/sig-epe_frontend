import { describe, expect, it } from "vitest";
import { getRenditionReportReadiness } from "@/lib/rendition-report-readiness";
import type { PaymentRequest, RequestDocument, RequestRenditionReport } from "@/types/requests";

function fixture() {
  const request = { id: "rexan", request_type: "ADVANCE_SETTLEMENT", currency: "PEN", related_request_id: "advance",
    relatedRequest: { id: "advance", request_type: "ADVANCE", status: "PAID", requested_amount: 300, currency: "PEN" },
    allocations: [{ id: "target" }],
  } as PaymentRequest;
  const coverage = [{ request_allocation_id: "target", planned_amount: 300, row_total_amount: 0, row_count: 0, has_rows: false,
    expected_return_amount: 300, return_validation_status: "VALID", line_return: { id: "return", returned_amount: 300,
      justification: "Saldo efectivamente devuelto", return_proof_document_id: "proof", return_proof_filename: "proof.pdf",
      status: "DRAFT", validated_at: null } }];
  const report = { id: "report", request_id: "rexan", status: "DRAFT", currency: "PEN", rows: [],
    zero_expense_allocation_ids: ["target"], zero_expense_declaration_valid: true, allocation_coverage: coverage,
    totals: { total_amount: 0, missing_allocations: [], by_allocation: coverage },
  } as unknown as RequestRenditionReport;
  const documents = [{ id: "proof", payment_request_id: "rexan", scope_type: "ALLOCATION", request_allocation_id: "target",
    document_category: "RETURN_PROOF", upload_status: "PERMANENT" }] as RequestDocument[];
  return { request, report, documents };
}

describe("canonical global report eligibility", () => {
  it("accepts actual DRAFT refund record with canonical VALID coverage, without fabricated validation timestamp", () => {
    const { request, report, documents } = fixture();
    expect(getRenditionReportReadiness(request, report, documents)).toMatchObject({ eligible: true, returnRegistered: true });
  });

  const invalidProofs: Array<[string, Partial<RequestDocument>]> = [
    ["foreign request", { payment_request_id: "advance" }],
    ["foreign allocation", { request_allocation_id: "source" }],
    ["request-level scope", { scope_type: "REQUEST" }],
    ["missing scope", { scope_type: undefined }],
    ["deleted", { deleted_at: "2026-10-01" }],
    ["EXTRA", { document_purpose: "EXTRA" }],
    ["wrong category", { document_category: "RECEIPT" }],
    ["normalized wrong category", { document_category_normalized: "RECEIPT" }],
  ];
  it.each(invalidProofs)("rejects %s evidence", (_, patch) => {
    const { request, report, documents } = fixture();
    documents[0] = { ...documents[0], ...patch };
    expect(getRenditionReportReadiness(request, report, documents)).toMatchObject({ eligible: false, returnRegistered: false });
  });
  it("accepts normalized RETURN_PROOF", () => {
    const { request, report, documents } = fixture();
    documents[0] = { ...documents[0], document_category: "legacy", document_category_normalized: "RETURN_PROOF" };
    expect(getRenditionReportReadiness(request, report, documents).eligible).toBe(true);
  });
  it("preserves the administrative execution blocker even when the line expected return is zero", () => {
    const { request, report, documents } = fixture();
    report.allocation_coverage[0].expected_return_amount = 0;
    report.allocation_coverage[0].return_validation_status = "MISSING_EXECUTION";
    expect(getRenditionReportReadiness(request, report, documents).eligible).toBe(false);
  });
  it.each([0, -1, 299.99, 300.01, Number.NaN, Number.POSITIVE_INFINITY])("rejects nonmatching actual refund amount %s", (amount) => {
    const { request, report, documents } = fixture();
    report.allocation_coverage[0].line_return!.returned_amount = amount;
    expect(getRenditionReportReadiness(request, report, documents).eligible).toBe(false);
  });
  it("rejects missing justification, missing evidence and noncanonical coverage", () => {
    const { request, report, documents } = fixture();
    expect(getRenditionReportReadiness(request, report, []).eligible).toBe(false);
    report.allocation_coverage[0].line_return!.justification = " ";
    expect(getRenditionReportReadiness(request, report, documents).eligible).toBe(false);
    report.allocation_coverage[0].return_validation_status = "NOT_REQUIRED";
    expect(getRenditionReportReadiness(request, report, documents).eligible).toBe(false);
  });
  it.each(["proof", "return", "allocation"])("rejects duplicate %s rather than summing it twice", (duplicate) => {
    const { request, report, documents } = fixture();
    const first = report.allocation_coverage[0];
    first.line_return!.returned_amount = 150;
    request.allocations!.push({ ...request.allocations![0], id: "target2" });
    report.zero_expense_allocation_ids!.push("target2");
    documents.push({ ...documents[0], id: "proof2", request_allocation_id: "target2" });
    report.allocation_coverage.push({ ...first, request_allocation_id: duplicate === "allocation" ? "target" : "target2",
      line_return: { ...first.line_return!, id: duplicate === "return" ? "return" : "return2",
        return_proof_document_id: duplicate === "proof" ? "proof" : "proof2" } });
    expect(getRenditionReportReadiness(request, report, documents).eligible).toBe(false);
  });
  it.each(["source", "currency", "unpaid", "report", "target", "zero", "total"])("fails closed for unresolved/stale %s", (invalid) => {
    const { request, report, documents } = fixture();
    if (invalid === "source") request.relatedRequest!.id = "foreign";
    if (invalid === "currency") request.relatedRequest!.currency = "USD";
    if (invalid === "unpaid") request.relatedRequest!.status = "APPROVED";
    if (invalid === "report") report.request_id = "foreign";
    if (invalid === "target") request.allocations = [];
    if (invalid === "zero") report.zero_expense_declaration_valid = false;
    if (invalid === "total") report.totals.total_amount = null as unknown as number;
    expect(getRenditionReportReadiness(request, report, documents).eligible).toBe(false);
  });
});
