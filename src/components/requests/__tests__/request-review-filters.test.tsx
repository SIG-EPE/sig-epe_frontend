import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RequestReviewFilters } from "@/components/requests/request-review-filters";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type RequestReviewFilters as ReviewFilters } from "@/types/requests";

vi.mock("@/hooks/use-budget", () => ({
  useOrganizationalUnits: () => ({
    data: [{ id: "11111111-1111-4111-8111-111111111111", code: "OP", name: "Operaciones", is_active: true }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/components/giof-work/giof-work-controls", () => ({
  GiofWorkScopeFilter: ({ onChange }: { onChange: (scope: string, assigneeId?: string) => void }) => (
    <div data-testid="authorized-assignee-lookup">
      <button type="button" onClick={() => onChange(GIOF_WORK_SCOPE.ASSIGNEE, "22222222-2222-4222-8222-222222222222")}>Filtrar por responsable autorizado</button>
    </div>
  ),
}));

function renderFilters(filters: ReviewFilters = {}, isManager = true) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  render(
    <RequestReviewFilters
      filters={filters}
      isManager={isManager}
      total={7}
      summary={{ count: 7, requested_amount_by_currency: { PEN: "1250.00" }, status_counts: { SUBMITTED: 7 } }}
      isLoading={false}
      isRefreshing={false}
      onChange={onChange}
      onClear={onClear}
    />,
  );
  return { onChange, onClear };
}

describe("RequestReviewFilters", () => {
  it("expone controles básicos etiquetados, usa el lookup autorizado solo para manager y no ofrece ordenamiento", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ work_scope: GIOF_WORK_SCOPE.ALL });

    expect(screen.getByLabelText("Buscar solicitudes")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de solicitud")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado de solicitud")).toBeInTheDocument();
    expect(screen.getByTestId("authorized-assignee-lookup")).toBeInTheDocument();
    expect(screen.queryByText(/orden/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Buscar solicitudes"), "viático");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(onChange).toHaveBeenCalledWith({ search: "viático" });

    await user.click(screen.getByRole("button", { name: "Filtrar por responsable autorizado" }));
    expect(onChange).toHaveBeenCalledWith({
      work_scope: GIOF_WORK_SCOPE.ASSIGNEE,
      assignee_id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("oculta a Gestor controles globales y de responsable", () => {
    renderFilters({ work_scope: GIOF_WORK_SCOPE.MINE }, false);

    expect(screen.queryByTestId("authorized-assignee-lookup")).not.toBeInTheDocument();
    expect(screen.queryByText("Todo")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin asignar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /responsable autorizado/i })).not.toBeInTheDocument();
  });

  it("valida intervalos y montos avanzados, enfoca el primer campo inválido y aplica campos permitidos", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();

    const disclosure = screen.getByRole("button", { name: "Filtros avanzados" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");

    fireEvent.change(screen.getByLabelText("Enviada desde"), { target: { value: "2026-08-28T10:00" } });
    fireEvent.change(screen.getByLabelText("Enviada hasta"), { target: { value: "2026-08-28T09:00" } });
    fireEvent.change(screen.getByLabelText("Monto mínimo solicitado"), { target: { value: "20.00" } });
    fireEvent.change(screen.getByLabelText("Monto máximo solicitado"), { target: { value: "10.00" } });
    await user.click(screen.getByRole("button", { name: "Aplicar filtros avanzados" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Revisa los intervalos y montos");
    expect(screen.getByLabelText("Enviada desde")).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("aplica intervalos Lima completos y el rango monetario solicitado sin campos arbitrarios", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      currency: REQUEST_CURRENCY.PEN,
      amount_min: "10.00",
      amount_max: "20.00",
      org_unit_id: "11111111-1111-4111-8111-111111111111",
    });

    fireEvent.change(screen.getByLabelText("Enviada desde"), { target: { value: "2026-08-27T08:00" } });
    fireEvent.change(screen.getByLabelText("Enviada hasta"), { target: { value: "2026-08-27T09:00" } });
    fireEvent.change(screen.getByLabelText("Asignada desde"), { target: { value: "2026-08-27T10:00" } });
    fireEvent.change(screen.getByLabelText("Asignada hasta"), { target: { value: "2026-08-27T11:00" } });
    await user.click(screen.getByRole("button", { name: "Aplicar filtros avanzados" }));

    expect(onChange).toHaveBeenCalledWith({
      submitted_from: "2026-08-27T08:00",
      submitted_to: "2026-08-27T09:00",
      assigned_from: "2026-08-27T10:00",
      assigned_to: "2026-08-27T11:00",
      currency: REQUEST_CURRENCY.PEN,
      amount_min: "10.00",
      amount_max: "20.00",
      org_unit_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("muestra resumen vivo y chips removibles con limpiar todos", async () => {
    const user = userEvent.setup();
    const { onChange, onClear } = renderFilters({
      work_scope: GIOF_WORK_SCOPE.UNASSIGNED,
      search: "viático",
      request_type: REQUEST_TYPE.ADVANCE,
      status: REQUEST_STATUS.SUBMITTED,
      currency: REQUEST_CURRENCY.PEN,
      amount_min: "10.00",
    });

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent("7 solicitudes");
    expect(screen.getByLabelText("Resumen de resultados filtrados")).toHaveTextContent("PEN 1250.00");
    expect(screen.getByLabelText("Resumen de resultados filtrados")).toHaveTextContent("Enviada: 7");
    expect(screen.getByRole("button", { name: "Quitar filtro Trabajo: sin asignar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar filtro Búsqueda: viático" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar filtro Búsqueda: viático" }));
    expect(onChange).toHaveBeenCalledWith({ search: undefined });

    await user.click(screen.getByRole("button", { name: "Limpiar todos los filtros" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("no reinicia borradores ni el panel durante un refresh con la misma URL", async () => {
    const user = userEvent.setup();
    const props = {
      filters: {} as ReviewFilters,
      isManager: false,
      total: 2,
      summary: null,
      isLoading: false,
      isRefreshing: false,
      onChange: vi.fn(),
      onClear: vi.fn(),
    };
    const { rerender } = render(<RequestReviewFilters {...props} />);

    await user.type(screen.getByLabelText("Buscar solicitudes"), "borrador");
    await user.click(screen.getByRole("button", { name: "Filtros avanzados" }));
    rerender(<RequestReviewFilters {...props} filters={{}} isRefreshing />);

    expect(screen.getByLabelText("Buscar solicitudes")).toHaveValue("borrador");
    expect(screen.getByRole("button", { name: "Filtros avanzados" })).toHaveAttribute("aria-expanded", "true");
  });
});
