import { Badge } from "@/components/ui/badge";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import type { PaymentRequest } from "@/types/requests";

interface PaymentCompletenessStatusProps {
  request: PaymentRequest;
  showComplete?: boolean;
}

export function PaymentCompletenessStatus({
  request,
  showComplete = true,
}: PaymentCompletenessStatusProps) {
  const presentation = getPaymentCompletenessPresentation({
    completeness: request.payment?.completeness,
    missing_fields: request.payment?.missing_fields,
    proof_pending: request.payment?.proof_pending
      ?? request.payment_proof_pending
      ?? request.proof_pending,
    details_pending: request.payment?.details_pending
      ?? request.payment_details_pending
      ?? request.details_pending,
  });
  if (!showComplete && !presentation.hasPendingDetails) return null;
  return (
    <div className="flex flex-wrap gap-1" data-testid="payment-completeness-status">
      {presentation.labels.map((label) => (
        <Badge key={label} variant="outline">{label}</Badge>
      ))}
    </div>
  );
}
