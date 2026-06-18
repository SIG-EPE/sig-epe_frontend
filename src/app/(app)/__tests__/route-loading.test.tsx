import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BudgetLoading from "../budget/loading";
import OrgUnitExecutionLoading from "../budget/org-unit-execution/loading";
import GiofDashboardLoading from "../dashboard/giof/loading";
import PaymentsLoading from "../payments/loading";
import RenditionsLoading from "../renditions/loading";

describe("route loading skeletons", () => {
  it("keeps prioritized chart routes accessible during segment loading", () => {
    render(
      <>
        <BudgetLoading />
        <OrgUnitExecutionLoading />
        <GiofDashboardLoading />
      </>,
    );

    expect(screen.getByRole("status", { name: "Cargando dashboard presupuestal" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Cargando Programado vs Ejecutado" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Cargando dashboard operativo GIOF" })).toHaveAttribute("aria-busy", "true");
  });

  it("keeps queue routes accessible during segment loading", () => {
    render(
      <>
        <PaymentsLoading />
        <RenditionsLoading />
      </>,
    );

    expect(screen.getByRole("status", { name: "Cargando cola de pagos" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Cargando bandeja de rendiciones" })).toHaveAttribute("aria-busy", "true");
  });
});
