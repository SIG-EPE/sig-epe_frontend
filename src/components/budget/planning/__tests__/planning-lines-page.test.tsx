import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanningLinesPage } from "../planning-lines-page";

const replaceMock = vi.fn((href: string) => {
  currentQuery = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
});
const pushMock = vi.fn();
const refetchMock = vi.fn();
const usePlanningLinesMock = vi.fn();
let currentQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector?: (state: { user: null }) => unknown) =>
    selector ? selector({ user: null }) : { user: null },
}));

vi.mock("@/hooks/use-budget", () => ({
  useFiscalYears: () => ({ data: [] }),
  useOrganizationalUnits: () => ({ data: [] }),
  usePlanningLineStats: () => ({ data: null, isLoading: false }),
  usePlanningLines: (filters: unknown) => usePlanningLinesMock(filters),
}));

function planningLinesResult(overrides: Record<string, unknown> = {}) {
  return {
    lines: [],
    total: 0,
    limit: 20,
    isLoading: false,
    isRefreshing: false,
    error: null,
    refetch: refetchMock,
    ...overrides,
  };
}

describe("PlanningLinesPage code search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    currentQuery = "";
    usePlanningLinesMock.mockReturnValue(planningLinesResult());
  });

  afterEach(() => vi.useRealTimers());

  it("debounces 300 ms, trims code, composes current filters, and resets page", async () => {
    currentQuery = "fiscal_year_id=fy-1&org_unit_id=ou-1&status=APPROVED";
    usePlanningLinesMock.mockReturnValue(planningLinesResult({ total: 40 }));
    const { rerender } = render(<PlanningLinesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(usePlanningLinesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar por código" }),
      {
        target: { value: "  PoA-17  " },
      },
    );

    act(() => vi.advanceTimersByTime(299));
    expect(replaceMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/budget/planning?fiscal_year_id=fy-1&org_unit_id=ou-1&status=APPROVED&code=PoA-17",
      { scroll: false },
    );
    expect(usePlanningLinesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fiscal_year_id: "fy-1",
        org_unit_id: "ou-1",
        status: "APPROVED",
        code: "PoA-17",
        page: 1,
      }),
    );

    rerender(<PlanningLinesPage />);
    expect(
      screen.getByRole("searchbox", { name: "Buscar por código" }),
    ).toHaveValue("PoA-17");
  });

  it("restores code from URL and clear removes only code", async () => {
    vi.useRealTimers();
    currentQuery = "status=DRAFT&code=POA-009";
    const { rerender } = render(<PlanningLinesPage />);

    const search = screen.getByRole("searchbox", { name: "Buscar por código" });
    expect(search).toHaveValue("POA-009");

    await userEvent.click(
      screen.getByRole("button", { name: "Limpiar búsqueda por código" }),
    );
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/budget/planning?status=DRAFT",
      { scroll: false },
    );

    rerender(<PlanningLinesPage />);
    expect(
      screen.getByRole("searchbox", { name: "Buscar por código" }),
    ).toHaveValue("");

    currentQuery = "status=DRAFT&code=POA-010";
    rerender(<PlanningLinesPage />);
    expect(
      screen.getByRole("searchbox", { name: "Buscar por código" }),
    ).toHaveValue("POA-010");
  });

  it("renders stable loading, code-only no-results, retryable error, and accessible controls", async () => {
    vi.useRealTimers();
    currentQuery = "code=ABC";
    usePlanningLinesMock.mockReturnValue(
      planningLinesResult({ isLoading: true }),
    );
    const { rerender } = render(<PlanningLinesPage />);

    expect(screen.getByLabelText("Buscar por código")).toHaveAttribute(
      "maxlength",
      "20",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Buscando líneas por código",
    );

    usePlanningLinesMock.mockReturnValue(planningLinesResult());
    rerender(<PlanningLinesPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No se encontraron líneas con el código “ABC”",
    );
    expect(screen.queryByText(/descripci[oó]n/i)).not.toBeInTheDocument();

    usePlanningLinesMock.mockReturnValue(
      planningLinesResult({ error: "No se pudo cargar" }),
    );
    rerender(<PlanningLinesPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetchMock).toHaveBeenCalledWith({ force: true });
  });
});
