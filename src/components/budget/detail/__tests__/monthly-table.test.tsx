import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonthlyTable } from "@/components/budget/detail/monthly-table";
import { MONTHLY_EXECUTION_DETAIL_SOURCE, type ManualExecution, type MonthlyEntry } from "@/types/budget";
import { ApiRequestError } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  toastError: vi.fn(),
}));

let manualExecutionsMock: ManualExecution[] = [];
const refetchManualExecutionsMock = vi.fn();

vi.mock("@/hooks/use-budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-budget")>();
  return {
    ...actual,
    useUpsertMonthly: () => ({ upsert: mocks.upsert, isLoading: false }),
    useManualExecutions: () => ({
      data: manualExecutionsMock,
      refetch: refetchManualExecutionsMock,
    }),
  };
});

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({ user: { role: { code: "GIOF_GESTOR" } } }),
}));

vi.mock("@/components/budget/detail/manual-execution-modal", () => ({
  ManualExecutionModal: ({ initialMonth }: { initialMonth: number | null }) => (
    <div role="dialog" aria-label="Modal de ejecución manual">
      Mes inicial: {initialMonth ?? "sin mes"}
    </div>
  ),
}));

function makeMonthlyEntry(overrides: Partial<MonthlyEntry> = {}): MonthlyEntry {
  return {
    id: "monthly-5",
    planning_line_id: "line-1",
    month: 5,
    planned_amount: 500,
    executed_amount: "123.45",
    execution_details: [
      {
        id: "payment-1",
        source: MONTHLY_EXECUTION_DETAIL_SOURCE.PAYMENT_REQUEST,
        requestId: "request-1",
        requestCode: "SOL-2026-0001",
        concept: "Compra de materiales",
        amount: 123.45,
        paidAt: "2026-05-10T10:00:00.000Z",
        status: "PAID",
        type: "DIRECT_PAYMENT",
      },
    ],
    ...overrides,
  };
}

async function renderExpandedTable(entries: MonthlyEntry[]) {
  const user = userEvent.setup();

  render(
    <MonthlyTable
      lineId="line-1"
      lineStatus="APPROVED"
      entries={entries}
    />,
  );

  await user.click(screen.getByText("Mayo"));

  return user;
}

describe("MonthlyTable", () => {
  beforeEach(() => {
    manualExecutionsMock = [];
    refetchManualExecutionsMock.mockClear();
    mocks.upsert.mockReset();
    mocks.toastError.mockReset();
  });

  it("renders the official QM April executed amount with two decimals", () => {
    render(
      <MonthlyTable
        entries={[makeMonthlyEntry({ month: 4, executed_amount: "6960.6", execution_details: [] })]}
      />,
    );

    expect(screen.getAllByText((content) => content.includes("6,960.60"))).toHaveLength(2);
  });

  it("renders paid request execution details as a request link when requestId exists", async () => {
    await renderExpandedTable([makeMonthlyEntry()]);

    const requestLink = screen.getByRole("link", { name: "Ver Solicitud SOL-2026-0001" });

    expect(requestLink).toHaveAttribute("href", "/requests/request-1");
    expect(screen.getByText("Compra de materiales")).toBeInTheDocument();
    expect(screen.getByText("Solicitud pagada")).toBeInTheDocument();
    expect(screen.getByText("PAID")).toBeInTheDocument();
    expect(screen.getByText(/Tipo: DIRECT_PAYMENT/)).toBeInTheDocument();
  });

  it("renders the exact reconciled provenance breakdown", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        executed_amount: "6960.6",
        execution_provenance: {
          imported: "6960.6",
          manual: "0",
          system_rendition: "0",
          system_paid_allocation: "0",
          system_paid_legacy: "0",
          total: "6960.6",
          system_lineages: [],
        },
      }),
    ]);

    expect(screen.getByText("Ejecución reconciliada")).toBeInTheDocument();
    expect(screen.getByText(/Importado:.*6,960.60/)).toBeInTheDocument();
    expect(screen.getByText(/Total:.*6,960.60/)).toBeInTheDocument();
  });

  it("keeps paid execution details static when requestId is missing", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        execution_details: [
          {
            id: "payment-without-request",
            source: MONTHLY_EXECUTION_DETAIL_SOURCE.PAYMENT_REQUEST,
            requestId: null,
            requestCode: "SOL-2026-0002",
            concept: "Pago sin identificador",
            amount: 75,
            paidAt: "2026-05-11T10:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(screen.getByText("Solicitud SOL-2026-0002")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /SOL-2026-0002/ })).not.toBeInTheDocument();
  });

  it("keeps manual execution details static without request navigation", async () => {
    manualExecutionsMock = [
      {
        id: "manual-1",
        planning_line_id: "line-1",
        month: 5,
        amount: 40,
        concept: "Ajuste manual de ejecución",
        execution_date: "2026-05-12T10:00:00.000Z",
        registered_by: "user-1",
        created_at: "2026-05-12T10:00:00.000Z",
      },
    ];

    await renderExpandedTable([makeMonthlyEntry({ execution_details: [] })]);

    expect(screen.getByText("Ejecución manual")).toBeInTheDocument();
    expect(screen.getByText("Ajuste manual de ejecución")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ejecución manual/ })).not.toBeInTheDocument();
  });

  it("uses clearer manual execution CTA copy and preserves selected month prefill", async () => {
    const user = await renderExpandedTable([makeMonthlyEntry()]);

    await user.click(screen.getByRole("button", { name: /Registrar ejecución manual/ }));

    expect(screen.getByRole("dialog", { name: "Modal de ejecución manual" })).toBeInTheDocument();
    expect(screen.getByText("Mes inicial: 5")).toBeInTheDocument();
  });

  it("descarta la edición y refresca el detalle cuando guardar pierde una carrera", async () => {
    const user = userEvent.setup();
    const onConflictRefetch = vi.fn();
    mocks.upsert.mockRejectedValue(
      new ApiRequestError(409, {
        statusCode: 409,
        code: "PLANNING_LINE_STATE_CONFLICT",
        message: "La línea ya fue enviada.",
        error: "Conflict",
        timestamp: "2026-07-26T00:00:00.000Z",
        path: "/budget/planning-lines/line-1/monthly",
      }),
    );

    render(
      <MonthlyTable
        lineId="line-1"
        totalCost={500}
        entries={[makeMonthlyEntry()]}
        editable
        lineStatus="DRAFT"
        onConflictRefetch={onConflictRefetch}
      />,
    );
    const mayInput = screen.getAllByRole("spinbutton")[4];
    await user.clear(mayInput);
    await user.type(mayInput, "250");
    await user.click(screen.getByRole("button", { name: "Guardar programación" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("La línea ya fue enviada.");
      expect(onConflictRefetch).toHaveBeenCalledTimes(1);
      expect(mayInput).toHaveValue(500);
    });
  });
});
