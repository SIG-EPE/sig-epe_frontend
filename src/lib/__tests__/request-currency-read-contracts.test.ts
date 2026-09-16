import { expect, expectTypeOf, it } from "vitest";
import { formatRequestCurrency } from "@/lib/requests";
import type {
  BulkRegisterPaymentItemInput,
  CreateRequestDto,
  PaymentRequest,
  RequestCurrency,
  RequestReceipt,
} from "@/types/requests";

it("mantiene lecturas nullable sin admitir null en los contratos de escritura", () => {
  expectTypeOf<
    PaymentRequest["currency"]
  >().toEqualTypeOf<RequestCurrency | null>();
  expectTypeOf<RequestReceipt["currency"]>().toEqualTypeOf<string | null>();
  expectTypeOf<CreateRequestDto["currency"]>().toEqualTypeOf<
    RequestCurrency
  >();
  expectTypeOf<
    BulkRegisterPaymentItemInput["expected_original_currency"]
  >().toEqualTypeOf<RequestCurrency>();

  const receipt: Pick<RequestReceipt, "amount" | "currency"> = {
    amount: 25,
    currency: null,
  };
  expect(formatRequestCurrency(receipt.amount ?? 0, receipt.currency)).toBe(
    "25.00 · Moneda pendiente de resolución",
  );
  expect(receipt.currency).toBeNull();
});
