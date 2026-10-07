import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimGiofWork,
  forceReassignGiofWork,
  getGiofConflictMessage,
  getGiofOwnershipErrorCode,
  releaseGiofWork,
  useAutoAcquireGiofWorkLease,
  useGiofOwnershipCommands,
  useGiofWorkLease,
  useGiofWorkLeaseSet,
} from "@/hooks/use-giof-work";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  clearGiofLeaseCredentials,
  getGiofMutationHeaders,
} from "@/lib/giof-work-lease-session";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";
import {
  GIOF_WORK_POOL,
  type GiofWorkLease,
  type GiofWorkMetadata,
} from "@/types/giof-work";

vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return { ...actual, api: { post: vi.fn() } };
});

const queryTagMocks = vi.hoisted(() => ({
  invalidateRequestDomain: vi.fn(),
  invalidateQueryPrefixes: vi.fn(),
}));

vi.mock("@/lib/query-tags", () => ({
  QUERY_TAGS: { GIOF_WORK: "giof-work" },
  invalidateRequestDomain: queryTagMocks.invalidateRequestDomain,
  invalidateQueryPrefixes: queryTagMocks.invalidateQueryPrefixes,
}));

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

const authUser: AuthUser = {
  id: "user-1",
  firstName: "Giof",
  lastName: "Gestor",
  email: "giof@example.test",
  documentNumber: "12345678",
  role: { code: "GIOF_GESTOR", name: "GIOF Gestor" },
  onboardingCompleted: true,
  authSource: "LOCAL",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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
  beforeEach(() => {
    vi.clearAllMocks();
    clearGiofLeaseCredentials();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      sessionExpiresAt: null,
      isLoading: false,
    });
  });
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

  it("serializa release y force-reassign con los DTO mínimos actuales", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({
        requestId: "request-1",
        pool: GIOF_WORK_POOL.REQUEST,
        assignmentVersion: "4",
        changed: true,
      })
      .mockResolvedValueOnce({
        requestId: "request-1",
        pool: GIOF_WORK_POOL.PAYMENT,
        assignmentVersion: "5",
        changed: true,
      });

    await releaseGiofWork({
      requestId: "request-1",
      pool: GIOF_WORK_POOL.REQUEST,
      expectedAssignmentVersion: 3,
    });
    await forceReassignGiofWork({
      requestId: "request-1",
      pool: GIOF_WORK_POOL.PAYMENT,
      targetAssigneeId: "22222222-2222-4222-8222-222222222222",
      expectedAssignmentVersion: 4,
      reason: "Cobertura operativa",
      confirmed: true,
      acknowledgePaymentInterruption: true,
    });

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/giof-work/assignments/release",
      {
        requestId: "request-1",
        pool: "REQUEST",
        expectedAssignmentVersion: 3,
      },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/giof-work/assignments/force-reassign",
      {
        requestId: "request-1",
        pool: "PAYMENT",
        targetAssigneeId: "22222222-2222-4222-8222-222222222222",
        expectedAssignmentVersion: 4,
        reason: "Cobertura operativa",
        confirmed: true,
        acknowledgePaymentInterruption: true,
      },
    );
  });

  it("conserva códigos públicos de conflicto y muestra mensajes accionables", () => {
    const error = new ApiRequestError(409, {
      statusCode: 409,
      code: "ACTIVE_CROSS_POOL_LEASE",
      message: "Work item has lease state for another pool",
      error: "Conflict",
      timestamp: "2026-09-16T00:00:00.000Z",
      path: "/giof-work/assignments/release",
    });

    expect(getGiofOwnershipErrorCode(error)).toBe("ACTIVE_CROSS_POOL_LEASE");
    expect(getGiofConflictMessage(error)).toMatch(/otra etapa/i);
    expect(getGiofOwnershipErrorCode(new Error("local"))).toBeUndefined();
  });

  it("el hook anuncia el error sin ocultar el ApiRequestError al llamador", async () => {
    const conflict = new ApiRequestError(409, {
      statusCode: 409,
      code: "VERSION_MISMATCH",
      message: "Assignment version is stale",
      error: "Conflict",
      timestamp: "2026-09-16T00:00:00.000Z",
      path: "/giof-work/assignments/release",
    });
    vi.mocked(api.post).mockRejectedValueOnce(conflict);
    const { result } = renderHook(() => useGiofOwnershipCommands());

    await act(async () => {
      await expect(
        result.current.release({
          requestId: "request-1",
          pool: GIOF_WORK_POOL.REQUEST,
          expectedAssignmentVersion: 3,
        }),
      ).rejects.toBe(conflict);
    });

    expect(result.current.error?.message).toMatch(/versión.*cambió/i);
    expect(result.current.isSubmitting).toBe(false);
  });

  it("refresca primero la cola inferior y luego claimable después de release", async () => {
    const order: string[] = [];
    vi.mocked(api.post).mockResolvedValueOnce({
      requestId: "request-1",
      pool: GIOF_WORK_POOL.REQUEST,
      assignmentVersion: "4",
      changed: true,
    });
    const { result } = renderHook(() =>
      useGiofOwnershipCommands({
        pool: GIOF_WORK_POOL.REQUEST,
        refetchPoolQueue: async () => {
          order.push("lower");
        },
        refetchClaimable: async () => {
          order.push("claimable");
        },
      }),
    );

    await act(async () => {
      await result.current.release({
        requestId: "request-1",
        pool: GIOF_WORK_POOL.REQUEST,
        expectedAssignmentVersion: 3,
      });
    });

    expect(order).toEqual(["lower", "claimable"]);
    expect(queryTagMocks.invalidateRequestDomain).toHaveBeenCalledWith(
      "request-1",
    );
  });

  it("retiene el error y refresca en el mismo orden ante 409", async () => {
    const order: string[] = [];
    const conflict = new ApiRequestError(409, {
      statusCode: 409,
      code: "VERSION_MISMATCH",
      message: "Assignment version is stale",
      error: "Conflict",
      timestamp: "2026-09-16T00:00:00.000Z",
      path: "/giof-work/assignments/release",
    });
    vi.mocked(api.post).mockRejectedValueOnce(conflict);
    const { result } = renderHook(() =>
      useGiofOwnershipCommands({
        pool: GIOF_WORK_POOL.REQUEST,
        refetchPoolQueue: async () => {
          order.push("lower");
        },
        refetchClaimable: async () => {
          order.push("claimable");
        },
      }),
    );

    await act(async () => {
      await expect(
        result.current.release({
          requestId: "request-1",
          pool: GIOF_WORK_POOL.REQUEST,
          expectedAssignmentVersion: 3,
        }),
      ).rejects.toBe(conflict);
    });

    expect(order).toEqual(["lower", "claimable"]);
    expect(result.current.error?.message).toMatch(/versión.*cambió/i);
  });

  it("rechaza un segundo submit mientras la acción anterior sigue pendiente", async () => {
    let finishRequest: ((value: unknown) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    const { result } = renderHook(() => useGiofOwnershipCommands());
    const command = {
      requestId: "request-1",
      pool: GIOF_WORK_POOL.REQUEST,
      expectedAssignmentVersion: 3,
    };

    let firstRequest: Promise<unknown> | undefined;
    await act(async () => {
      firstRequest = result.current.release(command);
      await expect(result.current.release(command)).rejects.toThrow(
        /acción de asignación en curso/i,
      );
    });
    expect(api.post).toHaveBeenCalledTimes(1);

    finishRequest?.({
      requestId: "request-1",
      pool: GIOF_WORK_POOL.REQUEST,
      assignmentVersion: "4",
      changed: true,
    });
    await act(async () => {
      await firstRequest;
    });
  });
});

