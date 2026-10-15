import { deriveRexanApprovalPreview, normalizeMoneyAmount, toMoneyCents } from "@/lib/requests";
import { LINE_RETURN_VALIDATION_STATUS, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_PURPOSE, REQUEST_DOCUMENT_SCOPE_TYPE, REQUEST_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type PaymentRequest, type RequestDocument, type RequestRenditionReport } from "@/types/requests";

// El DTO de cobertura no expone la ejecución ni el report_id de la devolución:
// VALID es la validación canónica del servidor, no el estado editable del registro.
export function getRenditionReportReadiness(request: PaymentRequest, report: RequestRenditionReport | null, documents: RequestDocument[]) {
  const zeroIds = report?.zero_expense_allocation_ids ?? [];
  const coverage = report?.allocation_coverage ?? [];
  const covered = Boolean(report && report.request_id === request.id
    && report.zero_expense_declaration_valid !== false && report.totals.missing_allocations.length === 0
    && coverage.length > 0 && new Set(coverage.map((item) => item.request_allocation_id)).size === coverage.length
    && (zeroIds.length === 0 || report.zero_expense_declaration_valid === true)
    && zeroIds.every((id) => coverage.some((item) => item.request_allocation_id === id))
    && coverage.every((item) => item.has_rows || zeroIds.includes(item.request_allocation_id))
    && !report.rows.some((row) => zeroIds.includes(row.request_allocation_id))
    && (report.rows.length > 0 || zeroIds.length > 0)
    && report.rows.every((row) => Boolean(row.request_document_id) && Boolean(row.request_allocation_id)
      && Boolean(row.purchase_date) && Boolean(row.provider_name.trim()) && Boolean(row.detail.trim())
      && Number.isFinite(Number(row.amount)) && Number(row.amount) > 0));
  const origin = request.relatedRequest;
  const paidAmount = origin && origin.id === request.related_request_id && origin.request_type === REQUEST_TYPE.ADVANCE
    && origin.status === REQUEST_STATUS.PAID && origin.currency === request.currency && report?.currency === request.currency
    ? normalizeMoneyAmount(origin.requested_amount) : null;
  const spentAmount = typeof report?.totals.total_amount === "number" ? normalizeMoneyAmount(report.totals.total_amount) : null;
  const preview = covered && paidAmount !== null && paidAmount > 0 && spentAmount !== null && spentAmount >= 0
    && (spentAmount !== 0 || (report?.rows.length === 0 && report.zero_expense_declaration_valid === true))
    ? deriveRexanApprovalPreview(paidAmount, spentAmount, report?.currency ?? null) : null;
  const proofIds = new Set<string>();
  const returnIds = new Set<string>();
  let returnedCents = 0;
  const returns = coverage.filter((item) => item.line_return);
  const returnRegistered = preview?.outcome === REXAN_OUTCOME.DEVOLUCION && returns.length > 0 && returns.every((item) => {
    const record = item.line_return!;
    const proof = documents.find((document) => document.id === record.return_proof_document_id);
    const amount = typeof record.returned_amount === "number" ? toMoneyCents(record.returned_amount) : null;
    if (item.return_validation_status !== LINE_RETURN_VALIDATION_STATUS.VALID
      || !record.id || returnIds.has(record.id) || !record.justification?.trim() || amount === null || amount <= 0
      || !request.allocations?.some((allocation) => allocation.id === item.request_allocation_id)
      || !proof || proof.deleted_at || proof.document_purpose === REQUEST_DOCUMENT_PURPOSE.EXTRA
      || proof.payment_request_id !== request.id || proof.scope_type !== REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION
      || proof.request_allocation_id !== item.request_allocation_id
      || (proof.document_category_normalized || proof.document_category) !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF
      || proofIds.has(proof.id)) return false;
    proofIds.add(proof.id);
    returnIds.add(record.id);
    returnedCents += amount;
    return true;
  }) && returnedCents === toMoneyCents(preview.balanceAmount);
  const lineReturnsSafe = coverage.every((item) => item.return_validation_status !== LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION && (Number(item.expected_return_amount ?? 0) <= 0
    || item.return_validation_status === LINE_RETURN_VALIDATION_STATUS.VALID
    || (item.return_validation_status === LINE_RETURN_VALIDATION_STATUS.NOT_REQUIRED && preview?.outcome !== REXAN_OUTCOME.DEVOLUCION)));
  return {
    preview,
    returnRegistered,
    eligible: covered && lineReturnsSafe && (request.request_type !== REQUEST_TYPE.ADVANCE_SETTLEMENT
      || Boolean(preview && (preview.outcome !== REXAN_OUTCOME.DEVOLUCION || returnRegistered))),
  };
}
