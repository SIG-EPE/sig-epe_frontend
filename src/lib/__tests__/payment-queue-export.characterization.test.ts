import { describe, expect, it } from "vitest";

import {
  parsePaymentQueueUrl,
  PAYMENT_QUEUE_TAB,
  serializePaymentQueueUrl,
} from "@/lib/queue-filters/payment";
import { PAYMENT_QUEUE_STATUS } from "@/lib/requests";
import { PAYMENT_COMPLETENESS } from "@/types/requests";

describe("payment queue pre-export characterization", () => {
  it.each([
    [PAYMENT_QUEUE_TAB.APPROVED, PAYMENT_QUEUE_STATUS.PENDING, undefined],
    [PAYMENT_QUEUE_TAB.PAID, PAYMENT_QUEUE_STATUS.PAID, undefined],
    [
      PAYMENT_QUEUE_TAB.PENDING_DATA,
      PAYMENT_QUEUE_STATUS.PAID,
      PAYMENT_COMPLETENESS.ANY_MISSING,
    ],
    [PAYMENT_QUEUE_TAB.REJECTED, PAYMENT_QUEUE_STATUS.REJECTED, undefined],
  ])(
    "maps the current %s tab to its applied queue predicate",
    (tab, expectedStatus, expectedCompleteness) => {
      const parsed = parsePaymentQueueUrl(
        new URLSearchParams(`tab=${tab}&page=4&search=%20synthetic%20`),
      );
      expect(parsed.invalidKeys).toEqual([]);
      const { tab: activeTab, ...urlFilters } = parsed.filters;
      const appliedFilters = {
        ...urlFilters,
        status:
          activeTab === PAYMENT_QUEUE_TAB.APPROVED
            ? PAYMENT_QUEUE_STATUS.PENDING
            : activeTab === PAYMENT_QUEUE_TAB.REJECTED
              ? PAYMENT_QUEUE_STATUS.REJECTED
              : PAYMENT_QUEUE_STATUS.PAID,
        completeness:
          activeTab === PAYMENT_QUEUE_TAB.PENDING_DATA
            ? PAYMENT_COMPLETENESS.ANY_MISSING
            : urlFilters.completeness,
      };
      expect(appliedFilters).toMatchObject({
        page: 4,
        search: "synthetic",
        status: expectedStatus,
      });
      expect(appliedFilters.completeness).toBe(expectedCompleteness);
      expect(serializePaymentQueueUrl(parsed.filters).get("tab")).toBe(
        tab === PAYMENT_QUEUE_TAB.APPROVED ? null : tab,
      );
    },
  );

  it("reports unknown status and duplicate params rather than silently treating them as payment scope", () => {
    const parsed = parsePaymentQueueUrl(
      new URLSearchParams("status=PAID&search=one&search=two"),
    );
    expect(parsed.unknownKeys).toContain("status");
    expect(parsed.invalidKeys).toContain("search");
  });

  it.todo(
    "RED future payment export: URL encodes effective status/completeness without tab/page/limit",
  );
});
