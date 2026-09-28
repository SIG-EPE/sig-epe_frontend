import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanningLineCeiling } from "../use-planning-line-ceiling";

const get = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  role: "GIOF_MANAGER",
  token: "token",
  userId: "user-a",
  session: "session-a",
}));
vi.mock("@/lib/api-client", () => ({ api: { get } }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: auth.userId, role: { code: auth.role } },
      accessToken: auth.token,
      sessionExpiresAt: auth.session,
      isLoading: false,
    }),
}));

describe("new planning line ceiling snapshot", () => {
  beforeEach(() => {
    get.mockReset();
    auth.role = "GIOF_MANAGER";
    auth.token = "token";
    auth.userId = "user-a";
    auth.session = "session-a";
  });

  it("only fetches for selected unit and year with an authorized session", async () => {
    get.mockResolvedValue({
      ceiling: 100,
      used: 20,
      available: 80,
      warning: false,
    });
    const { result, rerender } = renderHook(
      ({ org, year }) => usePlanningLineCeiling(org, year),
      { initialProps: { org: "", year: "2026" } },
    );
    expect(get).not.toHaveBeenCalled();
    rerender({ org: "uo-a", year: "2026" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(get).toHaveBeenCalledWith(
      "/budget/planning-lines/ceiling-check?org_unit_id=uo-a&fiscal_year_id=2026",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    auth.role = "SOLICITANTE_EPE";
    rerender({ org: "uo-b", year: "2026" });
    expect(result.current.status).toBe("unavailable");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not show a prior year/UO or late responses and aborts old requests", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    get.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const { result, rerender } = renderHook(
      ({ org, year }) => usePlanningLineCeiling(org, year),
      { initialProps: { org: "uo-a", year: "2026" } },
    );
    rerender({ org: "uo-b", year: "2026" });
    expect(result.current.data).toBeNull();
    expect(get.mock.calls[0][1].signal.aborted).toBe(true);
    rerender({ org: "uo-b", year: "2027" });
    expect(result.current.data).toBeNull();
    expect(get.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      resolvers[0]({ ceiling: 1000, used: 0, available: 1000, warning: false });
    });
    expect(result.current.status).toBe("loading");
    await act(async () => {
      resolvers[2]({
        ceiling: null,
        used: 20,
        available: null,
        warning: false,
      });
    });
    expect(result.current.data?.ceiling).toBeNull();
    expect(result.current.status).toBe("ready");
  });

  it("distinguishes failed fetch from no configured ceiling", async () => {
    get.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => usePlanningLineCeiling("uo-a", "2026"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toBeNull();
  });

  it("hides a previous session's snapshot even when the same UO/year remains selected", async () => {
    get.mockResolvedValue({
      ceiling: 100,
      used: 20,
      available: 80,
      warning: false,
    });
    const { result, rerender } = renderHook(() =>
      usePlanningLineCeiling("uo-a", "2026"),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    auth.userId = "user-b";
    rerender();
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
