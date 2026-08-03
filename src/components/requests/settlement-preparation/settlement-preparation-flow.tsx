import type { ReactNode } from "react";

import type { SettlementLineTask, SettlementPendingItem, SettlementPreparationStep, SettlementPreparationVm } from "@/lib/settlement-preparation-vm";
import { SETTLEMENT_PREPARATION_STEP } from "@/lib/settlement-preparation-vm";
import { SettlementExtras } from "./settlement-extras";
import { SettlementLineTaskCard } from "./settlement-line-task-card";
import { SettlementPendingPanel } from "./settlement-pending-panel";
import { SettlementPreparationStepper } from "./settlement-preparation-stepper";

interface SettlementPreparationFlowProps {
  vm: SettlementPreparationVm;
  disabled?: boolean;
  reviewAdvance: ReactNode;
  registerReceipts: ReactNode;
  generateAndSubmit: ReactNode;
  extrasReference?: string | null;
  extrasOptionalContent?: ReactNode;
  uploadProgress?: ReactNode;
  onStepChange: (step: SettlementPreparationStep) => void;
  onGoToTask?: (item: SettlementPendingItem) => void;
}

interface SettlementPreparationViewProps {
  id: SettlementPreparationStep;
  activeStep: SettlementPreparationStep;
  children: ReactNode;
}

function SettlementPreparationView({ id, activeStep, children }: SettlementPreparationViewProps) {
  const isActive = id === activeStep;
  return (
    <section
      aria-labelledby={`settlement-preparation-step-${id}`}
      data-testid={`settlement-preparation-view-${id}`}
      hidden={!isActive}
    >
      {children}
    </section>
  );
}

export function SettlementPreparationFlow({
  vm,
  disabled = false,
  reviewAdvance,
  registerReceipts,
  generateAndSubmit,
  extrasReference,
  extrasOptionalContent,
  uploadProgress,
  onStepChange,
  onGoToTask,
}: SettlementPreparationFlowProps) {
  function goToPendingItem(item: SettlementPendingItem): void {
    if (onGoToTask) {
      onGoToTask(item);
      return;
    }
    onStepChange(item.targetStep);
  }

  function goToLineTask(task: SettlementLineTask): void {
    const pendingItem = vm.pendingItems.find((item) => item.allocationId === task.id);
    if (pendingItem) goToPendingItem(pendingItem);
  }

  return (
    <div className="space-y-6" data-testid="settlement-preparation-flow">
      <SettlementPreparationStepper steps={vm.steps} disabled={disabled} onStepChange={onStepChange} />
      <SettlementPendingPanel items={vm.pendingItems} totals={vm.totals} disabled={disabled} onGoToTask={goToPendingItem} />
      <SettlementPreparationView id={SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE} activeStep={vm.activeStep}>
        {reviewAdvance}
      </SettlementPreparationView>
      <SettlementPreparationView id={SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS} activeStep={vm.activeStep}>
        <div className="space-y-6">
          {vm.lineTasks.length > 0 ? (
            <section className="space-y-3" aria-labelledby="settlement-line-tasks-heading">
              <div>
                <h2 id="settlement-line-tasks-heading" className="text-base font-semibold">Tareas por línea POA</h2>
                <p className="text-sm text-muted-foreground">Completa la siguiente acción indicada en cada línea.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {vm.lineTasks.map((task) => (
                  <SettlementLineTaskCard key={task.id} task={task} currency={vm.totals.currency} disabled={disabled} onGoToTask={goToLineTask} />
                ))}
              </div>
            </section>
          ) : null}
          {registerReceipts}
          {(extrasReference !== undefined || extrasOptionalContent) ? (
            <SettlementExtras reference={extrasReference ?? null} optionalContent={extrasOptionalContent} hasBlocker={vm.extras.hasBlocker} />
          ) : null}
        </div>
      </SettlementPreparationView>
      <SettlementPreparationView id={SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT} activeStep={vm.activeStep}>
        {generateAndSubmit}
      </SettlementPreparationView>
      {uploadProgress}
    </div>
  );
}
