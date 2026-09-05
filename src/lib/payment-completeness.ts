import {
  PAYMENT_COMPLETENESS_STATE,
  PAYMENT_MISSING_FIELD,
  type PaymentCompletenessState,
  type PaymentMissingField,
} from "@/types/requests";

interface PaymentCompletenessSource {
  completeness?: PaymentCompletenessState | string | null;
  missing_fields?: readonly (PaymentMissingField | string)[] | null;
  proof_pending?: boolean | null;
  details_pending?: boolean | null;
}

export interface PaymentCompletenessPresentation {
  completeness: PaymentCompletenessState;
  missingFields: PaymentMissingField[];
  labels: string[];
  hasPendingDetails: boolean;
}

function isPaymentCompletenessState(value: unknown): value is PaymentCompletenessState {
  return Object.values(PAYMENT_COMPLETENESS_STATE).includes(value as PaymentCompletenessState);
}

function deriveFromAliases(source: PaymentCompletenessSource): PaymentCompletenessState {
  const missing = new Set(source.missing_fields ?? []);
  const referencePending = source.details_pending === true
    || missing.has(PAYMENT_MISSING_FIELD.OPERATION_REFERENCE);
  const proofPending = source.proof_pending === true
    || missing.has(PAYMENT_MISSING_FIELD.PROOF);
  if (referencePending && proofPending) return PAYMENT_COMPLETENESS_STATE.BOTH_PENDING;
  if (referencePending) return PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING;
  if (proofPending) return PAYMENT_COMPLETENESS_STATE.PROOF_PENDING;
  return PAYMENT_COMPLETENESS_STATE.COMPLETE;
}

export function getPaymentCompletenessPresentation(
  source: PaymentCompletenessSource,
): PaymentCompletenessPresentation {
  const completeness = isPaymentCompletenessState(source.completeness)
    ? source.completeness
    : deriveFromAliases(source);
  const referencePending = completeness === PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING
    || completeness === PAYMENT_COMPLETENESS_STATE.BOTH_PENDING;
  const proofPending = completeness === PAYMENT_COMPLETENESS_STATE.PROOF_PENDING
    || completeness === PAYMENT_COMPLETENESS_STATE.BOTH_PENDING;
  const missingFields: PaymentMissingField[] = [];
  const labels: string[] = [];
  if (referencePending) {
    missingFields.push(PAYMENT_MISSING_FIELD.OPERATION_REFERENCE);
    labels.push("Falta referencia");
  }
  if (proofPending) {
    missingFields.push(PAYMENT_MISSING_FIELD.PROOF);
    labels.push("Falta constancia");
  }
  if (labels.length === 0) labels.push("Pago completo");
  return {
    completeness,
    missingFields,
    labels,
    hasPendingDetails: completeness !== PAYMENT_COMPLETENESS_STATE.COMPLETE,
  };
}
