import { z } from "zod";
import { ApiRequestError } from "@/lib/api-client";

export const annualUitInputSchema = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Use un valor positivo con máximo dos decimales, sin separadores de miles.",
  )
  .refine(
    (value) => Number(value) >= 0.01 && Number(value) <= 9999999999.99,
    "Valor UIT debe estar entre 0.01 y 9999999999.99 PEN.",
  );

export function draftUitChange(
  value: string,
  previous?: string | null,
): { annual_uit?: number } {
  if (value === "") return {};
  const valid = annualUitInputSchema.parse(value);
  if (previous != null && Number(valid) === Number(previous)) return {};
  // El DTO real recibe número; se valida el texto antes, sin redondeo.
  return { annual_uit: Number(valid) };
}

export function formatAnnualUit(value: string | null | undefined): string {
  if (value == null) return "Sin configurar";
  if (!annualUitInputSchema.safeParse(value).success)
    return `PEN ${value} (inválido)`;
  const [whole, fraction = ""] = value.split(".");
  return `PEN ${whole}.${fraction.padEnd(2, "0")}`;
}

export function fiscalYearErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const message = Array.isArray(error.body.message)
      ? error.body.message.join(". ")
      : error.body.message;
    return `${message}${error.body.code ? ` (${error.body.code})` : ""}`;
  }
  return error instanceof Error
    ? error.message
    : "No se pudo confirmar la operación.";
}
