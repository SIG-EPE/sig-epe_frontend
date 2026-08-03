import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettlementExtras } from "@/components/requests/settlement-preparation/settlement-extras";
import { SettlementLineTaskCard } from "@/components/requests/settlement-preparation/settlement-line-task-card";
import { SettlementPendingPanel } from "@/components/requests/settlement-preparation/settlement-pending-panel";
import {
  SETTLEMENT_LINE_TASK_STATE,
  SETTLEMENT_PREPARATION_STEP,
  type SettlementLineTask,
  type SettlementPendingItem,
} from "@/lib/settlement-preparation-vm";

const pendingTask: SettlementLineTask = {
  id: "allocation-1",
  label: "Línea 1: POA-001 — Taller regional",
  amount: 500,
  state: SETTLEMENT_LINE_TASK_STATE.NEEDS_CONFIRMATION,
  nextAction: "Confirma los datos del comprobante",
  blocker: "Hay comprobantes cuyos datos todavía no han sido confirmados.",
};

const pendingItem: SettlementPendingItem = {
  id: "line-allocation-1",
  label: pendingTask.label,
  message: pendingTask.blocker ?? "",
  targetStep: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS,
  allocationId: pendingTask.id,
};

describe("SettlementLineTaskCard", () => {
  it("expone monto, estado textual, icono accesible, siguiente acción y bloqueo", async () => {
    const user = userEvent.setup();
    const onGoToTask = vi.fn();
    render(<SettlementLineTaskCard task={pendingTask} currency="PEN" onGoToTask={onGoToTask} />);

    expect(screen.getByRole("heading", { name: pendingTask.label })).toBeInTheDocument();
    expect(screen.getByText("Requiere confirmación")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado: requiere confirmación")).toBeInTheDocument();
    expect(screen.getByText(/S\/\s*500\.00/)).toBeInTheDocument();
    expect(screen.getByText(pendingTask.blocker ?? "")).toBeInTheDocument();

    const action = screen.getByRole("button", { name: pendingTask.nextAction ?? "" });
    expect(action).toHaveClass("min-h-11");
    await user.click(action);
    expect(onGoToTask).toHaveBeenCalledWith(pendingTask);
  });
});

describe("SettlementPendingPanel", () => {
  it("muestra pendientes, totales y diferencia y lleva al primer pendiente", async () => {
    const user = userEvent.setup();
    const onGoToTask = vi.fn();
    render(
      <SettlementPendingPanel
        items={[pendingItem]}
        totals={{ allocatedAmount: 500, reportedAmount: 320, differenceAmount: 180, currency: "PEN" }}
        onGoToTask={onGoToTask}
      />,
    );

    expect(screen.getByText("1 pendiente")).toBeInTheDocument();
    expect(screen.getByText("Total del anticipo").nextSibling).toHaveTextContent(/S\/\s*500\.00/);
    expect(screen.getByText("Total registrado").nextSibling).toHaveTextContent(/S\/\s*320\.00/);
    expect(screen.getByText("Diferencia").nextSibling).toHaveTextContent(/S\/\s*180\.00/);

    await user.click(screen.getByRole("button", { name: "Ir al primer pendiente" }));
    expect(onGoToTask).toHaveBeenCalledWith(pendingItem);
  });
});

describe("SettlementExtras", () => {
  it("mantiene solo referencia y contenido opcional en un disclosure accesible", async () => {
    const user = userEvent.setup();
    render(<SettlementExtras reference="OP-001" optionalContent={<p>Documento opcional</p>} />);

    const trigger = screen.getByRole("button", { name: /Extras/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("OP-001")).not.toBeVisible();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("OP-001")).toBeVisible();
    expect(screen.getByText("Documento opcional")).toBeVisible();
  });

  it("se autoexpande cuando su contenido opcional informa un bloqueo", () => {
    render(<SettlementExtras reference={null} optionalContent={<p>Falta una referencia opcional</p>} hasBlocker />);

    expect(screen.getByRole("button", { name: /Extras/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Falta una referencia opcional")).toBeVisible();
  });
});
