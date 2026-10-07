import { describe, expect, it } from "vitest";

import { parseSupplierDocumentEvidence } from "@/lib/requests";
import {
  REQUEST_DOCUMENT_CATEGORY,
  SUPPLIER_DOCUMENT_ACTIVITY_STATE,
  SUPPLIER_DOCUMENT_ELIGIBILITY_STATE,
  SUPPLIER_DOCUMENT_PROJECTION_REASON,
  SUPPLIER_DOCUMENT_PROJECTION_STATE,
} from "@/types/requests";

describe("supplier document evidence contract", () => {
  it("parses satisfied evidence with stable aggregate and document fields", () => {
    const parsed = parseSupplierDocumentEvidence({
      state: SUPPLIER_DOCUMENT_PROJECTION_STATE.READY,
      eligible: true,
      primary_satisfied: true,
      reason_code: null,
      allowed_categories: [REQUEST_DOCUMENT_CATEGORY.INVOICE],
      documents: [
        {
          id: "document-1",
          stored_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
          effective_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
          activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.ACTIVE,
          eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.ELIGIBLE,
          eligible: true,
          reason_code: null,
        },
      ],
    });

    expect(parsed.primary_satisfied).toBe(true);
    expect(parsed.documents[0]).toMatchObject({
      stored_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
      effective_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
      activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.ACTIVE,
      eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.ELIGIBLE,
      reason_code: null,
    });
  });

  it("parses unsatisfied evidence and preserves per-document reason codes", () => {
    const parsed = parseSupplierDocumentEvidence({
      state: SUPPLIER_DOCUMENT_PROJECTION_STATE.BLOCKED,
      eligible: false,
      primary_satisfied: false,
      reason_code:
        SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED,
      allowed_categories: [REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT],
      documents: [
        {
          id: "document-2",
          stored_category: REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
          effective_category: REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
          activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.INACTIVE,
          eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.INELIGIBLE,
          eligible: false,
          reason_code:
            SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_NOT_PERMANENT,
        },
      ],
    });

    expect(parsed).toMatchObject({
      state: SUPPLIER_DOCUMENT_PROJECTION_STATE.BLOCKED,
      eligible: false,
      primary_satisfied: false,
      reason_code:
        SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED,
    });
    expect(parsed.documents[0]?.reason_code).toBe(
      SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_NOT_PERMANENT,
    );
  });

  it("rejects unknown reason/category/activity/eligibility contract values", () => {
    expect(() =>
      parseSupplierDocumentEvidence({
        state: "READY",
        eligible: true,
        primary_satisfied: true,
        reason_code: null,
        allowed_categories: ["UNKNOWN"],
        documents: [],
      }),
    ).toThrow("respuesta de evidencia");
  });
});
