import { describe, expect, it } from "vitest";
import { resolveSupplierIdentity, supplierIdentityPayload, supplierContractRequirement, supplierMatchesPayee } from "@/lib/request-supplier-policy";

describe("supplier identity and immutable threshold", () => {
  it("matches full normalized identities, not names alone or malformed evidence", () => {
    const source = { supplier_document_type: "CE", supplier_document_number: " ab1234 ", supplier_name: " Provider ", beneficiary_document_type: "CE", beneficiary_document_number: "AB1234", beneficiary_name: "Provider" };
    expect(supplierMatchesPayee(source)).toBe(true);
    expect(supplierMatchesPayee({ ...source, beneficiary_document_number: "AB5678" })).toBe(false);
    expect(supplierMatchesPayee({ ...source, beneficiary_document_type: "DNI" })).toBe(false);
    expect(supplierMatchesPayee({ ...source, beneficiary_name: "provider" })).toBe(false);
    expect(supplierMatchesPayee({ ...source, supplier_ruc: "20123456789" })).toBe(false);
    expect(supplierMatchesPayee({ ...source, supplier_document_number: null })).toBe(false);
    expect(supplierMatchesPayee({ supplier_name: null, supplier_ruc: null })).toBe(false);
    expect(supplierMatchesPayee({ supplier_ruc: "20123456789", supplier_name: "Provider", beneficiary_document_type: "RUC", beneficiary_document_number: "20123456789", beneficiary_name: "Provider" })).toBe(true);
  });
  it.each([["RUC", "20123456789"], ["DNI", "12345678"], ["CE", "ab1234"]])("normalizes %s independently of payee", (type, number) => {
    const input = { supplier_document_type: type, supplier_document_number: number, supplier_name: " Provider A " };
    expect(resolveSupplierIdentity(input)).toEqual({ supplier_document_type: type, supplier_document_number: number.toUpperCase(), supplier_name: "Provider A" });
    expect(supplierIdentityPayload(input).supplier_ruc).toBe(type === "RUC" ? number : undefined);
  });
  it("resolves only validated legacy RUC and never substitutes bank payee", () => {
    expect(resolveSupplierIdentity({ supplier_ruc: "20123456789", supplier_name: "A" })?.supplier_document_type).toBe("RUC");
    expect(resolveSupplierIdentity({ supplier_ruc: "12345678", supplier_name: "A" })).toBeNull();
    expect(resolveSupplierIdentity({})).toBeNull();
    expect(resolveSupplierIdentity({ supplier_document_type: "DNI", supplier_document_number: null, supplier_name: "A", supplier_ruc: "20123456789" })).toBeNull();
  });
  it("rejects partial and conflicting writes instead of omitting supplier data", () => {
    expect(supplierIdentityPayload({})).toEqual({});
    expect(() => supplierIdentityPayload({ supplier_name: "A" })).toThrow("SUPPLIER_IDENTITY_INVALID");
    expect(() => supplierIdentityPayload({ supplier_document_type: "DNI", supplier_document_number: "12345678", supplier_name: "A", supplier_ruc: "20123456789" })).toThrow("SUPPLIER_IDENTITY_CONFLICT");
  });
  it.each([["2500.00", "5000.00", false], ["2499.99", "5000.00", false], ["2500.01", "5000.00", true], ["2500.00", "5000.01", false], ["2500.01", "5000.01", true]])("compares exact doubled minor %s to UIT %s", (total, uit, required) => {
    expect(supplierContractRequirement("PEN", total, uit)).toEqual({ required, error: null });
  });
  it("fails closed for missing PEN UIT but never gates USD", () => {
    expect(supplierContractRequirement("PEN", "1", null).error).toBe("UIT_NOT_CONFIGURED");
    expect(supplierContractRequirement("USD", "999999", null)).toEqual({ required: false, error: null });
  });
});
