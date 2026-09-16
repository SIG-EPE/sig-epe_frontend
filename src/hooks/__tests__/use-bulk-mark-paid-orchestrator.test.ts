import { describe, expect, it, vi } from "vitest";

import {
  BULK_MARK_PAID_ITEM_STATUS,
  BULK_MARK_PAID_RUN_PHASE,
  type BulkMarkPaidRunScope,
} from "@/lib/bulk-mark-paid-run-storage";
import {
  aggregateBulkMarkPaidTotals,
  createBulkMarkPaidOrchestrator,
  createBulkMarkPaidRun,
  getBulkMarkPaidRunProgress,
  type BulkMarkPaidOrchestratorDependencies,
  type BulkMarkPaidSnapshotItem,
} from "../use-bulk-mark-paid-orchestrator";
import type {
  BulkMarkPaidInput,
  BulkMarkPaidResponse,
  MarkPaidItemResult,
} from "@/types/requests";

const SCOPE: BulkMarkPaidRunScope = {
  userId: "user",
  sessionId: "session",
  pageIdentity: "page-1",
};

function selected(count: number): BulkMarkPaidSnapshotItem[] {
  return Array.from({ length: count }, (_, index) => ({
    requestId: `request-${index + 1}`,
    originalAmount: `${index + 1}.00`,
    originalCurrency: index % 2 === 0 ? "PEN" : "USD",
  }));
}

function outcome(
  requestId: string,
  commandId: string,
  result: "SUCCESS" | "ALREADY_PROCESSED" | "FAILED" = "SUCCESS",
): MarkPaidItemResult {
  return {
    request_id: requestId,
    command_id: commandId,
    outcome: result,
    payment_id: result === "FAILED" ? null : `payment-${requestId}`,
    code: result,
    message: result,
    original:
      result === "FAILED"
        ? null
        : { amount: "0.10", currency: requestId.endsWith("1") ? "PEN" : "USD" },
    actual_disbursement: null,
    valuation: null,
    missing_fields: [],
    rexan_activation: null,
  };
}

function dependencies(
  overrides: Partial<BulkMarkPaidOrchestratorDependencies> = {},
): BulkMarkPaidOrchestratorDependencies {
  return {
    acquireLease: vi.fn(async (command) => ({
      requestId: command.requestId,
      assignmentVersion: 7,
      leaseToken: `lease-${command.requestId}`,
    })),
    releaseLease: vi.fn(async () => undefined),
    postChunk: vi.fn(
      async (input: BulkMarkPaidInput): Promise<BulkMarkPaidResponse> => ({
        items: input.items.map((item) =>
          outcome(item.request_id, item.command_id),
        ),
        amounts_by_currency: {},
        unresolved_count: 0,
        totals_complete: true,
      }),
    ),
    refetchQueue: vi.fn(async () => undefined),
    saveRun: vi.fn(),
    removeRun: vi.fn(),
    classifyPostError: () => "AMBIGUOUS",
    ...overrides,
  };
}

describe("bulk mark-paid run snapshot", () => {
  it.each([1, 5, 6, 50])(
    "creates stable ordered chunks for %i selected rows",
    (count) => {
      let id = 0;
      const rows = selected(count);
      const run = createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: rows.map((row) => row.requestId),
        selected: rows,
        paidAt: "2026-09-14T10:00:00.000Z",
        createId: () => `uuid-${++id}`,
      });
      expect(run.commands).toHaveLength(count);
      expect(run.chunks).toHaveLength(Math.ceil(count / 5));
      expect(run.chunks.every((chunk) => chunk.requestIds.length <= 5)).toBe(
        true,
      );
      expect(
        new Set(run.commands.map((command) => command.commandId)).size,
      ).toBe(count);
    },
  );

  it("rejects 51, duplicate, off-page, and unresolved-currency selections", () => {
    expect(() =>
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: selected(51).map((row) => row.requestId),
        selected: selected(51),
        paidAt: "2026-09-14T10:00:00Z",
      }),
    ).toThrow(/50/);
    expect(() =>
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: ["request-1"],
        selected: [selected(1)[0], selected(1)[0]],
        paidAt: "2026-09-14T10:00:00Z",
      }),
    ).toThrow(/duplicad/i);
    expect(() =>
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: [],
        selected: selected(1),
        paidAt: "2026-09-14T10:00:00Z",
      }),
    ).toThrow(/página/i);
    expect(() =>
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: ["request-1"],
        selected: [{ ...selected(1)[0], originalCurrency: null }],
        paidAt: "2026-09-14T10:00:00Z",
      }),
    ).toThrow(/moneda/i);
  });
});

