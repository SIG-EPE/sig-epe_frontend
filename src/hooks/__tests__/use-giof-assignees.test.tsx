import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGiofAssignees } from "@/hooks/use-giof-work";
import { clearQueryCache, setQueryCacheAuthNamespace } from "@/lib/query-cache";
import type { GiofAssigneeCandidate } from "@/types/giof-work";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  api: apiMocks,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string | null }) => unknown) => selector({ isLoading: false, accessToken: "token" }),
}));

const candidate: GiofAssigneeCandidate = {
  id: "user-1",
  firstName: "Ana",
  lastName: "Operadora",
  role: "GIOF_GESTOR",
};

function abortableRequest(signal: AbortSignal): Promise<GiofAssigneeCandidate[]> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

describe("useGiofAssignees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    setQueryCacheAuthNamespace("giof-assignees-test:ADMIN");
  });

  it("deduplica el replay de StrictMode con una clave estable", async () => {
    apiMocks.get.mockResolvedValue([candidate]);
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

    const { result } = renderHook(() => useGiofAssignees(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([candidate]));
    expect(apiMocks.get).toHaveBeenCalledTimes(1);
    expect(apiMocks.get).toHaveBeenCalledWith("/giof-work/assignees", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("comparte una solicitud entre dos controles y aborta solo al desmontar el último consumidor", async () => {
    let sharedSignal: AbortSignal | undefined;
    apiMocks.get.mockImplementation((_path: string, options?: RequestInit) => {
      sharedSignal = options?.signal as AbortSignal;
      return abortableRequest(sharedSignal);
    });

    const first = renderHook(() => useGiofAssignees());
    const second = renderHook(() => useGiofAssignees());

    expect(apiMocks.get).toHaveBeenCalledTimes(1);
    first.unmount();
    await act(async () => Promise.resolve());
    expect(sharedSignal?.aborted).toBe(false);

    second.unmount();
    await act(async () => Promise.resolve());
    expect(sharedSignal?.aborted).toBe(true);
  });

  it("reutiliza el catálogo al remontar dentro del TTL", async () => {
    apiMocks.get.mockResolvedValue([candidate]);
    const first = renderHook(() => useGiofAssignees());
    await waitFor(() => expect(first.result.current.data).toEqual([candidate]));
    first.unmount();

    const second = renderHook(() => useGiofAssignees());
    await waitFor(() => expect(second.result.current.data).toEqual([candidate]));

    expect(apiMocks.get).toHaveBeenCalledTimes(1);
  });

  it("reutiliza en el modal el catálogo ya cargado por el filtro", async () => {
    apiMocks.get.mockResolvedValue([candidate]);
    const { result, rerender } = renderHook(
      ({ modalOpen }: { modalOpen: boolean }) => ({
        filter: useGiofAssignees(),
        modal: useGiofAssignees({ enabled: modalOpen }),
      }),
      { initialProps: { modalOpen: false } },
    );

    await waitFor(() => expect(result.current.filter.data).toEqual([candidate]));
    expect(apiMocks.get).toHaveBeenCalledTimes(1);

    rerender({ modalOpen: true });
    await waitFor(() => expect(result.current.modal.data).toEqual([candidate]));
    expect(apiMocks.get).toHaveBeenCalledTimes(1);
  });

  it("respeta enabled y no consulta el catálogo sin permiso o con el modal cerrado", () => {
    const { result } = renderHook(() => useGiofAssignees({ enabled: false }));

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(apiMocks.get).not.toHaveBeenCalled();
  });
});
