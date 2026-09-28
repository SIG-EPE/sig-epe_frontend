import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonthlyTable } from "@/components/budget/detail/monthly-table";
import {
  MONTHLY_EXECUTION_DETAIL_SOURCE,
  type ManualExecution,
  type MonthlyEntry,
} from "@/types/budget";
import { ApiRequestError } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  toastError: vi.fn(),
  role: "GIOF_MANAGER",
}));

let manualExecutionsMock: ManualExecution[] = [];
let manualErrorMock: Error | null = null;
let manualLoadingMock = false;
const refetchManualExecutionsMock = vi.fn();

vi.mock("@/hooks/use-budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-budget")>();
  return {
    ...actual,
    useUpsertMonthly: () => ({ upsert: mocks.upsert, isLoading: false }),
    useManualExecutions: () => ({
      data: manualExecutionsMock,
      error: manualErrorMock,
      isLoading: manualLoadingMock,
      refetch: refetchManualExecutionsMock,
    }),
  };
});

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({ user: { role: { code: mocks.role } } }),
}));

vi.mock("@/components/budget/detail/manual-execution-modal", () => ({
  ManualExecutionModal: ({
    initialMonth,
    onSuccess,
  }: {
    initialMonth: number | null;
    onSuccess: () => void;
  }) => (
    <div role="dialog" aria-label="Modal de ejecución manual">
      Mes inicial: {initialMonth ?? "sin mes"}
      <button type="button" onClick={onSuccess}>
        Confirmar registro
      </button>
    </div>
  ),
}));

function makeMonthlyEntry(overrides: Partial<MonthlyEntry> = {}): MonthlyEntry {
  return {
    id: "monthly-5",
    planning_line_id: "line-1",
    month: 5,
    planned_amount: 500,
    executed_amount: 123.45,
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
    <MonthlyTable lineId="line-1" lineStatus="APPROVED" entries={entries} />,
  );

  await user.click(screen.getByText("Mayo"));

  return user;
}

