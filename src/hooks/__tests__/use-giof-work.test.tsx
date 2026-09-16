import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimGiofWork,
  useAutoAcquireGiofWorkLease,
  useGiofWorkLease,
} from "@/hooks/use-giof-work";
import { api, ApiRequestError } from "@/lib/api-client";
import { getGiofMutationHeaders } from "@/lib/giof-work-lease-session";
import {
  GIOF_WORK_POOL,
  type GiofWorkLease,
  type GiofWorkMetadata,
} from "@/types/giof-work";

vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return { ...actual, api: { post: vi.fn() } };
});

vi.mock("@/lib/query-tags", () => ({ invalidateRequestDomain: vi.fn() }));

const work: GiofWorkMetadata = {
  pool: GIOF_WORK_POOL.REQUEST,
  assigneeId: "user-1",
  assignmentVersion: "3",
  lease: null,
  canAcquire: true,
  canEdit: false,
  readOnly: true,
};

const lease: GiofWorkLease = {
  pool: GIOF_WORK_POOL.REQUEST,
  requestId: "request-1",
  ownerId: "user-1",
  token: "00000000-0000-4000-8000-000000000001",
  assignmentVersion: "3",
  heartbeatAt: "2026-08-07T10:00:00.000Z",
  expiresAt: "2026-08-07T10:05:00.000Z",
  ttlSeconds: 300,
  heartbeatIntervalSeconds: 60,
};

function makeApiError(status: number, message: string): ApiRequestError {
  return new ApiRequestError(status, {
    statusCode: status,
    message,
    error: "Test error",
    timestamp: "2026-08-28T12:00:00.000Z",
    path: "/giof-work/leases/acquire",
  });
}

describe("useGiofWorkLease", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("adquiere, enlaza headers y libera al terminar", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce({ released: true });
    const { result } = renderHook(() => useGiofWorkLease());

    await act(async () => {
      await result.current.acquire("request-1", work);
    });

    expect(
      getGiofMutationHeaders("/requests/request-1/approve", "POST"),
    ).toEqual({
      "x-giof-assignment-version": "3",
      "x-giof-lease-token": lease.token,
    });

    await act(async () => {
      await result.current.release();
    });
    expect(
      getGiofMutationHeaders("/requests/request-1/approve", "POST"),
    ).toBeUndefined();
    expect(api.post).toHaveBeenLastCalledWith(
      "/giof-work/leases/release",
      expect.objectContaining({ requestId: "request-1", token: lease.token }),
    );
  });

  it("no adquiere una vista que el backend marca como solo lectura", async () => {
    const { result } = renderHook(() => useGiofWorkLease());
    await expect(
      result.current.acquire("request-1", { ...work, canAcquire: false }),
    ).rejects.toThrow("solo lectura");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envía heartbeat cada 60 segundos mientras la edición está activa", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post)
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce({
        ...lease,
        heartbeatAt: "2026-08-07T10:01:00.000Z",
      })
      .mockResolvedValueOnce({ released: true });
    const { result } = renderHook(() => useGiofWorkLease());
    await act(async () => {
      await result.current.acquire("request-1", work);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(api.post).toHaveBeenCalledWith(
      "/giof-work/leases/heartbeat",
      expect.objectContaining({ requestId: "request-1", token: lease.token }),
    );
  });

  it("autoasigna el pool explícito con la versión actual antes de adquirir lease", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      requestId: "request-1",
      pool: GIOF_WORK_POOL.PAYMENT,
      assignmentVersion: "4",
      changed: true,
    });

    await expect(
      claimGiofWork({
        pool: GIOF_WORK_POOL.PAYMENT,
        requestId: "request-1",
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({ assignmentVersion: "4" });

    expect(api.post).toHaveBeenCalledWith("/giof-work/assignments/self", {
      pool: GIOF_WORK_POOL.PAYMENT,
      requestId: "request-1",
      expectedVersion: 3,
    });
  });
});

