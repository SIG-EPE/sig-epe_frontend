import { describe, expect, it } from "vitest";

import {
  parsePaymentQueueUrl,
  serializePaymentQueueUrl,
  updatePaymentQueueUrl,
} from "@/lib/queue-filters/payment";

describe("Payment queue URL adapter", () => {
  it("rechaza claves desconocidas, duplicadas y valores fuera de las allowlists", () => {
    const parsed = parsePaymentQueueUrl(new URLSearchParams(
      "tab=paid&tab=approved&status=VOIDED&drive_status=UNKNOWN&amount_min=1.00",
    ));

    expect(parsed.unknownKeys).toEqual(["status"]);
    expect(parsed.invalidKeys).toEqual(expect.arrayContaining([
      "tab",
      "drive_status",
      "amount_min",
    ]));
  });

  it("normaliza defaults, conserva filtros válidos y nunca serializa ALL", () => {
    const parsed = parsePaymentQueueUrl(new URLSearchParams(
      "tab=pending-data&page=2&search=%20REXAN%20&currency=PEN&amount_min=10.00&sort=payable_amount_desc",
    ));

    expect(parsed).toMatchObject({
      invalidKeys: [],
      unknownKeys: [],
      filters: {
        tab: "pending-data",
        page: 2,
        limit: 20,
        search: "REXAN",
        currency: "PEN",
        amount_min: "10.00",
        sort: "payable_amount_desc",
      },
    });
    expect(serializePaymentQueueUrl(parsed.filters).toString()).toBe(
      "tab=pending-data&page=2&search=REXAN&currency=PEN&amount_min=10.00&sort=payable_amount_desc",
    );
  });

  it("reinicia página al cambiar identidad y la conserva al paginar", () => {
    const current = new URLSearchParams("tab=paid&page=4&currency=USD");

    expect(updatePaymentQueueUrl(current, { completeness: "proof_missing" }).toString()).toBe(
      "tab=paid&completeness=proof_missing&currency=USD",
    );
    expect(updatePaymentQueueUrl(current, { page: 3 }).toString()).toBe(
      "tab=paid&page=3&currency=USD",
    );
  });
});
