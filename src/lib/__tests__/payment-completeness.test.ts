import { describe, expect, it } from "vitest";

import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import { PAYMENT_COMPLETENESS_STATE } from "@/types/requests";

describe("payment completeness presentation", () => {
  it.each([
    [PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING, ["Falta referencia"]],
    [PAYMENT_COMPLETENESS_STATE.PROOF_PENDING, ["Falta constancia"]],
    [PAYMENT_COMPLETENESS_STATE.BOTH_PENDING, ["Falta referencia", "Falta constancia"]],
    [PAYMENT_COMPLETENESS_STATE.COMPLETE, ["Pago completo"]],
  ])("maps %s to stable copy", (completeness, labels) => {
    expect(getPaymentCompletenessPresentation({ completeness })).toMatchObject({ completeness, labels });
  });

  it("supports existing pending aliases without SOURCE_REQUIRED", () => {
    expect(getPaymentCompletenessPresentation({ proof_pending: true, details_pending: false })).toMatchObject({
      completeness: PAYMENT_COMPLETENESS_STATE.PROOF_PENDING,
      labels: ["Falta constancia"],
    });
  });
});
