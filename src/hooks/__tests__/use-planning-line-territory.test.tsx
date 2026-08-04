import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUpdatePlanningLineTerritory } from "../use-budget";

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, patch } };
});

describe("useUpdatePlanningLineTerritory", () => {
  beforeEach(() => patch.mockReset());

  it("sends only the backend structured payload and never a generated legacy anchor", async () => {
    patch.mockResolvedValue({ id: "line-1" });
    const { result } = renderHook(() => useUpdatePlanningLineTerritory("line-1"));
    const territorySelection = {
      axes: [
        { axis: "REGION" as const, territory_id: "region" },
        { axis: "PROVINCIA" as const, aggregate_option_id: "aggregate" },
        { axis: "DISTRITO" as const, territory_id: "district" },
      ],
    };

    await act(() => result.current.update(territorySelection));

    expect(patch).toHaveBeenCalledWith("/budget/planning-lines/line-1", {
      territory_selection: territorySelection,
    });
    expect(patch.mock.calls[0][1]).not.toHaveProperty("territory_id");
  });
});