describe("useAutoAcquireGiofWorkLease", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it.each([403, 409, 429, 500])(
    "intenta una sola vez la identidad estable después de un error %s",
    async (status) => {
      vi.mocked(api.post).mockRejectedValue(
        makeApiError(status, `Error ${status}`),
      );

      const { result, rerender } = renderHook(
        ({ currentWork }) =>
          useAutoAcquireGiofWorkLease({
            requestId: "request-1",
            work: currentWork,
            aliases: ["payment-1"],
            enabled: true,
          }),
        { initialProps: { currentWork: work } },
      );

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.isLoading).toBe(false);

      rerender({ currentWork: { ...work } });
      rerender({ currentWork: { ...work } });

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
      expect(api.post).toHaveBeenCalledWith("/giof-work/leases/acquire", {
        pool: GIOF_WORK_POOL.REQUEST,
        requestId: "request-1",
        expectedVersion: 3,
      });
    },
  );

  it("mantiene el error 429 sin disparar nuevos intentos", async () => {
    vi.mocked(api.post).mockRejectedValue(
      makeApiError(429, "ThrottlerException: Too Many Requests"),
    );

    const { result, rerender } = renderHook(() =>
      useAutoAcquireGiofWorkLease({
        requestId: "request-1",
        work,
        enabled: true,
      }),
    );

    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        "ThrottlerException: Too Many Requests",
      ),
    );
    rerender();
    rerender();

    expect(result.current.error?.message).toBe(
      "ThrottlerException: Too Many Requests",
    );
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("vuelve a intentar cuando cambia request, pool, versión o asignación", async () => {
    vi.mocked(api.post).mockRejectedValue(makeApiError(409, "Conflicto"));
    const { rerender } = renderHook(
      ({ requestId, currentWork }) =>
        useAutoAcquireGiofWorkLease({
          requestId,
          work: currentWork,
          enabled: true,
        }),
      { initialProps: { requestId: "request-1", currentWork: work } },
    );

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    rerender({ requestId: "request-2", currentWork: work });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    rerender({
      requestId: "request-2",
      currentWork: { ...work, assignmentVersion: "4" },
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3));
    rerender({
      requestId: "request-2",
      currentWork: { ...work, assignmentVersion: "4", assigneeId: "user-2" },
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(4));
    rerender({
      requestId: "request-2",
      currentWork: {
        ...work,
        pool: GIOF_WORK_POOL.REXAN,
        assignmentVersion: "4",
        assigneeId: "user-2",
      },
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(5));
  });

  it("inicia heartbeat después de adquirir correctamente", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post)
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce({
        ...lease,
        heartbeatAt: "2026-08-07T10:01:00.000Z",
      });

    renderHook(() =>
      useAutoAcquireGiofWorkLease({
        requestId: "request-1",
        work,
        enabled: true,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(api.post).toHaveBeenCalledWith(
      "/giof-work/leases/heartbeat",
      expect.objectContaining({ requestId: "request-1", token: lease.token }),
    );
  });

  it("mantiene acotado el acquire bajo StrictMode", async () => {
    vi.mocked(api.post).mockRejectedValue(makeApiError(403, "Prohibido"));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    const { result } = renderHook(
      () =>
        useAutoAcquireGiofWorkLease({
          requestId: "request-1",
          work,
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("permite un único intento nuevo tras un remount legítimo", async () => {
    vi.mocked(api.post).mockRejectedValue(makeApiError(403, "Prohibido"));
    const firstMount = renderHook(() =>
      useAutoAcquireGiofWorkLease({
        requestId: "request-1",
        work,
        enabled: true,
      }),
    );

    await waitFor(() => expect(firstMount.result.current.error).not.toBeNull());
    firstMount.unmount();

    const secondMount = renderHook(() =>
      useAutoAcquireGiofWorkLease({
        requestId: "request-1",
        work,
        enabled: true,
      }),
    );
    await waitFor(() =>
      expect(secondMount.result.current.error).not.toBeNull(),
    );

    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
