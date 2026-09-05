import {
  DRIVE_PAYMENT_PROJECTION_STATUS,
  PAYMENT_REXAN_STATUS,
  type DrivePaymentProjectionStatus,
} from "@/types/requests";

const DRIVE_PROJECTION_STATUS_LABELS: Readonly<Record<DrivePaymentProjectionStatus, string>> = {
  [DRIVE_PAYMENT_PROJECTION_STATUS.SOURCE_REQUIRED]: "Drive: pendiente",
  [DRIVE_PAYMENT_PROJECTION_STATUS.PENDING]: "Drive: pendiente",
  [DRIVE_PAYMENT_PROJECTION_STATUS.PROCESSING]: "Drive: procesando",
  [DRIVE_PAYMENT_PROJECTION_STATUS.SUCCEEDED]: "Drive: completado",
  [DRIVE_PAYMENT_PROJECTION_STATUS.FAILED]: "Drive: requiere atención",
};

const REXAN_ACTIVATION_STATUS_LABELS = {
  [PAYMENT_REXAN_STATUS.PENDING]: "REXAN: pendiente",
  [PAYMENT_REXAN_STATUS.PROCESSING]: "REXAN: procesando",
  [PAYMENT_REXAN_STATUS.RETRYING]: "REXAN: procesando",
  [PAYMENT_REXAN_STATUS.CREATED]: "REXAN: activada",
  [PAYMENT_REXAN_STATUS.REUSED]: "REXAN: reutilizada",
  [PAYMENT_REXAN_STATUS.SKIPPED]: "REXAN: no aplica",
  [PAYMENT_REXAN_STATUS.FAILED]: "REXAN: requiere atención",
} as const;

const LEGACY_REXAN_ACTIVATION_STATUS_LABELS = {
  [PAYMENT_REXAN_STATUS.PENDING]: "REXAN en proceso",
  [PAYMENT_REXAN_STATUS.PROCESSING]: "REXAN procesando",
  [PAYMENT_REXAN_STATUS.RETRYING]: "REXAN reintentando",
  [PAYMENT_REXAN_STATUS.CREATED]: "REXAN activada",
  [PAYMENT_REXAN_STATUS.REUSED]: "REXAN reutilizada",
  [PAYMENT_REXAN_STATUS.SKIPPED]: "REXAN no aplica",
  [PAYMENT_REXAN_STATUS.FAILED]: "REXAN requiere atención",
} as const;

export interface PaymentCompletenessState {
  proofPending: boolean;
  referencePending: boolean;
  sourceAccountPending: boolean;
}

export function formatDriveProjectionStatus(status: string): string {
  return DRIVE_PROJECTION_STATUS_LABELS[status as DrivePaymentProjectionStatus]
    ?? `Drive: estado no reconocido (${status})`;
}

export function formatRexanActivationStatus(
  status: string,
  preserveLegacyCopy = false,
): string {
  if (preserveLegacyCopy) {
    return LEGACY_REXAN_ACTIVATION_STATUS_LABELS[
      status as keyof typeof LEGACY_REXAN_ACTIVATION_STATUS_LABELS
    ] ?? status;
  }
  return REXAN_ACTIVATION_STATUS_LABELS[
    status as keyof typeof REXAN_ACTIVATION_STATUS_LABELS
  ] ?? `REXAN: estado no reconocido (${status})`;
}

export function getPaymentCompletenessLabels(
  state: PaymentCompletenessState,
): string[] {
  const labels: string[] = [];
  if (state.proofPending) labels.push("Falta constancia");
  if (state.referencePending) labels.push("Falta referencia");
  if (state.sourceAccountPending) labels.push("Falta cuenta de origen");
  return labels.length > 0 ? labels : ["Datos de pago completos"];
}
