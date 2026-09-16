import { describe, expect, it } from "vitest";

import {
  REQUEST_STATUS,
  type PaymentQueueResponse,
  type PaymentRequest,
} from "@/types/requests";

describe("rejected payment queue contract", () => {
  it("requires the safe payment_rejection projection for rejected queue rows", () => {
    const ordinaryReviewRejection = {
      status: REQUEST_STATUS.REJECTED,
    } as PaymentRequest;

    const invalidQueueResponse: PaymentQueueResponse = {
      // @ts-expect-error An ordinary review rejection has no PAYMENT_REJECTED projection.
      requests: [ordinaryReviewRejection],
      total: 1,
      page: 1,
      limit: 50,
      summary: { count: 1, payable_amount_by_currency: {}, status_counts: {} },
    };

    expect(invalidQueueResponse.requests[0]?.payment_rejection).toBeUndefined();
  });
});
