const FISCAL_YEAR_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  CLOSED: "Cerrado",
};

const UPPERCASE_WORD_EXCEPTIONS = new Set(["POA", "SIG", "EPE", "GIOF", "RUC", "IGV", "USD", "PEN"]);

interface NamedCatalogItem {
  code?: string | null;
  name: string;
  short_name?: string | null;
}

interface FiscalYearLabelInput {
  year: number | string;
  status?: string | null;
}

function isMostlyUppercase(value: string): boolean {
  const letters = value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function toBusinessTitleCase(value: string): string {
  return value
    .toLocaleLowerCase("es-PE")
    .replace(/(^|[\s/([{¿¡-])([\p{L}])/gu, (match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("es-PE")}`)
    .replace(/\b(poa|sig|epe|giof|ruc|igv|usd|pen)\b/giu, (word) => word.toLocaleUpperCase("es-PE"));
}

export function formatBusinessName(value?: string | null): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "Sin nombre";
  if (UPPERCASE_WORD_EXCEPTIONS.has(normalized)) return normalized;
  return isMostlyUppercase(normalized) ? toBusinessTitleCase(normalized) : normalized;
}

export function getFiscalYearStatusLabel(status?: string | null): string {
  if (!status) return "";
  return FISCAL_YEAR_STATUS_LABELS[status] ?? formatBusinessName(status.replaceAll("_", " "));
}

export function getFiscalYearSelectLabel(fiscalYear: FiscalYearLabelInput, options: { includeStatus?: boolean } = {}): string {
  const includeStatus = options.includeStatus ?? true;
  const year = String(fiscalYear.year);
  if (!includeStatus) return year;
  const statusLabel = getFiscalYearStatusLabel(fiscalYear.status);
  return statusLabel ? `${year} — ${statusLabel}` : year;
}

export function getOrgUnitFilterLabel(unit: Pick<NamedCatalogItem, "name">): string {
  return formatBusinessName(unit.name);
}

export function getCatalogOptionLabel(item: NamedCatalogItem, options: { includeCode?: boolean } = {}): string {
  const name = formatBusinessName(item.name);
  if (!options.includeCode) return name;
  const prefix = item.code?.trim() || item.short_name?.trim();
  return prefix ? `${prefix} — ${name}` : name;
}
