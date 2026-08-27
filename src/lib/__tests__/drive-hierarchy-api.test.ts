import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  api: {
    get: mocks.get,
    post: mocks.post,
    patch: vi.fn(),
    downloadCsv: vi.fn(),
  },
}));

import { driveHierarchyApi } from "@/lib/drive-hierarchy-api";

describe("driveHierarchyApi readiness authorization routes", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it("requests the exact privacy-safe authorization target-list route", async () => {
    const signal = new AbortController().signal;
    mocks.get.mockResolvedValue([]);

    await driveHierarchyApi.getReadinessAuthorizationTargets(signal);

    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledWith(
      "/drive-hierarchy/readiness/authorization-targets",
      { signal },
    );
  });

  it("reads automatic auditor health from the projection health endpoint only", async () => {
    const signal = new AbortController().signal;
    mocks.get.mockResolvedValue({ auditor: { status: "PASS" } });

    await driveHierarchyApi.getPaymentProjectionHealth(signal);

    expect(mocks.get).toHaveBeenCalledWith(
      "/drive-hierarchy/payment-projections/health",
      { signal },
    );
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("posts issuance to the exact authorization route without adding fields", async () => {
    const signal = new AbortController().signal;
    const input = {
      purpose: "CAPTURE" as const,
      targetActorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      reason: "Dos previews revisados",
      manifestHash: "m".repeat(64),
      inventoryHash: "i".repeat(64),
      previewTokens: ["preview-a", "preview-b"],
    };
    mocks.post.mockResolvedValue({});

    await driveHierarchyApi.issueReadinessAuthorization(input, signal);

    expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledWith(
      "/drive-hierarchy/readiness/authorizations",
      input,
      { signal },
    );
  });

  it("posts only the exact ready-bundle route with the long-operation timeout", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutSignal);
    const input = {
      operationId: "70000000-0000-4000-8000-000000000001",
      reason: "produce the ready bundle",
      proofRunId: "50000000-0000-4000-8000-000000000001",
    };
    mocks.post.mockResolvedValue({ complete: true });

    await driveHierarchyApi.produceReadyBundle(input);

    expect(timeoutSpy).toHaveBeenCalledWith(120_000);
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledWith(
      "/drive-hierarchy/evidence/ready-bundle/produce",
      input,
      { signal: timeoutSignal },
    );
  });
});
