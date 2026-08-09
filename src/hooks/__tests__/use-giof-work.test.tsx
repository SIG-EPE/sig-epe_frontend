import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGiofWorkLease } from "@/hooks/use-giof-work";
import { api } from "@/lib/api-client";
import { getGiofMutationHeaders } from "@/lib/giof-work-lease-session";
import { GIOF_WORK_POOL, type GiofWorkLease, type GiofWorkMetadata } from "@/types/giof-work";

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

describe("useGiofWorkLease", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("adquiere, enlaza headers y libera al terminar", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(lease).mockResolvedValueOnce({ released: true });
    const { result } = renderHook(() => useGiofWorkLease());

    await act(async () => { await result.current.acquire("request-1", work); });

    expect(getGiofMutationHeaders("/requests/request-1/approve", "POST")).toEqual({
      "x-giof-assignment-version": "3",
      "x-giof-lease-token": lease.token,
    });

    await act(async () => { await result.current.release(); });
    expect(getGiofMutationHeaders("/requests/request-1/approve", "POST")).toBeUndefined();
    expect(api.post).toHaveBeenLastCalledWith("/giof-work/leases/release", expect.objectContaining({ requestId: "request-1", token: lease.token }));
  });

  it("no adquiere una vista que el backend marca como solo lectura", async () => {
    const { result } = renderHook(() => useGiofWorkLease());
    await expect(result.current.acquire("request-1", { ...work, canAcquire: false })).rejects.toThrow("solo lectura");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envía heartbeat cada 60 segundos mientras la edición está activa", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValueOnce(lease).mockResolvedValueOnce({ ...lease, heartbeatAt: "2026-08-07T10:01:00.000Z" }).mockResolvedValueOnce({ released: true });
    const { result } = renderHook(() => useGiofWorkLease());
    await act(async () => { await result.current.acquire("request-1", work); });

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(api.post).toHaveBeenCalledWith("/giof-work/leases/heartbeat", expect.objectContaining({ requestId: "request-1", token: lease.token }));
  });
});
