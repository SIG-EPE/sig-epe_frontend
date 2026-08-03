import { cn } from "@/lib/utils";
import type { SettlementPreparationStep, SettlementPreparationStepItem } from "@/lib/settlement-preparation-vm";

interface SettlementPreparationStepperProps {
  steps: SettlementPreparationStepItem[];
  disabled?: boolean;
  onStepChange: (step: SettlementPreparationStep) => void;
}

export function SettlementPreparationStepper({ steps, disabled = false, onStepChange }: SettlementPreparationStepperProps) {
  return (
    <nav aria-label="Preparación de rendición" className="grid gap-2 md:grid-cols-3">
      {steps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          className={cn(
            "min-h-11 rounded-md border p-3 text-left transition-colors hover:bg-muted",
            step.state === "current" && "border-primary bg-primary/5",
          )}
          aria-current={step.state === "current" ? "step" : undefined}
          disabled={disabled}
          onClick={() => onStepChange(step.id)}
          data-testid={`settlement-preparation-step-${step.id}`}
        >
          <span className="text-xs font-medium text-muted-foreground">Paso {index + 1}</span>
          <span className="block text-sm font-semibold">{step.label}</span>
          <span className="text-xs text-muted-foreground">
            {step.state === "completed" ? "Listo" : step.state === "current" ? "Estás aquí" : "Pendiente"}
          </span>
        </button>
      ))}
    </nav>
  );
}
