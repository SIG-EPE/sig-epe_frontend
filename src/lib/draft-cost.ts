const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const MAX_TOTAL_CENTS = BigInt("999999999999");

function cents(value: string, maxIntegerDigits: number): bigint | null {
  const trimmed = value.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const [integer, fraction = ""] = trimmed.split(".");
  if (integer.length > maxIntegerDigits) return null;
  const result =
    BigInt(integer) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (result > BigInt("9".repeat(maxIntegerDigits)) * BigInt(100) + BigInt(99))
    return null;
  return result;
}

function decimal(value: bigint): string {
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}

interface DraftCostErrors {
  unit_price?: string;
  quantity?: string;
  total?: string;
}

export function buildDraftCost(
  unitPrice: string,
  quantity: string,
): {
  request: { unit_price: number; quantity: number } | null;
  total: string | null;
  errors: DraftCostErrors;
} {
  const priceCents = cents(unitPrice, 10);
  const quantityHundredths = cents(quantity, 8);
  const errors: DraftCostErrors = {};
  if (priceCents === null)
    errors.unit_price =
      "Ingresa un precio entre 0 y 9999999999.99, con máximo dos decimales.";
  if (quantityHundredths === null)
    errors.quantity =
      "Ingresa una cantidad entre 0 y 99999999.99, con máximo dos decimales.";
  if (priceCents === null || quantityHundredths === null)
    return { request: null, total: null, errors };

  // PostgreSQL guarda el total generado con escala 2 (redondeo de mitad hacia arriba).
  const totalCents =
    (priceCents * quantityHundredths + BigInt(50)) / BigInt(100);
  if (totalCents > MAX_TOTAL_CENTS) {
    errors.total = "El total supera el máximo admitido (S/ 9999999999.99).";
    return { request: null, total: decimal(totalCents), errors };
  }
  return {
    request: {
      unit_price: Number(decimal(priceCents)),
      quantity: Number(decimal(quantityHundredths)),
    },
    total: decimal(totalCents),
    errors,
  };
}
