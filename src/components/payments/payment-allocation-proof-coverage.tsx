import { Badge } from "@/components/ui/badge";
import {
  formatRequestCurrency,
  formatRequestDate,
  getAllocationFinanciersLabel,
  getAllocationProofCoverageLabel,
  getPaymentProofEntriesForAllocation,
  getRequestDocumentDisplayName,
  getPlanningLineDisplay,
} from "@/lib/requests";
import type { PaymentRequest } from "@/types/requests";

const PAYMENT_ALLOCATION_COVERAGE_MODE = {
  SPECIFIC_PROOFS: "specific-proofs",
  REGISTER_GENERAL_PROOF: "register-general-proof",
} as const;

type PaymentAllocationCoverageMode = (typeof PAYMENT_ALLOCATION_COVERAGE_MODE)[keyof typeof PAYMENT_ALLOCATION_COVERAGE_MODE];

interface PaymentAllocationProofCoverageProps {
  request: PaymentRequest;
  compact?: boolean;
  mode?: PaymentAllocationCoverageMode;
}

export function PaymentAllocationProofCoverage({ request, compact = false, mode = PAYMENT_ALLOCATION_COVERAGE_MODE.SPECIFIC_PROOFS }: PaymentAllocationProofCoverageProps) {
  const allocations = request.allocations ?? [];
  const isRegisterGeneralProofMode = mode === PAYMENT_ALLOCATION_COVERAGE_MODE.REGISTER_GENERAL_PROOF;

  if (allocations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3" data-testid="payment-allocation-coverage">
      <p className="text-xs text-muted-foreground">
        {isRegisterGeneralProofMode
          ? "La constancia que adjuntes en este pago cubrirá todas las líneas POA de la solicitud."
          : "El pago es de la solicitud completa; estos comprobantes respaldan líneas POA específicas."}
      </p>
      <div className="space-y-2">
        {allocations.map((allocation, index) => {
          const line = allocation.planning_line ?? allocation.budgetPlanningLine;
          const proofs = isRegisterGeneralProofMode ? [] : getPaymentProofEntriesForAllocation(request.payment, allocation.id);
          const coverageLabel = isRegisterGeneralProofMode ? "Se cubrirá con la constancia general" : getAllocationProofCoverageLabel(allocation, request.payment);
          const financiers = allocation.financiers ?? allocation.funding_sources;

          return (
            <div key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`} className="rounded-md border bg-background p-3" data-testid="payment-allocation-coverage-row">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">Línea POA {index + 1}: {getPlanningLineDisplay(line)}</p>
                  <p className="text-xs text-muted-foreground">{allocation.org_unit?.name ?? line?.org_unit?.name ?? "Área no informada"}</p>
                  {!compact && <p className="text-xs text-muted-foreground">Financiadores: {getAllocationFinanciersLabel(financiers)}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-sm font-semibold">{formatRequestCurrency(allocation.amount, request.currency)}</span>
                  <Badge variant={isRegisterGeneralProofMode || proofs.length > 0 ? "default" : "outline"}>{coverageLabel}</Badge>
                </div>
              </div>
              {proofs.length > 0 && !compact && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {proofs.map((proof) => (
                    <p key={proof.id}>
                      {proof.proof_document ? getRequestDocumentDisplayName(proof.proof_document) : proof.proof_document_id}
                      {proof.operation_reference ? ` · Ref. ${proof.operation_reference}` : ""}
                      {proof.paid_at ? ` · ${formatRequestDate(proof.paid_at)}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
