import { AlertCircle, CheckCircle2, Clock3, FileText, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  REQUEST_DOCUMENT_UPLOAD_FILE_STATE,
  type RequestDocumentUploadQueueItem,
} from "@/lib/request-document-upload-queue";
import { formatRequestDocumentSize, getRequestDocumentCategoryLabel } from "@/lib/requests";

interface SettlementUploadFileRowProps {
  item: RequestDocumentUploadQueueItem;
  disabled?: boolean;
  onRetry: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}

const FILE_STATE_LABEL = {
  [REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED]: "En cola",
  [REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING]: "Subiendo",
  [REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED]: "Guardado",
  [REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING]: "Procesando",
  [REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW]: "Revisar",
  [REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR]: "Error",
} as const;

function getStateIcon(state: RequestDocumentUploadQueueItem["state"]) {
  if (state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING || state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING) {
    return <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  }
  if (state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED) return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR) return <AlertCircle className="size-4" aria-hidden="true" />;
  if (state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED) return <Clock3 className="size-4" aria-hidden="true" />;
  return <FileText className="size-4" aria-hidden="true" />;
}

function getStateVariant(state: RequestDocumentUploadQueueItem["state"]): "default" | "secondary" | "destructive" | "outline" {
  if (state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR) return "destructive";
  if (state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED) return "default";
  if (state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW) return "outline";
  return "secondary";
}

export function SettlementUploadFileRow({ item, disabled = false, onRetry, onRemove }: SettlementUploadFileRowProps) {
  const canRemove = item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED
    || item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR;

  return (
    <li className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{item.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatRequestDocumentSize(item.file.size)} · {getRequestDocumentCategoryLabel(item.documentCategory)}
          </p>
        </div>
        <Badge variant={getStateVariant(item.state)} className="shrink-0 gap-1">
          {getStateIcon(item.state)}
          {FILE_STATE_LABEL[item.state]}
        </Badge>
      </div>

      {item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING ? (
        <p className="text-sm text-muted-foreground">Enviando, guardando y procesando. El servidor puede terminar aunque salgas de esta página.</p>
      ) : null}
      {item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING ? (
        <p className="text-sm text-muted-foreground">El comprobante está siendo procesado. No mostramos porcentajes de Drive u OCR porque el servidor no los informa.</p>
      ) : null}
      {item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW ? (
        <p className="text-sm text-muted-foreground">Revisa y confirma los datos del comprobante desde la tarea de su línea POA.</p>
      ) : null}
      {item.errorMessage ? (
        <Alert variant="destructive" role="alert" className="py-2">
          <AlertDescription>{item.errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {item.hasPersistentWarning && item.warningMessage ? (
        <Alert role="alert" className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
          <AlertDescription className="text-amber-950 dark:text-amber-100">{item.warningMessage}</AlertDescription>
        </Alert>
      ) : null}

      {(item.retryable || canRemove) ? (
        <div className="flex flex-wrap justify-end gap-2">
          {item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR && item.retryable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              aria-label={`Reintentar ${item.file.name}`}
              disabled={disabled}
              onClick={() => onRetry(item.id)}
            >
              Reintentar
            </Button>
          ) : null}
          {canRemove ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              aria-label={`Retirar ${item.file.name}`}
              disabled={disabled || item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING}
              onClick={() => onRemove(item.id)}
            >
              Retirar
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
