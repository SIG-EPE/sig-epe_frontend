import { describe, expect, it } from "vitest";
import { getRegisteredPartyDisplay, getRegisteredPartyDocumentLabel } from "@/lib/requests";

describe("supplier read identity boundary", () => {
  it("never substitutes the bank payee for an unresolved supplier", () => {
    const request = { request_type: "SUPPLIER_PAYMENT", beneficiary_name: "Payee B", beneficiary_document_type: "DNI", beneficiary_document_number: "12345678" };
    expect(getRegisteredPartyDisplay(request)).toBe("Proveedor pendiente de resolución");
    expect(getRegisteredPartyDocumentLabel(request)).toBe("—");
  });
  it("uses canonical CE instead of a stale RUC alias", () => {
    const request = { request_type: "SUPPLIER_PAYMENT", supplier_document_type: "CE", supplier_document_number: "ab1234", supplier_name: "Supplier A", supplier_ruc: "20123456789", beneficiary_name: "Payee B" };
    expect(getRegisteredPartyDisplay(request)).toBe("Supplier A");
    expect(getRegisteredPartyDocumentLabel(request)).toBe("CE AB1234");
  });
});
