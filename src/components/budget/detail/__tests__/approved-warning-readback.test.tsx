import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineDetailPage } from "../line-detail-page";
import type { PlanningLine } from "@/types/budget";
import type { ApprovedAmendmentWarning } from "@/hooks/use-approved-amendment";
import { useApprovedAmendment } from "@/hooks/use-approved-amendment";

const state = vi.hoisted(() => ({
  line: null as PlanningLine | null,
  savedWarnings: [] as ApprovedAmendmentWarning[],
  refetch: vi.fn(),
  isLoading: false,
  realHooks: false,
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "line-1" }), useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/stores/auth-store", () => {
  const auth = { user: { id: "manager", role: { code: "GIOF_MANAGER" } }, isLoading: false, accessToken: "test-only-token" };
  return { useAuthStore: Object.assign(
    (selector?: (value: typeof auth) => unknown) => selector ? selector(auth) : auth,
    { getState: () => auth },
  ) };
});
vi.mock("@/hooks/use-budget", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/use-budget")>();
  return {
    ...original,
    usePlanningLine: (...args: Parameters<typeof original.usePlanningLine>) => state.realHooks
      ? original.usePlanningLine(...args)
      : { line: state.line, isLoading: state.isLoading, error: null, refetch: state.refetch },
  };
});
vi.mock("../approved-amendment-modal", async (importOriginal) => {
  const original = await importOriginal<typeof import("../approved-amendment-modal")>();
  return {
    ApprovedAmendmentWarnings: original.ApprovedAmendmentWarnings,
    ApprovedAmendmentModal: function TestAmendmentModal({ line, onSuccess }: {
      line: PlanningLine;
      onSuccess: (warnings: ApprovedAmendmentWarning[]) => void;
    }) {
      const amendment = useApprovedAmendment(line.id);
      async function saveAmendment() {
        if (!state.realHooks) return onSuccess(state.savedWarnings);
        const result = await amendment.save({
          expected_revision: "test-revision", unit_price: "750.00", quantity: "2.00",
          importance: "Actividad estratégica", frequency: "Actividad Rutinaria",
          monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, planned_amount: "125.00" })),
        });
        onSuccess(result.warnings);
      }
      return <button onClick={() => void saveAmendment()}>Guardar prueba</button>;
    },
  };
});
vi.mock("../monthly-table", () => ({ MonthlyTable: () => null }));
vi.mock("../manual-execution-modal", () => ({ ManualExecutionModal: () => null }));
vi.mock("../source-month-grid", () => ({ SourceMonthGrid: () => null }));
vi.mock("../funding-source-distribution", () => ({ FundingSourceDistribution: () => null }));
vi.mock("../status-timeline", () => ({ StatusTimeline: () => null }));
vi.mock("../planning-line-territory-card", () => ({ PlanningLineTerritoryCard: () => null }));
vi.mock("../line-actions", () => ({ LineActions: () => null }));

