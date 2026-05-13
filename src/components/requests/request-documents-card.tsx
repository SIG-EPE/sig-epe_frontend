"use client";

import { useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteRequestDocument, useRequestDocuments, useUploadRequestDocument } from "@/hooks/use-requests";
import {
  canManageRequestDocuments,
  formatRequestDateTime,
  formatRequestDocumentSize,
  getApiErrorMessage,
  getRequestDocumentCategoryLabel,
  getRequestDocumentDisplayName,
  REQUEST_DOCUMENT_CATEGORY_OPTIONS,
  validateRequestDocumentFile,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_DOCUMENT_CATEGORY, type PaymentRequest, type RequestDocumentCategory } from "@/types/requests";

interface RequestDocumentsCardProps {
  request: PaymentRequest;
}

export function RequestDocumentsCard({ request }: RequestDocumentsCardProps) {
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const canManage = canManageRequestDocuments(roleCode, request.status, request, user?.id);
  const { documents, isLoading, error, refetch } = useRequestDocuments(request.id);
  const { uploadDocument, isLoading: uploading } = useUploadRequestDocument();
  const { deleteDocument, isLoading: deleting } = useDeleteRequestDocument();
  const [category, setCategory] = useState<RequestDocumentCategory>(REQUEST_DOCUMENT_CATEGORY.SUPPORT);
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleFileChange(nextFile: File | null): void {
    setFile(nextFile);
    setValidationError(validateRequestDocumentFile(nextFile));
  }

  async function handleUpload(): Promise<void> {
    const fileError = validateRequestDocumentFile(file);
    if (fileError || !file) {
      setValidationError(fileError);
      return;
    }

    try {
      await uploadDocument(request.id, { file, document_category: category });
      toast.success("Documento adjuntado correctamente");
      setFile(null);
      setValidationError(null);
      await refetch();
    } catch (uploadError) {
      toast.error(getApiErrorMessage(uploadError));
    }
  }

  async function handleDelete(documentId: string): Promise<void> {
    try {
      await deleteDocument(request.id, documentId);
      toast.success("Documento eliminado correctamente");
      await refetch();
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos adjuntos</CardTitle>
        <CardDescription>Adjunta sustentos en PDF, JPG o PNG. No se muestran enlaces de Drive en este sprint.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage ? (
          <div className="rounded-md border p-4">
            <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="document-category">Categoría</label>
                <Select value={category} onValueChange={(value) => setCategory(value as RequestDocumentCategory)}>
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
                  key={file?.name ?? "empty"}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Máximo 10 MB. Formatos permitidos: PDF, JPG y PNG.</p>
              </div>
              <Button type="button" onClick={() => void handleUpload()} disabled={uploading || Boolean(validationError)}>
                <Upload className="size-4" />
                {uploading ? "Subiendo..." : "Adjuntar"}
              </Button>
            </div>
            {validationError && <p className="mt-2 text-sm text-destructive">{validationError}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">La carga y eliminación solo están disponibles para solicitudes editables autorizadas.</p>
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
            {documents.map((document) => (
              <div key={document.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{getRequestDocumentDisplayName(document)}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{getRequestDocumentCategoryLabel(document.document_category)}</Badge>
                      <span>{document.mime_type}</span>
                      <span>{formatRequestDocumentSize(document.size_bytes)}</span>
                      <span>Subido: {formatRequestDateTime(document.created_at)}</span>
                      {document.upload_status && <span>Estado: {document.upload_status}</span>}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(document.id)} disabled={deleting}>
                    <Trash2 className="size-4" />
                    Eliminar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
