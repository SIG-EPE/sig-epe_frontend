import { z } from "zod";

export const EPE_DNI_LENGTH = 8;

export const userEmailSchema = z
  .string()
  .trim()
  .min(1, "Ingresa tu correo electrónico")
  .email("Ingresa un correo válido");

export const optionalUserEmailSchema = z
  .string()
  .trim()
  .email("Ingresa un correo válido")
  .optional()
  .or(z.literal(""));

export function sanitizeEpeDni(value: string): string {
  return value.replace(/\D+/g, "").slice(0, EPE_DNI_LENGTH);
}
