import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { PlanningLineSelector } from "@/components/requests/planning-line-selector";
import { Form } from "@/components/ui/form";
import type { RequestFormValues } from "@/components/requests/request-form";
import type { RequestPlanningLineLookupItem } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  lines: [] as RequestPlanningLineLookupItem[],
}));

function makeLine(overrides: Partial<RequestPlanningLineLookupItem> = {}): RequestPlanningLineLookupItem {
  return {
    id: "line-1",
    line_code: "POA-001",
    resource_description: "Implementación territorial",
    planning_type: "PROJECT",
    type_resource: "SERVICIO",
    unit_price: 1250,
    quantity: 2,
    total_cost: 2500,
    status: "APPROVED",
    fiscal_year: { id: "fy-2026", year: 2026, status: "OPEN" },
    org_unit: { id: "unit-1", code: "UO-01", name: "Unidad de Operaciones" },
    category: { id: "category-1", code: "CAT-10", name: "Servicios técnicos" },
    program: { id: "program-1", code: "PRG-01", name: "Programa Estratégico" },
    action: {
      id: "action-1",
      name: "Ejecutar acompañamiento",
      component: { id: "component-1", name: "Fortalecimiento comunitario" },
    },
    territory: { id: "territory-1", name: "Región Norte" },
    monthly_summary: [{ month: 1, planned_amount: 2500, executed_amount: 400 }],
    ...overrides,
  };
}

function PlanningLineSelectorHarness({ selectedLine }: { selectedLine: RequestPlanningLineLookupItem | null }) {
  const form = useForm<RequestFormValues>({
    defaultValues: {
      request_type: "ADVANCE",
      budget_planning_line_id: selectedLine?.id ?? "",
      requested_amount: 100,
      concept: "Solicitud de prueba",
      scheduled_rendition_at: "",
      beneficiary_name: "",
      beneficiary_document_type: "",
      beneficiary_document_number: "",
      bank_code: "",
      bank_name: "",
      bank_account: "",
      bank_cci: "",
      account_type: "",
      supplier_ruc: "",
      supplier_name: "",
    },
  });

  return (
    <Form {...form}>
      <PlanningLineSelector control={form.control} selectedLine={selectedLine} lines={mocks.lines} onSelectedLineChange={vi.fn()} />
    </Form>
  );
}

describe("PlanningLineSelector", () => {
  it("muestra solo unidad, componente, acción y categoría/recurso en el resumen seleccionado", () => {
    const line = makeLine();
    mocks.lines = [line];

    render(<PlanningLineSelectorHarness selectedLine={line} />);

    expect(screen.getByText("Unidad")).toBeInTheDocument();
    expect(screen.getByText("UO-01 · Unidad de Operaciones")).toBeInTheDocument();
    expect(screen.getByText("Componente")).toBeInTheDocument();
    expect(screen.getByText("Fortalecimiento comunitario")).toBeInTheDocument();
    expect(screen.getByText("Acción")).toBeInTheDocument();
    expect(screen.getByText("Ejecutar acompañamiento")).toBeInTheDocument();
    expect(screen.getByText("Categoría/Recurso")).toBeInTheDocument();
    expect(screen.getByText("CAT-10 · Servicios técnicos")).toBeInTheDocument();

    expect(screen.queryByText("Tipo")).not.toBeInTheDocument();
    expect(screen.queryByText("Programa / proyecto / gestión")).not.toBeInTheDocument();
    expect(screen.queryByText("Programa Estratégico")).not.toBeInTheDocument();
    expect(screen.queryByText("Territorio")).not.toBeInTheDocument();
    expect(screen.queryByText("Región Norte")).not.toBeInTheDocument();
    expect(screen.queryByText("Costo total")).not.toBeInTheDocument();
    expect(screen.queryByText("Saldo por ejecutar")).not.toBeInTheDocument();
  });

  it("usa los mismos cuatro campos etiquetados en los subtítulos de opciones", async () => {
    const user = userEvent.setup();
    const line = makeLine();
    mocks.lines = [line];

    render(<PlanningLineSelectorHarness selectedLine={null} />);

    await user.click(screen.getByTestId("request-planning-line-trigger"));

    const dialog = await screen.findByRole("dialog");
    const option = within(dialog).getByTestId("request-planning-line-trigger-option");

    expect(option).toHaveTextContent("Unidad: UO-01 · Unidad de Operaciones");
    expect(option).toHaveTextContent("Componente: Fortalecimiento comunitario");
    expect(option).toHaveTextContent("Acción: Ejecutar acompañamiento");
    expect(option).toHaveTextContent("Categoría/Recurso: CAT-10 · Servicios técnicos");

    await waitFor(() => {
      expect(option).not.toHaveTextContent("Tipo:");
      expect(option).not.toHaveTextContent("Programa Estratégico");
      expect(option).not.toHaveTextContent("Región Norte");
      expect(option).not.toHaveTextContent("Costo total");
      expect(option).not.toHaveTextContent("Saldo por ejecutar");
    });
  });
});
