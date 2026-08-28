import { Badge } from "@/components/ui/badge";
import { formatDriveProjectionStatus } from "@/lib/integration-status-vocabulary";
import {
  DRIVE_PAYMENT_PROJECTION_STATUS,
  type RequestPayment,
} from "@/types/requests";

const DRIVE_PROJECTION_FAILED_DETAIL =
  "El pago quedó registrado, pero la carpeta requiere revisión en Drive.";

interface DriveProjectionStateProps {
  payment: Pick<
    RequestPayment,
    | "drive_projection_status"
    | "drive_projection_phase"
    | "drive_projection_error_code"
    | "drive_projection_error_message"
    | "drive_projection_reconciliation_required"
    | "drive_projection_frozen"
  >;
  compact?: boolean;
}

export function DriveProjectionState({
  payment,
  compact = false,
}: DriveProjectionStateProps) {
  const status = payment.drive_projection_status;
  if (!status) return null;
  const reconciliation =
    payment.drive_projection_reconciliation_required === true ||
    payment.drive_projection_frozen === true;
  return (
    <div className={compact ? "flex flex-wrap gap-1" : "space-y-1"}>
      <Badge variant={status === "FAILED" ? "destructive" : "outline"}>
        {formatDriveProjectionStatus(status)}
      </Badge>
      <Badge variant="secondary">
        Fase: {payment.drive_projection_phase ?? "PENDING"}
      </Badge>
      {reconciliation ? (
        <Badge variant="destructive">Reconciliación requerida · congelado</Badge>
      ) : null}
      {status === DRIVE_PAYMENT_PROJECTION_STATUS.FAILED ? (
        <p className="text-xs text-destructive">{DRIVE_PROJECTION_FAILED_DETAIL}</p>
      ) : null}
      {payment.drive_projection_error_code ? (
        <span
          className="text-xs text-destructive"
          title={payment.drive_projection_error_message ?? undefined}
        >
          {payment.drive_projection_error_code}
          {!compact && payment.drive_projection_error_message
            ? `: ${payment.drive_projection_error_message}`
            : null}
        </span>
      ) : !compact && payment.drive_projection_error_message ? (
        <span className="text-xs text-destructive">
          {payment.drive_projection_error_message}
        </span>
      ) : null}
    </div>
  );
}