describe("useAutoAcquireGiofWorkLease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGiofLeaseCredentials();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      sessionExpiresAt: null,
      isLoading: false,
    });
  });
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

  it("une el alias de pago al reutilizar un lease vigente y lo renueva antes del submit", async () => {
    const paymentWork: GiofWorkMetadata = {
      ...work,
      pool: GIOF_WORK_POOL.PAYMENT,
    };
    const currentLease: GiofWorkLease = {
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    };
    const renewedLease = {
      ...currentLease,
      token: "00000000-0000-4000-8000-000000000002",
    };
    vi.mocked(api.post)
      .mockResolvedValueOnce(currentLease)
      .mockResolvedValueOnce(renewedLease);
    const { result } = renderHook(() => useGiofWorkLeaseSet());

    await act(async () => {
      await result.current.acquire("request-1", paymentWork);
    });
    await act(async () => {
      await result.current.acquire("request-1", paymentWork, ["payment-1"]);
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(
      getGiofMutationHeaders("/request-payments/payment-1/details", "PATCH"),
    ).toEqual({
      "x-giof-assignment-version": "3",
      "x-giof-lease-token": currentLease.token,
    });

    await act(async () => {
      await result.current.renew("request-1");
    });
    expect(api.post).toHaveBeenLastCalledWith(
      "/giof-work/leases/heartbeat",
      expect.objectContaining({ token: currentLease.token }),
    );
    expect(
      getGiofMutationHeaders("/request-payments/payment-1/details", "PATCH"),
    ).toEqual({
      "x-giof-assignment-version": "3",
      "x-giof-lease-token": renewedLease.token,
    });
  });

  it("impide que un renew exitoso tardío tras cambio de identidad restaure headers o continúe el submit", async () => {
    const heartbeat = deferred<GiofWorkLease>();
    const paymentWork = { ...work, pool: GIOF_WORK_POOL.PAYMENT };
    const currentLease = {
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    };
    const renewedLease = {
      ...currentLease,
      token: "00000000-0000-4000-8000-000000000002",
    };
    vi.mocked(api.post)
      .mockResolvedValueOnce(currentLease)
      .mockReturnValueOnce(heartbeat.promise);
    const submit = vi.fn();
    const { result } = renderHook(() => useGiofWorkLeaseSet());
    useAuthStore.getState().setAuth(authUser, "token-user-1", {
      sessionExpiresAt: "2026-09-18T20:00:00.000Z",
    });

    await act(async () => {
      await result.current.acquire("request-1", paymentWork, ["payment-1"]);
    });
    const completion = result.current.renew("request-1").then(submit);
    useAuthStore
      .getState()
      .setAuth(
        { ...authUser, id: "user-2", email: "giof-2@example.test" },
        "token-user-2",
        { sessionExpiresAt: "2026-09-19T20:00:00.000Z" },
      );
    heartbeat.resolve(renewedLease);

    await expect(completion).rejects.toThrow(/sesión operativa cambió/i);
    expect(submit).not.toHaveBeenCalled();
    expect(
      getGiofMutationHeaders("/request-payments/payment-1/details", "PATCH"),
    ).toBeUndefined();
  });

  it("descarta un heartbeat exitoso que llega después de clearLocal", async () => {
    vi.useFakeTimers();
    const heartbeat = deferred<GiofWorkLease>();
    const paymentWork = { ...work, pool: GIOF_WORK_POOL.PAYMENT };
    const currentLease = {
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    };
    vi.mocked(api.post)
      .mockResolvedValueOnce(currentLease)
      .mockReturnValueOnce(heartbeat.promise);
    const { result } = renderHook(() => useGiofWorkLeaseSet());

    await act(async () => {
      await result.current.acquire("request-1", paymentWork, ["payment-1"]);
      await vi.advanceTimersByTimeAsync(60_000);
    });
    act(() => result.current.clearLocal());
    heartbeat.resolve({
      ...currentLease,
      token: "00000000-0000-4000-8000-000000000003",
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.leases).toEqual([]);
    expect(
      getGiofMutationHeaders("/request-payments/payment-1/details", "PATCH"),
    ).toBeUndefined();
  });

  it("captura credenciales, cerca el heartbeat y libera exactamente una vez", async () => {
    vi.mocked(api.post).mockReset();
    const paymentWork = { ...work, pool: GIOF_WORK_POOL.PAYMENT };
    const currentLease = {
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    };
    vi.mocked(api.post)
      .mockResolvedValueOnce(currentLease)
      .mockResolvedValue({ released: true });
    const { result } = renderHook(() => useGiofWorkLeaseSet());

    await act(async () => {
      await result.current.acquire("request-1", paymentWork, ["payment-1"]);
    });
    let captured: GiofWorkLease | null = null;
    act(() => {
      captured = result.current.captureAndFence("request-1");
    });

    expect(captured).toEqual(currentLease);
    expect(result.current.leases).toEqual([]);
    expect(
      getGiofMutationHeaders("/request-payments/payment-1/details", "PATCH"),
    ).toBeUndefined();
    await act(async () => {
      await result.current.releaseCaptured(captured!);
      await result.current.releaseCaptured(captured!);
    });
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenLastCalledWith(
      "/giof-work/leases/release",
      expect.objectContaining({
        requestId: "request-1",
        token: currentLease.token,
      }),
    );
  });

  it("suprime solo el 409 de ciclo de vida de un heartbeat iniciado antes del acknowledgement", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockReset();
    const heartbeat = deferred<GiofWorkLease>();
    const onLeaseLost = vi.fn();
    const paymentWork = { ...work, pool: GIOF_WORK_POOL.PAYMENT };
    const currentLease = {
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    };
    vi.mocked(api.post)
      .mockResolvedValueOnce(currentLease)
      .mockReturnValueOnce(heartbeat.promise);
    const { result } = renderHook(() => useGiofWorkLeaseSet(onLeaseLost));
    await act(async () => {
      await result.current.acquire("request-1", paymentWork, ["payment-1"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    act(() => {
      result.current.captureAndFence("request-1");
    });
    heartbeat.reject(
      new ApiRequestError(409, {
        statusCode: 409,
        code: "GIOF_LIFECYCLE_CONFLICT",
        message: "Lifecycle conflict",
        error: "Conflict",
        timestamp: "2026-09-20T12:00:00.000Z",
        path: "/giof-work/leases/heartbeat",
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(onLeaseLost).not.toHaveBeenCalled();
  });

  it("muestra un 409 de ciclo de vida que ocurre antes del acknowledgement", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockReset();
    const onLeaseLost = vi.fn();
    const paymentWork = { ...work, pool: GIOF_WORK_POOL.PAYMENT };
    const currentLease = {
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    };
    vi.mocked(api.post)
      .mockResolvedValueOnce(currentLease)
      .mockRejectedValueOnce(
        new ApiRequestError(409, {
          statusCode: 409,
          code: "GIOF_LIFECYCLE_CONFLICT",
          message: "Lifecycle conflict",
          error: "Conflict",
          timestamp: "2026-09-20T12:00:00.000Z",
          path: "/giof-work/leases/heartbeat",
        }),
      )
      .mockResolvedValue({ released: true });
    const { result } = renderHook(() => useGiofWorkLeaseSet(onLeaseLost));
    await act(async () => {
      await result.current.acquire("request-1", paymentWork, ["payment-1"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onLeaseLost).toHaveBeenCalledWith("request-1", expect.any(Error));
  });

  it("no deja que el timer suprima una renovación explícita válida", async () => {
    vi.useFakeTimers();
    const explicitRenew = deferred<GiofWorkLease>();
    const paymentWork = { ...work, pool: GIOF_WORK_POOL.PAYMENT };
    const currentLease = {
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    };
    const renewedLease = {
      ...currentLease,
      token: "00000000-0000-4000-8000-000000000099",
    };
    let heartbeatCalls = 0;
    vi.mocked(api.post).mockImplementation((path) => {
      if (path === "/giof-work/leases/acquire")
        return Promise.resolve(currentLease);
      heartbeatCalls += 1;
      return heartbeatCalls === 1
        ? explicitRenew.promise
        : Promise.resolve(currentLease);
    });
    const { result } = renderHook(() => useGiofWorkLeaseSet());

    await act(async () => {
      await result.current.acquire("request-1", paymentWork, ["payment-1"]);
    });
    const renewal = result.current.renew("request-1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.post).toHaveBeenCalledTimes(2);

    await act(async () => {
      explicitRenew.resolve(renewedLease);
      await expect(renewal).resolves.toEqual(renewedLease);
    });
    expect(result.current.leases).toEqual([renewedLease]);
  });

  it("descarta un acquire exitoso que llega después de invalidar la sesión local", async () => {
    const acquisition = deferred<GiofWorkLease>();
    const paymentWork = { ...work, pool: GIOF_WORK_POOL.PAYMENT };
    vi.mocked(api.post).mockReturnValueOnce(acquisition.promise);
    const { result } = renderHook(() => useGiofWorkLeaseSet());

    const pendingAcquire = result.current.acquire("request-1", paymentWork, [
      "payment-1",
    ]);
    act(() => result.current.clearLocal());
    acquisition.resolve({
      ...lease,
      pool: GIOF_WORK_POOL.PAYMENT,
      expiresAt: "2099-08-07T10:05:00.000Z",
    });

    await expect(pendingAcquire).rejects.toThrow(/sesión operativa cambió/i);
    expect(result.current.leases).toEqual([]);
    expect(
      getGiofMutationHeaders("/request-payments/payment-1/details", "PATCH"),
    ).toBeUndefined();
  });
});
