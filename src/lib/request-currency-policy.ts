import { REQUEST_CURRENCY } from "@/types/requests";

export function validatePoaCurrencies(currency: unknown, lines: readonly unknown[]): string | null {
  if (currency !== REQUEST_CURRENCY.PEN && currency !== REQUEST_CURRENCY.USD) {
    return "La moneda de la solicitud está pendiente de resolución.";
  }
  if (!lines.length || lines.some((line) => line !== REQUEST_CURRENCY.PEN && line !== REQUEST_CURRENCY.USD)) {
    return "Todas las líneas POA deben tener una moneda resuelta.";
  }
  if (new Set(lines).size !== 1) return "No se pueden mezclar líneas POA en soles y dólares.";
  if (currency === REQUEST_CURRENCY.PEN && lines[0] !== REQUEST_CURRENCY.PEN) {
    return "Una solicitud en soles solo puede usar líneas POA en soles.";
  }
  return null;
}

export function canPreviewPenBudget(currency: unknown, lines: readonly unknown[]): boolean {
  return currency === REQUEST_CURRENCY.PEN && validatePoaCurrencies(currency, lines) === null;
}
