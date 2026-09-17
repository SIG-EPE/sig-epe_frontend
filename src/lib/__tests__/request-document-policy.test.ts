import { describe, expect, it } from "vitest";
import { evaluateRequestEvidence } from "@/lib/request-document-policy";

const request = { id: "r", request_type: "SUPPLIER_PAYMENT", currency: "PEN", requested_amount: "2500.01", declares_rus: null, declares_casa_de_retiro: null, uit_year_applied: 2026, uit_amount_applied: "5000.00" };
const invoice = { id: "d", payment_request_id: "r", document_category: "INVOICE", upload_status: "PERMANENT", mime_type: "application/pdf" };
const pdf = { ...invoice, id: "c", document_category: "CONTRACT" };
describe("backend-aligned evidence without OCR prerequisite", () => {
  it("keeps contract advisory separate from primary eligibility and completeness", () => {
    expect(evaluateRequestEvidence(request, [pdf], []).primarySatisfied).toBe(false);
    expect(evaluateRequestEvidence(request, [invoice], []).contractRecommended).toBe(true);
    expect(evaluateRequestEvidence(request, [invoice], []).contractRequired).toBe(false);
    expect(evaluateRequestEvidence(request, [invoice], []).contractSatisfied).toBe(true);
    expect(evaluateRequestEvidence(request, [invoice, pdf], []).contractSatisfied).toBe(true);
    expect(evaluateRequestEvidence({ ...request, requested_amount: "2499.99" }, [invoice], []).contractRecommended).toBe(false);
  });
  it.each(["SALES_RECEIPT", "CASH_RECEIPT"])("requires the matching declaration for %s", (category) => {
    const document = { ...invoice, document_category: category };
    expect(evaluateRequestEvidence(request, [document], []).primarySatisfied).toBe(false);
    expect(evaluateRequestEvidence({ ...request, declares_rus: category === "SALES_RECEIPT", declares_casa_de_retiro: category === "CASH_RECEIPT" }, [document], []).primarySatisfied).toBe(true);
  });
  it("classifies only unambiguous same-request legacy receipt links", () => {
    const document = { ...invoice, document_category: "RECEIPT" };
    const receipt = { request_id: "r", document_id: "d", receipt_type: "INVOICE" };
    expect(evaluateRequestEvidence(request, [document], [receipt]).primarySatisfied).toBe(true);
    expect(evaluateRequestEvidence(request, [document], [{ ...receipt, request_id: "foreign" }]).primarySatisfied).toBe(false);
    expect(evaluateRequestEvidence(request, [document], [receipt, { ...receipt, receipt_type: "SALES_RECEIPT" }]).primarySatisfied).toBe(false);
  });
  it("requires an actual linked reimbursement receipt, not PXQ or OCR success", () => {
    const reimbursement = { ...request, request_type: "REIMBURSEMENT" };
    const receipt = { request_id: "r", document_id: "d", receipt_type: "INVOICE" };
    expect(evaluateRequestEvidence(reimbursement, [invoice], [receipt]).primarySatisfied).toBe(true);
    expect(evaluateRequestEvidence(reimbursement, [invoice], []).primarySatisfied).toBe(false);
    for (const document of [{ ...invoice, deleted_at: "2026-01-01" }, { ...invoice, upload_status: "TEMPORARY" }, { ...invoice, payment_request_id: "foreign" }, { ...invoice, document_category: "PXQ" }]) {
      expect(evaluateRequestEvidence(reimbursement, [document], [receipt]).primarySatisfied).toBe(false);
    }
  });
  it("prefers historical UIT and omits advisory when currency or UIT cannot determine it", () => {
    expect(evaluateRequestEvidence(request, [invoice], [], "6000.00").contractRecommended).toBe(true);
    expect(evaluateRequestEvidence({ ...request, uit_amount_applied: null }, [invoice, pdf], []).contractRecommended).toBeNull();
    expect(evaluateRequestEvidence({ ...request, currency: "USD", uit_amount_applied: null }, [invoice], []).contractRecommended).toBeNull();
    expect(evaluateRequestEvidence({ ...request, currency: null }, [invoice], []).contractRecommended).toBeNull();
  });
  it("uses annual UIT only when the immutable snapshot is wholly absent", () => {
    const draft = { ...request, uit_year_applied: null, uit_amount_applied: null };
    expect(evaluateRequestEvidence(draft, [invoice], [], "5500.00").contractRecommended).toBe(false);
    expect(evaluateRequestEvidence({ ...draft, requested_amount: "2750.00" }, [invoice], [], "5500.00").contractRecommended).toBe(true);
    expect(evaluateRequestEvidence({ ...draft, uit_year_applied: 2026 }, [invoice], [], "9000.00").contractRecommended).toBeNull();
  });
  it("keeps unresolved and missing UIT nonblocking without an advisory", () => {
    const draft = { ...request, uit_year_applied: null, uit_amount_applied: null };
    expect(evaluateRequestEvidence(draft, [invoice], [], undefined).contractRecommended).toBeNull();
    expect(evaluateRequestEvidence(draft, [invoice], [], null).contractRecommended).toBeNull();
    expect(evaluateRequestEvidence(draft, [invoice], [], null).contractSatisfied).toBe(true);
  });
  it("keeps registered primary evidence satisfied while annual UIT is resolved", () => {
    const draft = { ...request, requested_amount: "1000.00", uit_year_applied: null, uit_amount_applied: null };
    const evidence = evaluateRequestEvidence(draft, [invoice], [], "5500.00");
    expect(evidence.primarySatisfied).toBe(true);
    expect(evidence.contractSatisfied).toBe(true);
  });
});
