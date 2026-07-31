import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSetGiofMembership } from "@/hooks/use-users";
import { api } from "@/lib/api-client";
import { invalidateUserDomain } from "@/lib/query-tags";

vi.mock("@/lib/api-client", () => ({
  api: {
    patch: vi.fn(),
  },
}));

vi.mock("@/lib/query-tags", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/query-tags")>();
  return {
    ...actual,
    invalidateUserDomain: vi.fn(),
  };
});

describe("useSetGiofMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([true, false])(
    "uses the dedicated endpoint with enabled=%s and invalidates list/detail caches",
    async (enabled) => {
      vi.mocked(api.patch).mockResolvedValueOnce({});
      const { result } = renderHook(() => useSetGiofMembership());

      await act(async () => {
        await result.current.setGiofMembership("user-1", enabled);
      });

      expect(api.patch).toHaveBeenCalledWith(
        "/users/user-1/giof-membership",
        { enabled },
      );
      expect(invalidateUserDomain).toHaveBeenCalledTimes(1);
      expect(result.current.isLoading).toBe(false);
    },
  );

  it("propagates backend rejection, resets loading and still refreshes stale state", async () => {
    const error = new Error("Transición no permitida");
    vi.mocked(api.patch).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useSetGiofMembership());

    await expect(
      act(async () => {
        await result.current.setGiofMembership("user-1", true);
      }),
    ).rejects.toThrow(error);

    expect(invalidateUserDomain).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
  });
});
