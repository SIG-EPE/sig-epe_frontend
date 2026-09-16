import { isRexanExcessRequest } from "@/lib/requests";
import type { PaymentRequest } from "@/types/requests";

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

export function isPaymentConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.statusCode === 409 || record.status === 409
    || /CONFLICT|ALREADY_PAID|STALE|LEASE|ASSIGNMENT/.test(String(record.code ?? record.error_code ?? ""));
}

export const PAYMENT_CONFLICT_MESSAGE = "El pago o la asignación cambió. Actualiza la cola y revisa el resultado antes de volver a operar; no se reenviará automáticamente.";
