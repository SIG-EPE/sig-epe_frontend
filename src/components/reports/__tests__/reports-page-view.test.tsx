import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsPageView } from "@/components/reports/reports-page-view";
import type { ConceptDetailsFilters, ReportFilters } from "@/types/reports";

const requestsByStatusMock = vi.fn();
const expensesByTypeMock = vi.fn();
const expensesByConceptMock = vi.fn();
const expensesByConceptDetailsMock = vi.fn();
const catalogCategoriesMock = vi.fn(() => ({ data: [] }));
const catalogProgramsMock = vi.fn(() => ({ data: [] }));
const catalogFundingSourcesMock = vi.fn(() => ({ data: [] }));
const catalogOrgUnitsMock = vi.fn(() => ({ data: [] }));
const catalogTerritoriesMock = vi.fn(() => ({ data: [] }));
const planningLinesMock = vi.fn(() => ({ lines: [] }));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string }) => unknown) => selector({
    accessToken: "token-test",
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-catalogs", () => ({
  useCatalogBudgetCategories: () => catalogCategoriesMock(),
  useCatalogBudgetPrograms: () => catalogProgramsMock(),
  useCatalogFundingSources: () => catalogFundingSourcesMock(),
  useCatalogOrganizationalUnits: () => catalogOrgUnitsMock(),
  useCatalogTerritories: () => catalogTerritoriesMock(),
}));

vi.mock("@/hooks/use-budget", () => ({
  usePlanningLines: () => planningLinesMock(),
}));

vi.mock("@/hooks/use-reports", () => ({
  useRequestsByStatusReport: (filters: ReportFilters, options?: { enabled?: boolean }) => requestsByStatusMock(filters, options),
  useExpensesByRequestTypeReport: (filters: ReportFilters, options?: { enabled?: boolean }) => expensesByTypeMock(filters, options),
  useExpensesByConceptReport: (filters: ReportFilters, options?: { enabled?: boolean }) => expensesByConceptMock(filters, options),
  useExpensesByConceptDetailsReport: (filters: ConceptDetailsFilters, options?: { enabled?: boolean }) => expensesByConceptDetailsMock(filters, options),
}));

describe("ReportsPageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestsByStatusMock.mockReturnValue({
      data: {
        report: "requests-by-status",
        totals: { request_count: 1, by_currency: [] },
        groups: [{ status: "PAID", currency: "PEN", request_count: 1, requested_amount: 100, request_percentage: 0.5, amount_percentage: 0.5 }],
      },
      error: null,
      isLoading: false,
      isRefreshing: false,
      refetch: vi.fn(),
    });
    expensesByTypeMock.mockReturnValue({ data: null, error: null, isLoading: false, isRefreshing: false, refetch: vi.fn() });
    expensesByConceptMock.mockReturnValue({ data: null, error: null, isLoading: false, isRefreshing: false, refetch: vi.fn() });
    expensesByConceptDetailsMock.mockReturnValue({ data: null, error: null, isLoading: false, isRefreshing: false, refetch: vi.fn() });
  });

  it("oculta filtros avanzados por defecto y muestra contador al aplicar búsqueda", async () => {
    const user = userEvent.setup();
    render(<ReportsPageView />);

    expect(screen.queryByTestId("advanced-filters-panel")).not.toBeInTheDocument();
    expect(catalogOrgUnitsMock).not.toHaveBeenCalled();
    expect(planningLinesMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("advanced-filters-toggle"));
    expect(screen.getByTestId("advanced-filters-panel")).toBeInTheDocument();
    expect(catalogOrgUnitsMock).toHaveBeenCalled();
    expect(planningLinesMock).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Búsqueda principal"), { target: { value: "materiales" } });

    await waitFor(() => {
      expect(screen.getByTestId("active-filter-count")).toHaveTextContent("1");
      expect(screen.getByText("Búsqueda: materiales")).toBeInTheDocument();
      expect(requestsByStatusMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: "materiales" }), { enabled: true });
    });
  });

  it("mantiene los filtros avanzados en borrador hasta presionar aplicar", async () => {
    const user = userEvent.setup();
    render(<ReportsPageView />);

    await user.click(screen.getByTestId("advanced-filters-toggle"));
    fireEvent.change(screen.getByLabelText("Año fiscal"), { target: { value: "2026" } });

    expect(requestsByStatusMock).toHaveBeenLastCalledWith(expect.not.objectContaining({ fiscal_year: 2026 }), { enabled: true });
    expect(screen.queryByText("Año fiscal: 2026")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("apply-advanced-filters"));

    await waitFor(() => {
      expect(requestsByStatusMock).toHaveBeenLastCalledWith(expect.objectContaining({ fiscal_year: 2026 }), { enabled: true });
      expect(screen.getByText("Año fiscal: 2026")).toBeInTheDocument();
    });
  });

  it("alinea participación con ancho visual mínimo sin alterar la etiqueta real", () => {
    render(<ReportsPageView />);

    expect(screen.getByTestId("participation-cell")).toHaveClass("grid", "w-44");
    expect(screen.getByTestId("participation-bar")).toHaveStyle({ width: "4%" });
    expect(screen.getByTestId("participation-label")).toHaveTextContent("0.5%");
  });
});
