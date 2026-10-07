import { describe, expect, it } from "vitest";

import {
  PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL,
  REQUEST_DOCUMENT_CATEGORY_OPTIONS,
  getRequestDocumentAcceptedFormatsLabel,
  getRequestDocumentDisplayName,
  getRequiredDocumentChecklist,
} from "@/lib/requests";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_TYPE,
  type RequestDocument,
} from "@/types/requests";

const requestId = "supplier-request-1";

function document(
  category: RequestDocument["document_category"],
  overrides: Partial<RequestDocument> = {},
): RequestDocument {
  return {
    id: "document-1",
    payment_request_id: requestId,
    document_category: category,
    document_category_normalized: category,
    safe_filename: "archivo.pdf",
    original_filename: "Documento visible.pdf",
    mime_type: "application/pdf",
    size_bytes: 128,
    sha256_hash: "hash",
    storage_provider: "DRIVE",
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    uploaded_by_id: "user-1",
    created_at: "2026-09-22T12:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function supplierRequest(
  overrides: Record<string, unknown> = {},
): Parameters<typeof getRequiredDocumentChecklist>[2] {
  return {
    id: requestId,
    request_type: REQUEST_TYPE.SUPPLIER_PAYMENT,
    currency: REQUEST_CURRENCY.PEN,
    requested_amount: "100.00",
    ...overrides,
  };
}

describe("supplier document v2 frontend baseline characterization", () => {
  it("keeps supplier presentation free of generic RECEIPT and local eligibility", () => {
    const optionValues = REQUEST_DOCUMENT_CATEGORY_OPTIONS.map(
      (option) => option.value,
    );

    expect(optionValues).toEqual(
      expect.arrayContaining([
        REQUEST_DOCUMENT_CATEGORY.RECEIPT,
        REQUEST_DOCUMENT_CATEGORY.INVOICE,
        REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT,
        REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
        REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
      ]),
    );

    const checklist = getRequiredDocumentChecklist(
      REQUEST_TYPE.SUPPLIER_PAYMENT,
      [],
      supplierRequest(),
    );
    expect(checklist.items[0]).toMatchObject({
      key: "request-primary",
      category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
      label: "Documento principal",
      required: true,
      satisfied: false,
    });
    expect(JSON.stringify(checklist)).not.toMatch(/RUS|Casa de Retiro/);
  });

  it("keeps a visible PERMANENT generic RECEIPT pending while effective classification is unresolved", () => {
    const uploaded = document(REQUEST_DOCUMENT_CATEGORY.RECEIPT, {
      original_filename: "Factura cargada.pdf",
    });
    const checklist = getRequiredDocumentChecklist(
      REQUEST_TYPE.SUPPLIER_PAYMENT,
      [uploaded],
      supplierRequest(),
      [],
    );

    expect(getRequestDocumentDisplayName(uploaded)).toBe("Factura cargada.pdf");
    expect(uploaded.upload_status).toBe(
      REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    );
    expect(checklist.items[0]).toMatchObject({
      category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
      satisfied: false,
    });
    expect(checklist).toMatchObject({
      isComplete: false,
      missingMessages: ["Debes adjuntar al menos uno."],
    });
  });

  it.each([
    REQUEST_DOCUMENT_CATEGORY.INVOICE,
    REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT,
    REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
    REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
  ])(
    "does not infer supplier readiness from a local %s document",
    (category) => {
      const checklist = getRequiredDocumentChecklist(
        REQUEST_TYPE.SUPPLIER_PAYMENT,
        [document(category)],
        supplierRequest(),
      );

      expect(checklist.isComplete).toBe(false);
    },
  );

  it("does not infer supplier readiness from a historical RECEIPT link", () => {
    const legacy = document(REQUEST_DOCUMENT_CATEGORY.RECEIPT);
    const exact = getRequiredDocumentChecklist(
      REQUEST_TYPE.SUPPLIER_PAYMENT,
      [legacy],
      supplierRequest(),
      [
        {
          request_id: requestId,
          document_id: legacy.id,
          receipt_type: "INVOICE",
        },
      ],
    );
    const foreign = getRequiredDocumentChecklist(
      REQUEST_TYPE.SUPPLIER_PAYMENT,
      [legacy],
      supplierRequest(),
      [
        {
          request_id: "other-request",
          document_id: legacy.id,
          receipt_type: "INVOICE",
        },
      ],
    );

    expect(exact.isComplete).toBe(false);
    expect(foreign.isComplete).toBe(false);
    for (const receiptRows of [
      [],
      [
        {
          request_id: requestId,
          document_id: legacy.id,
          receipt_type: "INVOICE",
        },
        {
          request_id: requestId,
          document_id: legacy.id,
          receipt_type: "INVOICE",
        },
      ],
      [
        {
          request_id: requestId,
          document_id: legacy.id,
          receipt_type: "INVOICE",
        },
        {
          request_id: requestId,
          document_id: legacy.id,
          receipt_type: "SALES_RECEIPT",
        },
      ],
      [
        {
          request_id: requestId,
          document_id: legacy.id,
          receipt_type: "OTHER",
        },
      ],
      [
        {
          request_id: requestId,
          document_id: legacy.id,
          receipt_type: "TICKET",
        },
      ],
    ]) {
      expect(
        getRequiredDocumentChecklist(
          REQUEST_TYPE.SUPPLIER_PAYMENT,
          [legacy],
          supplierRequest(),
          receiptRows,
        ).isComplete,
      ).toBe(false);
    }
  });

  it("uses only authoritative backend evidence for supplier readiness", () => {
    const localInvoice = document(REQUEST_DOCUMENT_CATEGORY.INVOICE);

    expect(
      getRequiredDocumentChecklist(
        REQUEST_TYPE.SUPPLIER_PAYMENT,
        [],
        supplierRequest(),
        [],
        undefined,
        { primary_satisfied: true },
      ).isComplete,
    ).toBe(true);
    expect(
      getRequiredDocumentChecklist(
        REQUEST_TYPE.SUPPLIER_PAYMENT,
        [localInvoice],
        supplierRequest(),
        [],
        undefined,
        { primary_satisfied: false },
      ).isComplete,
    ).toBe(false);
    expect(
      getRequiredDocumentChecklist(
        REQUEST_TYPE.SUPPLIER_PAYMENT,
        [localInvoice],
        supplierRequest(),
        [],
        undefined,
        null,
      ).isComplete,
    ).toBe(false);
  });

  it("keeps PAYMENT_PROOF bank evidence and P10 report categories outside supplier primary evidence", () => {
    const checklist = getRequiredDocumentChecklist(
      REQUEST_TYPE.SUPPLIER_PAYMENT,
      [
        document(REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF),
        document(REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT, {
          id: "report-document",
        }),
      ],
      supplierRequest(),
    );

    expect(checklist.isComplete).toBe(false);
    expect(PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL).toBe("PDF, JPG o PNG");
    expect(
      getRequestDocumentAcceptedFormatsLabel(
        REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT,
      ),
    ).toBe("XLS o XLSX");
  });

  it("preserves unrelated request-type checklist behavior", () => {
    const advance = getRequiredDocumentChecklist(REQUEST_TYPE.ADVANCE, []);
    const reimbursement = getRequiredDocumentChecklist(
      REQUEST_TYPE.REIMBURSEMENT,
      [document(REQUEST_DOCUMENT_CATEGORY.RECEIPT)],
      {
        id: requestId,
        request_type: REQUEST_TYPE.REIMBURSEMENT,
        currency: REQUEST_CURRENCY.PEN,
        requested_amount: "100.00",
      },
      [
        {
          request_id: requestId,
          document_id: "document-1",
          receipt_type: "INVOICE",
        },
      ],
    );
    const settlement = getRequiredDocumentChecklist(
      REQUEST_TYPE.ADVANCE_SETTLEMENT,
      [document(REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT)],
    );

    expect(advance.items).toEqual([
      expect.objectContaining({
        category: REQUEST_DOCUMENT_CATEGORY.PXQ,
        satisfied: false,
      }),
    ]);
    expect(reimbursement.isComplete).toBe(true);
    expect(settlement).toMatchObject({
      items: [],
      missingMessages: [],
      isComplete: true,
    });
  });
});
