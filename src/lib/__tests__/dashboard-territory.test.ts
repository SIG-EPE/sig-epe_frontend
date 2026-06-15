import { describe, expect, it } from "vitest";

import { getTerritoryBusinessBadge, getTerritoryDisplayLabel } from "@/lib/dashboard-territory";
import type { BudgetDashboardBreakdownItem } from "@/types/dashboard";

const BASE_ROW: BudgetDashboardBreakdownItem = {
  id: "territory-1",
  label: "Carmen Salcedo",
  planned: 0,
  committed: 0,
  executed: 0,
  rendered: null,
  execution_rate: null,
};

describe("budget dashboard territory labels", () => {
  it("prefers hierarchical district display labels over ambiguous raw names", () => {
    const row: BudgetDashboardBreakdownItem = {
      ...BASE_ROW,
      display_label: "Distrito: Carmen Salcedo, Lucanas, Ayacucho",
      territory_level: "DISTRITO",
      territory_ubigeo_code: "050604",
    };

    expect(getTerritoryDisplayLabel(row)).toBe("Distrito: Carmen Salcedo, Lucanas, Ayacucho");
    expect(getTerritoryBusinessBadge(row)).toBe("Distrito");
  });

  it("marks synthetic territories with Spanish business labels", () => {
    const row: BudgetDashboardBreakdownItem = {
      ...BASE_ROW,
      label: "Exterior",
      display_label: "Exterior",
      territory_code: "EXTERIOR_DIST",
      is_synthetic_territory: true,
    };

    expect(getTerritoryDisplayLabel(row)).toBe("Exterior");
    expect(getTerritoryBusinessBadge(row)).toBe("Territorio sintético");
  });
});
