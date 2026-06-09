"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { CheckCircle2, ExternalLink, FileText, Info, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirmRequestReceiptReview, useDeleteRequestDocument, useRequestDocuments, useRequestReceiptReviews, useUpdateRequestReceiptReview, useUploadRequestDocument } from "@/hooks/use-requests";
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
  formatRequestCurrency,
  REQUEST_DOCUMENT_CATEGORY_OPTIONS,
  REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE,
  validateRequestDocumentFile,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_SCOPE_TYPE,
  REQUEST_RECEIPT_DUPLICATE_STATUS,
  REQUEST_RECEIPT_OCR_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
  type RequestAllocation,
  type RequestAllocationRequiredDocumentItem,
  type RequestDocument,
  type RequestDocumentCategory,
  type RequiredDocumentChecklistItem,
  type RequestReceiptReview,
  type UpdateRequestReceiptReviewInput,
} from "@/types/requests";

interface RequestDocumentsCardProps {
  request: PaymentRequest;
  backendMissingMessages?: string[];
  readOnly?: boolean;
  documents?: RequestDocument[];
  documentsLoading?: boolean;
  documentsError?: Error | null;
  onDocumentsChanged?: () => Promise<void> | void;
}

interface ReceiptReviewFormState {
  issuer_document_number: string;
  issuer_name: string;
  series: string;
  number: string;
  issue_date: string;
  amount: string;
  currency: string;
}

interface ChecklistAttachButtonProps {
  item: RequiredDocumentChecklistItem;
  disabled: boolean;
  isUploading: boolean;
  onAttach: (category: RequestDocumentCategory, file: File) => void;
}

const DOCUMENT_UPLOAD_ACTION = {
  GENERIC: "generic",
} as const;

type DocumentUploadAction = string;

interface UploadScopeOptions {
  scope_type?: typeof REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION;
  request_allocation_id?: string;
}

const EMPTY_CHECKLIST = {
  items: [],
  conditionalNotes: [],
  missingMessages: [],
  isComplete: true,
};

function ChecklistAttachButton({ item, disabled, isUploading, onAttach }: ChecklistAttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (selectedFile) onAttach(item.category, selectedFile);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={getRequestDocumentAccept(item.category)}
        aria-label={`Seleccionar ${item.label}`}
        disabled={disabled}
        onChange={handleInputChange}
      />
      <Button type="button" variant="outline" size="sm" className="self-start sm:self-center" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" />
        {isUploading ? "Subiendo..." : `Adjuntar ${item.label}`}
      </Button>
    </>
  );
}

function getRequestDocumentWebUrl(document: RequestDocument): string | null {
  const webUrl = document.drive_web_url?.trim();

  return webUrl && webUrl.length > 0 ? webUrl : null;
}

function getPendingRequiredDocumentCategories(checklist: RequiredDocumentChecklistItem[]): Set<RequestDocumentCategory> {
  return new Set(checklist.filter((item) => item.required && !item.satisfied).map((item) => item.category));
}

function getOptionalDocumentCategoryOptions(checklist: RequiredDocumentChecklistItem[]): typeof REQUEST_DOCUMENT_CATEGORY_OPTIONS {
  const pendingRequiredCategories = getPendingRequiredDocumentCategories(checklist);

  return REQUEST_DOCUMENT_CATEGORY_OPTIONS.filter((option) => !pendingRequiredCategories.has(option.value));
}

function getDefaultOptionalDocumentCategory(options: typeof REQUEST_DOCUMENT_CATEGORY_OPTIONS): RequestDocumentCategory | "" {
  return options.find((option) => option.value === REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT)?.value ?? options[0]?.value ?? "";
}

function isAllocationScopedDocument(document: RequestDocument): boolean {
  return document.scope_type === REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION || Boolean(document.request_allocation_id);
}

function getRequestLevelDocuments(documents: RequestDocument[]): RequestDocument[] {
  return documents.filter((document) => !isAllocationScopedDocument(document));
}

