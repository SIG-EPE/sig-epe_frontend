import type { FxValuation } from "@/types/requests";
import { formatExactMoney } from "@/lib/payment-fx";

const STATE_LABELS = { IDENTITY: "Identidad PEN", PROVISIONAL: "Provisional", FINAL: "Final", UNVALUED: "Sin valoración" } as const;
export function PaymentValuation({ valuation }: { valuation?: FxValuation | null }) {
  return <div className="space-y-1 text-xs text-muted-foreground">
    <p>Valoración contable: {valuation?.amount_pen != null ? formatExactMoney(valuation.amount_pen, "PEN") : "Pendiente / sin valoración"} · {valuation ? STATE_LABELS[valuation.state] : "Sin valoración"}</p>
    {valuation?.reference ? <p>TC referencial: {valuation.reference.rate} PEN por USD · {valuation.reference.source} / {valuation.reference.side} · fecha efectiva {valuation.reference.effective_date} · consultado {valuation.reference.retrieved_at}</p> : null}
    {valuation?.reference?.manual_source ? <p>Fuente manual: {valuation.reference.manual_source}</p> : null}
    {valuation?.final_rate ? <p>TC final confirmado: {valuation.final_rate} PEN por USD · {valuation.final_confirmed_at}</p> : null}
  </div>;
}
