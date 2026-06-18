import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuditLogs } from "@/hooks/use-audit-logs";
import { useRequests } from "@/hooks/use-requests";
import { useUsers } from "@/hooks/use-users";
import { api } from "@/lib/api-client";
import { clearQueryCache, setQueryCacheAuthNamespace } from "@/lib/query-cache";

vi.mock("@/lib/api-client", () => ({
  api: { get: vi.fn() },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string | null }) => unknown) => selector({ isLoading: false, accessToken: "token" }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearQueryCache();
  setQueryCacheAuthNamespace("list-cache-domains");
});

describe("cached list domain hooks", () => {
  it("mantiene usuarios previos durante cambios de búsqueda", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ users: [{ id: "user-1", firstName: "Ana" }], total: 1, page: 1, limit: 20 });
    const { result, rerender } = renderHook(({ search }) => useUsers(1, 20, search), { initialProps: { search: "ana" } });

    await waitFor(() => expect(result.current.users).toHaveLength(1));
    const pending = deferred<{ users: unknown[]; total: number; page: number; limit: number }>();
    vi.mocked(api.get).mockReturnValueOnce(pending.promise);

    rerender({ search: "ana paz" });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.users).toMatchObject([{ id: "user-1" }]);
    pending.resolve({ users: [{ id: "user-2", firstName: "Ana Paz" }], total: 1, page: 1, limit: 20 });
    await waitFor(() => expect(result.current.users).toMatchObject([{ id: "user-2" }]));
  });

  it("mantiene registros de auditoría previos durante cambios de filtro", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [{ id: "audit-1", action: "CREATE" }], total: 1, page: 1, limit: 20 });
    const { result, rerender } = renderHook(({ action }) => useAuditLogs({ page: 1, limit: 20, action }), { initialProps: { action: "CREATE" } });

    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    const pending = deferred<{ data: unknown[]; total: number; page: number; limit: number }>();
    vi.mocked(api.get).mockReturnValueOnce(pending.promise);

    rerender({ action: "UPDATE" });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.logs).toMatchObject([{ id: "audit-1" }]);
    pending.resolve({ data: [{ id: "audit-2", action: "UPDATE" }], total: 1, page: 1, limit: 20 });
    await waitFor(() => expect(result.current.logs).toMatchObject([{ id: "audit-2" }]));
  });

  it("mantiene solicitudes previas durante cambios de filtro de lista", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ requests: [{ id: "request-1", concept: "Inicial" }], total: 1, page: 1, limit: 20 });
    const { result, rerender } = renderHook(({ search }) => useRequests({ page: 1, limit: 20, search }), { initialProps: { search: "ini" } });

    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    const pending = deferred<{ requests: unknown[]; total: number; page: number; limit: number }>();
    vi.mocked(api.get).mockReturnValueOnce(pending.promise);

    rerender({ search: "act" });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.requests).toMatchObject([{ id: "request-1" }]);
    pending.resolve({ requests: [{ id: "request-2", concept: "Actualizada" }], total: 1, page: 1, limit: 20 });
    await waitFor(() => expect(result.current.requests).toMatchObject([{ id: "request-2" }]));
  });
});
