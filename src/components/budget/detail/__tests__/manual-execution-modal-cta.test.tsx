import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualExecutionModal } from "../manual-execution-modal";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/use-budget", () => ({ useAddManualExecution: () => ({ mutate: mocks.mutate, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("direct execution uses the existing manual modal", () => {
  beforeEach(() => {
    mocks.mutate.mockReset(); mocks.success.mockReset();
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => {};
    HTMLElement.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
  });

  it("requires a chosen month and positive amount, and submits existing execution fields on success", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockImplementation(async (_payload, callbacks) => callbacks.onSuccess());
    render(<ManualExecutionModal lineId="line-1" open onClose={vi.fn()} onSuccess={mocks.success} />);
    expect(screen.getByText("Ejecución presupuestal sin solicitud; no genera pago bancario ni constancia")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Seleccione un mes válido");
    expect(mocks.mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("combobox", { name: "Mes" }));
    await user.click(screen.getByRole("option", { name: "Mayo" }));
    await user.type(screen.getByLabelText("Monto (S/)"), "0");
    await user.type(screen.getByLabelText(/Concepto/), "Actividad directa");
    await user.type(screen.getByLabelText("Fecha de ejecución"), "2026-05-10");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("al menos S/ 0.01");
    expect(mocks.mutate).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Monto (S/)"));
    await user.type(screen.getByLabelText("Monto (S/)"), "23.50");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ month: 5, amount: 23.5, concept: "Actividad directa", execution_date: "2026-05-10" }, expect.any(Object));
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("preserves a within-month preset", () => {
    render(<ManualExecutionModal lineId="line-1" initialMonth={8} open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Mes" })).toHaveTextContent("Agosto");
  });
});
