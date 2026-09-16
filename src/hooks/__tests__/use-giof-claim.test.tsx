import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimGiofWork,
  useGiofClaimableWork,
  useGiofSelfClaim,
} from "@/hooks/use-giof-work";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  bumpQueryCacheSessionGeneration,
  clearQueryCache,
} from "@/lib/query-cache";
import { GIOF_WORK_POOL, type GiofClaimableWorkPage } from "@/types/giof-work";

const queryTags = vi.hoisted(() => ({
  invalidateRequestDomain: vi.fn(),
  invalidateQueryPrefixes: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

vi.mock("@/lib/query-tags", () => ({
  QUERY_TAGS: {
    REQUESTS: "requests",
    PAYMENTS: "payments",
    RENDITIONS: "renditions",
    GIOF_WORK: "giof-work",
  },
  ...queryTags,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: { isLoading: boolean; accessToken: string }) => unknown,
  ) => selector({ isLoading: false, accessToken: "session-token" }),
}));

const page: GiofClaimableWorkPage = {
  items: [
    {
      requestId: "request-1",
      requestCode: "SOL-1",
      pool: GIOF_WORK_POOL.REQUEST,
      requestType: "REIMBURSEMENT",
      status: "SUBMITTED",
      queueDate: "2026-09-14T10:00:00.000Z",
      assignmentVersion: "3",
      assignmentState: "UNASSIGNED",
      leaseState: "NONE",
    },
  ],
  total: 21,
  page: 2,
  limit: 10,
};

function apiError(status: number, code?: string): ApiRequestError {
  return new ApiRequestError(status, {
    statusCode: status,
    code,
    message: "Error de prueba",
    error: "Test",
    timestamp: "2026-09-14T10:00:00.000Z",
    path: "/giof-work/assignments/self",
  });
}

describe("useGiofClaimableWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
  });

  it("consulta una página acotada por pool y expone la lectura como asesoría", async () => {
    vi.mocked(api.get).mockResolvedValue(page);

    const { result } = renderHook(() =>
      useGiofClaimableWork({
        pool: GIOF_WORK_POOL.REQUEST,
        page: 2,
        limit: 10,
      }),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(api.get).toHaveBeenCalledWith(
      "/giof-work/claimable?pool=REQUEST&page=2&limit=10",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.isAdvisory).toBe(true);
    expect(result.current.total).toBe(21);
  });

  it("no reintenta a ciegas una consulta 403", async () => {
    vi.mocked(api.get).mockRejectedValue(apiError(403));
    const { result, rerender } = renderHook(() =>
      useGiofClaimableWork({ pool: GIOF_WORK_POOL.PAYMENT }),
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    rerender();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("no reutiliza una página de una sesión anterior", async () => {
    vi.mocked(api.get).mockResolvedValue(page);
    const first = renderHook(() =>
      useGiofClaimableWork({ pool: GIOF_WORK_POOL.REQUEST }),
    );
    await waitFor(() => expect(first.result.current.items).toHaveLength(1));
    first.unmount();

    bumpQueryCacheSessionGeneration();
    const second = renderHook(() =>
      useGiofClaimableWork({ pool: GIOF_WORK_POOL.REQUEST }),
    );
    await waitFor(() => expect(second.result.current.items).toHaveLength(1));

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe("useGiofSelfClaim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envía pool y versión estable, invalida y espera los refetch antes de resolver; nunca adquiere lease", async () => {
    const order: string[] = [];
    vi.mocked(api.post).mockImplementation(async (path) => {
      order.push(`post:${path}`);
      return {
        requestId: "request-1",
        pool: GIOF_WORK_POOL.REXAN,
        assignmentVersion: "8",
        changed: true,
      };
    });
    const refetchClaimable = vi.fn(async () => {
      order.push("refetch:claimable");
    });
    const refetchPoolQueue = vi.fn(async () => {
      order.push("refetch:queue");
    });
    const { result } = renderHook(() =>
      useGiofSelfClaim({
        pool: GIOF_WORK_POOL.REXAN,
        refetchClaimable,
        refetchPoolQueue,
      }),
    );

    await act(async () => {
      await result.current.claim({
        requestId: "request-1",
        expectedVersion: 7,
      });
    });

    expect(api.post).toHaveBeenCalledWith("/giof-work/assignments/self", {
      pool: GIOF_WORK_POOL.REXAN,
      requestId: "request-1",
      expectedVersion: 7,
    });
    expect(queryTags.invalidateQueryPrefixes).toHaveBeenCalledWith([
      ["giof-work", "claimable", GIOF_WORK_POOL.REXAN],
    ]);
    expect(queryTags.invalidateRequestDomain).toHaveBeenCalledWith("request-1");
    expect(order).toEqual([
      "post:/giof-work/assignments/self",
      "refetch:queue",
      "refetch:claimable",
    ]);
    expect(api.post).not.toHaveBeenCalledWith(
      "/giof-work/leases/acquire",
      expect.anything(),
    );
  });

  it("bloquea doble submit del mismo comando", async () => {
    let resolveClaim!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolveClaim = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useGiofSelfClaim({
        pool: GIOF_WORK_POOL.REQUEST,
        refetchClaimable: vi.fn().mockResolvedValue(undefined),
        refetchPoolQueue: vi.fn().mockResolvedValue(undefined),
      }),
    );

    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.claim({
        requestId: "request-1",
        expectedVersion: 3,
      });
      await expect(
        result.current.claim({ requestId: "request-1", expectedVersion: 3 }),
      ).rejects.toThrow(/curso/i);
    });
    expect(api.post).toHaveBeenCalledTimes(1);

    resolveClaim({
      requestId: "request-1",
      pool: GIOF_WORK_POOL.REQUEST,
      assignmentVersion: "4",
      changed: true,
    });
    await act(async () => {
      await first;
    });
  });

  it.each([
    [409, "ACTIVE_FOREIGN_LEASE", /lease activo/i],
    [409, "VERSION_MISMATCH", /versión/i],
    [409, "INELIGIBLE_LIFECYCLE", /ya no es elegible/i],
    [401, undefined, /sesión/i],
    [403, undefined, /permisos/i],
  ])(
    "expone error accionable %s/%s sin retry",
    async (status, code, expected) => {
      vi.mocked(api.post).mockRejectedValue(apiError(status, code));
      const refetchClaimable = vi.fn().mockResolvedValue(undefined);
      const refetchPoolQueue = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useGiofSelfClaim({
          pool: GIOF_WORK_POOL.PAYMENT,
          refetchClaimable,
          refetchPoolQueue,
        }),
      );

      await act(async () => {
        await expect(
          result.current.claim({ requestId: "request-1", expectedVersion: 3 }),
        ).rejects.toThrow(expected);
      });
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(refetchClaimable).toHaveBeenCalledTimes(status === 409 ? 1 : 0);
    },
  );
});

describe("claimGiofWork", () => {
  it("conserva el contrato explícito de pool", async () => {
    vi.mocked(api.post).mockResolvedValue({
      requestId: "request-1",
      pool: GIOF_WORK_POOL.PAYMENT,
      assignmentVersion: "4",
      changed: false,
    });
    await claimGiofWork({
      pool: GIOF_WORK_POOL.PAYMENT,
      requestId: "request-1",
      expectedVersion: 4,
    });
    expect(api.post).toHaveBeenCalledWith(
      "/giof-work/assignments/self",
      expect.objectContaining({ pool: "PAYMENT" }),
    );
  });
});
