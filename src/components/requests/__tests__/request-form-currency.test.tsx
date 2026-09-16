import { describe, expect, it } from "vitest";
import { getRequestFormDefaultValues, normalizeRequestAmountInput, requestFormSchema, toCreateRequestDto, toUpdateRequestDto, type RequestFormValues } from "@/components/requests/request-form";
import type { PaymentRequest } from "@/types/requests";

const values: RequestFormValues = {
  request_type: "SUPPLIER_PAYMENT", currency: "USD", concept: "Supplier payment",
  allocations: [{ client_key: "a", budget_planning_line_id: "poa", amount: "100" }],
  supplier_document_type: "DNI", supplier_document_number: "12345678", supplier_name: "Supplier A",
  beneficiary_document_type: "CE", beneficiary_document_number: "ab1234", beneficiary_name: "Payee B",
};
describe("request currency and supplier payload", () => {
  it.each([toCreateRequestDto, toUpdateRequestDto])("preserves explicit USD and derives payee from provider", (build) => {
    const dto = build(values);
    expect(dto).toMatchObject({ currency: "USD", supplier_document_type: "DNI", supplier_document_number: "12345678", supplier_name: "Supplier A", beneficiary_document_type: "DNI", beneficiary_document_number: "12345678", beneficiary_name: "Supplier A" });
    expect(dto.supplier_ruc).toBeUndefined();
    expect(dto.requested_amount).toBe("100.00");
  });
  it.each(["RUC", "DNI", "CE"] as const)("derives both create/update identities for %s and preserves banking", (type) => {
    const number = type === "RUC" ? "20123456789" : type === "DNI" ? "87654321" : "ab1234";
    const input = { ...values, supplier_document_type: type, supplier_document_number: number, supplier_name: " Provider ", supplier_ruc: "20123456789", bank_code: "BBVA" as const, account_type: "SAVINGS" as const, bank_account: "1234567890", bank_cci: "12345678901234567890" };
    for (const build of [toCreateRequestDto, toUpdateRequestDto]) {
      expect(build(input)).toMatchObject({ supplier_document_type: type, supplier_document_number: number.toUpperCase(), supplier_name: "Provider", beneficiary_document_type: type, beneficiary_document_number: number.toUpperCase(), beneficiary_name: "Provider", bank_code: "BBVA", account_type: "SAVINGS", bank_account: input.bank_account, bank_cci: input.bank_cci });
      expect(build(input).supplier_ruc).toBe(type === "RUC" ? number : undefined);
    }
  });
  it("does not manufacture PEN for unresolved legacy PATCH", () => {
    expect(toUpdateRequestDto({ ...values, currency: null }).currency).toBeUndefined();
  });
  it("does not override inherited settlement data", () => {
    expect(toUpdateRequestDto(values, "ADVANCE_SETTLEMENT")).toEqual({});
  });
  it.each([toCreateRequestDto, toUpdateRequestDto])("preserves explicit false declarations and omits unknown", (build) => {
    expect(build({ ...values, declares_rus: false, declares_casa_de_retiro: true })).toMatchObject({ declares_rus: false, declares_casa_de_retiro: true });
    expect(build({ ...values, declares_rus: null }).declares_rus).toBeUndefined();
  });
  it("sums original cents without floating point residue", () => {
    expect(toCreateRequestDto({ ...values, allocations: [
      { client_key: "a", budget_planning_line_id: "a", amount: "0.1" },
      { client_key: "b", budget_planning_line_id: "b", amount: "0.2" },
    ] }).requested_amount).toBe("0.30");
  });
  it.each(["", "0", "-1", "1.001", "1.000", "10000000000.00", "1e2"])("rejects invalid allocation %s without rounding", (amount) => {
    const input = { ...values, allocations: [{ ...values.allocations[0], amount }] };
    expect(requestFormSchema.safeParse(input).success).toBe(false);
    expect(() => toCreateRequestDto(input)).toThrow();
  });
  it("preserves raw decimal precision on blur and exact string payloads", () => {
    expect(normalizeRequestAmountInput("0001.000")).toBe("0001.000");
    expect(normalizeRequestAmountInput("9999999999999999.99")).toBe("9999999999999999.99");
    const input = { ...values, allocations: [{ ...values.allocations[0], amount: "9999999999.99" }] };
    expect(requestFormSchema.parse(input).allocations[0].amount).toBe("9999999999.99");
    expect(toCreateRequestDto(input)).toMatchObject({ requested_amount: "9999999999.99", allocations: [{ amount: "9999999999.99" }] });
  });
  it("requires an explicit approved create currency", () => {
    expect(() => toCreateRequestDto({ ...values, currency: null })).toThrow();
    expect(() => toCreateRequestDto({ ...values, currency: undefined })).toThrow();
  });
  it("rejects numeric form money so writes originate from exact decimal strings", () => {
    expect(requestFormSchema.safeParse({ ...values, allocations: [{ ...values.allocations[0], amount: 0.1 }] }).success).toBe(false);
  });
  it("hydrates edit/reset state without guessing legacy currency or merging provider and payee", () => {
    const request = {
      id: "legacy", request_type: "SUPPLIER_PAYMENT", currency: null, requested_amount: "10.20", concept: "Supplier payment",
      supplier_ruc: "20123456789", supplier_name: "Supplier A", beneficiary_document_type: "DNI", beneficiary_document_number: "12345678", beneficiary_name: "Payee B",
      declares_rus: false, declares_casa_de_retiro: true,
      allocations: [{ id: "allocation", budget_planning_line_id: "poa", amount: "10.20" }],
    } as unknown as PaymentRequest;
    expect(getRequestFormDefaultValues(request)).toMatchObject({
      currency: null,
      requested_amount: "10.20",
      allocations: [{ budget_planning_line_id: "poa", amount: "10.20" }],
      supplier_document_type: "RUC", supplier_document_number: "20123456789", supplier_name: "Supplier A",
      beneficiary_document_type: "DNI", beneficiary_document_number: "12345678", beneficiary_name: "Payee B",
      declares_rus: false, declares_casa_de_retiro: true,
    });
    expect(getRequestFormDefaultValues()).toMatchObject({ currency: "PEN", requested_amount: "", declares_rus: null, declares_casa_de_retiro: null });
  });
});