describe("MonthlyTable", () => {
  beforeEach(() => {
    mocks.role = "GIOF_MANAGER";
    manualExecutionsMock = [];
    manualErrorMock = null;
    manualLoadingMock = false;
    refetchManualExecutionsMock.mockClear();
    mocks.upsert.mockReset();
    mocks.toastError.mockReset();
  });

  it("renders the official QM April executed amount with two decimals", () => {
    render(
      <MonthlyTable
        entries={[
          makeMonthlyEntry({
            month: 4,
            executed_amount: 6960.6,
            execution_details: [],
          }),
        ]}
      />,
    );

    expect(
      screen.getAllByText((content) => content.includes("6,960.60")),
    ).toHaveLength(2);
  });

  it("displays the exact canonical decimal for a large numeric monthly amount", () => {
    render(
      <MonthlyTable
        entries={[
          makeMonthlyEntry({
            executed_amount: 9007199254740991,
            executed_amount_decimal: "9007199254740991.25",
            execution_details: [],
          }),
        ]}
      />,
    );
    expect(screen.getAllByText(/9,007,199,254,740,991\.25/)).toHaveLength(2);
  });

  it("renders paid request execution details as a request link when requestId exists", async () => {
    await renderExpandedTable([makeMonthlyEntry()]);

    const requestLink = screen.getByRole("link", {
      name: "Ver Solicitud SOL-2026-0001",
    });

    expect(requestLink).toHaveAttribute("href", "/requests/request-1");
    expect(screen.getByText("Compra de materiales")).toBeInTheDocument();
    expect(screen.getByText("Solicitud pagada")).toBeInTheDocument();
    expect(screen.getByText("PAID")).toBeInTheDocument();
    expect(screen.getByText(/Tipo: DIRECT_PAYMENT/)).toBeInTheDocument();
  });

  it("renders the exact reconciled provenance breakdown", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        executed_amount: 6960.6,
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
    expect(
      screen.queryByRole("link", { name: /SOL-2026-0002/ }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole("link", { name: /Ejecución manual/ }),
    ).not.toBeInTheDocument();
  });

  it("renders canonical paid and rendition winners once, with only authorized request links", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        executed_amount: 95,
        movements: [
          {
            id: "paid",
            source: "REQUEST",
            origin: "PAID_ALLOCATION",
            effective: true,
            requestId: "request-1",
            requestCode: "SOL-2026-0001",
            concept: "PAID_ALLOCATION",
            amount: 50,
            amountDecimal: "50",
            currency: "PEN",
            eventAt: "2026-05-10T10:00:00Z",
          },
          {
            id: "rendition",
            source: "REQUEST",
            origin: "RENDITION",
            effective: true,
            requestId: null,
            requestCode: null,
            concept: "RENDITION",
            amount: 45,
            amountDecimal: "45",
            currency: "PEN",
            eventAt: "2026-05-12T10:00:00Z",
          },
        ],
        movements_complete: true,
        movements_truncated: false,
      }),
    ]);
    expect(
      screen.getByRole("table", { name: "Movimientos de Mayo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Origen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver Solicitud SOL-2026-0001" }),
    ).toHaveAttribute("href", "/requests/request-1");
    expect(screen.getAllByRole("link", { name: /Ver Solicitud/ })).toHaveLength(
      1,
    );
    expect(screen.getByText("Rendición")).toBeInTheDocument();
    expect(screen.queryByText("Compra de materiales")).not.toBeInTheDocument();
    expect(screen.getAllByText(/95\.00/)).toHaveLength(2);
  });

  it("renders imported and manual movements without duplicating legacy manual rows or inventing amounts", async () => {
    manualExecutionsMock = [
      {
        id: "manual-1",
        planning_line_id: "line-1",
        month: 5,
        amount: 40,
        concept: "Legacy manual",
        execution_date: "2026-05-12",
        registered_by: "user-1",
        created_at: "2026-05-12",
      },
    ];
    await renderExpandedTable([
      makeMonthlyEntry({
        execution_details: [],
        movements: [
          {
            id: "manual",
            source: "DIRECT_MANUAL",
            origin: "MANUAL",
            effective: true,
            concept: "Movimiento directo",
            amount: 40,
            amountDecimal: "40",
            currency: "PEN",
            eventAt: "2026-05-12",
            requestId: null,
            requestCode: null,
          },
          {
            id: "imported",
            source: "IMPORTED",
            origin: "IMPORTED",
            effective: true,
            concept: "Importación mensual",
            amount: 10,
            amountDecimal: "10",
            currency: "PEN",
            eventAt: null,
            requestId: null,
            requestCode: null,
          },
          {
            id: "unknown",
            source: "LEGACY_UNRESOLVED",
            origin: "PAID_LEGACY",
            effective: true,
            concept: "PAID_LEGACY",
            amount: null,
            amountDecimal: null,
            currency: "PEN",
            eventAt: null,
            requestId: null,
            requestCode: null,
            warnings: ["UNRESOLVED"],
          },
        ],
        movements_complete: false,
        movements_unresolved_count: 1,
      }),
    ]);
    expect(screen.queryByText("Legacy manual")).not.toBeInTheDocument();
    expect(screen.getByText("Movimiento directo")).toBeInTheDocument();
    expect(screen.getByText("Importación mensual")).toBeInTheDocument();
    expect(screen.getByText("Monto sin resolver")).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Estado de movimientos de Mayo" }),
    ).toHaveTextContent("incompleto");
    expect(
      screen.queryByRole("link", { name: /Importación|Movimiento/ }),
    ).not.toBeInTheDocument();
  });

  it("renders legacy payment source, PEN currency and date without linking redacted identities", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        movements: [
          {
            id: "legacy-payment",
            source: "REQUEST",
            origin: "PAID_LEGACY",
            effective: true,
            requestId: null,
            requestCode: null,
            concept: "PAID_LEGACY",
            amount: 12.5,
            amountDecimal: "12.50",
            currency: "PEN",
            eventAt: "2026-05-10T10:00:00Z",
          },
        ],
      }),
    ]);
    const table = screen.getByRole("table", { name: "Movimientos de Mayo" });
    expect(table).toHaveTextContent("Pago legado");
    expect(table).toHaveTextContent("12.50");
    expect(table).toHaveTextContent("10/05/26");
    expect(
      screen.queryByRole("link", { name: /Solicitud/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps an exact large movement decimal and a separate unresolved null amount", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        movements: [
          {
            id: "large",
            source: "IMPORTED",
            concept: "Importe grande",
            amount: 9007199254740991,
            amountDecimal: "9007199254740991.25",
            currency: "PEN",
          },
          {
            id: "unresolved",
            source: "LEGACY_UNRESOLVED",
            concept: "Sin valuación",
            amount: null,
            amountDecimal: null,
            currency: "PEN",
          },
        ],
      }),
    ]);
    const table = screen.getByRole("table", { name: "Movimientos de Mayo" });
    expect(table).toHaveTextContent("9,007,199,254,740,991.25");
    expect(table).toHaveTextContent("Monto sin resolver");
  });

  it("keeps the legacy fallback when movements are absent, but uses canonical empty arrays authoritatively", async () => {
    const user = await renderExpandedTable([makeMonthlyEntry()]);
    expect(screen.getByText("Compra de materiales")).toBeInTheDocument();
    await user.click(screen.getByText("Mayo"));
    await user.click(screen.getByText("Mayo"));
    expect(screen.getByText("Compra de materiales")).toBeInTheDocument();
  });

  it("shows truncation and canonical empty state separately from legacy rows", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        movements: [],
        movements_truncated: true,
        movements_complete: false,
      }),
    ]);
    expect(
      screen.getByRole("status", { name: "Estado de movimientos de Mayo" }),
    ).toHaveTextContent("truncados");
    expect(screen.getByText("Sin movimientos en este mes")).toBeInTheDocument();
    expect(screen.queryByText("Compra de materiales")).not.toBeInTheDocument();
  });

  it("does not claim missing valuations when the only incompleteness is truncation", async () => {
    await renderExpandedTable([
      makeMonthlyEntry({
        movements: [],
        movements_truncated: true,
        movements_complete: false,
        movements_unresolved_count: 0,
      }),
    ]);
    const status = screen.getByRole("status", {
      name: "Estado de movimientos de Mayo",
    });
    expect(status).toHaveTextContent("truncados");
    expect(status).not.toHaveTextContent("importes sin resolver");
  });

  it("treats an empty canonical array as authoritative even with legacy manual data", async () => {
    manualExecutionsMock = [
      {
        id: "manual-1",
        planning_line_id: "line-1",
        month: 5,
        amount: 10,
        concept: "Manual legado",
        execution_date: "2026-05-12",
        registered_by: "user-1",
        created_at: "2026-05-12",
      },
    ];
    await renderExpandedTable([makeMonthlyEntry({ movements: [] })]);
    expect(screen.queryByText("Manual legado")).not.toBeInTheDocument();
    expect(screen.queryByText("Compra de materiales")).not.toBeInTheDocument();
    expect(screen.getByText("Sin movimientos en este mes")).toBeInTheDocument();
  });

  it("switches months by keyboard and scopes canonical movements to their month", async () => {
    const user = userEvent.setup();
    render(
      <MonthlyTable
        entries={[
          makeMonthlyEntry({
            movements: [
              {
                id: "may",
                source: "IMPORTED",
                origin: "IMPORTED",
                concept: "Mayo importado",
                amount: 3,
                currency: "PEN",
                eventAt: null,
              },
            ],
          }),
          makeMonthlyEntry({
            id: "monthly-6",
            month: 6,
            execution_details: [],
            movements: [
              {
                id: "june",
                source: "DIRECT_MANUAL",
                origin: "MANUAL",
                concept: "Junio directo",
                amount: 4,
                currency: "PEN",
                eventAt: null,
              },
            ],
          }),
        ]}
      />,
    );
    const may = screen.getByRole("button", {
      name: "Abrir movimientos de Mayo",
    });
    may.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Mayo importado")).toBeInTheDocument();
    expect(screen.queryByText("Junio directo")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Abrir movimientos de Junio" }),
    );
    expect(screen.getByText("Junio directo")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Movimientos de Mayo" }),
    ).toBeInTheDocument();
  });

  it("shows retryable legacy manual loading errors without masking canonical movements", async () => {
    manualErrorMock = new Error("offline");
    const user = await renderExpandedTable([
      makeMonthlyEntry({ execution_details: [] }),
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron cargar",
    );
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetchManualExecutionsMock).toHaveBeenCalledOnce();
  });

  it("uses clearer manual execution CTA copy and preserves selected month prefill", async () => {
    const user = await renderExpandedTable([makeMonthlyEntry()]);

    await user.click(
      screen.getByRole("button", { name: /Registrar ejecución manual/ }),
    );

    expect(
      screen.getByRole("dialog", { name: "Modal de ejecución manual" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mes inicial: 5")).toBeInTheDocument();
  });

  it.each(["ADMIN_SISTEMA", "GIOF_GESTOR"])(
    "does not expose the manager-only monthly action to %s",
    async (role) => {
      mocks.role = role;
      await renderExpandedTable([makeMonthlyEntry()]);
      expect(
        screen.queryByRole("button", { name: /Registrar ejecución manual/ }),
      ).not.toBeInTheDocument();
    },
  );

  it("refreshes canonical monthly movements after registering a manual execution", async () => {
    const user = userEvent.setup();
    const onExecutionCreated = vi.fn();
    render(
      <MonthlyTable
        lineId="line-1"
        lineStatus="APPROVED"
        entries={[makeMonthlyEntry({ movements: [] })]}
        onExecutionCreated={onExecutionCreated}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Abrir movimientos de Mayo" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Registrar ejecución manual/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar registro" }),
    );
    expect(refetchManualExecutionsMock).toHaveBeenCalledOnce();
    expect(onExecutionCreated).toHaveBeenCalledOnce();
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
    await user.click(
      screen.getByRole("button", { name: "Guardar programación" }),
    );

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("La línea ya fue enviada.");
      expect(onConflictRefetch).toHaveBeenCalledTimes(1);
      expect(mayInput).toHaveValue(500);
    });
  });
});
