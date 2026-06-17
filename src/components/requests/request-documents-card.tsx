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
import { getSafeDocumentUrl } from "@/lib/safe-url";
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
  REQUEST_DOCUMENT_UPLOAD_QUEUE_DELAY_MS,
  validateRequestDocumentFile,
  validateRequestDocumentBatch,
  isRetryableRequestDocumentUploadError,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_SCOPE_TYPE,
  REQUEST_DOCUMENT_UPLOAD_QUEUE_ERROR_KIND,
  REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS,
  REQUEST_RECEIPT_DUPLICATE_STATUS,
  REQUEST_RECEIPT_OCR_STATUS,
  REQUEST_STATUS,
  REXAN_OUTCOME,
  REQUEST_TYPE,
  type PaymentRequest,
  type RequestAllocation,
  type RequestAllocationRequiredDocumentItem,
  type RequestDocument,
  type RequestDocumentCategory,
  type RequestDocumentUploadQueueItem,
  type RequiredDocumentChecklistItem,
  type RequestReceiptReview,
  type UpdateRequestReceiptReviewInput,
} from "@/types/requests";

interface RequestDocumentsCardProps {
  request: PaymentRequest;
  guidanceAllocations?: RequestAllocation[];
  backendMissingMessages?: string[];
  readOnly?: boolean;
  structuredReportLocked?: boolean;
  documents?: RequestDocument[];
  documentsLoading?: boolean;
  documentsError?: Error | null;
  documentsResource?: ReturnType<typeof useRequestDocuments>;
  receiptsResource?: ReturnType<typeof useRequestReceiptReviews>;
  onDocumentsChanged?: () => Promise<void> | void;
  hideOptionalUploader?: boolean;
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
  return getSafeDocumentUrl(document.drive_web_url);
}

function getPendingRequiredDocumentCategories(checklist: RequiredDocumentChecklistItem[]): Set<RequestDocumentCategory> {
  return new Set(checklist.filter((item) => item.required && !item.satisfied).map((item) => item.category));
}

function getOptionalDocumentCategoryOptions(checklist: RequiredDocumentChecklistItem[]): typeof REQUEST_DOCUMENT_CATEGORY_OPTIONS {
  const pendingRequiredCategories = getPendingRequiredDocumentCategories(checklist);

  return REQUEST_DOCUMENT_CATEGORY_OPTIONS.filter((option) => !pendingRequiredCategories.has(option.value));
}