function getAllocationDocuments(allocation: RequestAllocation, documents: RequestDocument[]): RequestDocument[] {
  const directDocuments = allocation.documents ?? [];
  if (!allocation.id) return directDocuments;

  const scopedDocuments = documents.filter((document) => document.request_allocation_id === allocation.id);
  const byId = new Map<string, RequestDocument>();
  [...directDocuments, ...scopedDocuments].forEach((document) => byId.set(document.id, document));

  return Array.from(byId.values());
}

function getPlanningLineDisplay(allocation: RequestAllocation): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  const code = line?.line_code?.trim();
  const description = line?.resource_description?.trim();

  return [code, description].filter(Boolean).join(" · ") || "Línea POA sin detalle";
}

function getAllocationSummary(allocation: RequestAllocation): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  const orgUnit = allocation.org_unit ?? line?.org_unit ?? null;
  const fiscalYear = allocation.fiscal_year ?? line?.fiscal_year?.year ?? null;
  const parts = [
    orgUnit?.name ? `Unidad: ${orgUnit.name}` : null,
    fiscalYear ? `Año fiscal: ${fiscalYear}` : null,
    `Monto: ${formatRequestCurrency(Number(allocation.amount ?? 0), allocation.currency || REQUEST_CURRENCY.PEN)}`,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

function normalizeBackendChecklistItem(item: RequestAllocationRequiredDocumentItem, index: number): RequiredDocumentChecklistItem | null {
  const category = (item.category ?? item.document_type) as RequestDocumentCategory | undefined;
  if (!category || !Object.values(REQUEST_DOCUMENT_CATEGORY).includes(category)) return null;

  return {
    key: item.key ?? `${category}-${index}`,
    category,
    label: item.label ?? getRequestDocumentCategoryLabel(category),
    description: item.description ?? (category === REQUEST_DOCUMENT_CATEGORY.PXQ ? "Adjunta la plantilla PxQ correspondiente a esta línea POA." : "Adjunta el documento requerido para esta línea POA."),
    required: item.required ?? true,
    satisfied: item.satisfied ?? false,
    acceptedFormatsLabel: item.acceptedFormatsLabel ?? item.accepted_formats_label ?? getRequestDocumentAcceptedFormatsLabel(category),
    missingMessage: item.missingMessage ?? item.missing_message ?? `Falta adjuntar ${getRequestDocumentCategoryLabel(category)} para esta línea POA.`,
  };
}

function mergeBackendChecklistWithLocalDocuments(items: RequiredDocumentChecklistItem[], allocationDocuments: RequestDocument[]): RequiredDocumentChecklistItem[] {
  const localChecklist = getRequiredDocumentChecklist(REQUEST_TYPE.ADVANCE, allocationDocuments);

  return items.map((item) => {
    const localItem = localChecklist.items.find((candidate) => candidate.category === item.category);

    return {
      ...item,
      satisfied: item.satisfied || Boolean(localItem?.satisfied),
    };
  });
}

function getAllocationChecklist(allocation: RequestAllocation, allocationDocuments: RequestDocument[]) {
  const backendItems = allocation.document_checklist?.required_documents ?? allocation.document_checklist?.items ?? [];
  if (backendItems.length > 0) {
    const normalizedItems = backendItems
      .map(normalizeBackendChecklistItem)
      .filter((item): item is RequiredDocumentChecklistItem => item !== null);
    const items = mergeBackendChecklistWithLocalDocuments(normalizedItems, allocationDocuments);
    const missingMessages = items.filter((item) => item.required && !item.satisfied).map((item) => item.missingMessage);
    const backendIsComplete = allocation.document_checklist?.complete ?? allocation.document_checklist?.is_complete ?? allocation.document_checklist?.isComplete;
    const isComplete = missingMessages.length === 0 || Boolean(backendIsComplete);

    return { items, conditionalNotes: [], missingMessages, isComplete };
  }

  return getRequiredDocumentChecklist(REQUEST_TYPE.ADVANCE, allocationDocuments);
}

function getReceiptStatusLabel(receiptReview?: RequestReceiptReview): string {
  if (!receiptReview) return "Procesando comprobante";
  if (receiptReview.receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.POSSIBLE_DUPLICATE) return "Factura duplicada por revisar";
  if (receiptReview.duplicate_candidates.length > 0) return "Factura duplicada por revisar";
  if (receiptReview.receipt.confirmed_at) return "Factura registrada";

  const status = receiptReview.receipt.ocr_status;
  if (status === REQUEST_RECEIPT_OCR_STATUS.PENDING || status === REQUEST_RECEIPT_OCR_STATUS.PROCESSING) return "Procesando comprobante";
  if (status === REQUEST_RECEIPT_OCR_STATUS.REQUIRES_REVIEW || status === REQUEST_RECEIPT_OCR_STATUS.FAILED) return "Requiere revisión";
  if (status === REQUEST_RECEIPT_OCR_STATUS.SUCCESS) return "Datos detectados";
  return "Lectura automática disponible";
}

function getReceiptStatusVariant(receiptReview?: RequestReceiptReview): "default" | "secondary" | "destructive" | "outline" {
  if (!receiptReview) return "outline";
  if (receiptReview.receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.POSSIBLE_DUPLICATE || receiptReview.duplicate_candidates.length > 0) return "destructive";
  if (receiptReview.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.REQUIRES_REVIEW || receiptReview.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.FAILED) return "secondary";
  if (receiptReview.receipt.confirmed_at || receiptReview.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.SUCCESS) return "default";
  return "outline";
}

function canConfirmReceiptReview(receiptReview: RequestReceiptReview): boolean {
  const receipt = receiptReview.receipt;
  return Boolean(
    !receipt.confirmed_at &&
    receipt.issuer_document_number &&
    receipt.series &&
    receipt.number &&
    receipt.issue_date &&
    receipt.amount !== null,
  );
}

function getReceiptReviewFormState(receiptReview: RequestReceiptReview): ReceiptReviewFormState {
  return {
    issuer_document_number: receiptReview.receipt.issuer_document_number ?? "",
    issuer_name: receiptReview.receipt.issuer_name ?? "",
    series: receiptReview.receipt.series ?? "",
    number: receiptReview.receipt.number ?? "",
    issue_date: receiptReview.receipt.issue_date ?? "",
    amount: receiptReview.receipt.amount === null ? "" : String(receiptReview.receipt.amount),
    currency: receiptReview.receipt.currency || REQUEST_CURRENCY.PEN,
  };
}

function getReceiptReviewPayload(formState: ReceiptReviewFormState): UpdateRequestReceiptReviewInput {
  const amount = Number(formState.amount);
  return {
    issuer_document_number: formState.issuer_document_number.trim(),
    issuer_name: formState.issuer_name.trim(),
    series: formState.series.trim().toUpperCase(),
    number: formState.number.trim(),
    issue_date: formState.issue_date,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency: formState.currency === REQUEST_CURRENCY.USD ? REQUEST_CURRENCY.USD : REQUEST_CURRENCY.PEN,
  };
}

function getReceiptValueSummary(receiptReview: RequestReceiptReview): string {
  const receipt = receiptReview.receipt;
  const serieNumber = [receipt.series, receipt.number].filter(Boolean).join("-") || "sin serie/número";
  const provider = receipt.issuer_name?.trim() || "proveedor no detectado";
  const amount = receipt.amount === null ? "monto no detectado" : `${receipt.currency} ${receipt.amount}`;
  return `${provider} · ${serieNumber} · ${amount}`;
}

export function RequestDocumentsCard({
  request,
  backendMissingMessages = [],
  readOnly = false,
  documents: controlledDocuments,
  documentsLoading,
  documentsError,
  onDocumentsChanged,
}: RequestDocumentsCardProps) {
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const canManage = canManageRequestDocuments(roleCode, request.status, request, user?.id);
  const canManageActions = canManage && !readOnly;
  const permissionMessage = getRequestDocumentPermissionMessage(roleCode, request.status, request, user?.id);
  const internalDocuments = useRequestDocuments(request.id);
  const documents = controlledDocuments ?? internalDocuments.documents;
  const isLoading = documentsLoading ?? internalDocuments.isLoading;
  const error = documentsError ?? internalDocuments.error;
  const refetch = onDocumentsChanged ?? internalDocuments.refetch;
  const { receipts, isLoading: receiptsLoading, error: receiptsError, refetch: refetchReceipts } = useRequestReceiptReviews(request.id);
  const { uploadDocument, isLoading: uploading } = useUploadRequestDocument();
  const { deleteDocument, isLoading: deleting } = useDeleteRequestDocument();
  const { updateReceiptReview, isLoading: updatingReceipt } = useUpdateRequestReceiptReview();
  const { confirmReceiptReview, isLoading: confirmingReceipt } = useConfirmRequestReceiptReview();
  const [category, setCategory] = useState<RequestDocumentCategory | "">(REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT);
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [receiptToReview, setReceiptToReview] = useState<RequestReceiptReview | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptReviewFormState | null>(null);
  const [activeUploadAction, setActiveUploadAction] = useState<DocumentUploadAction | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allocationGroups = request.allocations ?? [];
  const hasAllocationGroups = allocationGroups.length > 0;
  const requestLevelDocuments = getRequestLevelDocuments(documents);
  const checklist = hasAllocationGroups && request.request_type === REQUEST_TYPE.ADVANCE
    ? EMPTY_CHECKLIST
    : getRequiredDocumentChecklist(request.request_type, requestLevelDocuments);
  const optionalCategoryOptions = getOptionalDocumentCategoryOptions(checklist.items).filter((option) => !hasAllocationGroups || option.value !== REQUEST_DOCUMENT_CATEGORY.PXQ);
  const hasOptionalCategoryOptions = optionalCategoryOptions.length > 0;
  const acceptedFormatsLabel = category ? getRequestDocumentAcceptedFormatsLabel(category) : "selecciona una categoría";
  const uploadActionsDisabled = uploading || activeUploadAction !== null;

  useEffect(() => {
    if (optionalCategoryOptions.some((option) => option.value === category)) return;
    setCategory(getDefaultOptionalDocumentCategory(optionalCategoryOptions));
    setFile(null);
    setValidationError(null);
  }, [category, optionalCategoryOptions]);

  function handleFileChange(nextFile: File | null): void {
    setFile(nextFile);
    setValidationError(category ? validateRequestDocumentFile(nextFile, category) : "Selecciona una categoría para adjuntar el documento.");
    setSuccessMessage(null);
  }

  function handleCategoryChange(value: string): void {
    const nextCategory = value as RequestDocumentCategory;
    setCategory(nextCategory);
    setValidationError(validateRequestDocumentFile(file, nextCategory));
  }

  async function uploadSelectedFile(selectedFile: File, selectedCategory: RequestDocumentCategory, action: DocumentUploadAction, scope?: UploadScopeOptions): Promise<void> {
    const fileError = validateRequestDocumentFile(selectedFile, selectedCategory);
    if (fileError) {
      setValidationError(fileError);
      return;
    }

    try {
      setActiveUploadAction(action);
      setOperationError(null);
      await uploadDocument(request.id, { file: selectedFile, document_category: selectedCategory, ...scope });
      toast.success(REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE);
      setSuccessMessage(REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE);
      setFile(null);
      setValidationError(null);
      await Promise.all([refetch(), refetchReceipts()]);
    } catch (uploadError) {
      const message = getApiErrorMessage(uploadError);
      setOperationError(message);
      toast.error(message);
      await Promise.all([refetch(), refetchReceipts()]);
    } finally {
      setActiveUploadAction(null);
    }
  }

  async function handleUpload(): Promise<void> {
    if (!category) {
      setValidationError("Selecciona una categoría para adjuntar el documento.");
      return;
    }

    if (!file) {
      setValidationError(validateRequestDocumentFile(file, category));
      return;
    }

    await uploadSelectedFile(file, category, DOCUMENT_UPLOAD_ACTION.GENERIC);
  }

  function handleChecklistAttach(nextCategory: RequestDocumentCategory, nextFile: File): void {
    flushSync(() => {
      setCategory(nextCategory);
      setFile(nextFile);
      setSuccessMessage(null);
    });
    void uploadSelectedFile(nextFile, nextCategory, nextCategory);
  }

  function handleAllocationChecklistAttach(allocationId: string, nextCategory: RequestDocumentCategory, nextFile: File): void {
    void uploadSelectedFile(nextFile, nextCategory, `${nextCategory}:${allocationId}` as DocumentUploadAction, {
      scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
      request_allocation_id: allocationId,
    });
  }

  async function handleDelete(documentId: string): Promise<void> {
    try {
      setOperationError(null);
      await deleteDocument(request.id, documentId);
      toast.success("Documento eliminado correctamente");
      setDocumentToDelete(null);
      await Promise.all([refetch(), refetchReceipts()]);
    } catch (deleteError) {
      const message = getApiErrorMessage(deleteError);
      setOperationError(message);
      toast.error(message);
      await Promise.all([refetch(), refetchReceipts()]);
    }
  }

  function openReceiptReview(receiptReview: RequestReceiptReview): void {
    setReceiptToReview(receiptReview);
    setReceiptForm(getReceiptReviewFormState(receiptReview));
    setOperationError(null);
  }

  function closeReceiptReview(): void {
    setReceiptToReview(null);
    setReceiptForm(null);
  }

  function updateReceiptFormField(field: keyof ReceiptReviewFormState, value: string): void {
    setReceiptForm((current) => current ? { ...current, [field]: value } : current);
  }

  async function handleSaveReceiptReview(): Promise<void> {
    if (!receiptToReview || !receiptForm) return;
    try {
      setOperationError(null);
      await updateReceiptReview(request.id, receiptToReview.receipt.id, getReceiptReviewPayload(receiptForm));
      toast.success("Datos del comprobante actualizados");
      closeReceiptReview();
      await refetchReceipts();
    } catch (reviewError) {
      const message = getApiErrorMessage(reviewError);
      setOperationError(message);
      toast.error(message);
    }
  }

  async function handleConfirmReceiptReview(receiptReview: RequestReceiptReview): Promise<void> {
    try {
      setOperationError(null);
      await confirmReceiptReview(request.id, receiptReview.receipt.id);
      toast.success("Datos del comprobante confirmados");
      await refetchReceipts();
    } catch (confirmError) {
      const message = getApiErrorMessage(confirmError);
      setOperationError(message);
      toast.error(message);
    }
  }

  function renderDocumentRows(rows: RequestDocument[]): ReactNode {
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin documentos adjuntos.</p>;

    return (
      <div className="space-y-3">
        {rows.map((document) => {
          const documentWebUrl = getRequestDocumentWebUrl(document);
          const receiptReview = receipts.find((item) => item.receipt?.document_id === document.id);
          const shouldShowReceiptReview = document.document_category === REQUEST_DOCUMENT_CATEGORY.RECEIPT && (receiptsLoading || receiptReview);

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
                  {shouldShowReceiptReview && (
                    <div className="mt-2 rounded-md bg-muted p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getReceiptStatusVariant(receiptReview)}>{getReceiptStatusLabel(receiptReview)}</Badge>
                        <span className="text-muted-foreground">Lectura automática del comprobante</span>
                      </div>
                      {receiptReview ? (
                        <div className="mt-2 space-y-1 text-muted-foreground">
                          <p>{getReceiptValueSummary(receiptReview)}</p>
                          {receiptReview.receipt.issuer_document_number && <p>RUC: {receiptReview.receipt.issuer_document_number}</p>}
                          {receiptReview.receipt.issue_date && <p>Fecha: {receiptReview.receipt.issue_date}</p>}
                          {receiptReview.latest_extraction?.error_message && <p>Necesita revisión manual para completar la información.</p>}
                          {receiptReview.duplicate_candidates.length > 0 && <p>Ya existe un comprobante con la misma serie y número en otra solicitud activa.</p>}
                        </div>
                      ) : (
                        <p className="mt-2 text-muted-foreground">Estamos leyendo el comprobante para ayudarte a validar sus datos.</p>
                      )}
                    </div>
                  )}
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
                {receiptReview && canManageActions && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openReceiptReview(receiptReview)}>
                    Revisar datos
                  </Button>
                )}
                {receiptReview && canManageActions && canConfirmReceiptReview(receiptReview) && (
                  <Button type="button" size="sm" onClick={() => void handleConfirmReceiptReview(receiptReview)} disabled={confirmingReceipt}>
                    {confirmingReceipt ? "Confirmando..." : "Confirmar datos"}
                  </Button>
                )}
                {canManageActions && (
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
    );
  }

  function renderAllocationGroups(): ReactNode {
    if (!hasAllocationGroups) return null;

    return (
      <section className="space-y-3" data-testid="allocation-documents-groups">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Documentos por línea POA</h3>
          <p className="text-xs text-muted-foreground">Cada línea POA debe completar su propio Excel PxQ. Un archivo de una línea no completa otra línea.</p>
        </div>
        {allocationGroups.map((allocation, index) => {
          const allocationDocuments = getAllocationDocuments(allocation, documents);
          const allocationChecklist = getAllocationChecklist(allocation, allocationDocuments);
          const allocationId = allocation.id;

          return (
            <div key={allocationId ?? `${allocation.budget_planning_line_id}-${index}`} className="space-y-3 rounded-md border p-4" data-testid="allocation-documents-group">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Bloque {index + 1}: {getPlanningLineDisplay(allocation)}</h4>
                  <p className="text-xs text-muted-foreground">{getAllocationSummary(allocation)}</p>
                </div>
                <Badge variant={allocationChecklist.isComplete ? "secondary" : "destructive"}>{allocationChecklist.isComplete ? "Completo" : "Pendiente"}</Badge>
              </div>
              {!allocationId && canManageActions && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>Guarda el borrador y continúa para adjuntar el Excel PxQ de esta línea POA.</AlertDescription>
                </Alert>
              )}
              <div className="space-y-3">
                {allocationChecklist.items.map((item) => (
                  <div key={item.key} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      {item.satisfied ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : <XCircle className="mt-0.5 size-5 text-destructive" />}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.label}</p>
                          <Badge variant={item.satisfied ? "secondary" : "destructive"}>{item.satisfied ? "Adjunto" : "Pendiente"}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                        <p className="text-xs text-muted-foreground">Formatos esperados: {item.acceptedFormatsLabel}.</p>
                        {!item.satisfied && <p className="text-xs text-muted-foreground">{item.missingMessage}</p>}
                      </div>
                    </div>
                    {!item.satisfied && canManageActions && allocationId && (
                      <ChecklistAttachButton
                        item={item}
                        disabled={uploadActionsDisabled}
                        isUploading={activeUploadAction === `${item.category}:${allocationId}`}
                        onAttach={(nextCategory, nextFile) => handleAllocationChecklistAttach(allocationId, nextCategory, nextFile)}
                      />
                    )}
                  </div>
                ))}
              </div>
              {renderDocumentRows(allocationDocuments)}
            </div>
          );
        })}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos adjuntos</CardTitle>
        <CardDescription>
          {readOnly
            ? "Consulta los sustentos adjuntos y el estado del checklist. Para cambiar documentos, ingresa al flujo de edición del borrador."
            : "Adjunta sustentos en PDF, JPG, PNG y Excel cuando la categoría lo requiera. Podrás abrir los documentos compartidos cuando el acceso haya sido habilitado."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAllocationGroups && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Esta solicitud tiene líneas POA. Adjunta el Excel PxQ dentro del bloque correspondiente y usa documentos generales solo para sustentos de la solicitud.
            </AlertDescription>
          </Alert>
        )}
        {renderAllocationGroups()}
        <div className="rounded-md border p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Checklist de documentos generales</h3>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? "Estado de los documentos requeridos para esta solicitud. Esta vista no permite adjuntar ni eliminar archivos."
                : hasAllocationGroups
                  ? "Completa aquí solo los documentos requeridos a nivel general. Los Excel PxQ se adjuntan en cada línea POA."
                  : "Completa los documentos requeridos para continuar con el envío. La validación final se realizará al enviar la solicitud."}
            </p>
          </div>
          <div className="mt-3 space-y-3">
            {checklist.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay documentos obligatorios generales configurados para este tipo de solicitud.</p>
            ) : checklist.items.map((item) => (
              <div key={item.key} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
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
                {!item.satisfied && canManageActions && (
                  <ChecklistAttachButton
                    item={item}
                    disabled={uploadActionsDisabled}
                    isUploading={activeUploadAction === item.category}
                    onAttach={handleChecklistAttach}
                  />
                )}
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

        {canManageActions ? (
          <div className="rounded-md border p-4">
            <div className="mb-3 space-y-1">
              <h3 className="text-sm font-semibold">Otros documentos</h3>
              <p className="text-xs text-muted-foreground">Usa este cargador solo para documentos adicionales que no se solicitan en el checklist. Para documentos requeridos pendientes, usa el botón de su fila. Este cargador adjunta un archivo por vez.</p>
            </div>
            {hasOptionalCategoryOptions ? (
            <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="document-category">Categoría</label>
                <Select value={category} onValueChange={handleCategoryChange}>
                  <SelectTrigger id="document-category" disabled={uploadActionsDisabled}><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                  <SelectContent>
                    {optionalCategoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="request-document-file">Archivo</label>
                <Input
                  id="request-document-file"
                  ref={fileInputRef}
                  key={file ? "selected" : "empty"}
                  type="file"
                  accept={category ? getRequestDocumentAccept(category) : undefined}
                  disabled={uploadActionsDisabled}
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Máximo 10 MB. Formatos permitidos para esta categoría: {acceptedFormatsLabel}. Selecciona un solo archivo por carga.</p>
              </div>
              <Button type="button" onClick={() => void handleUpload()} disabled={uploadActionsDisabled || Boolean(validationError) || !file}>
                <Upload className="size-4" />
                {activeUploadAction === DOCUMENT_UPLOAD_ACTION.GENERIC ? "Subiendo..." : "Adjuntar"}
              </Button>
            </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay categorías opcionales disponibles por ahora. Completa los documentos requeridos desde el checklist.</p>
            )}
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
          <p className="text-sm text-muted-foreground">
            {readOnly ? "Vista de solo lectura: los documentos se gestionan desde el flujo de edición del borrador." : permissionMessage}
          </p>
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

        {receiptsError && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>No se pudo cargar la lectura automática de comprobantes. Puedes reintentar sin afectar los documentos adjuntos.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetchReceipts()}>Reintentar lectura</Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando documentos...</p>
        ) : (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Documentos generales</h3>
            {renderDocumentRows(requestLevelDocuments)}
          </section>
        )}
        <Dialog open={Boolean(receiptToReview)} onOpenChange={(open) => !open && closeReceiptReview()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revisar datos del comprobante</DialogTitle>
              <DialogDescription>
                Corrige los datos detectados por la lectura automática antes de continuar. No se cambia el archivo adjunto.
              </DialogDescription>
            </DialogHeader>
            {receiptForm && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-ruc">RUC</label>
                  <Input id="receipt-ruc" value={receiptForm.issuer_document_number} onChange={(event) => updateReceiptFormField("issuer_document_number", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-provider">Proveedor</label>
                  <Input id="receipt-provider" value={receiptForm.issuer_name} onChange={(event) => updateReceiptFormField("issuer_name", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-series">Serie</label>
                  <Input id="receipt-series" value={receiptForm.series} onChange={(event) => updateReceiptFormField("series", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-number">Número</label>
                  <Input id="receipt-number" value={receiptForm.number} onChange={(event) => updateReceiptFormField("number", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-date">Fecha</label>
                  <Input id="receipt-date" type="date" value={receiptForm.issue_date} onChange={(event) => updateReceiptFormField("issue_date", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-amount">Total</label>
                  <Input id="receipt-amount" type="number" min="0" step="0.01" value={receiptForm.amount} onChange={(event) => updateReceiptFormField("amount", event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="receipt-currency">Moneda</label>
                  <Select value={receiptForm.currency} onValueChange={(value) => updateReceiptFormField("currency", value)}>
                    <SelectTrigger id="receipt-currency"><SelectValue placeholder="Selecciona moneda" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REQUEST_CURRENCY.PEN}>Soles (PEN)</SelectItem>
                      <SelectItem value={REQUEST_CURRENCY.USD}>Dólares (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeReceiptReview} disabled={updatingReceipt}>Cancelar</Button>
              <Button type="button" onClick={() => void handleSaveReceiptReview()} disabled={updatingReceipt || !receiptForm}>
                {updatingReceipt ? "Guardando..." : "Guardar corrección"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
