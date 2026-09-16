import { useRequestAnnualUit, useRequestFxReference } from "@/hooks/use-request-currency";
import { multiplyMoneyByRateHalfUp } from "@/lib/payment-fx";
import { supplierContractRequirement } from "@/lib/request-supplier-policy";
import type { PaymentRequest } from "@/types/requests";

function getLimaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidNonFutureReferenceDate(effectiveDate: string, retrievedAt: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return false;
  const parsedEffectiveDate = new Date(`${effectiveDate}T00:00:00.000Z`);
  const parsedRetrievedAt = Date.parse(retrievedAt);
  return !Number.isNaN(parsedEffectiveDate.valueOf())
    && parsedEffectiveDate.toISOString().slice(0, 10) === effectiveDate
    && effectiveDate <= getLimaDate()
    && Number.isFinite(parsedRetrievedAt)
    && parsedRetrievedAt <= Date.now();
}

export function RequestContractAdvisory({ request }: { request: PaymentRequest }) {
  const reference = useRequestFxReference();
  const uit = useRequestAnnualUit(request.fiscal_year, true);
  const quote = reference.data?.reference;
  let estimate: string | null = null;
  if (
    quote &&
    ["SBS_BCRPDATA", "MANUAL"].includes(quote.source) &&
    quote.side.trim() &&
    isValidNonFutureReferenceDate(quote.effective_date, quote.retrieved_at) &&
    (quote.source !== "MANUAL" || quote.manual_source?.trim())
  ) {
    try {
      estimate = multiplyMoneyByRateHalfUp(String(request.requested_amount), quote.rate);
    } catch {
      // Referencias inválidas no se presentan como una cotización.
    }
  }
  const comparison = estimate ? supplierContractRequirement("PEN", estimate, uit.annualUit) : null;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>Referencia informativa, no es un TC final y no hace obligatorio el contrato en dólares.</p>
      {quote && estimate ? (
        <>
          <p>Estimación: PEN {estimate} · TC referencial: {quote.rate} PEN/USD.</p>
          <p>Fuente: {quote.source === "MANUAL" ? `Manual · ${quote.manual_source}` : quote.source} · Lado: {quote.side} · Fecha efectiva: {quote.effective_date} · Consultada: {quote.retrieved_at}.</p>
          <p>{comparison?.error ? "Comparación con ½ UIT no disponible para el año de la solicitud." : comparison?.required ? "La estimación supera ½ UIT; el contrato sigue siendo opcional." : "La estimación no supera ½ UIT; el contrato sigue siendo opcional."}</p>
          {reference.data?.fallback && <p>Estado de referencia: {reference.data.fallback}.</p>}
        </>
      ) : (
        <p>Referencia cambiaria no disponible{reference.data?.last_refresh_failure ? `: ${reference.data.last_refresh_failure}` : ""}.</p>
      )}
      {estimate && reference.data?.last_refresh_failure && <p>Falló la última actualización: {reference.data.last_refresh_failure}. Se conserva la referencia fechada.</p>}
    </div>
  );
}
