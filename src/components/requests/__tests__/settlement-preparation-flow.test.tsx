import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettlementPreparationFlow } from "@/components/requests/settlement-preparation/settlement-preparation-flow";
import {
  SETTLEMENT_PREPARATION_CTA,
  SETTLEMENT_PREPARATION_STEP,
  type SettlementPreparationVm,
} from "@/lib/settlement-preparation-vm";

function makeVm(activeStep: SettlementPreparationVm["activeStep"] = SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE): SettlementPreparationVm {
  return {
    activeStep,
    steps: [
      { id: SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE, label: "Revisa el anticipo", state: activeStep === SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE ? "current" : "completed" },
      { id: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS, label: "Registra comprobantes", state: activeStep === SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS ? "current" : "pending" },
      { id: SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT, label: "Genera y envía", state: activeStep === SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT ? "current" : "pending" },
    ],
    lineTasks: [],
    pendingItems: [],
    readiness: { isReady: false, pendingCount: 0 },
    totals: { allocatedAmount: 0, reportedAmount: 0, differenceAmount: 0, currency: "PEN" },
    locks: { isEditable: true, isReportLocked: false, canUpload: true, canGenerate: false, canSubmit: false },
    extras: { hasBlocker: false },
    cta: { kind: SETTLEMENT_PREPARATION_CTA.CONTINUE, label: "Continuar", targetStep: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS, disabled: false, reason: null },
  };
}

describe("SettlementPreparationFlow", () => {
  it("usa un stepper exclusivo REXAN y emite navegación tipada", async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    render(
      <SettlementPreparationFlow
        vm={makeVm()}
        onStepChange={onStepChange}
        reviewAdvance={<div>Contenido anticipo</div>}
        registerReceipts={<div>Contenido comprobantes</div>}
        generateAndSubmit={<div>Contenido generación</div>}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Preparación de rendición" })).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining("Revisa el anticipo"),
      expect.stringContaining("Registra comprobantes"),
      expect.stringContaining("Genera y envía"),
    ]));

    await user.click(screen.getByRole("button", { name: /Registra comprobantes/ }));
    expect(onStepChange).toHaveBeenCalledWith(SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS);
  });

  it("mantiene estructura responsive, targets de 44 px y navegación de teclado", async () => {
    const user = userEvent.setup();
    render(
      <SettlementPreparationFlow
        vm={makeVm()}
        onStepChange={vi.fn()}
        reviewAdvance={<div>Contenido anticipo</div>}
        registerReceipts={<div>Contenido comprobantes</div>}
        generateAndSubmit={<div>Contenido generación</div>}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "Preparación de rendición" });
    expect(navigation).toHaveClass("grid");
    expect(navigation).toHaveClass("md:grid-cols-3");
    const steps = screen.getAllByRole("button", { name: /Revisa el anticipo|Registra comprobantes|Genera y envía/ });
    steps.forEach((step) => expect(step).toHaveClass("min-h-11"));

    await user.tab();
    expect(steps[0]).toHaveFocus();
    await user.tab();
    expect(steps[1]).toHaveFocus();
  });

  it("oculta pasos sin desmontar su contenido", () => {
    const { rerender } = render(
      <SettlementPreparationFlow
        vm={makeVm()}
        onStepChange={vi.fn()}
        reviewAdvance={<input aria-label="Nota local" defaultValue="Conservar" />}
        registerReceipts={<div>Contenido comprobantes</div>}
        generateAndSubmit={<div>Contenido generación</div>}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Nota local" });

    rerender(
      <SettlementPreparationFlow
        vm={makeVm(SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS)}
        onStepChange={vi.fn()}
        reviewAdvance={<input aria-label="Nota local" defaultValue="Conservar" />}
        registerReceipts={<div>Contenido comprobantes</div>}
        generateAndSubmit={<div>Contenido generación</div>}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Nota local", hidden: true })).toBe(input);
    expect(screen.getByTestId("settlement-preparation-view-review-advance")).toHaveAttribute("hidden");
    expect(screen.getByTestId("settlement-preparation-view-register-receipts")).not.toHaveAttribute("hidden");
  });

  it("mantiene el monitor de carga fuera de los pasos al navegar internamente", () => {
    const uploadProgress = <aside aria-label="Monitor de carga">1/2 archivos guardados</aside>;
    const { rerender } = render(
      <SettlementPreparationFlow
        vm={makeVm(SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS)}
        onStepChange={vi.fn()}
        reviewAdvance={<div>Contenido anticipo</div>}
        registerReceipts={<div>Contenido comprobantes</div>}
        generateAndSubmit={<div>Contenido generación</div>}
        uploadProgress={uploadProgress}
      />,
    );
    const monitor = screen.getByRole("complementary", { name: "Monitor de carga" });

    rerender(
      <SettlementPreparationFlow
        vm={makeVm(SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT)}
        onStepChange={vi.fn()}
        reviewAdvance={<div>Contenido anticipo</div>}
        registerReceipts={<div>Contenido comprobantes</div>}
        generateAndSubmit={<div>Contenido generación</div>}
        uploadProgress={uploadProgress}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Monitor de carga" })).toBe(monitor);
    expect(monitor).toBeVisible();
  });

  it("integra panel, tareas por línea y Extras sin mover acciones del contenido existente", async () => {
    const user = userEvent.setup();
    const onGoToTask = vi.fn();
    const vm = makeVm(SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS);
    vm.lineTasks = [{
      id: "allocation-1",
      label: "Línea 1: POA-001",
      amount: 500,
      state: "needs-confirmation",
      nextAction: "Confirma los datos del comprobante",
      blocker: "Falta confirmar el OCR.",
    }];
    vm.pendingItems = [{
      id: "line-allocation-1",
      label: "Línea 1: POA-001",
      message: "Falta confirmar el OCR.",
      targetStep: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS,
      allocationId: "allocation-1",
    }];
    vm.totals = { allocatedAmount: 500, reportedAmount: 100, differenceAmount: 400, currency: "PEN" };

    render(
      <SettlementPreparationFlow
        vm={vm}
        onStepChange={vi.fn()}
        onGoToTask={onGoToTask}
        extrasReference="OP-001"
        extrasOptionalContent={<div>Adjuntos opcionales existentes</div>}
        reviewAdvance={<div>Contexto del anticipo</div>}
        registerReceipts={<div>Confirmar OCR y agregar al informe permanecen aquí</div>}
        generateAndSubmit={<div>Bloqueos, devoluciones y generación permanecen aquí</div>}
      />,
    );

    expect(screen.getByTestId("settlement-pending-panel")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-line-task-allocation-1")).toBeInTheDocument();
    expect(screen.getByText("Confirmar OCR y agregar al informe permanecen aquí")).toBeVisible();
    expect(screen.queryByText("Bloqueos, devoluciones y generación permanecen aquí")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "Ir al primer pendiente" }));
    expect(onGoToTask).toHaveBeenCalledWith(vm.pendingItems[0]);

    await user.click(screen.getByRole("button", { name: /Extras/ }));
    expect(screen.getByText("OP-001")).toBeVisible();
    expect(screen.getByText("Adjuntos opcionales existentes")).toBeVisible();
  });
});
