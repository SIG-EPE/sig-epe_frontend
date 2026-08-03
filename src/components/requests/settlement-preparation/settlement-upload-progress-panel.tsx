import { AlertTriangle, ChevronUp, Minus, Pause, Play, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { RequestDocumentUploadQueueController } from "@/hooks/use-request-document-upload-queue";
import { REQUEST_DOCUMENT_UPLOAD_BATCH_STATE } from "@/lib/request-document-upload-queue";
import { SettlementUploadFileRow } from "./settlement-upload-file-row";

interface SettlementUploadProgressPanelProps {
  queue: RequestDocumentUploadQueueController;
}

function getErrorLauncherLabel(errors: number): string {
  if (errors === 0) return "Abrir progreso de carga";
  return `Abrir progreso de carga: ${errors} archivo${errors === 1 ? "" : "s"} con error`;
}

export function SettlementUploadProgressPanel({ queue }: SettlementUploadProgressPanelProps) {
  const { state, summary } = queue;
  if (summary.total === 0) return null;

  if (state.minimized) {
    return (
      <Button
        type="button"
        className="fixed bottom-4 right-4 z-50 min-h-11 max-w-[calc(100vw-2rem)] shadow-lg max-md:bottom-[max(1rem,env(safe-area-inset-bottom))] max-md:left-4 max-md:right-4"
        variant={summary.errors > 0 || summary.persistentWarnings > 0 ? "destructive" : "default"}
        aria-label={getErrorLauncherLabel(summary.errors)}
        onClick={queue.restore}
      >
        {summary.errors > 0 ? <AlertTriangle className="size-4" aria-hidden="true" /> : <ChevronUp className="size-4" aria-hidden="true" />}
        {summary.errors > 0
          ? `${summary.errors} archivo${summary.errors === 1 ? "" : "s"} con error`
          : `${summary.saved}/${summary.total} archivos guardados`}
      </Button>
    );
  }

  const canClose = !queue.isRunning && summary.errors === 0 && summary.persistentWarnings === 0 && summary.queued === 0;
  const isPaused = state.batchState === REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSED;

  return (
    <aside
      aria-label="Progreso de carga de documentos"
      className="fixed bottom-4 right-4 z-50 w-[min(26rem,calc(100vw-2rem))] max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:w-full max-md:pb-[env(safe-area-inset-bottom)]"
    >
      <Card className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-hidden shadow-xl max-md:max-h-[70dvh] max-md:rounded-b-none">
        <CardHeader className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Adjuntando comprobantes</CardTitle>
              <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
                {summary.saved}/{summary.total} archivos guardados
              </p>
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Minimizar progreso de carga" onClick={queue.minimize}>
                <Minus className="size-4" />
              </Button>
              {canClose ? (
                <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Cerrar progreso de carga" onClick={queue.reset}>
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <ProgressBar
            value={summary.processed}
            max={summary.total}
            label={`${summary.processed} de ${summary.total} archivos procesados`}
          />
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{summary.processed} procesados</span>
            <span>{summary.uploading} subiendo</span>
            <span>{summary.processing} procesando</span>
            <span>{summary.queued} en cola</span>
            {summary.errors > 0 ? <Badge variant="destructive">{summary.errors} con error</Badge> : null}
            {summary.persistentWarnings > 0 ? <Badge variant="outline">{summary.persistentWarnings} con incidencia</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {queue.isRunning ? (
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={queue.pauseAfterCurrent}>
                <Pause className="size-4" />
                Pausar después del actual
              </Button>
            ) : isPaused && summary.queued > 0 ? (
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={queue.resume}>
                <Play className="size-4" />
                Continuar cargas
              </Button>
            ) : null}
            {summary.retryableErrors > 0 ? (
              <Button type="button" variant="outline" size="sm" className="min-h-11" aria-label="Reintentar todos los errores" onClick={queue.retryFailed} disabled={queue.isRunning}>
                <RotateCcw className="size-4" />
                Reintentar fallidos
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="max-h-[min(27rem,45dvh)] overflow-y-auto p-4 pt-0">
          <ul className="space-y-2">
            {queue.items.map((item) => (
              <SettlementUploadFileRow
                key={item.id}
                item={item}
                disabled={queue.isRunning}
                onRetry={queue.retry}
                onRemove={queue.remove}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}
