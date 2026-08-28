import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { GiofOperationsDashboardView } from "@/components/dashboard/giof-operations-dashboard";
import type { GiofOperationsDashboard } from "@/types/dashboard";

const data: GiofOperationsDashboard = {
  generated_at: "2026-08-28T12:00:00.000Z",
  applied_filters: {},
  summary: {
    backlog_count: 11,
    pending_review_count: 7,
    approved_pending_payment_count: 5,
    overdue_count: 3,
    in_risk_count: 2,
  },
  funnel: [
    { status: "SUBMITTED", count: 7, amount: 700 },
    { status: "APPROVED", count: 5, amount: 500 },
    { status: "PAID", count: 4, amount: 400 },
  ],
  aging: { buckets: [], average_days: null },
  payments: { pending_count: 5, paid_count: 4, pending_amount: 500, paid_amount: 400 },
  renditions: { pending: 2, overdue: 3, in_review: 1, observed: 1, settled: 4 },
  workload_by_manager: [],
  exceptions: [],
};

vi.mock("@/hooks/use-dashboard", () => ({
  useGiofOperationsDashboard: () => ({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children, data: chartData }: { children: ReactNode; data?: readonly Record<string, unknown>[] }) => (
    <div data-testid="bar-chart" data-chart={JSON.stringify(chartData)}>{children}</div>
  ),
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("GiofOperationsDashboardView", () => {
  it("cambia solo copy y conserva exactamente los valores recibidos", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 360));
    render(<GiofOperationsDashboardView />);

    const expectedSummaryCards = [
      ["Backlog", "11", "Solicitudes abiertas"],
      ["Por revisar", "7", "Solicitudes enviadas a revisión"],
      ["Aprobadas · pendientes de pago", "5", "Requieren acción de pago"],
      ["Vencidas", "3", "Fuera de plazo"],
      ["Sin asignar u observadas", "2", "Misma métrica operativa"],
    ] as const;

    for (const [title, value, description] of expectedSummaryCards) {
      const card = screen.getByText(title).closest("div.rounded-xl");
      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText(value)).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText(description)).toBeInTheDocument();
    }

    const [funnelChart] = screen.getAllByTestId("bar-chart");
    expect(JSON.parse(funnelChart.getAttribute("data-chart") ?? "[]")).toEqual([
      { estado: "Enviadas a revisión", Solicitudes: 7, Monto: 700 },
      { estado: "Aprobadas · pendientes de pago", Solicitudes: 5, Monto: 500 },
      { estado: "Pagadas", Solicitudes: 4, Monto: 400 },
    ]);

    const pendingPaymentCard = screen.getByText("Pendiente de pago").closest("div.rounded-xl");
    const paidCard = screen.getByText("Pagos registrados").closest("div.rounded-xl");
    expect(pendingPaymentCard).not.toBeNull();
    expect(paidCard).not.toBeNull();
    expect(within(pendingPaymentCard as HTMLElement).getByText("5")).toBeInTheDocument();
    expect(within(pendingPaymentCard as HTMLElement).getByText(/S\/\s500\.00/)).toBeInTheDocument();
    expect(within(paidCard as HTMLElement).getByText("4")).toBeInTheDocument();
    expect(within(paidCard as HTMLElement).getByText(/S\/\s400\.00 · 44\.4%/)).toBeInTheDocument();

    expect(screen.queryByText("Próximas a vencer")).not.toBeInTheDocument();
    expect(screen.getByText("Rendidas:")).toHaveTextContent("4");
    expect(screen.queryByText("Regularizadas:")).not.toBeInTheDocument();
  });
});
