import type { PlanningLine, PlanningLineHierarchyInput } from "@/types/budget";
import type { FundingMembershipChanges } from "@/lib/approved-funding";

export const APPROVED_IMPORTANCE = [
  "Actividad estratégica",
  "Actividad no estratégica",
] as const;
export const APPROVED_FREQUENCY = [
  "Actividad Rutinaria",
  "Actividad Periódica",
  "Actividad Ocasional",
  "Actividad de largo alcance",
] as const;

export interface ApprovedAmendmentMonth {
  month: number;
  planned_amount: string;
}
export interface ApprovedAmendmentFields {
  unit_price: string;
  quantity: string;
  importance: string;
  frequency: string;
  monthly: ApprovedAmendmentMonth[];
  resource_description: string;
}
export interface ApprovedAmendmentRequest {
  expected_revision: string;
  unit_price: string;
  quantity: string;
  importance: string;
  frequency: string;
  monthly: ApprovedAmendmentMonth[];
  resource_description?: string;
  hierarchy?: PlanningLineHierarchyInput;
  budget_category_id?: string;
  funding_membership_changes?: FundingMembershipChanges;
}
export interface ApprovedAmendmentErrors {
  budget_category_id?: string;
  unit_price?: string;
  quantity?: string;
  importance?: string;
  frequency?: string;
  monthly?: string;
  resource_description?: string;
  revision?: string;
}

const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
function cents(value: string, maxDigits: number): bigint | null {
  const match = DECIMAL.exec(value);
  if (!match || match[1].length > maxDigits) return null;
  return BigInt(match[1]) * HUNDRED + BigInt((match[2] ?? "").padEnd(2, "0"));
}
function decimal(value: bigint): string {
  if (value < ZERO) return `-${decimal(-value)}`;
  return `${value / HUNDRED}.${(value % HUNDRED).toString().padStart(2, "0")}`;
}

export function approvedAmendmentDistribution(
  monthly: ApprovedAmendmentMonth[],
  total: string | null,
): { distributed: string | null; remaining: string | null } {
  const seen = new Set<number>();
  let sum = ZERO;
  if (monthly.length !== 12) return { distributed: null, remaining: null };
  for (const entry of monthly) {
    const amount = cents(entry.planned_amount, 10);
    if (
      !Number.isInteger(entry.month) ||
      entry.month < 1 ||
      entry.month > 12 ||
      seen.has(entry.month) ||
      amount === null
    )
      return { distributed: null, remaining: null };
    seen.add(entry.month);
    sum += amount;
  }
  const totalCents = total === null ? null : cents(total, 10);
  return {
    distributed: decimal(sum),
    remaining: totalCents === null ? null : decimal(totalCents - sum),
  };
}

export function seedApprovedAmendment(
  line: PlanningLine,
): ApprovedAmendmentFields | null {
  // Solo los sidecars DB conservan los centavos: numeric puede serializarse como string
  // y Number → String no puede reconstruir centavos ya perdidos.
  const unit_price = line.unit_price_decimal;
  const quantity = line.quantity_decimal;
  const entries = line.monthlyDistribution ?? line.monthly_distribution;
  if (
    typeof unit_price !== "string" ||
    cents(unit_price, 10) === null ||
    typeof quantity !== "string" ||
    cents(quantity, 8) === null ||
    !entries ||
    entries.length !== 12
  )
    return null;
  const seen = new Set<number>();
  const monthly: ApprovedAmendmentMonth[] = [];
  for (const entry of entries) {
    const amount = entry.monthly_programmed_decimal;
    if (
      !Number.isInteger(entry.month) ||
      entry.month < 1 ||
      entry.month > 12 ||
      seen.has(entry.month) ||
      typeof amount !== "string" ||
      cents(amount, 10) === null
    )
      return null;
    seen.add(entry.month);
    monthly.push({ month: entry.month, planned_amount: amount });
  }
  return {
    unit_price,
    quantity,
    importance: line.importance ?? "",
    frequency: line.frequency ?? "",
    monthly: monthly.sort((a, b) => a.month - b.month),
    resource_description: line.resource_description,
  };
}

