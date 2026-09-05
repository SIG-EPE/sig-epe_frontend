import { Badge } from "@/components/ui/badge";
import type {
  DriveProjectionAuditorHealth,
  DriveProjectionCallBudget,
} from "@/types/drive-hierarchy";

interface ProjectionHealthSummaryProps {
  auditor: DriveProjectionAuditorHealth | null;
  callBudget: DriveProjectionCallBudget;
}

const AUDITOR_LABEL = {
  PASS: "Auditor saludable",
  STALE: "Auditor vencido",
  FAIL: "Auditor bloqueado",
  MISSING: "Auditor sin evidencia",
} as const;

export function ProjectionHealthSummary({
  auditor,
  callBudget,
}: ProjectionHealthSummaryProps) {
  const status = auditor?.status ?? "MISSING";
  return (
    <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
      <div className="space-y-1">
        <p className="font-medium">Admisión automática</p>
        <Badge variant={status === "PASS" ? "default" : "destructive"}>
          {AUDITOR_LABEL[status]}
        </Badge>
        <p className="text-xs text-muted-foreground">
          Generación {auditor?.generation ?? "—"} · antigüedad{" "}
          {auditor?.ageSeconds ?? "—"} s · revisadas {auditor?.auditedCount ?? 0}
          {auditor?.frozenCount ? ` · congeladas ${auditor.frozenCount}` : ""}
        </p>
      </div>
      <div className="space-y-1">
        <p className="font-medium">Presupuesto Drive por proyección</p>
        <p>
          {callBudget.normal} normal · {callBudget.maximum} máximo
        </p>
        <p className="text-xs text-muted-foreground">
          Máximo del último lote: {callBudget.lastBatchMaximum}
        </p>
      </div>
      {auditor?.issueCodes.length ? (
        <p className="text-xs text-destructive sm:col-span-2">
          {auditor.issueCodes.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
