import { describe, expect, it } from "vitest";

import { evaluateNonSupplierRequestEvidence } from "@/lib/request-document-policy";
import { REQUEST_DOCUMENT_CATEGORY_OPTIONS, getPlannedRequestDocumentCategories } from "@/lib/requests";
import { REQUEST_DOCUMENT_CATEGORY, REQUEST_TYPE } from "@/types/requests";

const reimbursement = {
  id: "request-1",
  request_type: "REIMBURSEMENT",
  currency: "PEN",
  requested_amount: "100.00",
};

const receiptDocument = {
  id: "document-1",
  payment_request_id: reimbursement.id,
  document_category: "RECEIPT",
  upload_status: "PERMANENT",
  mime_type: "application/pdf",
};

const linkedReceipt = {
  request_id: reimbursement.id,
  document_id: receiptDocument.id,
  receipt_type: "INVOICE",
};

describe("non-supplier request document policy", () => {
  it("deja intacto el selector real hasta aprobación y no extiende REXAN ni proveedor", () => {
    expect(REQUEST_DOCUMENT_CATEGORY_OPTIONS).toHaveLength(15);
    expect(REQUEST_DOCUMENT_CATEGORY_OPTIONS.map((option) => option.value)).not.toContain(REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET);
    expect(REQUEST_DOCUMENT_CATEGORY_OPTIONS.map((option) => option.value)).not.toContain(REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION);
    expect(getPlannedRequestDocumentCategories(REQUEST_TYPE.ADVANCE_SETTLEMENT)).toHaveLength(13);
    expect(getPlannedRequestDocumentCategories(REQUEST_TYPE.ADVANCE_SETTLEMENT).map((entry) => entry.category)).not.toContain(REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET);
    expect(getPlannedRequestDocumentCategories(REQUEST_TYPE.SUPPLIER_PAYMENT)).toEqual([]);
  });
  it("keeps reimbursement receipt-link behavior unchanged", () => {
    expect(
      evaluateNonSupplierRequestEvidence(
        reimbursement,
        [receiptDocument],
        [linkedReceipt],
      ).primarySatisfied,
    ).toBe(true);
    expect(
      evaluateNonSupplierRequestEvidence(reimbursement, [receiptDocument], [])
        .primarySatisfied,
    ).toBe(false);
  });

  it.each([
    { ...receiptDocument, deleted_at: "2026-01-01" },
    { ...receiptDocument, upload_status: "TEMPORARY" },
    { ...receiptDocument, payment_request_id: "foreign-request" },
    { ...receiptDocument, document_category: "PXQ" },
  ])("rejects inactive or unrelated reimbursement evidence", (document) => {
    expect(
      evaluateNonSupplierRequestEvidence(
        reimbursement,
        [document],
        [linkedReceipt],
      ).primarySatisfied,
    ).toBe(false);
  });

  it("keeps exact historical category mapping scoped to reimbursement", () => {
    const legacy = { ...receiptDocument, document_category: "RECEIPT" };

    expect(
      evaluateNonSupplierRequestEvidence(
        reimbursement,
        [legacy],
        [linkedReceipt, { ...linkedReceipt }],
      ).primarySatisfied,
    ).toBe(true);
    expect(
      evaluateNonSupplierRequestEvidence(
        reimbursement,
        [legacy],
        [{ ...linkedReceipt, request_id: "foreign-request" }],
      ).primarySatisfied,
    ).toBe(false);
  });

  it("contains no supplier primary eligibility result", () => {
    const supplier = {
      ...reimbursement,
      request_type: "SUPPLIER_PAYMENT",
    };
    const typedPrimary = {
      ...receiptDocument,
      document_category: "INVOICE",
    };

    expect(
      evaluateNonSupplierRequestEvidence(supplier, [typedPrimary], [])
        .primarySatisfied,
    ).toBe(false);
  });
});
