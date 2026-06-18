import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const dynamicMock = vi.hoisted(() => vi.fn());

vi.mock("next/dynamic", () => ({
  default: dynamicMock,
}));

dynamicMock.mockImplementation((loader: unknown, options: { loading?: () => ReactNode; ssr?: boolean }) => {
  const Loading = options.loading;

  return function DynamicDashboardWrapperMock() {
    return Loading ? <>{Loading()}</> : null;
  };
});

describe("dynamic dashboard wrappers", () => {
  it("renders the org-unit dashboard skeleton while its dynamic import resolves", async () => {
    const { DynamicOrgUnitExecutionDashboard } = await import("@/components/budget/dashboard/org-unit-execution-dashboard-dynamic");

    render(<DynamicOrgUnitExecutionDashboard />);

    expect(screen.getByRole("status", { name: "Cargando panel Programado vs Ejecutado" })).toHaveAttribute("aria-busy", "true");
    expect(dynamicMock).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ ssr: false, loading: expect.any(Function) }));
  });

  it("renders the GIOF dashboard skeleton while its dynamic import resolves", async () => {
    const { DynamicGiofOperationsDashboardView } = await import("@/components/dashboard/giof-operations-dashboard-dynamic");

    render(<DynamicGiofOperationsDashboardView />);

    expect(screen.getByRole("status", { name: "Cargando panel operativo GIOF" })).toHaveAttribute("aria-busy", "true");
  });
});
