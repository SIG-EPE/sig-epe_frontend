import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkSelfAssignGiofWork,
  registerGiofClaimableRefetch,
  useGiofBulkSelection,
  useGiofBulkSelfAssignment,
} from "@/hooks/use-giof-work";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  GIOF_WORK_POOL,
  GIOF_BULK_ASSIGNMENT_MODE,
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
  SELF_BULK_ASSIGNMENT_OUTCOME,
  type GiofSelfBulkAssignResponse,
} from "@/types/giof-work";

vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return { ...actual, api: { post: vi.fn() } };
});

const queryTags = vi.hoisted(() => ({
  invalidateRequestDomain: vi.fn(),
  invalidateQueryPrefixes: vi.fn(),
}));

vi.mock("@/lib/query-tags", () => ({
  QUERY_TAGS: { GIOF_WORK: "giof-work" },
  ...queryTags,
}));

const response: GiofSelfBulkAssignResponse = {
  pool: GIOF_WORK_POOL.REQUEST,
  total: 2,
  counts: { assigned: 1, unchangedSelf: 0, blocked: 1 },
  results: [
    {
      requestId: "11111111-1111-4111-8111-111111111111",
      outcome: SELF_BULK_ASSIGNMENT_OUTCOME.ASSIGNED,
      assignmentVersion: "4",
    },
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      outcome: SELF_BULK_ASSIGNMENT_OUTCOME.BLOCKED,
      code: "VERSION_CONFLICT",
      assignmentVersion: "8",
    },
  ],
};

const items = [
  {
    requestId: "11111111-1111-4111-8111-111111111111",
    expectedAssignmentVersion: 3,
  },
  {
    requestId: "22222222-2222-4222-8222-222222222222",
    expectedAssignmentVersion: 7,
  },
];

function apiError(status: number): ApiRequestError {
  return new ApiRequestError(status, {
    statusCode: status,
    message: "Error de prueba",
    error: "Test",
    timestamp: "2026-09-16T00:00:00.000Z",
    path: "/giof-work/assignments/self/bulk",
  });
}

describe("bulkSelfAssignGiofWork", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializa solo pool, requestId y expectedAssignmentVersion", async () => {
    vi.mocked(api.post).mockResolvedValue(response);
    const forged = {
      pool: GIOF_WORK_POOL.REQUEST,
      items: items.map((item) => ({
        ...item,
        targetAssigneeId: "forged",
        forceTakeover: true,
        note: "forged",
      })),
      targetAssigneeId: "forged",
    };

    await bulkSelfAssignGiofWork(forged);

    expect(api.post).toHaveBeenCalledWith(
      "/giof-work/assignments/self/bulk",
      { pool: GIOF_WORK_POOL.REQUEST, items },
    );
  });
});

describe("useGiofBulkSelfAssignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloquea el submit duplicado, limpia y refresca cola inferior antes de claimable", async () => {
    const order: string[] = [];
    let finish!: (value: GiofSelfBulkAssignResponse) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onClearSelection = vi.fn(() => order.push("clear"));
    const { result } = renderHook(() =>
      useGiofBulkSelfAssignment({
        pool: GIOF_WORK_POOL.REQUEST,
        onClearSelection,
        refetchPoolQueue: async () => {
          order.push("lower");
        },
        refetchClaimable: async () => {
          order.push("claimable");
        },
      }),
    );

    let first!: Promise<GiofSelfBulkAssignResponse>;
    await act(async () => {
      first = result.current.assign(items);
      await expect(result.current.assign(items)).rejects.toThrow(/curso/i);
    });
    expect(api.post).toHaveBeenCalledTimes(1);

    finish(response);
    await act(async () => {
      await first;
    });

    expect(order).toEqual(["clear", "lower", "claimable"]);
    expect(result.current.result).toEqual(response);
    expect(result.current.isSubmitting).toBe(false);
  });

  it("usa el refetch claimable registrado por el panel después de la cola inferior", async () => {
    const order: string[] = [];
    vi.mocked(api.post).mockResolvedValue(response);
    const unregister = registerGiofClaimableRefetch(
      GIOF_WORK_POOL.PAYMENT,
      async () => {
        order.push("claimable");
      },
    );
    const { result } = renderHook(() =>
      useGiofBulkSelfAssignment({
        pool: GIOF_WORK_POOL.PAYMENT,
        onClearSelection: () => order.push("clear"),
        refetchPoolQueue: async () => {
          order.push("lower");
        },
      }),
    );

    try {
      await act(async () => {
        await result.current.assign(items);
      });
      expect(order).toEqual(["clear", "lower", "claimable"]);
    } finally {
      unregister();
    }
  });

  it("limpia y refresca en orden ante 409 conocido sin reintentar", async () => {
    const order: string[] = [];
    vi.mocked(api.post).mockRejectedValue(apiError(409));
    const { result } = renderHook(() =>
      useGiofBulkSelfAssignment({
        pool: GIOF_WORK_POOL.PAYMENT,
        onClearSelection: () => order.push("clear"),
        refetchPoolQueue: async () => {
          order.push("lower");
        },
        refetchClaimable: async () => {
          order.push("claimable");
        },
      }),
    );

    await act(async () => {
      await expect(result.current.assign(items)).rejects.toThrow();
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["clear", "lower", "claimable"]);
  });

  it("advierte final incierto, refresca y nunca reintenta automáticamente", async () => {
    const order: string[] = [];
    vi.mocked(api.post).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() =>
      useGiofBulkSelfAssignment({
        pool: GIOF_WORK_POOL.REXAN,
        onClearSelection: () => order.push("clear"),
        refetchPoolQueue: async () => {
          order.push("lower");
        },
        refetchClaimable: async () => {
          order.push("claimable");
        },
      }),
    );

    await act(async () => {
      await expect(result.current.assign(items)).rejects.toThrow(
        /actualiza.*reintentar/i,
      );
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["clear", "lower", "claimable"]);
    expect(result.current.error?.message).toMatch(/no se reintentará/i);
  });

  it("rechaza 51 elementos antes de enviar y acepta el límite de 50", async () => {
    vi.mocked(api.post).mockResolvedValue({
      ...response,
      total: 50,
      counts: { assigned: 50, unchangedSelf: 0, blocked: 0 },
      results: [],
    });
    const { result } = renderHook(() =>
      useGiofBulkSelfAssignment({
        pool: GIOF_WORK_POOL.REQUEST,
        onClearSelection: vi.fn(),
        refetchPoolQueue: vi.fn().mockResolvedValue(undefined),
        refetchClaimable: vi.fn().mockResolvedValue(undefined),
      }),
    );
    const fifty = Array.from({ length: 50 }, (_, index) => ({
      requestId: `request-${index}`,
      expectedAssignmentVersion: index,
    }));

    await act(async () => {
      await result.current.assign(fifty);
      await expect(
        result.current.assign([
          ...fifty,
          { requestId: "request-50", expectedAssignmentVersion: 50 },
        ]),
      ).rejects.toThrow(/1 y 50/i);
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe("useGiofBulkSelection", () => {
  it("mantiene solo la página actual y reinicia al cambiar página, filtro o resultado", () => {
    const makeItem = (requestId: string) => ({
      requestId,
      label: requestId,
      work: {
        pool: GIOF_WORK_POOL.REQUEST,
        assignmentVersion: "1",
        assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED,
        leaseState: GIOF_WORK_LEASE_STATE.NONE,
        canAssign: true,
        canAcquire: false,
        canEdit: false,
        readOnly: true,
      },
    });
    const pageOne = [makeItem("request-1"), makeItem("request-2")];
    const { result, rerender } = renderHook(
      ({ items, identity }) =>
        useGiofBulkSelection({
          items,
          identity,
          mode: GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF,
        }),
      { initialProps: { items: pageOne, identity: "page=1|filter=all|result=1" } },
    );

    act(() => result.current.selectAll());
    expect(result.current.selectedIds).toEqual(["request-1", "request-2"]);

    rerender({
      items: [makeItem("request-3")],
      identity: "page=2|filter=all|result=1",
    });
    expect(result.current.selectedIds).toEqual([]);

    act(() => result.current.toggle("request-3", true));
    expect(result.current.selectedIds).toEqual(["request-3"]);
    rerender({
      items: [makeItem("request-3")],
      identity: "page=2|filter=mine|result=2",
    });
    expect(result.current.selectedIds).toEqual([]);
  });
});
