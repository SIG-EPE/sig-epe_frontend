import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRequest } from "@/hooks/use-requests";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { PaymentRequest } from "@/types/requests";

vi.mock("@/lib/api-client", () => ({ api: { get: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function detail(id: string, status?: string): PaymentRequest {
  return {
    id,
    concept: id,
    rexan_activation: status ? { status, attempt_count: 0 } : null,
  } as PaymentRequest;
}

function strictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  useAuthStore.setState({ accessToken: "token-a", isLoading: false });
});

describe("useRequest detail GET lifecycle", () => {
  it("aborta inmediatamente el primer GET en el remount de StrictMode", async () => {
    const first = deferred<PaymentRequest>();
    vi.mocked(api.get)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(detail("new"));
    const firstMount = renderHook(() => useRequest("request-1"), {
      wrapper: strictWrapper,
    });
    firstMount.unmount();
    const { result, unmount } = renderHook(() => useRequest("request-1"), {
      wrapper: strictWrapper,
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    const oldSignal = vi.mocked(api.get).mock.calls[0]?.[1]?.signal;
    const currentSignal = vi.mocked(api.get).mock.calls[1]?.[1]?.signal;
    expect(oldSignal?.aborted).toBe(true);
    expect(currentSignal?.aborted).toBe(false);
    await waitFor(() => expect(result.current.request?.concept).toBe("new"));
    await act(async () =>
      first.reject(new DOMException("aborted", "AbortError")),
    );
    expect(result.current.error).toBeNull();
    unmount();
    expect(currentSignal?.aborted).toBe(false);
  });

  it("aborta por ID y descarta respuesta/error tardíos sin apagar la carga actual", async () => {
    const old = deferred<PaymentRequest>();
    const current = deferred<PaymentRequest>();
    vi.mocked(api.get)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const { result, rerender } = renderHook(({ id }) => useRequest(id), {
      initialProps: { id: "old" },
    });
    rerender({ id: "current" });
    expect(vi.mocked(api.get).mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.mocked(api.get).mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
    await act(async () => old.reject(new Error("obsolete failure")));
    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => current.resolve(detail("current")));
    expect(result.current.request?.id).toBe("current");
    expect(result.current.isInitialLoading).toBe(false);
  });

  it("cambia de token, invalida respuestas viejas y limpia estado al perder autenticación", async () => {
    const old = deferred<PaymentRequest>();
    const current = deferred<PaymentRequest>();
    vi.mocked(api.get)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const { result } = renderHook(() => useRequest("request-1"));
    act(() => useAuthStore.setState({ accessToken: "token-b" }));
    expect(vi.mocked(api.get).mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => old.resolve(detail("obsolete")));
    expect(result.current.request).toBeNull();
    expect(result.current.isInitialLoading).toBe(true);
    await act(async () => current.resolve(detail("fresh")));
    expect(result.current.request?.id).toBe("fresh");
    act(() => useAuthStore.setState({ accessToken: null }));
    expect(result.current.request).toBeNull();
    expect(result.current.isInitialLoading).toBe(false);
  });

  it("el refetch reemplaza al GET previo y conserva el detalle durante error de fondo", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(detail("initial"));
    const { result } = renderHook(() => useRequest("request-1"));
    await waitFor(() => expect(result.current.request?.id).toBe("initial"));
    const obsolete = deferred<PaymentRequest>();
    const active = deferred<PaymentRequest>();
    vi.mocked(api.get)
      .mockReturnValueOnce(obsolete.promise)
      .mockReturnValueOnce(active.promise);
    act(() => {
      void result.current.refetch({ background: true });
    });
    act(() => {
      void result.current.refetch({ background: true });
    });
    expect(vi.mocked(api.get).mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => obsolete.resolve(detail("obsolete")));
    expect(result.current.request?.id).toBe("initial");
    expect(result.current.isRefreshing).toBe(true);
    await act(async () => active.reject(new Error("network failed")));
    expect(result.current.request?.id).toBe("initial");
    expect(result.current.error?.message).toBe("network failed");
    expect(result.current.isRefreshing).toBe(false);
  });

  it("mantiene el polling REXAN acotado y aborta una consulta al desmontar", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(detail("request-1", "PENDING"));
    const polling = deferred<PaymentRequest>();
    const { result, unmount } = renderHook(() => useRequest("request-1"));
    await waitFor(() => expect(result.current.request?.id).toBe("request-1"));
    vi.mocked(api.get).mockReturnValueOnce(polling.promise);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(result.current.isRefreshing).toBe(true);
    const signal = vi.mocked(api.get).mock.calls[1]?.[1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      polling.reject(new DOMException("aborted", "AbortError")),
    );
  });
});
