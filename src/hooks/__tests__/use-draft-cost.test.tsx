import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUpdateDraftPlanningLineCost } from "../use-budget";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  api: { patch: mocks.patch },
  ApiRequestError: class extends Error {},
}));
vi.mock("@/lib/query-cache", () => ({ invalidateQueryTag: mocks.invalidate }));

describe("draft cost PATCH", () => {
  it("uses ordinary line PATCH with numeric bases, not approved amendment", async () => {
    mocks.patch.mockReset();
    mocks.invalidate.mockReset();
    mocks.patch.mockResolvedValue({ id: "line-1" });
    const { result } = renderHook(() =>
      useUpdateDraftPlanningLineCost("line-1"),
    );
    await act(async () => {
      await result.current.update({ unit_price: 12.5, quantity: 3 });
    });
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith(
      "/budget/planning-lines/line-1",
      { unit_price: 12.5, quantity: 3 },
    );
    expect(mocks.invalidate).toHaveBeenCalledWith("budget");
    expect(mocks.invalidate).toHaveBeenCalledWith("poa");
  });
});
