export function normalizeDecimalInput(value: string): string {
  const normalizedSeparator = value.replace(/,/g, ".");
  const sanitized = normalizedSeparator.replace(/[^\d.]/g, "");
  const [rawInteger = "", ...fractionParts] = sanitized.split(".");
  const hasDecimalSeparator = sanitized.includes(".");
  const fraction = fractionParts.join("");

  if (!rawInteger && !hasDecimalSeparator) return "";

  const integer = rawInteger.replace(/^0+(?=\d)/, "") || "0";
  return hasDecimalSeparator ? `${integer}.${fraction}` : integer;
}

export function parseDecimalInput(value: string): number | undefined {
  if (value.trim() === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
