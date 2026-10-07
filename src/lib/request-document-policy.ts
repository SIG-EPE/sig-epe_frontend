import { REQUEST_DOCUMENT_CATEGORY, REQUEST_TYPE, type RequestDocumentCategory, type RequestType } from "@/types/requests";

// Solo plan de presentación: el selector y la autorización real no consumen esta función.
export function getPlannedCategoryPlacement(
  requestType: RequestType,
  category: RequestDocumentCategory,
  pendingRequired: readonly RequestDocumentCategory[],
): "required" | "grouped" {
  const requiredCategory = requestType === REQUEST_TYPE.ADVANCE
    ? REQUEST_DOCUMENT_CATEGORY.PXQ
    : requestType === REQUEST_TYPE.REIMBURSEMENT
      ? REQUEST_DOCUMENT_CATEGORY.RECEIPT
      : null;
  return requiredCategory === category && pendingRequired.includes(category)
    ? "required"
    : "grouped";
}

export interface RequestEvidenceContext {
  id: string;
  request_type: string;
  currency: string | null;
  requested_amount: string | number;
  uit_year_applied?: number | null;
  uit_amount_applied?: string | null;
}
export interface EvidenceDocument {
  id: string;
  payment_request_id: string;
  document_category: string;
  document_category_normalized?: string | null;
  upload_status: string;
  deleted_at?: string | null;
  mime_type: string;
}
export interface EvidenceReceipt {
  request_id: string;
  document_id: string | null;
  receipt_type: string;
}
const RECEIPT_CATEGORIES = new Set([
  "RECEIPT",
  "INVOICE",
  "PROFESSIONAL_FEE_RECEIPT",
  "SALES_RECEIPT",
  "CASH_RECEIPT",
]);
const LEGACY_RECEIPT_CATEGORY: Record<string, string> = {
  INVOICE: "INVOICE",
  FEE_RECEIPT: "PROFESSIONAL_FEE_RECEIPT",
  SALES_RECEIPT: "SALES_RECEIPT",
};

export function evaluateNonSupplierRequestEvidence(
  request: RequestEvidenceContext,
  documents: readonly EvidenceDocument[],
  receipts: readonly EvidenceReceipt[],
) {
  const active = documents.filter(
    (document) =>
      document.payment_request_id === request.id &&
      document.deleted_at == null &&
      document.upload_status === "PERMANENT",
  );
  const linked = receipts.filter(
    (receipt) =>
      receipt.request_id === request.id && receipt.document_id !== null,
  );
  const category = (document: EvidenceDocument) => {
    const stored = document.document_category;
    if (stored !== "RECEIPT") return stored;
    const matches = linked.filter(
      (receipt) => receipt.document_id === document.id,
    );
    return matches.length === 1
      ? (LEGACY_RECEIPT_CATEGORY[matches[0].receipt_type] ?? stored)
      : stored;
  };
  const primarySatisfied =
    request.request_type === "REIMBURSEMENT"
      ? active.some(
          (document) =>
            RECEIPT_CATEGORIES.has(category(document)) &&
            linked.some((receipt) => receipt.document_id === document.id),
        )
      : false;
  return {
    primarySatisfied,
    error: null,
  };
}
