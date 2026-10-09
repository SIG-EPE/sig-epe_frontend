import { isRexanExcessRequest } from "@/lib/requests";
import {
  FX_POLICY_VERSION,
  FX_VALUATION_STATE,
  type FxValuation,
  type PaymentRequest,
} from "@/types/requests";

export type MonthlyValuationContext = Partial<
  Pick<PaymentRequest,
    | "currency"
    | "original"
    | "fx_policy_version"
    | "monthly_fx_applied_close_month"
    | "monthly_fx_applied_close_rate"
  >
>;

export function isMonthlyUsdValuation(
  request?: MonthlyValuationContext | null,
): boolean {
  return (request?.original?.currency ?? request?.currency) === "USD" &&
    request?.fx_policy_version === FX_POLICY_VERSION.MONTHLY_V1;
}

export function hasAppliedMonthlyClose(
  request?: MonthlyValuationContext | null,
): boolean {
  const month = request?.monthly_fx_applied_close_month;
  const rate = request?.monthly_fx_applied_close_rate;
  return isMonthlyUsdValuation(request) && typeof month === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month) && !month.startsWith("0000-") &&
    typeof rate === "string" && /^\d{1,12}(?:\.\d{1,12})?$/.test(rate) && /[1-9]/.test(rate);
}

export function getPaymentValuationState(
  request: MonthlyValuationContext | null | undefined,
  valuation?: FxValuation | null,
): FxValuation["state"] {
  if (!valuation || valuation.amount_pen == null) return FX_VALUATION_STATE.UNVALUED;
  // El servidor conserva el importe; los marcadores sólo evitan un cierre visual falso.
  if (isMonthlyUsdValuation(request) && valuation.state !== FX_VALUATION_STATE.UNVALUED) {
    return valuation.state === FX_VALUATION_STATE.FINAL && hasAppliedMonthlyClose(request)
      ? FX_VALUATION_STATE.FINAL : FX_VALUATION_STATE.PROVISIONAL;
  }
  return valuation.state;
}

export function normalizeFinalRate(value: string): string {
  const text = value.trim();
  if (!/^\d{1,12}(?:\.\d{1,12})?$/.test(text) || !/[1-9]/.test(text)) {
    throw new Error("Ingresa un TC positivo en PEN por USD (máximo 12 decimales).");
  }
  const [whole, fraction = ""] = text.split(".");
  const tail = fraction.replace(/0+$/, "");
  return `${BigInt(whole)}${tail ? `.${tail}` : ""}`;
}

export function exactMoney(value: string | number): string {
  const text = String(value);
  if (!/^\d{1,36}(?:\.\d{1,2})?$/.test(text)) throw new Error("Importe original no válido; actualiza la solicitud.");
  const [whole, fraction = ""] = text.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

export function multiplyMoneyByRateHalfUp(amount: string, rate: string): string {
  const minor = BigInt(exactMoney(amount).replace(".", ""));
  const normalized = normalizeFinalRate(rate);
  const scale = normalized.split(".")[1]?.length ?? 0;
  const denominator = BigInt(10) ** BigInt(scale);
  const product = minor * BigInt(normalized.replace(".", ""));
  const cents = (product * BigInt(2) + denominator) / (denominator * BigInt(2));
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export function formatExactMoney(amount: string | number, currency: string): string {
  const [whole, fraction] = exactMoney(amount).split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

export function getExactPayablePrincipal(request: PaymentRequest): string {
  return exactMoney(isRexanExcessRequest(request)
    ? String(request.rexan_balance_amount)
    : request.original?.amount ?? request.requested_amount);
}
