import { CheckCircle2, CircleAlert, Clock3, FilePlus2, ListPlus, ScanSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatRequestCurrency } from "@/lib/requests";
import {
  SETTLEMENT_LINE_TASK_STATE,
  type SettlementLineTask,
  type SettlementLineTaskState,
} from "@/lib/settlement-preparation-vm";

interface SettlementLineTaskCardProps {
  task: SettlementLineTask;
  currency: string;
  disabled?: boolean;
  onGoToTask: (task: SettlementLineTask) => void;
}

const STATE_LABELS: Record<SettlementLineTaskState, string> = {
  [SETTLEMENT_LINE_TASK_STATE.NEEDS_RECEIPT]: "Falta comprobante",
  [SETTLEMENT_LINE_TASK_STATE.PROCESSING]: "En procesamiento",
  [SETTLEMENT_LINE_TASK_STATE.NEEDS_CONFIRMATION]: "Requiere confirmación",
  [SETTLEMENT_LINE_TASK_STATE.NEEDS_REPORT_ROW]: "Falta agregar al informe",
  [SETTLEMENT_LINE_TASK_STATE.COMPLETE]: "Línea lista",
};

function TaskStateIcon({ state }: { state: SettlementLineTaskState }) {
  const label = STATE_LABELS[state].toLocaleLowerCase("es-PE");
  const className = state === SETTLEMENT_LINE_TASK_STATE.COMPLETE ? "size-5 text-emerald-600" : "size-5 text-amber-600";
  const props = { className, "aria-label": `Estado: ${label}` };

  if (state === SETTLEMENT_LINE_TASK_STATE.COMPLETE) return <CheckCircle2 {...props} />;
  if (state === SETTLEMENT_LINE_TASK_STATE.NEEDS_RECEIPT) return <FilePlus2 {...props} />;
  if (state === SETTLEMENT_LINE_TASK_STATE.PROCESSING) return <Clock3 {...props} />;
  if (state === SETTLEMENT_LINE_TASK_STATE.NEEDS_CONFIRMATION) return <ScanSearch {...props} />;
  if (state === SETTLEMENT_LINE_TASK_STATE.NEEDS_REPORT_ROW) return <ListPlus {...props} />;
  return <CircleAlert {...props} />;
}

export function SettlementLineTaskCard({ task, currency, disabled = false, onGoToTask }: SettlementLineTaskCardProps) {
  const complete = task.state === SETTLEMENT_LINE_TASK_STATE.COMPLETE;

  return (
    <Card id={`settlement-task-${task.id}`} className="shadow-sm" data-testid={`settlement-line-task-${task.id}`} tabIndex={-1}>
      <CardHeader className="gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <TaskStateIcon state={task.state} />
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold leading-snug tracking-tight">{task.label}</h3>
            <Badge variant={complete ? "secondary" : "outline"}>{STATE_LABELS[task.state]}</Badge>
          </div>
        </div>
        <p className="shrink-0 text-sm font-semibold">{formatRequestCurrency(task.amount, currency)}</p>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {task.blocker ? <p className="text-sm text-muted-foreground">{task.blocker}</p> : <p className="text-sm text-muted-foreground">Esta línea no tiene pendientes.</p>}
        {task.nextAction ? (
          <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal sm:w-auto" disabled={disabled} onClick={() => onGoToTask(task)}>
            {task.nextAction}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
