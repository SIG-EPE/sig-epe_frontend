import { supplierContractRequirement } from "./request-supplier-policy";

export interface RequestEvidenceContext {
  id: string;
  request_type: string;
  currency: string | null;
  requested_amount: string | number;
  declares_rus?: boolean | null;
  declares_casa_de_retiro?: boolean | null;
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
const RECEIPT_CATEGORIES = new Set(["RECEIPT", "INVOICE", "PROFESSIONAL_FEE_RECEIPT", "SALES_RECEIPT", "CASH_RECEIPT"]);
const LEGACY_RECEIPT_CATEGORY: Record<string, string> = { INVOICE: "INVOICE", FEE_RECEIPT: "PROFESSIONAL_FEE_RECEIPT", SALES_RECEIPT: "SALES_RECEIPT" };

export function evaluateRequestEvidence(request: RequestEvidenceContext, documents: readonly EvidenceDocument[], receipts: readonly EvidenceReceipt[], annualUit?: string | null) {
  const active = documents.filter((document) => document.payment_request_id === request.id && document.deleted_at == null && document.upload_status === "PERMANENT");
  const linked = receipts.filter((receipt) => receipt.request_id === request.id && receipt.document_id !== null);
  const category = (document: EvidenceDocument) => {
    const stored = document.document_category_normalized || document.document_category;
    if (stored !== "RECEIPT") return stored;
    const types = new Set(linked.filter((receipt) => receipt.document_id === document.id).map((receipt) => receipt.receipt_type));
    return types.size === 1 ? LEGACY_RECEIPT_CATEGORY[[...types][0]] ?? stored : stored;
  };
  const supplier = request.request_type === "SUPPLIER_PAYMENT";
  const primarySatisfied = request.request_type === "REIMBURSEMENT"
    ? active.some((document) => RECEIPT_CATEGORIES.has(category(document)) && linked.some((receipt) => receipt.document_id === document.id))
    : supplier ? active.some((document) => {
      const type = category(document);
      return type === "INVOICE" || type === "PROFESSIONAL_FEE_RECEIPT" || type === "SALES_RECEIPT" && request.declares_rus === true || type === "CASH_RECEIPT" && request.declares_casa_de_retiro === true;
    }) : true;
  // Un snapshot parcial tampoco se reemplaza con el catálogo actual.
  const hasSnapshot = request.uit_year_applied != null || request.uit_amount_applied != null;
  const uit = hasSnapshot ? request.uit_year_applied != null ? request.uit_amount_applied : null : annualUit;
  const contract = supplier && !hasSnapshot && annualUit === undefined
    ? { required: false, error: null }
    : supplier
      ? supplierContractRequirement(request.currency, String(request.requested_amount), uit)
      : { required: false, error: null };
  const contractPresent = active.some((document) => category(document) === "CONTRACT" && document.mime_type.toLowerCase() === "application/pdf");
  return { primarySatisfied, contractRequired: contract.required, contractPresent, contractSatisfied: !contract.required || contractPresent, error: contract.error };
}
