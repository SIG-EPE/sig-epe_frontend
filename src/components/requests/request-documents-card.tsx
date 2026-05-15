"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, FileText, Info, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteRequestDocument, useRequestDocuments, useUploadRequestDocument } from "@/hooks/use-requests";
import {
  canManageRequestDocuments,
  formatRequestDateTime,
  formatRequestDocumentSize,
  getApiErrorMessage,
  getRequestDocumentCategoryLabel,
  getRequestDocumentAccept,
  getRequestDocumentAcceptedFormatsLabel,
  getRequestDocumentDisplayName,
  getRequestDocumentMimeLabel,
  getRequestDocumentPermissionMessage,
  getRequestDocumentStorageProviderLabel,
  getRequestDocumentUploadStatusLabel,
  getRequiredDocumentChecklist,
  REQUEST_DOCUMENT_CATEGORY_OPTIONS,
  REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE,
  validateRequestDocumentFile,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_DOCUMENT_CATEGORY, REQUEST_TYPE, type PaymentRequest, type RequestDocument, type RequestDocumentCategory } from "@/types/requests";

interface RequestDocumentsCardProps {
  request: PaymentRequest;
  backendMissingMessages?: string[];
}

function getRequestDocumentWebUrl(document: RequestDocument): string | null {
  const webUrl = document.drive_web_url?.trim();

  return webUrl && webUrl.length > 0 ? webUrl : null;
}

function getDefaultDocumentCategory(request: PaymentRequest): RequestDocumentCategory {
  if (request.request_type === REQUEST_TYPE.ADVANCE) return REQUEST_DOCUMENT_CATEGORY.PXQ;
  if (request.request_type === REQUEST_TYPE.REIMBURSEMENT) return REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT;
  if (request.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT) return REQUEST_DOCUMENT_CATEGORY.RECEIPT;
  return REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT;
}

