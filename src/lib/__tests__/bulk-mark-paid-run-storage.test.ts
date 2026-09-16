import { beforeEach, describe, expect, it } from "vitest";

import {
  BULK_MARK_PAID_RUN_PHASE,
  clearBulkMarkPaidRunStorage,
  createBulkMarkPaidRunStorageKey,
  loadBulkMarkPaidRun,
  saveBulkMarkPaidRun,
  synchronizeBulkMarkPaidRunScope,
  type BulkMarkPaidRunScope,
} from "../bulk-mark-paid-run-storage";
import { createBulkMarkPaidRun } from "@/hooks/use-bulk-mark-paid-orchestrator";

const SCOPE: BulkMarkPaidRunScope = {
  userId: "user-1",
  sessionId: "session-1",
  pageIdentity: "payments?page=2",
};

describe("bulk mark-paid run session storage", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips stable commands, chunks, statuses, results, and ambiguous intent without credentials", () => {
    const run = createBulkMarkPaidRun({
      scope: SCOPE,
      pageRequestIds: ["request-1"],
      selected: [
        {
          requestId: "request-1",
          originalAmount: "10.25",
          originalCurrency: "PEN",
        },
      ],
      paidAt: "2026-09-14T10:00:00.000Z",
      createId: () => "stable-id",
      now: () => "2026-09-14T09:00:00.000Z",
    });
    const contaminated = {
      ...run,
      phase: BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS,
      results: {
        "request-1": {
          request_id: "request-1",
          command_id: "stable-id",
          outcome: "SUCCESS" as const,
          payment_id: "payment-1",
          code: "PAID",
          message: "Registrado",
          original: { amount: "10.25", currency: "PEN" as const },
          actual_disbursement: null,
          valuation: null,
          missing_fields: [],
          rexan_activation: null,
        },
      },
      ambiguousIntent: {
        chunkId: run.chunks[0].id,
        fingerprint: run.chunks[0].fingerprint,
        requestIds: ["request-1"],
        lease_token: "must-not-survive",
      },
    };

    saveBulkMarkPaidRun(SCOPE, contaminated);

    const raw = sessionStorage.getItem(createBulkMarkPaidRunStorageKey(SCOPE));
    expect(raw).not.toContain("must-not-survive");
    expect(raw).not.toMatch(/lease[_-]?token|access[_-]?token|authorization/i);
    expect(loadBulkMarkPaidRun(SCOPE, { recover: false })).toMatchObject({
      runId: "stable-id",
      phase: BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS,
      commands: [{ commandId: "stable-id" }],
      chunks: [{ requestIds: ["request-1"] }],
      results: {
        "request-1": {
          original: { amount: "10.25", currency: "PEN" },
          outcome: "SUCCESS",
        },
      },
      ambiguousIntent: { requestIds: ["request-1"] },
    });
  });

  it("removes invalid and unsupported versions and restores active work as recovery-required", () => {
    const key = createBulkMarkPaidRunStorageKey(SCOPE);
    sessionStorage.setItem(key, "not-json");
    expect(loadBulkMarkPaidRun(SCOPE)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();

    sessionStorage.setItem(key, JSON.stringify({ version: 999 }));
    expect(loadBulkMarkPaidRun(SCOPE)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();

    const run = createBulkMarkPaidRun({
      scope: SCOPE,
      pageRequestIds: ["request-1"],
      selected: [
        {
          requestId: "request-1",
          originalAmount: "1.00",
          originalCurrency: "USD",
        },
      ],
      paidAt: "2026-09-14T10:00:00.000Z",
      createId: () => "id",
    });
    saveBulkMarkPaidRun(SCOPE, {
      ...run,
      phase: BULK_MARK_PAID_RUN_PHASE.SUBMITTING,
    });
    expect(loadBulkMarkPaidRun(SCOPE)?.phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED,
    );

    saveBulkMarkPaidRun(SCOPE, {
      ...run,
      phase: BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS,
      ambiguousIntent: {
        chunkId: run.chunks[0].id,
        fingerprint: run.chunks[0].fingerprint,
        requestIds: ["request-1"],
      },
    });
    expect(loadBulkMarkPaidRun(SCOPE)?.phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED,
    );
  });

  it("cleans runs on auth/session scope changes, logout, and explicit completion cleanup", () => {
    const otherScope = { ...SCOPE, userId: "user-2" };
    const run = createBulkMarkPaidRun({
      scope: SCOPE,
      pageRequestIds: ["request-1"],
      selected: [
        {
          requestId: "request-1",
          originalAmount: "1.00",
          originalCurrency: "PEN",
        },
      ],
      paidAt: "2026-09-14T10:00:00.000Z",
      createId: () => "id",
    });
    saveBulkMarkPaidRun(SCOPE, run);
    saveBulkMarkPaidRun(otherScope, {
      ...run,
      scopeFingerprint: "ignored-on-save",
    });

    synchronizeBulkMarkPaidRunScope(SCOPE);
    expect(loadBulkMarkPaidRun(SCOPE, { recover: false })).not.toBeNull();
    expect(loadBulkMarkPaidRun(otherScope, { recover: false })).toBeNull();

    clearBulkMarkPaidRunStorage();
    expect(loadBulkMarkPaidRun(SCOPE)).toBeNull();
  });
});
