import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApprovedAmendmentModal,
  ApprovedAmendmentWarnings,
} from "../approved-amendment-modal";
import type { PlanningLine } from "@/types/budget";
import { ApiRequestError } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  readRevision: vi.fn(),
  save: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/hooks/use-approved-amendment", () => ({
  useApprovedAmendment: (id: string) => ({
    readRevision: mocks.readRevision,
    readDetail: (signal: AbortSignal) =>
      mocks.get(`/budget/planning-lines/${id}`, { cache: "no-store", signal }),
    save: mocks.save,
    isSaving: false,
  }),
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: { get: mocks.get },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const line = {
  id: "line-1",
  status: "APPROVED",
  resource_id: null,
  resource_description: "Recurso libre",
  unit_price: 100,
  quantity: 1,
  unit_price_decimal: "100.00",
  quantity_decimal: "1.00",
  importance: "Actividad estratégica",
  frequency: "Actividad Rutinaria",
  total_cost: 100,
  monthlyDistribution: Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    planning_line_id: "line-1",
    month: i + 1,
    planned_amount: i ? 0 : 100,
    executed_amount: 0,
    monthly_programmed_decimal: i ? "0.00" : "100.00",
  })),
} as PlanningLine;
const revision = { line_id: "line-1", revision: "4" };
const response = {
  line: {
    id: "line-1",
    status: "APPROVED",
    unit_price: "100.00",
    quantity: "1.00",
    total_cost: "100.00",
    importance: line.importance,
    frequency: line.frequency,
    resource_description: line.resource_description,
    monthly: [],
  },
  revision: "5",
  valuationComplete: false,
  warnings: [
    {
      code: "CEILING_EXCEEDED",
      scope: "UNIT_YEAR",
      status: "BREACH",
      fiscalYear: 2026,
    },
    { code: "UNKNOWN_VALUATION", scope: "MONTH", status: "UNKNOWN", month: 1 },
  ],
};

