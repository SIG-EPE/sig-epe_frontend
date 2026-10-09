import { expect, it } from "vitest";
import { getPaymentValuationState, hasAppliedMonthlyClose } from "../payment-fx";
import type { FxValuation, PaymentRequest } from "@/types/requests";

const request = {
  currency: "USD", fx_policy_version: "MONTHLY_V1",
  monthly_fx_applied_close_month: "2026-09-01",
  monthly_fx_applied_close_rate: "3.780000000000",
} satisfies Partial<PaymentRequest>;
const valuation: FxValuation = {
  amount_pen: "378.00", accounting_currency: "PEN", state: "FINAL",
  reference: null, final_rate: "3.780000000000", final_confirmed_at: null,
  final_confirmed_by: null, origin_execution_id: null,
};

it("requires both trusted markers and server FINAL; never converts amounts", () => {
  expect(hasAppliedMonthlyClose(request)).toBe(true);
  expect(getPaymentValuationState(request, valuation)).toBe("FINAL");
  expect(getPaymentValuationState(request, { ...valuation, state: "PROVISIONAL" })).toBe("PROVISIONAL");
  expect(valuation.amount_pen).toBe("378.00");
});
it.each([null, undefined, "", "0000-09-01", "2026-13-01", "2026-09-02", " 2026-09-01"])("rejects close month %s", (month) => {
  const row = { ...request, monthly_fx_applied_close_month: month };
  expect(hasAppliedMonthlyClose(row)).toBe(false);
  expect(getPaymentValuationState(row, valuation)).toBe("PROVISIONAL");
});
it.each([null, undefined, "0", "-3.78", "3e0", " 3.78", "3.1234567890123"])("rejects close rate %s", (rate) => {
  const row = { ...request, monthly_fx_applied_close_rate: rate };
  expect(hasAppliedMonthlyClose(row)).toBe(false);
  expect(getPaymentValuationState(row, valuation)).toBe("PROVISIONAL");
});
it("preserves legacy final, legacy provisional, PEN identity and unresolved states", () => {
  expect(getPaymentValuationState({ currency: "USD" }, valuation)).toBe("FINAL");
  expect(getPaymentValuationState({ currency: "USD" }, { ...valuation, state: "PROVISIONAL" })).toBe("PROVISIONAL");
  expect(getPaymentValuationState({ ...request, currency: "PEN" }, { ...valuation, state: "IDENTITY" })).toBe("IDENTITY");
  expect(getPaymentValuationState(request, { ...valuation, amount_pen: null })).toBe("UNVALUED");
  expect(getPaymentValuationState(request, null)).toBe("UNVALUED");
});
