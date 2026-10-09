import type { FxValuation, MonthlyPaymentReference } from "@/types/requests";
import {
  formatExactMoney,
  getPaymentValuationState,
  isMonthlyUsdValuation,
  normalizeFinalRate,
  type MonthlyValuationContext,
} from "@/lib/payment-fx";

const STATE_LABELS = {
  IDENTITY: "Identidad PEN",
  PROVISIONAL: "Provisional",
  FINAL: "Final",
  UNVALUED: "Sin valoración",
} as const;
interface PaymentValuationProps {
  valuation?: FxValuation | null;
  request?: MonthlyValuationContext | null;
  monthlyReference?: MonthlyPaymentReference | null;
}

export function PaymentValuation({
  valuation,
  request,
  monthlyReference,
}: PaymentValuationProps) {
  const monthly = isMonthlyUsdValuation(request);
  const state = getPaymentValuationState(request, valuation);
  let bankRate: string | null = null;
  if (
    monthly && monthlyReference &&
    Number.isInteger(monthlyReference.year) &&
    monthlyReference.year >= 1 && monthlyReference.year <= 9999 &&
    Number.isInteger(monthlyReference.month) &&
    monthlyReference.month >= 1 && monthlyReference.month <= 12
  ) {
    try {
      bankRate = normalizeFinalRate(monthlyReference.reference_rate);
    } catch {
      /* Sin referencia válida. */
    }
  }
  const closeRate = request?.monthly_fx_applied_close_rate;
  const closeMonth = request?.monthly_fx_applied_close_month;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        Valoración contable: {valuation?.amount_pen != null
          ? formatExactMoney(valuation.amount_pen, "PEN")
          : "Pendiente / sin valoración"} · {monthly && state === "FINAL" ? "Cerrado" : STATE_LABELS[state]}
      </p>
      {bankRate && monthlyReference ? (
        <p>
          Referencia bancaria mensual: {bankRate} PEN por USD · {String(monthlyReference.year).padStart(4, "0")}-{String(monthlyReference.month).padStart(2, "0")}
        </p>
      ) : null}
      {valuation?.reference ? (
        <p>
          {monthly ? "Aprobación" : "TC referencial"}: {valuation.reference.rate} PEN por USD · {valuation.reference.source} / {valuation.reference.side} · fecha efectiva {valuation.reference.effective_date} · consultado {valuation.reference.retrieved_at}
        </p>
      ) : null}
      {valuation?.reference?.manual_source ? (
        <p>Fuente manual: {valuation.reference.manual_source}</p>
      ) : null}
      {monthly && state === "FINAL" && closeRate && closeMonth ? (
        <p>TC de cierre mensual: {normalizeFinalRate(closeRate)} PEN por USD · {closeMonth.slice(0, 7)}</p>
      ) : null}
      {!monthly && valuation?.final_rate ? (
        <p>TC final confirmado: {valuation.final_rate} PEN por USD · {valuation.final_confirmed_at}</p>
      ) : null}
    </div>
  );
}