function getGenericDocumentCategoryOptions(checklist: RequiredDocumentChecklistItem[], excludeReturnProof: boolean): typeof REQUEST_DOCUMENT_CATEGORY_OPTIONS {
  const options = getOptionalDocumentCategoryOptions(checklist);
  if (!excludeReturnProof) return options;
  return options.filter((option) => option.value !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF);
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

function hasOpenReturnProofObservation(request: PaymentRequest): boolean {
  return Boolean(request.observations?.some((observation) => {
    if (observation.is_resolved) return false;
    const fieldReference = observation.field_reference?.toLowerCase() ?? "";
    const comment = observation.comment.toLowerCase();

    return fieldReference.includes("constancia de devolución") || comment.includes("constancia de devolución");
  }));
}

function isReturnProofFollowUpRequired(request: PaymentRequest, documents: RequestDocument[]): boolean {
  if (request.request_type !== REQUEST_TYPE.ADVANCE_SETTLEMENT || request.status !== REQUEST_STATUS.OBSERVED) {
    return false;
  }

  if ((request.allocations?.length ?? 0) > 0) {
    return false;
  }

  const existingReturnProof = documents.some((document) => document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF);
  if (existingReturnProof || request.rexan_return_proof_document_id) return false;

  return request.rexan_outcome === REXAN_OUTCOME.DEVOLUCION || hasOpenReturnProofObservation(request);
}

function getGeneralChecklist(request: PaymentRequest, requestLevelDocuments: RequestDocument[]): ReturnType<typeof getRequiredDocumentChecklist> {
  const checklist = getRequiredDocumentChecklist(request.request_type, requestLevelDocuments);
  if (!isReturnProofFollowUpRequired(request, requestLevelDocuments)) return checklist;

  return {
    ...checklist,
    items: [
      ...checklist.items,
      {
        key: "return-proof-follow-up",
        category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        label: "Constancia de devolución",
        description: "Adjunta la constancia solicitada para completar la aprobación de la devolución. Este documento no modifica el informe generado.",
        required: true,
        satisfied: false,
        acceptedFormatsLabel: getRequestDocumentAcceptedFormatsLabel(REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF),
        missingMessage: "Falta adjuntar la constancia de devolución solicitada.",
      },
    ],
    missingMessages: [...checklist.missingMessages, "Falta adjuntar la constancia de devolución solicitada."],
    isComplete: false,
  };
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

function getPlanningLineCode(allocation: RequestAllocation): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  return line?.line_code?.trim() || "Sin código";
}

function getCompactPlanningLineLabel(allocation: RequestAllocation, index: number): string {
  return `Línea ${index + 1} · ${getPlanningLineCode(allocation)}`;
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
  if (status === REQUEST_RECEIPT_OCR_STATUS.SUCCESS) return "Pendiente de confirmación";
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

function getQueueStatusLabel(item: RequestDocumentUploadQueueItem): string {
  if (item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.PENDING) return "Pendiente";
  if (item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.UPLOADING) return "Subiendo y procesando";
  if (item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.COMPLETED) return "Completado";
  if (item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.FAILED) return item.retryable ? "Falló · reintentar" : "No cargado";
  return "Retirado";
}

function getQueueStatusVariant(item: RequestDocumentUploadQueueItem): "default" | "secondary" | "destructive" | "outline" {
  if (item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.COMPLETED) return "default";
  if (item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.FAILED) return "destructive";
  if (item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.REMOVED) return "outline";
  return "secondary";
}

function toDateInputValue(value?: string | null): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

function getReceiptReviewFormState(receiptReview: RequestReceiptReview): ReceiptReviewFormState {
  return {
    issuer_document_number: receiptReview.receipt.issuer_document_number ?? "",
    issuer_name: receiptReview.receipt.issuer_name ?? "",
    series: receiptReview.receipt.series ?? "",
    number: receiptReview.receipt.number ?? "",
    issue_date: toDateInputValue(receiptReview.receipt.issue_date),
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
  guidanceAllocations = [],
  backendMissingMessages = [],
  readOnly = false,
  structuredReportLocked = false,
  documents: controlledDocuments,
  documentsLoading,
  documentsError,
  documentsResource,
  receiptsResource,
  onDocumentsChanged,
  hideOptionalUploader = false,
}: RequestDocumentsCardProps) {
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const effectiveStructuredReportLocked = structuredReportLocked && request.status !== REQUEST_STATUS.OBSERVED;
  const canManage = canManageRequestDocuments(roleCode, request.status, request, user?.id);
  const canManageActions = canManage && !readOnly && !effectiveStructuredReportLocked;
  const canManageReturnProofWhileLocked = canManage && !readOnly && effectiveStructuredReportLocked && request.status === REQUEST_STATUS.OBSERVED;
  const permissionMessage = getRequestDocumentPermissionMessage(roleCode, request.status, request, user?.id);
  const internalDocuments = useRequestDocuments(request.id);
  const effectiveDocumentsResource = documentsResource ?? internalDocuments;
  const documents = controlledDocuments ?? effectiveDocumentsResource.documents;
  const isLoading = documentsLoading ?? effectiveDocumentsResource.isLoading;
  const isRefreshingDocuments = effectiveDocumentsResource.isRefreshing;
  const error = documentsError ?? effectiveDocumentsResource.error;
  const refetch = onDocumentsChanged ?? (() => effectiveDocumentsResource.refetch({ background: true }));
  const internalReceipts = useRequestReceiptReviews(request.id);
  const effectiveReceiptsResource = receiptsResource ?? internalReceipts;
  const { receipts, isLoading: receiptsLoading, isRefreshing: receiptsRefreshing, error: receiptsError, refetch: refetchReceipts, upsertReceipt } = effectiveReceiptsResource;
  const { uploadDocument, isLoading: uploading } = useUploadRequestDocument();
  const { deleteDocument, isLoading: deleting } = useDeleteRequestDocument();
  const { updateReceiptReview, isLoading: updatingReceipt } = useUpdateRequestReceiptReview();
  const { confirmReceiptReview, isLoading: confirmingReceipt } = useConfirmRequestReceiptReview();
  const [category, setCategory] = useState<RequestDocumentCategory | "">(REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT);
  const [file, setFile] = useState<File | null>(null);
  const [uploadQueue, setUploadQueue] = useState<RequestDocumentUploadQueueItem[]>([]);
  const uploadQueueRef = useRef<RequestDocumentUploadQueueItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [receiptToReview, setReceiptToReview] = useState<RequestReceiptReview | null>(null);
  const [receiptToConfirm, setReceiptToConfirm] = useState<RequestReceiptReview | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptReviewFormState | null>(null);
  const [activeUploadAction, setActiveUploadAction] = useState<DocumentUploadAction | null>(null);
  const [uploadAllocationId, setUploadAllocationId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const operationErrorRef = useRef<HTMLDivElement>(null);
  const allocationGroups = request.allocations ?? [];
  const displayAllocationGroups = allocationGroups.length > 0 ? allocationGroups : guidanceAllocations;
  const isAdvanceSettlement = request.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT;
  const hasAllocationGroups = allocationGroups.length > 0;
  const hasDisplayAllocationGroups = displayAllocationGroups.length > 0;
  const isUsingGuidanceAllocations = isAdvanceSettlement && !hasAllocationGroups && guidanceAllocations.length > 0;
  const hasAllocationDocumentGroups = hasAllocationGroups && !isAdvanceSettlement;
  const requiresReceiptAllocation = isAdvanceSettlement && hasAllocationGroups && category === REQUEST_DOCUMENT_CATEGORY.RECEIPT;
  const requestLevelDocuments = getRequestLevelDocuments(documents);
  const requestLevelGeneralDocuments = requestLevelDocuments.filter((document) => document.document_category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF);
  const legacyUnscopedReturnProofs = requestLevelDocuments.filter((document) => document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF);
  const allocationReturnProofs = documents.filter((document) => document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF && document.request_allocation_id);
  const restrictGenericReturnProof = isAdvanceSettlement && hasDisplayAllocationGroups;
  const baseChecklist = hasAllocationGroups && request.request_type === REQUEST_TYPE.ADVANCE
    ? EMPTY_CHECKLIST
    : getGeneralChecklist(request, requestLevelDocuments);
  const checklist = restrictGenericReturnProof
    ? {
      ...baseChecklist,
      items: baseChecklist.items.filter((item) => item.category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF),
      missingMessages: baseChecklist.missingMessages.filter((message) => !message.toLowerCase().includes("constancia de devolución")),
      isComplete: baseChecklist.items.some((item) => item.category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF) ? baseChecklist.items.filter((item) => item.category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF).every((item) => !item.required || item.satisfied) : baseChecklist.isComplete,
    }
    : baseChecklist;
  const optionalCategoryOptions = getGenericDocumentCategoryOptions(checklist.items, restrictGenericReturnProof).filter((option) => !hasAllocationGroups || option.value !== REQUEST_DOCUMENT_CATEGORY.PXQ);
  const hasOptionalCategoryOptions = optionalCategoryOptions.length > 0;
  const acceptedFormatsLabel = category ? getRequestDocumentAcceptedFormatsLabel(category) : "selecciona una categoría";
  const uploadActionsDisabled = uploading || activeUploadAction !== null;
  const uploadRequiresAllocationSelection = requiresReceiptAllocation && !uploadAllocationId;
  const queuedActiveItems = uploadQueue.filter((item) => item.status !== REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.REMOVED);
  const queuedPendingItems = uploadQueue.filter((item) => item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.PENDING);
  const queuedCompletedCount = uploadQueue.filter((item) => item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.COMPLETED).length;
  const queuedFailedCount = uploadQueue.filter((item) => item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.FAILED).length;
  const uploadButtonDisabled = uploadActionsDisabled || isQueueRunning || Boolean(validationError) || queuedPendingItems.length === 0 || uploadRequiresAllocationSelection;
  const selectedUploadAllocation = allocationGroups.find((allocation) => allocation.id === uploadAllocationId) ?? null;

  useEffect(() => {
    if (optionalCategoryOptions.some((option) => option.value === category)) return;
    setCategory(getDefaultOptionalDocumentCategory(optionalCategoryOptions));
    setFile(null);
    setValidationError(null);
  }, [category, optionalCategoryOptions]);

  useEffect(() => {
    if (!operationError) return;
    operationErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    operationErrorRef.current?.focus({ preventScroll: true });
  }, [operationError]);

  function setQueue(nextQueue: RequestDocumentUploadQueueItem[]): void {
    uploadQueueRef.current = nextQueue;
    setUploadQueue(nextQueue);
  }

  function updateQueueItem(itemId: string, patch: Partial<RequestDocumentUploadQueueItem>): void {
    setQueue(uploadQueueRef.current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
  }

  function handleQueueFileChange(fileList: FileList | null): void {
    const selectedFiles = Array.from(fileList ?? []);
    setFile(selectedFiles[0] ?? null);
    setSuccessMessage(null);
    if (selectedFiles.length === 0) return;
    const activeCount = uploadQueueRef.current.filter((item) => item.status !== REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.REMOVED).length;
    const result = validateRequestDocumentBatch(selectedFiles, {
      category,
      requiresAllocation: requiresReceiptAllocation,
      requestAllocationId: uploadAllocationId,
      existingQueueCount: activeCount,
    });
    setQueue([...uploadQueueRef.current, ...result.accepted, ...result.rejected]);
    setValidationError(null);
  }

  function handleCategoryChange(value: string): void {
    const nextCategory = value as RequestDocumentCategory;
    setCategory(nextCategory);
    if (nextCategory !== REQUEST_DOCUMENT_CATEGORY.RECEIPT) setUploadAllocationId("");
    setQueue([]);
    setValidationError(validateRequestDocumentFile(file, nextCategory));
  }

  async function uploadSelectedFile(selectedFile: File, selectedCategory: RequestDocumentCategory, action: DocumentUploadAction, scope?: UploadScopeOptions): Promise<void> {
    if (effectiveStructuredReportLocked && selectedCategory !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF) return;
    const fileError = validateRequestDocumentFile(selectedFile, selectedCategory);
    if (fileError) {
      setValidationError(fileError);
      return;
    }

    try {
      setActiveUploadAction(action);
      setOperationError(null);
      const uploaded = await uploadDocument(request.id, { file: selectedFile, document_category: selectedCategory, ...scope });
      effectiveDocumentsResource.upsertDocument?.(uploaded);
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

    if (queuedPendingItems.length === 0) {
      setValidationError("Selecciona al menos un archivo válido para adjuntar.");
      return;
    }

    if (requiresReceiptAllocation && !uploadAllocationId) {
      setValidationError("Selecciona la línea POA a la que corresponde el comprobante.");
      return;
    }

    await processUploadQueue(queuedPendingItems.map((item) => item.id));
  }

  async function processUploadQueue(itemIds: string[]): Promise<void> {
    if (isQueueRunning) return;
    setIsQueueRunning(true);
    setActiveUploadAction(DOCUMENT_UPLOAD_ACTION.GENERIC);
    setOperationError(null);
    let completed = 0;
    let failed = 0;

    try {
      for (const [index, itemId] of itemIds.entries()) {
        const item = uploadQueueRef.current.find((candidate) => candidate.id === itemId);
        if (!item || item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.REMOVED) continue;
        updateQueueItem(itemId, { status: REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.UPLOADING, error_message: undefined });
        try {
          const uploaded = await uploadDocument(request.id, {
            file: item.file,
            document_category: item.document_category,
            scope_type: item.scope_type,
            request_allocation_id: item.request_allocation_id,
          });
          effectiveDocumentsResource.upsertDocument?.(uploaded);
          completed += 1;
          updateQueueItem(itemId, { status: REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.COMPLETED, retryable: false });
        } catch (uploadError) {
          failed += 1;
          const message = getApiErrorMessage(uploadError);
          const retryable = isRetryableRequestDocumentUploadError(uploadError);
          updateQueueItem(itemId, {
            status: REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.FAILED,
            error_kind: retryable ? REQUEST_DOCUMENT_UPLOAD_QUEUE_ERROR_KIND.TRANSIENT : REQUEST_DOCUMENT_UPLOAD_QUEUE_ERROR_KIND.BACKEND,
            error_message: message,
            retryable,
          });
        }
        if (index < itemIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, REQUEST_DOCUMENT_UPLOAD_QUEUE_DELAY_MS));
        }
      }
      await Promise.all([refetch(), refetchReceipts({ background: true })]);
      if (failed > 0) {
        setOperationError(`${failed} archivo${failed === 1 ? "" : "s"} no se pudieron adjuntar. Revisa la cola y reintenta los pendientes.`);
        toast.error("Algunos documentos no se pudieron adjuntar.");
      } else if (completed > 0) {
        setSuccessMessage(`${completed} documento${completed === 1 ? " adjuntado" : "s adjuntados"} correctamente.`);
        toast.success(`${completed} documento${completed === 1 ? " adjuntado" : "s adjuntados"} correctamente.`);
      }
      setFile(null);
      setValidationError(null);
    } finally {
      setIsQueueRunning(false);
      setActiveUploadAction(null);
    }
  }

  function removeQueueItem(itemId: string): void {
    const item = uploadQueueRef.current.find((candidate) => candidate.id === itemId);
    if (!item || item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.UPLOADING) return;
    updateQueueItem(itemId, { status: REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.REMOVED });
  }

  function retryQueueItem(itemId: string): void {
    const item = uploadQueueRef.current.find((candidate) => candidate.id === itemId);
    if (!item || !item.retryable || isQueueRunning) return;
    updateQueueItem(itemId, { status: REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.PENDING, error_message: undefined });
    void processUploadQueue([itemId]);
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
    const existingDocument = documents.find((document) => document.id === documentId);
    if (effectiveStructuredReportLocked && existingDocument?.document_category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF) return;
    try {
      setOperationError(null);
      await deleteDocument(request.id, documentId);
      effectiveDocumentsResource.removeDocument?.(documentId);
      toast.success("Documento eliminado correctamente");
      setDocumentToDelete(null);
      await Promise.all([refetch(), refetchReceipts({ background: true })]);
    } catch (deleteError) {
      const message = getApiErrorMessage(deleteError);
      setOperationError(message);
      toast.error(message);
      await Promise.all([refetch(), refetchReceipts({ background: true })]);
    }
  }

  function openReceiptReview(receiptReview: RequestReceiptReview): void {
    if (effectiveStructuredReportLocked) return;
    setReceiptToReview(receiptReview);
    setReceiptForm(getReceiptReviewFormState(receiptReview));
    setOperationError(null);
  }

  function closeReceiptReview(): void {
    setReceiptToReview(null);
    setReceiptForm(null);
  }

  function openReceiptConfirm(receiptReview: RequestReceiptReview): void {
    if (effectiveStructuredReportLocked) return;
    setReceiptToConfirm(receiptReview);
    setOperationError(null);
  }

  function closeReceiptConfirm(): void {
    setReceiptToConfirm(null);
  }

  function moveReceiptConfirmToReview(): void {
    if (!receiptToConfirm) return;
    const nextReceiptReview = receiptToConfirm;
    closeReceiptConfirm();
    openReceiptReview(nextReceiptReview);
  }

  function updateReceiptFormField(field: keyof ReceiptReviewFormState, value: string): void {
    setReceiptForm((current) => current ? { ...current, [field]: value } : current);
  }

  async function handleSaveReceiptReview(): Promise<void> {
    if (!receiptToReview || !receiptForm || effectiveStructuredReportLocked) return;
    try {
      setOperationError(null);
      const updatedReceipt = await updateReceiptReview(request.id, receiptToReview.receipt.id, getReceiptReviewPayload(receiptForm));
      upsertReceipt?.(updatedReceipt);
      toast.success("Datos del comprobante actualizados");
      closeReceiptReview();
      await refetchReceipts({ background: true });
    } catch (reviewError) {
      const message = getApiErrorMessage(reviewError);
      setOperationError(message);
      toast.error(message);
    }
  }

  async function handleConfirmReceiptReview(): Promise<void> {
    if (!receiptToConfirm || effectiveStructuredReportLocked) return;
    try {
      setOperationError(null);
      const confirmedReceipt = await confirmReceiptReview(request.id, receiptToConfirm.receipt.id);
      upsertReceipt?.(confirmedReceipt);
      toast.success("Datos del comprobante confirmados");
      closeReceiptConfirm();
      await refetchReceipts({ background: true });
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
                          {!receiptReview.receipt.confirmed_at && (
                            <p className="font-medium text-foreground">Confirma los datos para usar este comprobante en el Informe de rendición. Si algún valor no coincide, selecciona Revisar datos antes de confirmar.</p>
                          )}
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
                  <Button type="button" size="sm" onClick={() => openReceiptConfirm(receiptReview)} disabled={confirmingReceipt}>
                    {confirmingReceipt ? "Confirmando..." : "Confirmar datos"}
                  </Button>
                )}
                {(canManageActions || (canManageReturnProofWhileLocked && document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF)) && (
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
    if (!hasAllocationDocumentGroups) return null;

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

  function renderSettlementReceiptGroups(): ReactNode {
    if (!isAdvanceSettlement || !hasDisplayAllocationGroups) return null;

    return (
      <section className="space-y-3" data-testid="settlement-receipt-groups">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Comprobantes por línea POA</h3>
          <p className="text-xs text-muted-foreground">
            {isUsingGuidanceAllocations
              ? "Estas son las líneas POA del anticipo original como referencia mientras se actualizan las líneas de la rendición."
              : "Cada comprobante de la rendición debe pertenecer a una sola línea POA. Una línea puede tener uno o más comprobantes."}
          </p>
        </div>
        {displayAllocationGroups.map((allocation, index) => {
          const allocationDocuments = !isUsingGuidanceAllocations && allocation.id ? getAllocationDocuments(allocation, documents) : [];
          const receiptDocuments = allocationDocuments.filter((document) => document.document_category === REQUEST_DOCUMENT_CATEGORY.RECEIPT);
          const hasReceipts = receiptDocuments.length > 0;

          return (
            <div key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`} className="space-y-3 rounded-md border p-4" data-testid="settlement-receipt-group">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Línea {index + 1}: {getPlanningLineDisplay(allocation)}</h4>
                  <p className="text-xs text-muted-foreground">{getAllocationSummary(allocation)}</p>
                </div>
                <Badge variant={hasReceipts ? "secondary" : "destructive"}>{isUsingGuidanceAllocations ? "Referencia" : hasReceipts ? "Con comprobante" : "Pendiente"}</Badge>
              </div>
              {isUsingGuidanceAllocations ? <p className="text-sm text-muted-foreground">Cuando termine la actualización, adjunta el comprobante seleccionando esta línea POA en el cargador.</p> : renderDocumentRows(receiptDocuments)}
            </div>
          );
        })}
      </section>
    );
  }

  function renderReturnProofGroups(): ReactNode {
    if (!isAdvanceSettlement || !hasDisplayAllocationGroups) return null;

    return (
      <section className="space-y-3" data-testid="settlement-return-proof-groups">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Constancias de devolución por línea POA</h3>
          <p className="text-xs text-muted-foreground">Estas constancias se registran desde Saldos por línea POA con Registrar devolución. Solo una constancia asociada a la misma línea valida esa devolución.</p>
        </div>
        {displayAllocationGroups.map((allocation, index) => {
          const proofDocuments = allocation.id ? allocationReturnProofs.filter((document) => document.request_allocation_id === allocation.id) : [];
          return (
            <div key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`} className="space-y-3 rounded-md border p-4" data-testid="settlement-return-proof-group">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Línea {index + 1}: {getPlanningLineDisplay(allocation)}</h4>
                  <p className="text-xs text-muted-foreground">{getAllocationSummary(allocation)}</p>
                </div>
                <Badge variant={proofDocuments.length > 0 ? "secondary" : "outline"}>{proofDocuments.length > 0 ? "Con constancia" : "Sin constancia"}</Badge>
              </div>
              {renderDocumentRows(proofDocuments)}
            </div>
          );
        })}
        {legacyUnscopedReturnProofs.length > 0 ? (
          <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-amber-950 dark:text-amber-100">
              Estas constancias no están asociadas a una línea POA y no validan una devolución por línea. Vuelve a registrar la devolución desde Saldos por línea POA → Registrar devolución.
              <div className="mt-3">{renderDocumentRows(legacyUnscopedReturnProofs)}</div>
            </AlertDescription>
          </Alert>
        ) : null}
      </section>
    );
  }

  return (
    <Card id="documents">
      <CardHeader>
        <CardTitle>Documentos adjuntos</CardTitle>
        <CardDescription>
          {readOnly
            ? "Consulta los sustentos adjuntos y el estado del checklist. Para cambiar documentos, ingresa al flujo de edición del borrador."
            : "Adjunta sustentos en PDF, JPG, PNG y Excel cuando la categoría lo requiera. Podrás abrir los documentos compartidos cuando el acceso haya sido habilitado."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(isRefreshingDocuments || receiptsRefreshing) && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
            Actualizando documentos y lectura automática…
          </p>
        )}
        {isAdvanceSettlement && hasDisplayAllocationGroups && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {isUsingGuidanceAllocations
                ? "En esta rendición no debes volver a adjuntar los Excel PxQ del anticipo. Estamos actualizando las líneas de la rendición antes de asociar comprobantes."
                : "En esta rendición no debes volver a adjuntar los Excel PxQ del anticipo. Cada línea POA debe tener al menos un comprobante agregado al Informe de rendición; adjunta cada comprobante seleccionando su línea POA."}
            </AlertDescription>
          </Alert>
        )}
        {request.status === REQUEST_STATUS.OBSERVED && structuredReportLocked ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>La rendición fue observada; puedes actualizar sustentos y regenerar el informe antes de reenviar.</AlertDescription>
          </Alert>
        ) : null}
        {effectiveStructuredReportLocked ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {canManageReturnProofWhileLocked && isReturnProofFollowUpRequired(request, requestLevelDocuments)
                ? "El informe generado mantiene bloqueados comprobantes, eliminación y revisión de datos. Puedes adjuntar la constancia de devolución solicitada; este documento no modifica el informe generado."
                : "El informe generado bloquea la carga, eliminación y revisión de comprobantes. Si el informe es observado/reabierto o la generación falla, estas acciones volverán a estar disponibles."}
            </AlertDescription>
          </Alert>
        ) : null}
        {hasAllocationDocumentGroups && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Esta solicitud tiene líneas POA. Adjunta el Excel PxQ dentro del bloque correspondiente y usa documentos generales solo para sustentos de la solicitud.
            </AlertDescription>
          </Alert>
        )}
        {renderAllocationGroups()}
        {renderSettlementReceiptGroups()}
        {renderReturnProofGroups()}
        <div className="rounded-md border p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Checklist de documentos generales</h3>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? "Estado de los documentos requeridos para esta solicitud. Esta vista no permite adjuntar ni eliminar archivos."
                : isAdvanceSettlement && hasAllocationGroups
                  ? "No hay un comprobante general obligatorio. Los comprobantes se gestionan por línea POA y luego se agregan al Informe de rendición."
                : hasAllocationDocumentGroups
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
                {!item.satisfied && (canManageActions || (canManageReturnProofWhileLocked && item.category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF)) && (
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

        {!hideOptionalUploader && (canManageActions ? (
          <div className="rounded-md border p-4">
            <div className="mb-3 space-y-1">
              <h3 className="text-sm font-semibold">Otros documentos</h3>
              <p className="text-xs text-muted-foreground">Usa este cargador para documentos adicionales o comprobantes por línea POA. Puedes seleccionar hasta 20 archivos; se adjuntarán de uno en uno para mantener estable la carga.</p>
              {restrictGenericReturnProof ? <p className="text-xs text-amber-700 dark:text-amber-300">Las constancias de devolución se adjuntan desde Saldos por línea POA → Registrar devolución para que queden vinculadas a la línea correcta.</p> : null}
            </div>
            {hasOptionalCategoryOptions ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_minmax(220px,320px)_auto] xl:items-end">
              <div className="min-w-0 space-y-2">
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
                  multiple
                  accept={category ? getRequestDocumentAccept(category) : undefined}
                  disabled={uploadActionsDisabled}
                  onChange={(event) => { handleQueueFileChange(event.target.files); event.target.value = ""; }}
                />
                <p className="text-xs text-muted-foreground">Máximo 10 MB por archivo. Formatos permitidos: {acceptedFormatsLabel}. Máximo 20 archivos por tanda.</p>
              </div>
              {requiresReceiptAllocation && (
                <div className="min-w-0 space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-allocation">Línea POA</label>
                  <Select value={uploadAllocationId} onValueChange={(value) => { setUploadAllocationId(value); setQueue([]); setValidationError(null); }}>
                    <SelectTrigger id="receipt-allocation" className="max-w-full" disabled={uploadActionsDisabled}><SelectValue placeholder="Selecciona línea POA" /></SelectTrigger>
                    <SelectContent className="max-w-[min(92vw,28rem)]">
                      {allocationGroups.map((allocation, index) => allocation.id ? (
                        <SelectItem key={allocation.id} value={allocation.id} title={`Línea ${index + 1}: ${getPlanningLineDisplay(allocation)}`}>{getCompactPlanningLineLabel(allocation, index)}</SelectItem>
                      ) : null)}
                    </SelectContent>
                  </Select>
                  <p className="truncate text-xs text-muted-foreground" title={selectedUploadAllocation ? getPlanningLineDisplay(selectedUploadAllocation) : undefined}>
                    {selectedUploadAllocation ? getPlanningLineDisplay(selectedUploadAllocation) : "Selecciona la línea POA antes de adjuntar el comprobante."}
                  </p>
                </div>
              )}
              <Button type="button" className="md:self-end" onClick={() => void handleUpload()} disabled={uploadButtonDisabled}>
                <Upload className="size-4" />
                {isQueueRunning ? "Adjuntando..." : "Adjuntar"}
              </Button>
            </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay categorías opcionales disponibles por ahora. Completa los documentos requeridos desde el checklist.</p>
            )}
            {file && (
              <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Último archivo seleccionado</p>
                <p className="text-muted-foreground">
                  {file.name} · {formatRequestDocumentSize(file.size)} · {getRequestDocumentMimeLabel(file.type)}
                </p>
              </div>
            )}
            {queuedActiveItems.length > 0 && (
              <div className="mt-3 space-y-3 rounded-md border p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">Cola de carga</p>
                  <p className="text-xs text-muted-foreground">
                    {queuedCompletedCount} completado{queuedCompletedCount === 1 ? "" : "s"} · {queuedFailedCount} con incidencia · {queuedPendingItems.length} pendiente{queuedPendingItems.length === 1 ? "" : "s"}
                  </p>
                </div>
                {isQueueRunning && <p className="text-xs text-muted-foreground">Estamos adjuntando los archivos uno por uno. Puedes seguir viendo el avance aquí.</p>}
                <div className="space-y-2">
                  {queuedActiveItems.map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 rounded-md bg-muted p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{item.file.name}</p>
                          <Badge variant={getQueueStatusVariant(item)}>{getQueueStatusLabel(item)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatRequestDocumentSize(item.file.size)} · {getRequestDocumentCategoryLabel(item.document_category)}</p>
                        {item.error_message && <p className="text-xs text-destructive">{item.error_message}</p>}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.FAILED && item.retryable && (
                          <Button type="button" variant="outline" size="sm" disabled={isQueueRunning} onClick={() => retryQueueItem(item.id)}>Reintentar</Button>
                        )}
                        {(item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.PENDING || item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.FAILED) && (
                          <Button type="button" variant="outline" size="sm" disabled={isQueueRunning && item.status === REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS.PENDING} onClick={() => removeQueueItem(item.id)}>Retirar</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {validationError && <p className="mt-2 text-sm text-destructive">{validationError}</p>}
            {uploadRequiresAllocationSelection && !validationError && <p className="mt-2 text-sm text-muted-foreground">Selecciona la línea POA antes de adjuntar el comprobante.</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {readOnly ? "Vista de solo lectura: los documentos se gestionan desde el flujo de edición del borrador." : permissionMessage}
          </p>
        ))}

        {successMessage && (
          <Alert>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {operationError && !receiptToReview && !receiptToConfirm && (
          <div ref={operationErrorRef} tabIndex={-1} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Alert variant="destructive">
              <AlertDescription>{operationError}</AlertDescription>
            </Alert>
          </div>
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
              {!effectiveStructuredReportLocked ? <Button type="button" variant="outline" size="sm" onClick={() => void refetchReceipts()}>Reintentar lectura</Button> : null}
            </AlertDescription>
          </Alert>
        )}

        {isLoading && documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cargando documentos...</p>
        ) : (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Documentos generales</h3>
            {renderDocumentRows(requestLevelGeneralDocuments)}
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
                  <label className="text-sm font-medium" htmlFor="receipt-date">Fecha del comprobante</label>
                  <Input id="receipt-date" type="date" value={receiptForm.issue_date} aria-describedby="receipt-date-help" onChange={(event) => updateReceiptFormField("issue_date", event.target.value)} />
                  <p id="receipt-date-help" className="text-xs text-muted-foreground">Selecciona solo día, mes y año. No requiere hora.</p>
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
            {operationError && receiptToReview ? (
              <div ref={operationErrorRef} tabIndex={-1} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <Alert variant="destructive">
                  <AlertDescription>{operationError}. Conservamos este formulario abierto para que corrijas el comprobante sin perder contexto.</AlertDescription>
                </Alert>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeReceiptReview} disabled={updatingReceipt}>Cancelar</Button>
              <Button type="button" onClick={() => void handleSaveReceiptReview()} disabled={updatingReceipt || !receiptForm}>
                {updatingReceipt ? "Guardando..." : "Guardar corrección"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={Boolean(receiptToConfirm)} onOpenChange={(open) => !open && closeReceiptConfirm()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar datos del comprobante</DialogTitle>
              <DialogDescription>
                Esta confirmación es necesaria para que el comprobante pueda agregarse al Informe de rendición. Revisa el resumen y, si algo no coincide con el documento, usa Revisar datos antes de continuar.
              </DialogDescription>
            </DialogHeader>
            {receiptToConfirm && (
              <div className="space-y-3 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Pendiente de confirmación</Badge>
                  <span className="text-muted-foreground">Datos detectados por lectura automática</span>
                </div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Proveedor</dt><dd className="font-medium">{receiptToConfirm.receipt.issuer_name || "Proveedor no detectado"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">RUC</dt><dd className="font-medium">{receiptToConfirm.receipt.issuer_document_number || "RUC no detectado"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Comprobante</dt><dd className="font-medium">{[receiptToConfirm.receipt.series, receiptToConfirm.receipt.number].filter(Boolean).join("-") || "Serie y número no detectados"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Fecha</dt><dd className="font-medium">{receiptToConfirm.receipt.issue_date || "Fecha no detectada"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Monto</dt><dd className="font-medium">{receiptToConfirm.receipt.amount === null ? "Monto no detectado" : formatRequestCurrency(receiptToConfirm.receipt.amount, receiptToConfirm.receipt.currency || REQUEST_CURRENCY.PEN)}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">Después de confirmar, podrás seleccionar la línea POA y agregar este comprobante al Informe de rendición.</p>
              </div>
            )}
            {operationError && receiptToConfirm ? (
              <div ref={operationErrorRef} tabIndex={-1} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <Alert variant="destructive">
                  <AlertDescription>{operationError}. La confirmación sigue abierta para que revises los datos o vuelvas a intentarlo.</AlertDescription>
                </Alert>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeReceiptConfirm} disabled={confirmingReceipt}>Cancelar</Button>
              <Button type="button" variant="outline" onClick={moveReceiptConfirmToReview} disabled={confirmingReceipt}>Revisar datos</Button>
              <Button type="button" onClick={() => void handleConfirmReceiptReview()} disabled={confirmingReceipt || !receiptToConfirm}>
                {confirmingReceipt ? "Confirmando..." : "Confirmar para informe"}
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
