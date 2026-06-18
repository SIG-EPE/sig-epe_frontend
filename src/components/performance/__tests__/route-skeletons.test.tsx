import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BudgetRouteSkeleton,
  GiofDashboardRouteSkeleton,
  OrgUnitExecutionRouteSkeleton,
  PaymentQueueRouteSkeleton,
  RenditionsRouteSkeleton,
} from "../route-skeletons";

describe("route skeletons", () => {
  it("exposes accessible loading semantics for prioritized chart routes", () => {
    render(
      <>
        <BudgetRouteSkeleton />
        <OrgUnitExecutionRouteSkeleton />
        <GiofDashboardRouteSkeleton />
      </>,
    );

    expect(screen.getByRole("status", { name: "Cargando dashboard presupuestal" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Cargando Programado vs Ejecutado" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Cargando dashboard operativo GIOF" })).toHaveAttribute("aria-busy", "true");
  });

  it("exposes queue-specific loading semantics for payments and renditions", () => {
    render(
      <>
        <PaymentQueueRouteSkeleton />
        <RenditionsRouteSkeleton />
      </>,
    );

    expect(screen.getByRole("status", { name: "Cargando cola de pagos" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Cargando bandeja de rendiciones" })).toHaveAttribute("aria-busy", "true");
  });
});
