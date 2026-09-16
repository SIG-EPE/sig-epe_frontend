import { BENEFICIARY_DOCUMENT_TYPE, type BeneficiaryDocumentType } from "@/types/requests";

export interface SupplierIdentitySource {
  supplier_document_type?: string | null;
  supplier_document_number?: string | null;
  supplier_name?: string | null;
  supplier_ruc?: string | null;
}

export interface SupplierIdentity {
  supplier_document_type: BeneficiaryDocumentType;
  supplier_document_number: string;
  supplier_name: string;
}

export interface SupplierPayeeSource extends SupplierIdentitySource {
  beneficiary_document_type?: string | null;
  beneficiary_document_number?: string | null;
  beneficiary_name?: string | null;
}

/** Compare the whole identity using backend normalization, never name-only guesses. */
export function supplierMatchesPayee(source: SupplierPayeeSource): boolean {
  const supplier = resolveSupplierIdentity(source);
  if (!supplier) return false;
  if (source.supplier_document_type != null || source.supplier_document_number != null) {
    const alias = source.supplier_ruc == null ? null : source.supplier_ruc.trim();
    if (alias !== (supplier.supplier_document_type === "RUC" ? supplier.supplier_document_number : null)) return false;
  }
  return supplier.supplier_document_type === source.beneficiary_document_type?.trim().toUpperCase()
    && supplier.supplier_document_number === source.beneficiary_document_number?.trim().toUpperCase()
    && supplier.supplier_name === source.beneficiary_name?.trim();
}

/** Consent is scoped to the saved identity, not currency or a new object reference. */
export function supplierPayeeConsentKey(source: SupplierPayeeSource & { id: string }): string {
  return JSON.stringify([source.id, source.supplier_document_type, source.supplier_document_number,
    source.supplier_name, source.supplier_ruc, source.beneficiary_document_type,
    source.beneficiary_document_number, source.beneficiary_name]);
}

export function resolveSupplierIdentity(source: SupplierIdentitySource): SupplierIdentity | null {
  const typed = source.supplier_document_type != null || source.supplier_document_number != null;
  const type = typed ? source.supplier_document_type?.trim().toUpperCase() : BENEFICIARY_DOCUMENT_TYPE.RUC;
  const number = (typed ? source.supplier_document_number : source.supplier_ruc)?.trim().toUpperCase() ?? "";
  const name = source.supplier_name?.trim() ?? "";
  if (!name || name.length > 255) return null;
  if (type === "RUC" && /^\d{11}$/.test(number) || type === "DNI" && /^\d{8}$/.test(number) || type === "CE" && /^[A-Z0-9]{6,12}$/.test(number)) {
    return { supplier_document_type: type as BeneficiaryDocumentType, supplier_document_number: number, supplier_name: name };
  }
  return null;
}

export function supplierIdentityPayload(source: SupplierIdentitySource): Partial<SupplierIdentity> & { supplier_ruc?: string } {
  if (Object.values(source).every((value) => value === undefined)) return {};
  const identity = resolveSupplierIdentity(source);
  if (!identity) throw new Error("SUPPLIER_IDENTITY_INVALID");
  if (source.supplier_ruc != null && (identity.supplier_document_type !== "RUC" || source.supplier_ruc.trim() !== identity.supplier_document_number)) {
    throw new Error("SUPPLIER_IDENTITY_CONFLICT");
  }
  return { ...identity, ...(identity.supplier_document_type === "RUC" ? { supplier_ruc: identity.supplier_document_number } : {}) };
}

export const USD_CONTRACT_NOTICE = "Opcional para solicitudes en dólares. El umbral de ½ UIT solo se aplica a solicitudes en soles.";

function exactMinor(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function sumRequestAmounts(values: readonly (string | number)[]): string | null {
  let total = BigInt(0);
  for (const value of values) {
    const minor = exactMinor(String(value));
    if (minor === null) return null;
    total += minor;
  }
  return `${total / BigInt(100)}.${String(total % BigInt(100)).padStart(2, "0")}`;
}

// El llamador debe preferir el snapshot histórico; nunca se consulta el año actual por defecto.
export function supplierContractRequirement(currency: unknown, total: string, annualUit: string | null | undefined) {
  if (currency === "USD") return { required: false, error: null };
  if (currency !== "PEN") return { required: false, error: "LEGACY_CURRENCY_RESOLUTION_REQUIRED" };
  const uit = exactMinor(annualUit);
  if (uit === null || uit <= BigInt(0)) return { required: false, error: "UIT_NOT_CONFIGURED" };
  const amount = exactMinor(total);
  if (amount === null || amount < BigInt(0)) return { required: false, error: "REQUEST_AMOUNT_INVALID" };
  return { required: amount * BigInt(2) > uit, error: null };
}
