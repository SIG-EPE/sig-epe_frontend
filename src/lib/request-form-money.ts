import { sumRequestAmounts } from "./request-supplier-policy";

// Compatibilidad de lectura: null no equivale a cero; las cadenas nunca pasan por Number.
export function requestMoneyInput(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function requestMoneyError(value: unknown, integerDigits = 10, allowZero = false): string | null {
  if (typeof value !== "string") return "El monto debe conservarse como cadena decimal exacta.";
  const text = value;
  if (!text) return "Ingresa el monto de la línea POA.";
  if (text.length > 128 || !/^\d+(?:\.\d{1,2})?$/.test(text)) return "Ingresa un monto exacto con hasta dos decimales, sin signos ni exponentes.";
  const [whole, fraction = ""] = text.split(".");
  if ((whole.replace(/^0+/, "") || "0").length > integerDigits) return `El monto no puede superar ${"9".repeat(integerDigits)}.99.`;
  if (!allowZero && BigInt(whole + fraction.padEnd(2, "0")) === BigInt(0)) return "El monto de la línea POA debe ser mayor a cero.";
  return null;
}

export function requestMoneyTotal(values: readonly unknown[]): string {
  for (const value of values) {
    const error = requestMoneyError(value);
    if (error) throw new Error(error);
  }
  const total = sumRequestAmounts(values as readonly string[]);
  const error = total === null ? "Ingresa montos exactos." : requestMoneyError(total, 16, true);
  if (error || total === null) throw new Error(error ?? "Ingresa montos exactos.");
  return total;
}
