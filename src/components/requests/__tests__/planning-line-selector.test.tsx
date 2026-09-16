import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanningLineSelector } from "@/components/requests/planning-line-selector";
import { Form } from "@/components/ui/form";
import type { RequestFormValues } from "@/components/requests/request-form";
import type { RequestPlanningLineLookupItem } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  lines: [] as RequestPlanningLineLookupItem[],
  searchHook: vi.fn(),
  facetsHook: vi.fn(),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequestPlanningLineSearch: (filters: unknown, enabled: boolean) => mocks.searchHook(filters, enabled),
  useRequestPlanningLineFacets: (filters: unknown, enabled: boolean) => mocks.facetsHook(filters, enabled),
}));

function makeLine(overrides: Partial<RequestPlanningLineLookupItem> = {}): RequestPlanningLineLookupItem {
  return {
    id: "line-1",
    currency: "PEN",
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

function PlanningLineSelectorHarness({ selectedLine, currency = "PEN", otherSelectedCurrencies = [] }: { selectedLine: RequestPlanningLineLookupItem | null; currency?: "PEN" | "USD"; otherSelectedCurrencies?: Array<"PEN" | "USD" | null> }) {
  const form = useForm<RequestFormValues>({
    defaultValues: {
      request_type: "ADVANCE",
      currency,
      budget_planning_line_id: selectedLine?.id ?? "",
      requested_amount: "100",
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
      <label>Moneda de prueba<select aria-label="Moneda de prueba" {...form.register("currency")}><option value="PEN">PEN</option><option value="USD">USD</option></select></label>
      <output data-testid="selected-line-id">{form.watch("budget_planning_line_id")}</output>
      <PlanningLineSelector control={form.control} selectedLine={selectedLine} lines={mocks.lines} otherSelectedCurrencies={otherSelectedCurrencies} onSelectedLineChange={vi.fn()} />
    </Form>
  );
}

describe("PlanningLineSelector", () => {
  beforeEach(() => {
    mocks.lines = [];
    mocks.searchHook.mockReset().mockImplementation(() => ({
      items: mocks.lines,
      total: mocks.lines.length,
      hasMore: false,
      isLoading: false,
      isRefreshing: false,
      error: null,
      loadMore: vi.fn(),
      retry: vi.fn(),
    }));
    mocks.facetsHook.mockReset().mockReturnValue({
      data: {
        org_units: [{ id: "unit-1", code: "UO-01", name: "Unidad de Operaciones" }],
        planning_types: ["PROJECT"],
        programs: [{ id: "program-1", code: "PRG-01", name: "Programa Estratégico" }],
        components: [{ id: "component-1", name: "Fortalecimiento comunitario" }],
        operative_actions: [{ id: "action-1", name: "Ejecutar acompañamiento" }],
        categories: [{ id: "category-1", code: "CAT-10", name: "Servicios técnicos" }],
        territories: [{ id: "territory-1", name: "Región Norte" }],
      },
      isLoading: false,
      error: null,
    });
  });

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
    expect(option).toHaveTextContent("Moneda: PEN");
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
  it("shows the actual currency and disables USD and unresolved lines for PEN", async () => {
    mocks.lines = [makeLine(), makeLine({ id: "usd", currency: "USD" }), makeLine({ id: "legacy", currency: null })];
    render(<PlanningLineSelectorHarness selectedLine={null} />);
    await userEvent.setup().click(screen.getByTestId("request-planning-line-trigger"));
    const options = await screen.findAllByTestId("request-planning-line-trigger-option");
    expect(options[0]).not.toBeDisabled();
    expect(options[1]).toBeDisabled();
    expect(options[1]).toHaveTextContent("Una solicitud en soles solo puede usar líneas POA en soles.");
    expect(options[2]).toBeDisabled();
    expect(options[2]).toHaveTextContent("Pendiente de resolución");
  });

  it("allows USD with homogeneous PEN or USD lines, but never mixed lines", async () => {
    mocks.lines = [makeLine(), makeLine({ id: "usd", currency: "USD" }), makeLine({ id: "legacy", currency: null })];
    const { rerender } = render(<PlanningLineSelectorHarness selectedLine={null} currency="USD" />);
    await userEvent.setup().click(screen.getByTestId("request-planning-line-trigger"));
    let options = await screen.findAllByTestId("request-planning-line-trigger-option");
    expect(options[0]).not.toBeDisabled();
    expect(options[1]).not.toBeDisabled();
    expect(options[2]).toBeDisabled();

    rerender(<PlanningLineSelectorHarness selectedLine={null} currency="USD" otherSelectedCurrencies={["PEN"]} />);
    options = await screen.findAllByTestId("request-planning-line-trigger-option");
    expect(options[0]).not.toBeDisabled();
    expect(options[1]).toBeDisabled();
    expect(options[1]).toHaveTextContent("No se pueden mezclar");
  });

  it("retains the hydrated PEN selection across PEN to USD to PEN", async () => {
    const user = userEvent.setup();
    const line = makeLine();
    mocks.lines = [line];
    render(<PlanningLineSelectorHarness selectedLine={line} />);
    expect(screen.getByTestId("selected-line-id")).toHaveTextContent(line.id);
    await user.selectOptions(screen.getByLabelText("Moneda de prueba"), "USD");
    expect(screen.getByTestId("selected-line-id")).toHaveTextContent(line.id);
    expect(screen.getByText("Moneda").parentElement).toHaveTextContent("PEN");
    await user.selectOptions(screen.getByLabelText("Moneda de prueba"), "PEN");
    expect(screen.getByTestId("selected-line-id")).toHaveTextContent(line.id);
  });

  it("retains an incompatible hydrated selection and shows how to correct it after currency changes", async () => {
    const user = userEvent.setup();
    const line = makeLine({ id: "usd", currency: "USD" });
    mocks.lines = [line];
    render(<PlanningLineSelectorHarness selectedLine={line} currency="USD" />);
    await user.selectOptions(screen.getByLabelText("Moneda de prueba"), "PEN");
    expect(screen.getByTestId("selected-line-id")).toHaveTextContent(line.id);
    expect(screen.getByRole("alert")).toHaveTextContent("Una solicitud en soles solo puede usar líneas POA en soles.");
    await user.selectOptions(screen.getByLabelText("Moneda de prueba"), "USD");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("propaga la apertura del modal para iniciar la carga directa", async () => {
    const user = userEvent.setup();
    render(<PlanningLineSelectorHarness selectedLine={null} />);

    expect(mocks.searchHook.mock.calls.some(([, enabled]) => enabled === true)).toBe(false);
    await user.click(screen.getByTestId("request-planning-line-trigger"));

    await waitFor(() => {
      expect(mocks.searchHook.mock.calls.some(([filters, enabled]) => (
        enabled === true
        && (filters as { scope?: string }).scope === "direct"
        && (filters as { org_unit_id?: string }).org_unit_id === undefined
      ))).toBe(true);
    });
  });

  it("envía la unidad seleccionada como jerarquía de descendientes y conserva directo multiunidad por defecto", async () => {
    const user = userEvent.setup();
    const line = makeLine();
    mocks.lines = [line];
    render(<PlanningLineSelectorHarness selectedLine={line} />);

    expect(mocks.searchHook.mock.calls.some(([filters]) => (
      (filters as { scope?: string }).scope === "direct"
      && (filters as { org_unit_id?: string }).org_unit_id === undefined
    ))).toBe(true);

    await user.click(screen.getByRole("tab", { name: "Jerarquía" }));

    await waitFor(() => {
      expect(mocks.searchHook.mock.calls.some(([filters, enabled]) => (
        enabled === true
        && (filters as { scope?: string }).scope === "hierarchy"
        && (filters as { org_unit_id?: string }).org_unit_id === "unit-1"
      ))).toBe(true);
    });
    expect(screen.getByText("Unidad organizacional")).toBeInTheDocument();
  });

  it("permite filtrar la búsqueda directa por una unidad exacta", async () => {
    const user = userEvent.setup();
    render(<PlanningLineSelectorHarness selectedLine={null} />);

    await user.click(screen.getByTestId("request-planning-line-org-unit-trigger"));
    const dialog = await screen.findByRole("dialog", { name: "Filtrar por unidad organizacional" });
    await user.click(within(dialog).getByTestId("request-planning-line-org-unit-trigger-option"));
    await user.click(screen.getByTestId("request-planning-line-trigger"));

    await waitFor(() => {
      expect(mocks.searchHook.mock.calls.some(([filters, enabled]) => (
        enabled === true
        && (filters as { scope?: string }).scope === "direct"
        && (filters as { org_unit_id?: string }).org_unit_id === "unit-1"
      ))).toBe(true);
    });
  });

  it("conserva la selección y ofrece retry localizado cuando falla cargar más", async () => {
    const user = userEvent.setup();
    const selectedLine = makeLine();
    const retry = vi.fn();
    mocks.lines = [selectedLine];
    mocks.searchHook.mockReturnValue({
      items: [selectedLine],
      total: 2,
      hasMore: true,
      isLoading: false,
      isRefreshing: false,
      error: new Error("No se pudo cargar la siguiente página"),
      loadMore: vi.fn(),
      retry,
    });

    render(<PlanningLineSelectorHarness selectedLine={selectedLine} />);

    expect(screen.getAllByText("POA-001 — Implementación territorial")).not.toHaveLength(0);
    await user.click(screen.getByTestId("request-planning-line-trigger"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("POA-001 — Implementación territorial")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("POA-001 — Implementación territorial")).not.toHaveLength(0);
  });
});
