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
    || missing.has(PAYMENT_MISSING_FIELD.OPERATION_REFERENCE)
    || missing.has(PAYMENT_MISSING_FIELD.FINAL_FX_RATE)
    || missing.has(PAYMENT_MISSING_FIELD.FINAL_FX_CONFIRMED);
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
  // The legacy REFERENCE_PENDING enum also covers FX-only pending now.
  // An explicit server missing-fields list takes precedence over aliases.
  const explicit = source.missing_fields;
  const referencePending = explicit != null
    ? explicit.includes(PAYMENT_MISSING_FIELD.OPERATION_REFERENCE)
    : completeness === PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING || completeness === PAYMENT_COMPLETENESS_STATE.BOTH_PENDING;
  const proofPending = explicit != null
    ? explicit.includes(PAYMENT_MISSING_FIELD.PROOF)
    : completeness === PAYMENT_COMPLETENESS_STATE.PROOF_PENDING || completeness === PAYMENT_COMPLETENESS_STATE.BOTH_PENDING;
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
  const fxMissing = (explicit ?? []).filter((field) => field === PAYMENT_MISSING_FIELD.FINAL_FX_RATE || field === PAYMENT_MISSING_FIELD.FINAL_FX_CONFIRMED) as PaymentMissingField[];
  missingFields.push(...fxMissing);
  if (fxMissing.length) labels.push("Falta TC final confirmado");
  if (labels.length === 0) labels.push("Pago completo");
  return {
    completeness,
    missingFields,
    labels,
    hasPendingDetails: missingFields.length > 0 || completeness !== PAYMENT_COMPLETENESS_STATE.COMPLETE,
  };
}
