import { RequestForm } from "./request-form";

export function NewRequestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva solicitud</h1>
        <p className="text-muted-foreground">Registra un anticipo, reembolso o pago a proveedor.</p>
      </div>
      <RequestForm />
    </div>
  );
}