export function buildApprovedAmendment(
  fields: ApprovedAmendmentFields,
  revision: string,
  hasCatalogResource: boolean,
  hierarchy?: PlanningLineHierarchyInput,
  category?: { baselineId: string; selectedId: string },
  fundingChanges?: FundingMembershipChanges | null,
): {
  request: ApprovedAmendmentRequest | null;
  errors: ApprovedAmendmentErrors;
  total: string | null;
} {
  const errors: ApprovedAmendmentErrors = {};
  const price = cents(fields.unit_price, 10);
  const quantity = cents(fields.quantity, 8);
  if (price === null)
    errors.unit_price =
      "Ingresa un precio no negativo con máximo dos decimales y diez dígitos enteros.";
  if (quantity === null)
    errors.quantity =
      "Ingresa una cantidad no negativa con máximo dos decimales y ocho dígitos enteros.";
  const product = price !== null && quantity !== null ? price * quantity : null;
  const total =
    product !== null &&
    product % HUNDRED === ZERO &&
    product / HUNDRED <= BigInt("999999999999")
      ? product / HUNDRED
      : null;
  if (product !== null && total === null)
    errors.quantity =
      "Precio por cantidad debe tener centavos exactos y no superar el límite permitido.";
  if (!APPROVED_IMPORTANCE.some((option) => option === fields.importance))
    errors.importance = "Selecciona una importancia válida.";
  if (!APPROVED_FREQUENCY.some((option) => option === fields.frequency))
    errors.frequency = "Selecciona una frecuencia válida.";
  if (
    !/^(0|[1-9]\d{0,18})$/.test(revision) ||
    BigInt(revision) > BigInt("9223372036854775806")
  )
    errors.revision = "No hay una revisión válida; vuelve a cargar la línea.";
  const seen = new Set<number>();
  let monthlySum = ZERO;
  if (fields.monthly.length !== 12)
    errors.monthly = "Se requieren exactamente los doce meses.";
  for (const entry of fields.monthly) {
    if (
      !Number.isInteger(entry.month) ||
      entry.month < 1 ||
      entry.month > 12 ||
      seen.has(entry.month)
    )
      errors.monthly = "Los doce meses deben ser únicos y válidos.";
    seen.add(entry.month);
    const value = cents(entry.planned_amount, 10);
    if (value === null)
      errors.monthly =
        "Cada mes requiere un importe no negativo con hasta dos decimales.";
    else monthlySum += value;
  }
  if (total !== null && monthlySum !== total)
    errors.monthly =
      "La suma de los doce meses debe coincidir exactamente con precio por cantidad.";
  if (
    !hasCatalogResource && !hierarchy &&
    (!fields.resource_description.trim() ||
      fields.resource_description.length > 2000)
  )
    errors.resource_description =
      "La descripción es obligatoria y admite hasta 2000 caracteres.";
  if (category && (!category.selectedId || !category.baselineId))
    errors.budget_category_id = "Selecciona un tipo de recurso válido.";
  if (Object.keys(errors).length || total === null)
    return {
      request: null,
      errors,
      total: total === null ? null : decimal(total),
    };
  return {
    request: {
      expected_revision: revision,
      unit_price: fields.unit_price,
      quantity: fields.quantity,
      importance: fields.importance,
      frequency: fields.frequency,
      monthly: fields.monthly
        .map(({ month, planned_amount }) => ({ month, planned_amount }))
        .sort((a, b) => a.month - b.month),
      ...(!hasCatalogResource && !hierarchy
        ? { resource_description: fields.resource_description }
        : {}),
      ...(hierarchy ? { hierarchy } : {}),
      ...(category && category.selectedId !== category.baselineId
        ? { budget_category_id: category.selectedId }
        : {}),
      ...(fundingChanges ? { funding_membership_changes: fundingChanges } : {}),
    },
    errors,
    total: decimal(total!),
  };
}