describe("approved amendment dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readRevision.mockResolvedValue(revision);
    mocks.get.mockResolvedValue(line);
    mocks.save.mockResolvedValue(response);
  });

  it("updates derived total and remaining when price or quantity changes without reallocating months", async () => {
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Precio unitario (S/)"), {
      target: { value: "120.25" },
    });
    expect(screen.getByText(/Total derivado.*S\/ 120.25/)).toBeInTheDocument();
    expect(
      screen.getByText(/Distribuido en 12 meses.*S\/ 100.00/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Restante por repartir.*S\/ 20.25/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "2.00" },
    });
    expect(
      screen.getByText(/Restante por repartir.*S\/ 140.50/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enero")).toHaveValue("100.00");
  });

  it("updates distribution on month changes, labels excess, and reports exact balance at zero", async () => {
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Febrero"), {
      target: { value: "0.01" },
    });
    expect(
      screen.getByText(/Distribuido en 12 meses.*S\/ 100.01/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Exceso distribuido.*S\/ 0.01/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Restante por repartir/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Febrero"), {
      target: { value: "0.00" },
    });
    expect(screen.getByText(/Cuadrado.*S\/ 0.00/)).toBeInTheDocument();
  });

  it("does not represent invalid inputs as zero or claim a balance", async () => {
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "abc" },
    });
    expect(
      screen.getByText(/Distribuido en 12 meses.*No calculable/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Balance.*No calculable/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Precio unitario (S/)"), {
      target: { value: "abc" },
    });
    expect(
      screen.getByText(/Total derivado.*No calculable/),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "100.00" },
    });
    expect(
      screen.getByText(/Distribuido en 12 meses.*S\/ 100.00/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Balance.*No calculable/)).toBeInTheDocument();
  });

  it("keeps large cents exact beyond Number safe integers", async () => {
    const large = {
      ...line,
      unit_price_decimal: "4999999999.99",
      quantity_decimal: "1.00",
      monthlyDistribution: line.monthlyDistribution?.map((row, index) => ({
        ...row,
        monthly_programmed_decimal: index === 0 ? "4999999999.99" : "0.00",
      })),
    };
    mocks.get.mockResolvedValue(large);
    render(
      <ApprovedAmendmentModal
        line={large}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "2.00" },
    });
    expect(
      screen.getByText(/Total derivado.*S\/ 9999999999.98/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Restante por repartir.*S\/ 4999999999.99/),
    ).toBeInTheDocument();
  });

  it("refuses to submit when revision GET fails", async () => {
    mocks.readRevision.mockRejectedValue(new Error("offline"));
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(
        /No se pudo cargar el detalle y la revisión aprobada/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar presupuesto" }),
    ).toBeDisabled();
  });

  it("fails closed with actionable message if price, quantity or a month exact sidecar is missing", async () => {
    for (const broken of [
      { ...line, unit_price_decimal: undefined },
      { ...line, quantity_decimal: undefined },
      { ...line, monthlyDistribution: line.monthlyDistribution?.slice(1) },
      { ...line, monthlyDistribution: undefined },
    ]) {
      mocks.get.mockResolvedValueOnce(broken);
      const { unmount } = render(
        <ApprovedAmendmentModal
          line={broken}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );
      await screen.findByText(/proyección decimal exacta del servidor/);
      expect(mocks.get).toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Guardar presupuesto" }),
      ).toBeDisabled();
      unmount();
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("preserves exact inputs across repeated prop refreshes and submits original strings", async () => {
    const large = {
      ...line,
      unit_price: "9999999999.99",
      quantity: "1.00",
      unit_price_decimal: "9999999999.99",
      quantity_decimal: "1.00",
      monthlyDistribution: line.monthlyDistribution?.map((month, index) => ({
        ...month,
        monthly_programmed_decimal: index ? "0.00" : "9999999999.99",
      })),
    };
    mocks.get.mockResolvedValueOnce(large);
    const { rerender } = render(
      <ApprovedAmendmentModal
        line={large}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue(
      "9999999999.99",
    );
    expect(screen.getByLabelText("Enero")).toHaveValue("9999999999.99");
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "1.00" },
    });
    rerender(
      <ApprovedAmendmentModal
        line={{ ...large, unit_price_decimal: "0.00" }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    rerender(
      <ApprovedAmendmentModal
        line={large}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue(
      "9999999999.99",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Guardar presupuesto" }));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_price: "9999999999.99",
        quantity: "1.00",
        monthly: expect.arrayContaining([
          { month: 1, planned_amount: "9999999999.99" },
        ]),
      }),
    );
    expect(mocks.readRevision).toHaveBeenCalledTimes(2);
  });

  it("enforces monthly exact sum inline and saves advisory warnings with revision", async () => {
    const user = userEvent.setup();
    const success = vi.fn();
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "99.99" },
    });
    await user.click(
      screen.getByRole("button", { name: "Guardar presupuesto" }),
    );
    expect(screen.getByText(/La suma de los doce meses/)).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "100.00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Guardar presupuesto" }),
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(response.warnings),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_revision: "4",
        monthly: expect.arrayContaining([
          { month: 1, planned_amount: "100.00" },
        ]),
      }),
    );
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("total_cost");
  });

  it("keeps edits on 409, refetches both reads, and requires deliberate revision acceptance", async () => {
    const user = userEvent.setup();
    mocks.save.mockRejectedValueOnce(
      new ApiRequestError(409, {
        statusCode: 409,
        code: "APPROVED_AMENDMENT_CONFLICT",
        message: "conflict",
        error: "Conflict",
        timestamp: "now",
        path: "",
      }),
    );
    mocks.get
      .mockResolvedValueOnce(line)
      .mockResolvedValue({ ...line, total_cost: 120 });
    mocks.readRevision
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce(revision)
      .mockResolvedValue({ line_id: "line-1", revision: "5" });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "99.99" },
    });
    fireEvent.change(screen.getByLabelText("Febrero"), {
      target: { value: "0.01" },
    });
    await user.click(
      screen.getByRole("button", { name: "Guardar presupuesto" }),
    );
    await screen.findByText(/La versión actual es 5/);
    expect(screen.getByLabelText("Enero")).toHaveValue("99.99");
    expect(screen.getByLabelText("Febrero")).toHaveValue("0.01");
    expect(
      screen.getByRole("button", { name: "Guardar presupuesto" }),
    ).toBeDisabled();
    expect(mocks.get).toHaveBeenCalledWith(
      "/budget/planning-lines/line-1",
      expect.objectContaining({ cache: "no-store" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Usar revisión actual/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar presupuesto" }),
    );
    expect(mocks.save.mock.calls[1][0].expected_revision).toBe("5");
    expect(mocks.save.mock.calls[1][0].monthly).toContainEqual({
      month: 2,
      planned_amount: "0.01",
    });
  });

  it("reads revision, fresh detail, revision in order and never seeds the stale parent", async () => {
    const events: string[] = [];
    mocks.readRevision.mockImplementation(() => {
      events.push("revision");
      return Promise.resolve(revision);
    });
    mocks.get.mockImplementation(() => {
      events.push("detail");
      return Promise.resolve({
        ...line,
        unit_price_decimal: "200.00",
        monthlyDistribution: line.monthlyDistribution?.map((row, i) => ({
          ...row,
          monthly_programmed_decimal: i ? "0.00" : "200.00",
        })),
      });
    });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    expect(events).toEqual(["revision", "detail", "revision"]);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("200.00");
  });

  it("retries an intervening amendment and seeds only the matching second snapshot", async () => {
    mocks.readRevision
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce({ line_id: "line-1", revision: "5" })
      .mockResolvedValue({ line_id: "line-1", revision: "5" });
    mocks.get.mockResolvedValueOnce(line).mockResolvedValue({
      ...line,
      unit_price_decimal: "200.00",
      monthlyDistribution: line.monthlyDistribution?.map((row, i) => ({
        ...row,
        monthly_programmed_decimal: i ? "0.00" : "200.00",
      })),
    });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 5/);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("200.00");
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("ignores late first-open reads after a request identity change", async () => {
    let finish!: (value: typeof revision) => void;
    mocks.readRevision.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mocks.readRevision.mockResolvedValue({ line_id: "line-2", revision: "7" });
    mocks.get.mockResolvedValue({
      ...line,
      id: "line-2",
      unit_price_decimal: "300.00",
      monthlyDistribution: line.monthlyDistribution?.map((row, i) => ({
        ...row,
        monthly_programmed_decimal: i ? "0.00" : "300.00",
      })),
    });
    const { rerender } = render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    rerender(
      <ApprovedAmendmentModal
        line={{ ...line, id: "line-2" }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 7/);
    finish(revision);
    await waitFor(() =>
      expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue(
        "300.00",
      ),
    );
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("fails closed after repeated mismatch, invalid fresh sidecar or detail network failure", async () => {
    for (const mode of ["mismatch", "missing", "network"]) {
      mocks.readRevision.mockReset();
      mocks.get.mockReset();
      mocks.readRevision.mockImplementationOnce(() =>
        Promise.resolve(revision),
      );
      if (mode === "mismatch") {
        let next = 4;
        mocks.readRevision.mockImplementation(() =>
          Promise.resolve({ line_id: "line-1", revision: String(++next) }),
        );
        mocks.get.mockResolvedValue(line);
      } else {
        mocks.readRevision.mockResolvedValue(revision);
        if (mode === "missing")
          mocks.get.mockResolvedValue({ ...line, quantity_decimal: null });
        else mocks.get.mockRejectedValue(new Error("offline"));
      }
      const { unmount } = render(
        <ApprovedAmendmentModal
          line={line}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Guardar presupuesto" }),
        ).toBeDisabled(),
      );
      await screen.findByText(
        mode === "missing"
          ? /proyección decimal exacta del servidor/
          : /Cierra y recarga/i,
      );
      expect(mocks.save).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("handles 403 and 500 safely, with no false success", async () => {
    const user = userEvent.setup();
    const success = vi.fn();
    mocks.save.mockRejectedValueOnce(
      new ApiRequestError(403, {
        statusCode: 403,
        code: "FORBIDDEN",
        message: "secret",
        error: "Forbidden",
        timestamp: "now",
        path: "",
      }),
    );
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    await user.click(
      screen.getByRole("button", { name: "Guardar presupuesto" }),
    );
    expect(await screen.findByText(/No tienes permiso/)).toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });

  it("does not claim success or reveal server internals on 500", async () => {
    const success = vi.fn();
    mocks.save.mockRejectedValue(
      new ApiRequestError(500, {
        statusCode: 500,
        message: "SQL internal secret",
        error: "Internal",
        timestamp: "now",
        path: "",
      }),
    );
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Guardar presupuesto" }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeInTheDocument();
    expect(screen.queryByText(/SQL internal secret/)).not.toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });

  it("keeps breach and unknown warnings visible after a successful save", () => {
    render(<ApprovedAmendmentWarnings warnings={response.warnings as never} />);
    expect(screen.getByText(/techo de la unidad excedido/)).toBeInTheDocument();
    expect(screen.getByText(/valoración no disponible/)).toBeInTheDocument();
    expect(screen.getByText(/no impiden el guardado/)).toBeInTheDocument();
  });

  it("reports a successful save with only unit-year valuation unknown, without claiming monthly valuation failed", async () => {
    const success = vi.fn();
    const warnings = [
      {
        code: "UNKNOWN_VALUATION" as const,
        scope: "UNIT_YEAR" as const,
        status: "UNKNOWN" as const,
        fiscalYear: 2026,
      },
    ];
    mocks.save.mockResolvedValueOnce({ ...response, warnings });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Guardar presupuesto" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith(warnings));
    render(<ApprovedAmendmentWarnings warnings={warnings} />);
    expect(
      screen.getByText(
        /No se pudo comprobar el techo anual de la unidad: falta el techo o una valoración completa en PEN\. Los importes mensuales se revisan por separado\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/no impiden el guardado/)).toBeInTheDocument();
    expect(
      screen.queryByText(/valoración no disponible/),
    ).not.toBeInTheDocument();
  });

  it("keeps month and total unknown wording separate from the unit-year explanation", () => {
    render(
      <ApprovedAmendmentWarnings
        warnings={[
          {
            code: "UNKNOWN_VALUATION",
            scope: "MONTH",
            status: "UNKNOWN",
            month: 1,
          },
          { code: "UNKNOWN_VALUATION", scope: "TOTAL", status: "UNKNOWN" },
          {
            code: "UNKNOWN_VALUATION",
            scope: "UNIT_YEAR",
            status: "UNKNOWN",
            fiscalYear: 2026,
          },
        ]}
      />,
    );
    expect(screen.getAllByText(/valoración no disponible/)).toHaveLength(2);
    expect(
      screen.getByText(/No se pudo comprobar el techo anual/),
    ).toBeInTheDocument();
    expect(screen.getByText(/año 2026/)).toBeInTheDocument();
  });
});
