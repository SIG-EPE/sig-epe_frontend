import { strict as assert } from "node:assert";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { PlanningLinesTable } from "../planning-lines-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({ user: null }),
}));

describe("PlanningLinesTable generated-cost label", () => {
  it("names the total_cost column Costo generado in loading and populated table headers", () => {
    const { rerender } = render(
      <PlanningLinesTable lines={[]} isLoading onRefetch={vi.fn()} />,
    );

    assert.ok(screen.getByRole("columnheader", { name: "Costo generado" }));

    rerender(
      <PlanningLinesTable
        isLoading={false}
        onRefetch={vi.fn()}
        lines={[
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            line_code: "QM-001",
            resource_description: "Materiales",
            planning_type: "OPERATIVE",
            total_cost: 2000,
            status: "APPROVED",
            created_at: "2026-08-04T00:00:00.000Z",
            created_by: "user-1",
          },
        ] as never}
      />,
    );

    assert.ok(screen.getByRole("columnheader", { name: "Costo generado" }));
    assert.equal(screen.queryByRole("columnheader", { name: "Total" }), null);
  });
});