export function RequestDocumentsCard({ request, backendMissingMessages = [] }: RequestDocumentsCardProps) {
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const canManage = canManageRequestDocuments(roleCode, request.status, request, user?.id);
  const permissionMessage = getRequestDocumentPermissionMessage(roleCode, request.status, request, user?.id);
  const { documents, isLoading, error, refetch } = useRequestDocuments(request.id);
  const { uploadDocument, isLoading: uploading } = useUploadRequestDocument();
  const { deleteDocument, isLoading: deleting } = useDeleteRequestDocument();
  const [category, setCategory] = useState<RequestDocumentCategory>(getDefaultDocumentCategory(request));
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const checklist = getRequiredDocumentChecklist(request.request_type, documents);
  const acceptedFormatsLabel = getRequestDocumentAcceptedFormatsLabel(category);

  function handleFileChange(nextFile: File | null): void {
    setFile(nextFile);
    setValidationError(validateRequestDocumentFile(nextFile, category));
    setSuccessMessage(null);
  }

  function handleCategoryChange(value: string): void {
    const nextCategory = value as RequestDocumentCategory;
    setCategory(nextCategory);
    setValidationError(validateRequestDocumentFile(file, nextCategory));
  }

  async function handleUpload(): Promise<void> {
    const fileError = validateRequestDocumentFile(file, category);
    if (fileError || !file) {
      setValidationError(fileError);
      return;
    }

    try {
      setOperationError(null);
      await uploadDocument(request.id, { file, document_category: category });
      toast.success(REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE);
      setSuccessMessage(REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE);
      setFile(null);
      setValidationError(null);
      await refetch();
    } catch (uploadError) {
      const message = getApiErrorMessage(uploadError);
      setOperationError(message);
      toast.error(message);
      await refetch();
    }
  }

  async function handleDelete(documentId: string): Promise<void> {
    try {
      setOperationError(null);
      await deleteDocument(request.id, documentId);
      toast.success("Documento eliminado correctamente");
      setDocumentToDelete(null);
      await refetch();
    } catch (deleteError) {
      const message = getApiErrorMessage(deleteError);
      setOperationError(message);
      toast.error(message);
      await refetch();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos adjuntos</CardTitle>
        <CardDescription>Adjunta sustentos en PDF, JPG, PNG y Excel cuando la categoría lo requiera. Podrás abrir los documentos compartidos cuando el acceso haya sido habilitado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Checklist de documentos requeridos</h3>
            <p className="text-xs text-muted-foreground">Completa los documentos requeridos para continuar con el envío. La validación final se realizará al enviar la solicitud.</p>
          </div>
          <div className="mt-3 space-y-3">
            {checklist.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay documentos obligatorios configurados para este tipo de solicitud.</p>
            ) : checklist.items.map((item) => (
              <div key={item.key} className="flex gap-3 rounded-md border p-3">
                {item.satisfied ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : <XCircle className="mt-0.5 size-5 text-destructive" />}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.label}</p>
                    <Badge variant={item.satisfied ? "secondary" : "destructive"}>{item.satisfied ? "Adjunto" : "Pendiente"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground">Formatos esperados: {item.acceptedFormatsLabel}.</p>
                </div>
              </div>
            ))}
          </div>
          {checklist.conditionalNotes.length > 0 && (
            <div className="mt-3 space-y-2 rounded-md bg-muted p-3">
              <p className="flex items-center gap-2 text-xs font-medium"><Info className="size-4" /> Consideraciones adicionales</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {checklist.conditionalNotes.map((note) => (
                  <li key={note.key}><span className="font-medium text-foreground">{note.label}:</span> {note.description}</li>
                ))}
              </ul>
            </div>
          )}
          {backendMissingMessages.length > 0 && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>
                <p className="font-medium">Documentos requeridos pendientes</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {backendMissingMessages.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {canManage ? (
          <div className="rounded-md border p-4">
            <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="document-category">Categoría</label>
                <Select value={category} onValueChange={handleCategoryChange}>
                  <SelectTrigger id="document-category"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                  <SelectContent>
                    {REQUEST_DOCUMENT_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="request-document-file">Archivo</label>
                <Input
                  id="request-document-file"
                  key={file ? "selected" : "empty"}
                  type="file"
                  accept={getRequestDocumentAccept(category)}
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Máximo 10 MB. Formatos permitidos para esta categoría: {acceptedFormatsLabel}.</p>
              </div>
              <Button type="button" onClick={() => void handleUpload()} disabled={uploading || Boolean(validationError) || !file}>
                <Upload className="size-4" />
                {uploading ? "Subiendo..." : "Adjuntar"}
              </Button>
            </div>
            {file && (
              <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Archivo seleccionado</p>
                <p className="text-muted-foreground">
                  {file.name} · {formatRequestDocumentSize(file.size)} · {getRequestDocumentMimeLabel(file.type)}
                </p>
              </div>
            )}
            {validationError && <p className="mt-2 text-sm text-destructive">{validationError}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{permissionMessage}</p>
        )}

        {successMessage && (
          <Alert>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {operationError && (
          <Alert variant="destructive">
            <AlertDescription>{operationError}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{getApiErrorMessage(error)}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Reintentar</Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando documentos...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin documentos adjuntos.</p>
        ) : (
          <div className="space-y-3">
            {documents.map((document) => {
              const documentWebUrl = getRequestDocumentWebUrl(document);

              return (
                <div key={document.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">{getRequestDocumentDisplayName(document)}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{getRequestDocumentCategoryLabel(document.document_category)}</Badge>
                        <span>{getRequestDocumentMimeLabel(document.mime_type)}</span>
                        <span>{formatRequestDocumentSize(document.size_bytes)}</span>
                        <span>Subido: {formatRequestDateTime(document.created_at)}</span>
                        <span>Proveedor: {getRequestDocumentStorageProviderLabel(document.storage_provider)}</span>
                        <span>Estado: {getRequestDocumentUploadStatusLabel(document.upload_status)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    {documentWebUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={documentWebUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-4" />
                          Ver documento
                        </a>
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Enlace no disponible</p>
                    )}
                    {canManage && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setDocumentToDelete(document.id)} disabled={deleting}>
                        <Trash2 className="size-4" />
                        {deleting && documentToDelete === document.id ? "Eliminando..." : "Eliminar"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Dialog open={Boolean(documentToDelete)} onOpenChange={(open) => !open && setDocumentToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar documento</DialogTitle>
              <DialogDescription>
                Esta acción quitará el documento de la solicitud si cuentas con los permisos necesarios.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDocumentToDelete(null)} disabled={deleting}>Cancelar</Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => documentToDelete && void handleDelete(documentToDelete)}
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : "Eliminar documento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
