export const POA_PREFIX_HELP_TEXT =
  "Para generar el código POA oficial, usa solo letras A-Z y números 0-9, sin espacios ni símbolos. Se guardará en mayúsculas.";

export const POA_PREFIX_INVALID_MESSAGE =
  "La abreviatura de la unidad orgánica solo puede contener letras mayúsculas (A-Z) y números (0-9), sin espacios ni símbolos.";

export const POA_ORG_UNIT_INVALID_MESSAGE =
  "Esta unidad orgánica no puede usarse para crear líneas POA porque su abreviatura/código no cumple el formato oficial: solo letras A-Z y números 0-9, sin espacios ni símbolos.";

const POA_PREFIX_PATTERN = /^[A-Z0-9]+$/;

export interface PoaPrefixOrgUnitLike {
  code?: string | null;
  short_name?: string | null;
}

export function normalizeOptionalPoaPrefix(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length > 0 ? normalized : undefined;
}

export function isValidPoaPrefix(value: string | null | undefined): boolean {
  const normalized = normalizeOptionalPoaPrefix(value);
  return normalized !== undefined && POA_PREFIX_PATTERN.test(normalized);
}

export function getOrgUnitPoaPrefix(unit: PoaPrefixOrgUnitLike | null | undefined): string | undefined {
  return normalizeOptionalPoaPrefix(unit?.short_name) ?? normalizeOptionalPoaPrefix(unit?.code);
}

export function hasValidOrgUnitPoaPrefix(unit: PoaPrefixOrgUnitLike | null | undefined): boolean {
  return isValidPoaPrefix(getOrgUnitPoaPrefix(unit));
}
