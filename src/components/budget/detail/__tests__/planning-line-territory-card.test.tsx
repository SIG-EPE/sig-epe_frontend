import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanningLineTerritoryCard } from "../planning-line-territory-card";

const update = vi.fn();
vi.mock("@/hooks/use-budget", () => ({
  useUpdatePlanningLineTerritory: () => ({ update, isLoading: false }),
  useTerritories: () => ({ data: [], isLoading: false, error: null }),
}));

describe("PlanningLineTerritoryCard", () => {
  beforeEach(() => update.mockReset());

  it("renders exact mixed official and aggregate labels", () => {
    render(
      <PlanningLineTerritoryCard
        lineId="line-1"
        canEdit={false}
        legacyLabel="Amazonas"
        selection={{ axes: [
          { axis: "REGION", territory_id: "r1", aggregate_option_id: null, territory: { id: "r1", name: "Amazonas" }, aggregate_option: null },
          { axis: "PROVINCIA", territory_id: null, aggregate_option_id: "a1", territory: null, aggregate_option: { id: "a1", code: "MULTIPROVINCIAL", axis: "PROVINCIA", name: "Multiprovincial" } },
          { axis: "DISTRITO", territory_id: "d1", aggregate_option_id: null, territory: { id: "d1", name: "Imaza" }, aggregate_option: null },
        ] }}
      />,
    );

    expect(screen.getByText("Amazonas")).toBeInTheDocument();
    expect(screen.getByText("Multiprovincial")).toBeInTheDocument();
    expect(screen.getByText("Imaza")).toBeInTheDocument();
  });

  it("offers an accessible reclassification editor only when allowed", () => {
    render(
      <PlanningLineTerritoryCard
        lineId="line-1"
        canEdit
        legacyLabel="Amazonas"
        selection={{ axes: [] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reclasificar territorio" }));
    expect(screen.getByRole("group", { name: /alcance territorial por eje/i })).toBeInTheDocument();
  });
});