const unknown: ApprovedAmendmentWarning[] = Array.from({ length: 12 }, (_, i) => ({
  code: "UNKNOWN_VALUATION", scope: "MONTH", status: "UNKNOWN", month: i + 1,
}));
const postWarnings: ApprovedAmendmentWarning[] = [...unknown,
  { code: "UNKNOWN_VALUATION", scope: "TOTAL", status: "UNKNOWN" },
  { code: "CEILING_EXCEEDED", scope: "UNIT_YEAR", status: "BREACH", fiscalYear: 2026 },
];
// GET usa before = after = current: la misma condición del techo también es histórica.
// Se agrupan en presentación, conservando ambas advertencias del servidor en detalle.
const getWarnings: ApprovedAmendmentWarning[] = [...postWarnings,
  { code: "HISTORICAL_OVERRUN", scope: "UNIT_YEAR", status: "BREACH", fiscalYear: 2026 },
];
function resolvedLine(): PlanningLine {
  // Escenario sintético: plan menor, valoración completa y sin exposición/techo excedido.
  return {
    ...state.line!, unit_price: 375, quantity: 2, total_cost: 750,
    monthlyDistribution: Array.from({ length: 12 }, (_, i) => ({
      id: `month-${i + 1}`, planning_line_id: "line-1", month: i + 1,
      planned_amount: 62.5, executed_amount: 0, monthly_programmed_decimal: "62.50",
    })),
    approved_amendment_warnings: [],
  };
}
function save() {
  fireEvent.click(screen.getByRole("button", { name: "Editar presupuesto aprobado" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar prueba" }));
}
function rawWarnings() {
  const detail = screen.getByText("Ver detalle").closest("details")!;
  return within(detail).getAllByRole("listitem", { hidden: true });
}
describe("current approved warning readback", () => {
  beforeEach(() => {
    state.refetch.mockReset();
    state.isLoading = false;
    state.realHooks = false;
    state.savedWarnings = postWarnings;
    state.line = {
      id: "line-1", fiscal_year_id: "fy", organizational_unit_id: "uo", budget_category_id: "cat",
      planning_type: "GESTION", status: "APPROVED", resource_description: "Recurso",
      unit_price: 750, quantity: 2, total_cost: 1500, created_at: "2026-01-01", updated_at: "2026-01-01",
      created_by: "manager", monthlyDistribution: Array.from({ length: 12 }, (_, i) => ({
        id: `month-${i + 1}`, planning_line_id: "line-1", month: i + 1,
        planned_amount: 125, executed_amount: 0, monthly_programmed_decimal: "125.00",
      })),
    };
  });
  afterEach(() => vi.unstubAllGlobals());
  it("renders all canonical GET warnings on mount and after a full remount", () => {
    state.line!.approved_amendment_warnings = getWarnings;
    const view = render(<LineDetailPage />);
    expect(rawWarnings()).toHaveLength(15);
    expect(screen.getByText(/techo de la unidad excedido/)).toBeInTheDocument();
    view.unmount();
    render(<LineDetailPage />);
    expect(rawWarnings()).toHaveLength(15);
  });
  it("keeps POST warnings while the old GET [] is still present, then uses the fresh GET", () => {
    state.line!.approved_amendment_warnings = [];
    const view = render(<LineDetailPage />);
    save();
    expect(rawWarnings()).toHaveLength(14);
    expect(state.refetch).toHaveBeenCalledOnce();
    state.line = { ...state.line!, approved_amendment_warnings: getWarnings };
    view.rerender(<LineDetailPage />);
    expect(rawWarnings()).toHaveLength(15);
  });
  it("legitimately clears stale POST warnings when a fresh canonical GET returns []", () => {
    const view = render(<LineDetailPage />);
    save();
    state.line = resolvedLine();
    view.rerender(<LineDetailPage />);
    expect(screen.queryByText("Ver detalle")).not.toBeInTheDocument();
  });
  it("does not flash-hide saved warnings while refetch is still loading the next GET", () => {
    state.line!.approved_amendment_warnings = [];
    const view = render(<LineDetailPage />);
    save();
    state.isLoading = true;
    view.rerender(<LineDetailPage />);
    expect(rawWarnings()).toHaveLength(14);
    state.line = resolvedLine();
    state.isLoading = false;
    view.rerender(<LineDetailPage />);
    expect(screen.queryByText("Ver detalle")).not.toBeInTheDocument();
  });
  it("does not falsely clear POST warnings when an older API omits the field", () => {
    const view = render(<LineDetailPage />);
    save();
    state.line = { ...state.line! };
    view.rerender(<LineDetailPage />);
    expect(rawWarnings()).toHaveLength(14);
    view.unmount();
    render(<LineDetailPage />);
    expect(state.line.approved_amendment_warnings).toBeUndefined();
    // Sin POST conocido en esta sesión, ausencia no significa resolución confirmada.
    expect(screen.queryByText("Ver detalle")).not.toBeInTheDocument();
  });
  it("shows issue-free GET [] without manufacturing warnings", () => {
    state.line = resolvedLine();
    render(<LineDetailPage />);
    expect(screen.queryByText("Ver detalle")).not.toBeInTheDocument();
  });
  it("bridges the successful amendment's 14 warnings until fetched GET 15 supersedes them and survives remount with real hooks", async () => {
    state.realHooks = true;
    const currentLine = { ...state.line!, approved_amendment_warnings: getWarnings };
    let finishGet!: (response: Response) => void;
    const pendingGet = new Promise<Response>((resolve) => { finishGet = resolve; });
    const response = (data: unknown) => new Response(JSON.stringify({ data }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(resolvedLine()))
      .mockResolvedValueOnce(response({
        line: {
          id: "line-1", status: "APPROVED", unit_price: "750.00", quantity: "2.00",
          total_cost: "1500.00", importance: "Actividad estratégica",
          frequency: "Actividad Rutinaria", resource_description: "Recurso",
          monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, planned_amount: "125.00" })),
        },
        revision: "test-next-revision", valuationComplete: false, warnings: postWarnings,
      }))
      .mockReturnValueOnce(pendingGet)
      .mockResolvedValueOnce(response(currentLine));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<LineDetailPage />);
    await screen.findByRole("button", { name: "Editar presupuesto aprobado" });
    expect(screen.queryByText("Ver detalle")).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(rawWarnings()).toHaveLength(14);
    expect(screen.queryByText(/exceso histórico/)).not.toBeInTheDocument();
    // El contrato llamado POST en el checkpoint se transporta por PATCH en el hook real.
    expect(fetchMock.mock.calls.map(([url, options]) => [
      new URL(String(url)).pathname, options?.method ?? "GET",
    ])).toEqual([
      ["/budget/planning-lines/line-1", "GET"],
      ["/budget/planning-lines/line-1/approved-amendment", "PATCH"],
      ["/budget/planning-lines/line-1", "GET"],
    ]);
    await act(async () => { finishGet(response(currentLine)); });
    expect(rawWarnings()).toHaveLength(15);
    expect(screen.getByText(/exceso histórico/)).toBeInTheDocument();
    expect(screen.getByText(/techo de la unidad excedido/)).toBeInTheDocument();
    view.unmount();
    render(<LineDetailPage />);
    await screen.findByText("Ver detalle");
    expect(rawWarnings()).toHaveLength(15);
    expect(screen.getByText(/exceso histórico/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new URL(String(fetchMock.mock.calls[3][0])).pathname).toBe("/budget/planning-lines/line-1");
    expect(fetchMock.mock.calls[3][1]?.method ?? "GET").toBe("GET");
  });
  it("shows two compact notices, keeps all 15 raw warnings closed, and opens native detail", async () => {
    state.line!.approved_amendment_warnings = getWarnings;
    render(<LineDetailPage />);
    const card = screen.getByRole("region", { name: "Avisos financieros (informativos)" });
    expect(within(card.querySelector("ul")!).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Valoración incompleta")).toBeVisible();
    expect(screen.getByText("Techo UO excedido")).toBeVisible();
    expect(screen.getByText(/Techo presupuestario de la unidad superado para 2026/)).toBeVisible();
    expect(within(card).queryByText(/749[.,]62/)).not.toBeInTheDocument();
    const summary = screen.getByText("Ver detalle");
    const detail = summary.closest("details") as HTMLDetailsElement;
    expect(detail.open).toBe(false);
    expect(rawWarnings()).toHaveLength(15);
    // jsdom/Testing Library no excluye details cerrado de getByRole; comprobar semántica nativa.
    expect(rawWarnings()[0]).not.toBeVisible();
    for (let month = 1; month <= 12; month++) {
      expect(rawWarnings()[month - 1]).toHaveTextContent(`mes ${month}`);
    }
    expect(rawWarnings()[12]).toHaveTextContent("total");
    const user = (await import("@testing-library/user-event")).default.setup();
    summary.focus();
    expect(summary).toHaveFocus();
    await user.click(summary);
    expect(detail.open).toBe(true);
    expect(within(detail).getAllByRole("listitem")).toHaveLength(15);
    expect(screen.getByRole("button", { name: "Registrar ejecución directa del POA" })).toBeEnabled();
  });
  it("does not merge unrelated year, status or unit-year unknown contexts", () => {
    state.line!.approved_amendment_warnings = [
      ...getWarnings,
      { code: "UNKNOWN_VALUATION", scope: "MONTH", status: "UNKNOWN", month: 1, fiscalYear: 2027 },
      { code: "UNKNOWN_VALUATION", scope: "UNIT_YEAR", status: "UNKNOWN", fiscalYear: 2026 },
      { code: "CEILING_EXCEEDED", scope: "UNIT_YEAR", status: "BREACH", fiscalYear: 2027 },
      { code: "HISTORICAL_OVERRUN", scope: "TOTAL", status: "BREACH", fiscalYear: 2026 },
      { code: "UNKNOWN_VALUATION", scope: "MONTH", status: "ADVISORY", month: 2 },
    ];
    render(<LineDetailPage />);
    const card = screen.getByRole("region", { name: "Avisos financieros (informativos)" });
    expect(within(card.querySelector("ul")!).getAllByRole("listitem")).toHaveLength(7);
    expect(rawWarnings()).toHaveLength(20);
  });
  it("keeps future warning codes visible through an additional notice and raw detail", () => {
    const future = { code: "FUTURE_CRITICAL", scope: "TOTAL", status: "BREACH" } as unknown as ApprovedAmendmentWarning;
    state.line!.approved_amendment_warnings = [...getWarnings, future];
    render(<LineDetailPage />);
    expect(screen.getByText("Hay otras advertencias financieras")).toBeVisible();
    expect(screen.getByText(/Códigos del servidor:.*FUTURE_CRITICAL/)).toBeInTheDocument();
    expect(rawWarnings()).toHaveLength(16);
  });
});
