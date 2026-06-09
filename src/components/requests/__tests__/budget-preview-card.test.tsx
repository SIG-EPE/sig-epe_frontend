import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BudgetPreviewCard } from "@/components/requests/budget-preview-card";
import type { RequestAllocationsBudgetPreview } from "@/types/requests";

function makeAllocationsPreview(overrides: Partial<RequestAllocationsBudgetPreview> = {}): RequestAllocationsBudgetPreview {
  return {
    valid: true,
    hard_blocked: false,
    total_requested_amount: 1500,
    fiscal_year: 2026,
    allocation_count: 2,
    errors: [],
    allocations: [
      {
        budget_planning_line_id: "line-1",
        amount: 1000,
        valid: true,
        hard_blocked: false,
        errors: [],
        warnings: [],
        line_planned_remaining: 2000,
        remaining_ceiling: 5000,
      },
      {
        budget_planning_line_id: "line-2",
        amount: 500,
        valid: false,
        hard_blocked: true,
        errors: ["budget_ceiling excedido"],
        warnings: [],
        line_planned_remaining: null,
        remaining_ceiling: 300,
      },
    ],
    org_unit_groups: [],
    ...overrides,
  };
}

describe("BudgetPreviewCard", () => {
  it("muestra un estado vacío orientado a asignaciones POA múltiples", () => {
    render(<BudgetPreviewCard preview={null} isLoading={false} error={null} canPreview={false} onRetry={vi.fn()} />);

    expect(screen.getByText("Resumen presupuestal")).toBeInTheDocument();
    expect(screen.getByText("Agrega una o más líneas POA con monto para calcular la validación presupuestal.")).toBeInTheDocument();
    expect(screen.queryByText(/Selecciona línea POA y monto válido/i)).not.toBeInTheDocument();
  });

  it("muestra resumen agregado y estado por línea cuando hay asignaciones", () => {
    render(<BudgetPreviewCard preview={makeAllocationsPreview()} isLoading={false} error={null} canPreview onRetry={vi.fn()} />);

    expect(screen.getByText("Resumen presupuestal")).toBeInTheDocument();
    expect(screen.getByText("Validación agregada de la solicitud según las líneas POA y montos asignados.")).toBeInTheDocument();
    expect(screen.getByText("S/ 1,500.00")).toBeInTheDocument();
    expect(screen.getByText("Línea POA 1")).toBeInTheDocument();
    expect(screen.getByText("Estado: Validada")).toBeInTheDocument();
    expect(screen.getByText("Línea POA 2")).toBeInTheDocument();
    expect(screen.getByText("Estado: Bloqueada")).toBeInTheDocument();
    expect(screen.getByText("Bloquea el envío")).toBeInTheDocument();
    expect(screen.getByText("límite presupuestal excedido")).toBeInTheDocument();
  });
});
