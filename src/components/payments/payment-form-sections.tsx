import { Input } from "@/components/ui/input";
import { formatBusinessDate } from "@/lib/business-timezone";
import {
  PAYMENT_PROOF_ACCEPT,
  PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL,
  formatRequestCurrency,
  formatRequestDateTime,
} from "@/lib/requests";
import {
  DRIVE_PAYMENT_ROUTE_MODEL,
  DRIVE_SOURCE_ACCOUNT,
  type DriveSourceAccount,
  type RequestCurrency,
} from "@/types/requests";

const SOURCE_ACCOUNT_LABEL: Readonly<Record<DriveSourceAccount, string>> = {
  [DRIVE_SOURCE_ACCOUNT.BCP_PEN]: "BCP-SOLES",
  [DRIVE_SOURCE_ACCOUNT.BCP_USD]: "BCP-DOLARES",
  [DRIVE_SOURCE_ACCOUNT.BCP_ODF]: "BCP-ODF",
  [DRIVE_SOURCE_ACCOUNT.BBVA_PEN]: "BBVA-SOLES",
  [DRIVE_SOURCE_ACCOUNT.BBVA_USD]: "BBVA-DOLARES",
};

interface PaymentImmutableContextProps {
  paidAt?: string | null;
  amountPaid?: number | null;
  currency: RequestCurrency;
  sourceAccountKey?: DriveSourceAccount | null;
  paymentCycleDate?: string | null;
  driveRouteModel?: string | null;
  driveRoutingDate?: string | null;
  driveRouteClassifiedAt?: string | null;
}

export function getDriveRouteModelLabel(model?: string | null): string {
  if (model === DRIVE_PAYMENT_ROUTE_MODEL.DAILY_V1) return "Destino diario";
  return "Ruta V2 no disponible";
}

interface PaymentSourceAccountSelectProps {
  id: string;
  value?: string;
  required?: boolean;
  describedBy?: string;
  testId: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}

interface PaymentProofFieldProps {
  id: string;
  required?: boolean;
  error?: string | null;
  errorId?: string;
  testId: string;
  autoFocus?: boolean;
  onChange: (file: File | null) => void;
}

export function PaymentImmutableContext({
  paidAt,
  amountPaid,
  currency,
  sourceAccountKey,
  paymentCycleDate,
  driveRouteModel,
  driveRoutingDate,
  driveRouteClassifiedAt,
}: PaymentImmutableContextProps) {
  const hasAmount = typeof amountPaid === "number" && Number.isFinite(amountPaid);
  return (
    <section aria-label="Resumen del pago" className="rounded-md border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Resumen del pago</h3>
        <span className="text-xs font-medium text-muted-foreground">Solo lectura</span>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {paidAt ? (
          <div>
            <dt className="text-xs text-muted-foreground">Fecha de pago</dt>
            <dd className="text-sm font-medium">{formatRequestDateTime(paidAt)}</dd>
          </div>
        ) : null}
        {hasAmount ? (
          <div>
            <dt className="text-xs text-muted-foreground">Monto</dt>
            <dd className="text-sm font-medium">{formatRequestCurrency(amountPaid, currency)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Cuenta origen</dt>
          <dd className="text-sm font-medium">{sourceAccountKey ? SOURCE_ACCOUNT_LABEL[sourceAccountKey] : "Pendiente"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Modelo de destino</dt>
          <dd className="text-sm font-medium">{getDriveRouteModelLabel(driveRouteModel)}</dd>
        </div>
        {driveRouteClassifiedAt ? (
          <div>
            <dt className="text-xs text-muted-foreground">Registrado en SIG-EPE</dt>
            <dd className="text-sm font-medium">{formatRequestDateTime(driveRouteClassifiedAt)}</dd>
          </div>
        ) : null}
        {driveRouteModel === DRIVE_PAYMENT_ROUTE_MODEL.DAILY_V1 && driveRoutingDate ? (
          <div>
            <dt className="text-xs text-muted-foreground">Fecha de destino</dt>
            <dd className="text-sm font-medium">
              {formatBusinessDate(driveRoutingDate, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export function PaymentSourceAccountSelect({
  id,
  value,
  required = false,
  describedBy,
  testId,
  autoFocus = false,
  onChange,
}: PaymentSourceAccountSelectProps) {
  return (
    <select
      id={id}
      value={value ?? ""}
      required={required}
      aria-describedby={describedBy}
      aria-invalid={Boolean(describedBy)}
      data-autofocus={autoFocus ? true : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      data-testid={testId}
    >
      <option value="" disabled>Selecciona una cuenta</option>
      {Object.values(DRIVE_SOURCE_ACCOUNT).map((account) => (
        <option key={account} value={account}>{SOURCE_ACCOUNT_LABEL[account]}</option>
      ))}
    </select>
  );
}

export function PaymentProofField({
  id,
  required = false,
  error,
  errorId: explicitErrorId,
  testId,
  autoFocus = false,
  onChange,
}: PaymentProofFieldProps) {
  const errorId = explicitErrorId ?? `${id}-error`;
  return (
    <fieldset className="space-y-2 rounded-md border p-4">
      <legend className="px-1 text-sm font-semibold">Constancia global de pago</legend>
      <label className="text-sm font-medium" htmlFor={id}>
        Constancia de pago ({PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL})
      </label>
      <Input
        id={id}
        type="file"
        accept={PAYMENT_PROOF_ACCEPT}
        required={required}
        data-autofocus={autoFocus ? true : undefined}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        data-testid={testId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
      />
      {error ? <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}