describe("bulk mark-paid orchestrator", () => {
  it("acquires leases immediately before each POST and sends 50 as ten sequential chunks of at most five", async () => {
    const rows = selected(50);
    const deps = dependencies();
    let activePosts = 0;
    let maximumPosts = 0;
    vi.mocked(deps.postChunk).mockImplementation(async (input) => {
      activePosts += 1;
      maximumPosts = Math.max(maximumPosts, activePosts);
      expect(input.items).toHaveLength(5);
      activePosts -= 1;
      return {
        items: input.items.map((item) =>
          outcome(item.request_id, item.command_id),
        ),
        amounts_by_currency: {},
        unresolved_count: 0,
        totals_complete: true,
      };
    });
    const run = createBulkMarkPaidRun({
      scope: SCOPE,
      pageRequestIds: rows.map((row) => row.requestId),
      selected: rows,
      paidAt: "2026-09-14T10:00:00Z",
    });
    const orchestrator = createBulkMarkPaidOrchestrator(run, deps, SCOPE);

    await orchestrator.start();

    expect(deps.postChunk).toHaveBeenCalledTimes(10);
    expect(deps.acquireLease).toHaveBeenCalledTimes(50);
    expect(maximumPosts).toBe(1);
    const calls = [
      ...vi.mocked(deps.acquireLease).mock.invocationCallOrder,
      ...vi.mocked(deps.postChunk).mock.invocationCallOrder,
    ];
    expect(calls).toHaveLength(60);
    for (let chunk = 0; chunk < 10; chunk += 1) {
      const leaseOrders = vi
        .mocked(deps.acquireLease)
        .mock.invocationCallOrder.slice(chunk * 5, chunk * 5 + 5);
      const postOrder = vi.mocked(deps.postChunk).mock.invocationCallOrder[
        chunk
      ];
      expect(Math.max(...leaseOrders)).toBeLessThan(postOrder);
      if (chunk > 0)
        expect(postOrder).toBeGreaterThan(
          vi.mocked(deps.postChunk).mock.invocationCallOrder[chunk - 1],
        );
    }
    expect(orchestrator.getState().phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.COMPLETED,
    );
    expect(deps.removeRun).toHaveBeenCalledWith(SCOPE);
  });

  it("continues after definitive partial item failures and replaces replayed outcomes without double counting", async () => {
    const rows = selected(6);
    const deps = dependencies();
    vi.mocked(deps.postChunk).mockImplementation(async (input) => ({
      items: input.items.map((item, index) =>
        outcome(
          item.request_id,
          item.command_id,
          index === 1 ? "FAILED" : "SUCCESS",
        ),
      ),
      amounts_by_currency: {},
      unresolved_count: 0,
      totals_complete: true,
    }));
    const orchestrator = createBulkMarkPaidOrchestrator(
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: rows.map((row) => row.requestId),
        selected: rows,
        paidAt: "2026-09-14T10:00:00Z",
      }),
      deps,
      SCOPE,
    );
    await orchestrator.start();
    expect(deps.postChunk).toHaveBeenCalledTimes(2);
    expect(orchestrator.getState().items["request-2"].status).toBe(
      BULK_MARK_PAID_ITEM_STATUS.FAILED,
    );
    expect(orchestrator.getState().items["request-6"].status).toBe(
      BULK_MARK_PAID_ITEM_STATUS.SUCCESS,
    );
    expect(getBulkMarkPaidRunProgress(orchestrator.getState())).toMatchObject({
      completed: 5,
      failed: 1,
      pending: 0,
      unresolved: 0,
      total: 6,
    });
  });

  it("pauses safely on lease failure and never sends a chunk containing an invalid item", async () => {
    const rows = selected(6);
    const deps = dependencies();
    vi.mocked(deps.acquireLease).mockRejectedValueOnce(
      new Error("stale assignment"),
    );
    const orchestrator = createBulkMarkPaidOrchestrator(
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: rows.map((row) => row.requestId),
        selected: rows,
        paidAt: "2026-09-14T10:00:00Z",
      }),
      deps,
      SCOPE,
    );

    await orchestrator.start();

    expect(deps.postChunk).not.toHaveBeenCalled();
    expect(orchestrator.getState().phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE,
    );
    expect(orchestrator.getState().items["request-1"].status).toBe(
      BULK_MARK_PAID_ITEM_STATUS.LEASE_FAILED,
    );
    expect(deps.refetchQueue).toHaveBeenCalledWith({ force: true });
  });

  it("attributes a later lease failure to that item and releases leases already acquired for the chunk", async () => {
    const rows = selected(6);
    const deps = dependencies();
    vi.mocked(deps.acquireLease).mockImplementation(async (command) => {
      if (command.requestId === "request-3")
        throw new Error("assignment changed for request-3");
      return {
        requestId: command.requestId,
        assignmentVersion: 7,
        leaseToken: `lease-${command.requestId}`,
      };
    });
    const orchestrator = createBulkMarkPaidOrchestrator(
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: rows.map((row) => row.requestId),
        selected: rows,
        paidAt: "2026-09-14T10:00:00Z",
      }),
      deps,
      SCOPE,
    );

    await orchestrator.start();

    expect(deps.acquireLease).toHaveBeenCalledTimes(3);
    expect(deps.releaseLease).toHaveBeenCalledTimes(2);
    expect(deps.releaseLease).toHaveBeenNthCalledWith(1, "request-1");
    expect(deps.releaseLease).toHaveBeenNthCalledWith(2, "request-2");
    expect(orchestrator.getState().items["request-3"]).toMatchObject({
      status: BULK_MARK_PAID_ITEM_STATUS.LEASE_FAILED,
      errorMessage: "assignment changed for request-3",
    });
    expect(orchestrator.getState().items["request-1"].status).toBe(
      BULK_MARK_PAID_ITEM_STATUS.PENDING,
    );
    expect(orchestrator.getState().items["request-4"].status).toBe(
      BULK_MARK_PAID_ITEM_STATUS.PENDING,
    );
    expect(deps.postChunk).not.toHaveBeenCalled();
  });

  it("does not auto-retry an explicitly rejected POST and resumes with the same commands only when requested", async () => {
    const rows = selected(1);
    const deps = dependencies({ classifyPostError: () => "SAFE" });
    vi.mocked(deps.postChunk).mockRejectedValueOnce(new Error("conflict"));
    const orchestrator = createBulkMarkPaidOrchestrator(
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: ["request-1"],
        selected: rows,
        paidAt: "2026-09-14T10:00:00Z",
      }),
      deps,
      SCOPE,
    );
    await orchestrator.start();
    expect(deps.postChunk).toHaveBeenCalledTimes(1);
    expect(orchestrator.getState().phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.PAUSED_SAFE,
    );
    const commandId = vi.mocked(deps.postChunk).mock.calls[0][0].items[0]
      .command_id;

    await orchestrator.resumeSafe();

    expect(deps.postChunk).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.postChunk).mock.calls[1][0].items[0].command_id).toBe(
      commandId,
    );
  });

  it("pauses an ambiguous POST and explicit retry reuses business payload and command IDs without auto retry", async () => {
    const rows = selected(6);
    const deps = dependencies();
    vi.mocked(deps.postChunk).mockRejectedValueOnce(
      new TypeError("network lost"),
    );
    const orchestrator = createBulkMarkPaidOrchestrator(
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: rows.map((row) => row.requestId),
        selected: rows,
        paidAt: "2026-09-14T10:00:00Z",
      }),
      deps,
      SCOPE,
    );
    await orchestrator.start();
    expect(deps.postChunk).toHaveBeenCalledTimes(1);
    expect(orchestrator.getState().phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.PAUSED_AMBIGUOUS,
    );
    const firstPayload = vi.mocked(deps.postChunk).mock.calls[0][0];

    await orchestrator.retryAmbiguous();

    expect(deps.postChunk).toHaveBeenCalledTimes(3);
    const retryPayload = vi.mocked(deps.postChunk).mock.calls[1][0];
    expect(
      retryPayload.items.map(
        ({ lease_token: _lease, assignment_version: _version, ...item }) =>
          item,
      ),
    ).toEqual(
      firstPayload.items.map(
        ({ lease_token: _lease, assignment_version: _version, ...item }) =>
          item,
      ),
    );
    expect(orchestrator.getState().phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.COMPLETED,
    );
  });

  it("cancels only future chunks after an in-flight POST settles", async () => {
    const rows = selected(6);
    let resolvePost: ((response: BulkMarkPaidResponse) => void) | undefined;
    const deps = dependencies({
      postChunk: vi.fn(
        (input: BulkMarkPaidInput) =>
          new Promise<BulkMarkPaidResponse>((resolve) => {
            resolvePost = resolve;
            void input;
          }),
      ),
    });
    const orchestrator = createBulkMarkPaidOrchestrator(
      createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: rows.map((row) => row.requestId),
        selected: rows,
        paidAt: "2026-09-14T10:00:00Z",
      }),
      deps,
      SCOPE,
    );
    const executing = orchestrator.start();
    await vi.waitFor(() => expect(deps.postChunk).toHaveBeenCalledTimes(1));
    orchestrator.cancel();
    const input = vi.mocked(deps.postChunk).mock.calls[0][0];
    resolvePost?.({
      items: input.items.map((item) =>
        outcome(item.request_id, item.command_id),
      ),
      amounts_by_currency: {},
      unresolved_count: 0,
      totals_complete: true,
    });
    await executing;
    expect(deps.postChunk).toHaveBeenCalledTimes(1);
    expect(orchestrator.getState().items["request-1"].status).toBe(
      BULK_MARK_PAID_ITEM_STATUS.SUCCESS,
    );
    expect(orchestrator.getState().items["request-6"].status).toBe(
      BULK_MARK_PAID_ITEM_STATUS.CANCELLED,
    );
    expect(orchestrator.getState().phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.CANCELLED,
    );
  });

  it("requires explicit recovery resume after reload", async () => {
    const rows = selected(1);
    const deps = dependencies();
    const recovered = {
      ...createBulkMarkPaidRun({
        scope: SCOPE,
        pageRequestIds: ["request-1"],
        selected: rows,
        paidAt: "2026-09-14T10:00:00Z",
      }),
      phase: BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED,
    };
    const orchestrator = createBulkMarkPaidOrchestrator(recovered, deps, SCOPE);
    expect(deps.postChunk).not.toHaveBeenCalled();
    await orchestrator.resumeRecovery();
    expect(deps.refetchQueue).toHaveBeenCalledWith({ force: true });
    expect(deps.postChunk).toHaveBeenCalledTimes(1);
  });

  it("reconciles committed items exactly and resumes the same chunk with only unresolved commands", async () => {
    const rows = selected(6);
    const original = createBulkMarkPaidRun({
      scope: SCOPE,
      pageRequestIds: rows.map((row) => row.requestId),
      selected: rows,
      paidAt: "2026-09-14T10:00:00Z",
      createId: (() => {
        let id = 0;
        return () => `stable-${++id}`;
      })(),
    });
    const recoveredResult = outcome(
      "request-1",
      original.commands[0].commandId,
      "ALREADY_PROCESSED",
    );
    const deps = dependencies({
      reconcileRun: vi.fn(async () => [recoveredResult]),
    });
    const orchestrator = createBulkMarkPaidOrchestrator(
      { ...original, phase: BULK_MARK_PAID_RUN_PHASE.RECOVERY_REQUIRED },
      deps,
      SCOPE,
    );

    await orchestrator.resumeRecovery();

    expect(deps.refetchQueue).toHaveBeenNthCalledWith(1, { force: true });
    expect(deps.acquireLease).toHaveBeenCalledTimes(5);
    expect(deps.postChunk).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.postChunk).mock.calls[0][0].items).toHaveLength(4);
    expect(
      vi
        .mocked(deps.postChunk)
        .mock.calls[0][0].items.map((item) => item.request_id),
    ).toEqual(["request-2", "request-3", "request-4", "request-5"]);
    expect(
      vi
        .mocked(deps.postChunk)
        .mock.calls.flatMap(([input]) =>
          input.items.map((item) => item.command_id),
        ),
    ).toEqual(original.commands.slice(1).map((command) => command.commandId));
    expect(orchestrator.getState().results["request-1"]).toEqual(
      recoveredResult,
    );
    expect(orchestrator.getState().phase).toBe(
      BULK_MARK_PAID_RUN_PHASE.COMPLETED,
    );
  });

  it("aggregates exact successful principal by currency and excludes failures/unresolved values", () => {
    const results = {
      a: outcome("a1", "c1"),
      b: {
        ...outcome("b", "c2"),
        original: { amount: "20.25", currency: "USD" as const },
      },
      c: {
        ...outcome("c", "c3", "FAILED"),
        original: { amount: "9.00", currency: "PEN" as const },
      },
      d: { ...outcome("d", "c4"), original: null },
    };
    results.a.original = { amount: "100.10", currency: "PEN" };
    expect(aggregateBulkMarkPaidTotals(results)).toEqual({
      amountsByCurrency: { PEN: "100.10", USD: "20.25" },
      unresolvedCount: 1,
      totalsComplete: false,
    });
  });
});
