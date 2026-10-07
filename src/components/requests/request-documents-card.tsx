"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useRequestAnnualUit } from "@/hooks/use-request-currency";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useRequestDocumentUploadQueue,
  type RequestDocumentUploadQueueController,
} from "@/hooks/use-request-document-upload-queue";
import {
  useConfirmRequestReceiptReview,
  useDeleteRequestDocument,
  useRequestDocuments,
  useRequestReceiptReviews,
  useRetryRequestReceiptOcr,
  useResolveRequestReceiptDuplicate,
  useSupplierDocumentEvidence,
  useUpdateRequestReceiptReview,
  useUploadRequestDocument,
} from "@/hooks/use-requests";
import { ROLE_CODE } from "@/lib/constants";
import { api, ApiRequestError } from "@/lib/api-client";
import { getQueryCacheAuthNamespace } from "@/lib/query-cache";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import {
  REQUEST_DOCUMENT_UPLOAD_BATCH_STATE,
  REQUEST_DOCUMENT_UPLOAD_FILE_STATE,
} from "@/lib/request-document-upload-queue";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import { supplierContractRecommendation } from "@/lib/request-supplier-policy";
import {
  canManageRequestDocuments,
  formatRequestDateTime,
  formatRequestDocumentSize,
  getApiErrorMessage,
  getRequestDocumentCategoryLabel,
  getRequestDocumentAccept,
  getRequestDocumentAcceptedFormatsLabel,
  getRequestDocumentDisplayName,
  getOtherDocumentBusinessMetadata,
  getRequestDocumentMimeLabel,
  getRequestDocumentPermissionMessage,
  getRequestDocumentStorageProviderLabel,
  getRequestDocumentUploadStatusLabel,
  getRequiredDocumentChecklist,
  getPlannedRequestDocumentCategories,
  REQUEST_DOCUMENT_PRESENTATION_GROUP,
  REQUEST_DOCUMENT_PRESENTATION_GROUP_LABELS,
  formatRequestCurrency,
  REQUEST_DOCUMENT_CATEGORY_OPTIONS,
  REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE,
  validateRequestDocumentFile,
  validateOtherDocumentDisplayName,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_SCOPE_TYPE,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_RECEIPT_DUPLICATE_STATUS,
  REQUEST_RECEIPT_DUPLICATE_REVIEW_ACTION,
  type RequestReceiptDuplicateReviewAction,
  REQUEST_RECEIPT_OCR_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  SUPPLIER_DOCUMENT_ACTIVITY_STATE,
  SUPPLIER_DOCUMENT_ELIGIBILITY_STATE,
  SUPPLIER_DOCUMENT_PROJECTION_REASON,
  type PaymentRequest,
  type RequestAllocation,
  type RequestDocument,
  type RequestDocumentCategory,
  type RequiredDocumentChecklistItem,
  type RequestReceiptReview,
  type SupplierProjectedDocument,
  type UpdateRequestReceiptReviewInput,
} from "@/types/requests";
import { SettlementUploadFileRow } from "./settlement-preparation/settlement-upload-file-row";

import { RequestDocumentProvenanceBadge } from "./request-document-provenance-badge";

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
  supplierEvidenceResource?: ReturnType<typeof useSupplierDocumentEvidence>;
  onDocumentsChanged?: () => Promise<void> | void;
  hideOptionalUploader?: boolean;
  uploadQueue?: RequestDocumentUploadQueueController;
  hideUploadQueueMonitor?: boolean;
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

interface ReceiptCandidateViewerProps {
  review: RequestReceiptReview;
  onRefresh: () => Promise<unknown> | void;
}

interface CandidatePreview {
  url: string;
  mime: string;
  filename: string | null;
}

interface CandidatePreviewResource {
  controller: AbortController;
  url: string | null;
}

// Solo affordance de UX: el servidor vuelve a autorizar ambos comprobantes en cada lectura.
export function ReceiptCandidateViewer(props: ReceiptCandidateViewerProps) {
  const user = useAuthStore((state) => state.user);
  const role = user?.role?.code;
  const { review } = props;
  if (
    (role !== ROLE_CODE.GIOF_GESTOR && role !== ROLE_CODE.GIOF_MANAGER) ||
    !review.candidate_open_snapshot ||
    !/^[a-f0-9]{64}$/.test(review.candidate_open_snapshot) ||
    review.duplicate_candidates.length === 0
  ) {
    return null;
  }

  const identity = [
    getQueryCacheAuthNamespace(),
    user?.id,
    role,
    review.receipt.request_id,
    review.receipt.id,
    review.candidate_open_snapshot,
    ...review.duplicate_candidates.map((candidate) => candidate.receipt_id),
  ].join(":");
  return <ActiveReceiptCandidateViewer key={identity} {...props} />;
}

function ActiveReceiptCandidateViewer({
  review,
  onRefresh,
}: ReceiptCandidateViewerProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resource = useRef<CandidatePreviewResource | null>(null);

  function release(): void {
    resource.current?.controller.abort();
    if (resource.current?.url) URL.revokeObjectURL(resource.current.url);
    resource.current = null;
  }

  function close(): void {
    release();
    setOpen(false);
    setPreview(null);
    setError(null);
  }

  useEffect(() => {
    const namespace = getQueryCacheAuthNamespace();
    const actor = useAuthStore.getState().user;
    const unsubscribe = useAuthStore.subscribe(() => {
      const currentActor = useAuthStore.getState().user;
      if (
        getQueryCacheAuthNamespace() !== namespace ||
        !currentActor ||
        currentActor.id !== actor?.id ||
        currentActor.role?.code !== actor?.role?.code
      ) {
        close();
      }
    });
    return () => {
      unsubscribe();
      release();
    };
  }, []);

  async function showCandidate(candidateReceiptId: string): Promise<void> {
    release();
    setPreview(null);
    setError(null);
    setOpen(true);
    const controller = new AbortController();
    const current: CandidatePreviewResource = { controller, url: null };
    resource.current = current;
    const namespace = getQueryCacheAuthNamespace();
    const path = `/requests/${encodeURIComponent(review.receipt.request_id)}/receipts/${encodeURIComponent(review.receipt.id)}/candidates/${encodeURIComponent(candidateReceiptId)}/document?snapshot=${encodeURIComponent(review.candidate_open_snapshot!)}`;
    try {
      const result = await api.documentBlob(path, { signal: controller.signal });
      if (
        controller.signal.aborted ||
        resource.current !== current ||
        getQueryCacheAuthNamespace() !== namespace
      ) {
        return;
      }
      current.url = URL.createObjectURL(result.blob);
      setPreview({
        url: current.url,
        mime: result.blob.type,
        filename: result.filename,
      });
    } catch (caught) {
      if (
        controller.signal.aborted ||
        resource.current !== current ||
        getQueryCacheAuthNamespace() !== namespace
      ) {
        return;
      }
      release();
      const unavailable =
        caught instanceof ApiRequestError &&
        (caught.status === 403 || caught.status === 404);
      const message = unavailable
        ? "El comprobante candidato ya no está disponible o la revisión cambió. Actualiza la revisión e intenta nuevamente."
        : "No se pudo abrir el comprobante candidato. Solo se admiten PDF, JPEG o PNG. Intenta nuevamente.";
      setError(message);
      toast.error(message);
      if (unavailable) {
        void Promise.resolve().then(onRefresh).catch(() => undefined);
      }
    }
  }

  return (
    <>
      {review.duplicate_candidates.map((candidate, index) => (
        <div key={candidate.receipt_id} className="mt-2">
          {review.duplicate_candidates.length > 1 && <p>Candidato {index + 1}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void showCandidate(candidate.receipt_id)}
          >
            Ver comprobante candidato
          </Button>
        </div>
      ))}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Comprobante candidato</DialogTitle>
            <DialogDescription>
              Consulta del comprobante relacionado. Esta vista no confirma ni
              adjudica un duplicado.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert">{error}</p>
          ) : preview ? (
            <>
              {preview.filename && (
                <p className="break-words">{preview.filename}</p>
              )}
              {preview.mime === "application/pdf" ? (
                <iframe
                  title="Vista del comprobante candidato"
                  src={preview.url}
                  className="h-[60vh] w-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <img
                  alt="Comprobante candidato"
                  src={preview.url}
                  className="max-h-[60vh] w-full object-contain"
                />
              )}
            </>
          ) : (
            <p role="status">Cargando comprobante candidato…</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cerrar comprobante candidato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReceiptDuplicateSummary({ review }: { review: RequestReceiptReview }) {
  const decision = review.duplicate_resolution;
  if (!decision) {
    return review.receipt.duplicate_status ===
      REQUEST_RECEIPT_DUPLICATE_STATUS.DUPLICATE_CONFIRMED ? (
      <p>
        Duplicado confirmado. El archivo se conserva y no es evidencia financiera.
        Detalle de decisión no disponible.
      </p>
    ) : null;
  }
  return (
    <div className="space-y-1 text-sm">
      <p>
        {decision.action === REQUEST_RECEIPT_DUPLICATE_REVIEW_ACTION.NOT_DUPLICATE
          ? "No es duplicado"
          : "Duplicado confirmado"} · {formatRequestDateTime(decision.decided_at)}
      </p>
      <p className="break-words">{decision.actor_role} · {decision.actor_id}</p>
      <p className="break-words">{decision.reason}</p>
      <p>
        {decision.fresh
          ? decision.action === REQUEST_RECEIPT_DUPLICATE_REVIEW_ACTION.NOT_DUPLICATE
            ? review.receipt.confirmed_at
              ? "Decisión vigente. Datos del comprobante confirmados."
              : "La decisión no aprueba el comprobante. Revisa los datos y realiza una nueva confirmación separada."
            : "El archivo se conserva y no es evidencia financiera."
          : "La revisión cambió. La decisión anterior ya no está vigente; actualiza y revisa nuevamente."}
      </p>
    </div>
  );
}

interface ReceiptDuplicateDecisionProps {
  review: RequestReceiptReview;
  onUpdated: (review: RequestReceiptReview) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}

// Se monta dentro de la revisión existente. Roles y flags son UX, nunca autoridad.
function ReceiptDuplicateDecision({
  review,
  onUpdated,
  onBusyChange,
  disabled,
}: ReceiptDuplicateDecisionProps) {
  const [current, setCurrent] = useState<RequestReceiptReview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const rejectedSnapshot = useRef<string | undefined>(undefined);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;
  const { resolveReceiptDuplicate } = useResolveRequestReceiptDuplicate();
  const requestId = review.receipt.request_id;
  const receiptId = review.receipt.id;

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  async function refresh(previousSnapshot?: string): Promise<void> {
    if (previousSnapshot) rejectedSnapshot.current = previousSnapshot;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setCurrent(null);
    setBusy(true);
    try {
      const fresh = await api.get<RequestReceiptReview>(
        `/requests/${encodeURIComponent(requestId)}/receipts/${encodeURIComponent(receiptId)}`,
        { signal: next.signal, cache: "no-store" },
      );
      if (next.signal.aborted) return;
      if (fresh.can_resolve_duplicate !== true) setReason("");
      // A failed mutation cannot reuse the rejected token, even if a cached server response repeats it.
      setCurrent(
        rejectedSnapshot.current &&
          fresh.duplicate_review_snapshot === rejectedSnapshot.current
          ? { ...fresh, can_resolve_duplicate: false }
          : fresh,
      );
      onUpdatedRef.current(fresh);
    } catch (cause) {
      if (!next.signal.aborted) setError(getApiErrorMessage(cause));
    } finally {
      if (!next.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    const actor = useAuthStore.getState().user;
    const namespace = getQueryCacheAuthNamespace();
    const unsubscribe = useAuthStore.subscribe(() => {
      const next = useAuthStore.getState().user;
      if (
        next?.id !== actor?.id ||
        next?.role?.code !== actor?.role?.code ||
        getQueryCacheAuthNamespace() !== namespace
      ) {
        controller.current?.abort();
        setCurrent(null);
        setReason("");
      }
    });
    return () => {
      unsubscribe();
      controller.current?.abort();
    };
    // Identity is also keyed by the parent; changing a snapshot must not reset the reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, receiptId]);

  const validReason = reason.trim().length >= 10 && reason.trim().length <= 1000;
  const canResolve =
    current?.can_resolve_duplicate === true &&
    /^[a-f0-9]{64}$/.test(current.duplicate_review_snapshot ?? "");

  async function resolve(
    action: RequestReceiptDuplicateReviewAction,
  ): Promise<void> {
    if (!current || !canResolve || !validReason || busy || disabled) return;
    const next = new AbortController();
    controller.current?.abort();
    controller.current = next;
    setBusy(true);
    setError(null);
    const snapshot = current.duplicate_review_snapshot!;
    try {
      const result = await resolveReceiptDuplicate(
        requestId,
        receiptId,
        { action, reason, snapshot },
        next.signal,
      );
      if (next.signal.aborted) return;
      setCurrent(result);
      onUpdatedRef.current(result);
    } catch (cause) {
      if (next.signal.aborted) return;
      setCurrent(null);
      setError(getApiErrorMessage(cause));
      // Only GET refresh. Never silently retry or accept the decision.
      await refresh(snapshot);
    } finally {
      if (!next.signal.aborted) setBusy(false);
    }
  }

  return (
    <section
      className="space-y-3 rounded-md border p-3"
      aria-label="Revisión de duplicado"
    >
      <ReceiptDuplicateSummary review={current ?? review} />
      {current && (
        <ReceiptCandidateViewer review={current} onRefresh={() => refresh()} />
      )}
      {busy && <p role="status">Actualizando revisión…</p>}
      {error && (
        <p role="alert">
          {error}. Actualiza la revisión antes de decidir nuevamente.
        </p>
      )}
      {canResolve && (
        <>
          <label htmlFor="receipt-duplicate-reason">Motivo de la decisión</label>
          <Input
            id="receipt-duplicate-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-describedby="receipt-duplicate-reason-help"
            disabled={busy || disabled}
          />
          <p id="receipt-duplicate-reason-help" className="text-sm">
            Obligatorio: entre 10 y 1000 caracteres, sin espacios al inicio o final.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!validReason || busy || disabled}
              onClick={() => void resolve(REQUEST_RECEIPT_DUPLICATE_REVIEW_ACTION.NOT_DUPLICATE)}
            >
              No es duplicado
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!validReason || busy || disabled}
              onClick={() => void resolve(REQUEST_RECEIPT_DUPLICATE_REVIEW_ACTION.DUPLICATE_CONFIRMED)}
            >
              Duplicado confirmado
            </Button>
          </div>
        </>
      )}
      {!busy && !canResolve && (
        <p>Sin autorización vigente para resolver el duplicado.</p>
      )}
      {!busy && (
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          Actualizar revisión de duplicado
        </Button>
      )}
    </section>
  );
}

interface ChecklistAttachButtonProps {
  item: RequiredDocumentChecklistItem;
  disabled: boolean;
  isUploading: boolean;
  onAttach: (category: RequestDocumentCategory, file: File) => void;
}

type DocumentUploadAction = string;

const UPLOAD_CONTEXT_CHANGE_KIND = {
  CATEGORY: "category",
  ALLOCATION: "allocation",
} as const;

type UploadContextChangeKind =
  (typeof UPLOAD_CONTEXT_CHANGE_KIND)[keyof typeof UPLOAD_CONTEXT_CHANGE_KIND];

interface PendingUploadContextChange {
  kind: UploadContextChangeKind;
  value: string;
}

interface UploadScopeOptions {
  scope_type?: typeof REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION;
  request_allocation_id?: string;
}

function ChecklistAttachButton({
  item,
  disabled,
  isUploading,
  onAttach,
}: ChecklistAttachButtonProps) {
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
        tabIndex={-1}
        accept={getRequestDocumentAccept(item.category)}
        aria-label={`Seleccionar ${item.label}`}
        disabled={disabled}
        onChange={handleInputChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 min-w-11 max-w-full self-start sm:self-center"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {isUploading ? "Subiendo..." : `Adjuntar ${item.label}`}
      </Button>
    </>
  );
}

function getRequestDocumentWebUrl(document: RequestDocument): string | null {
  return getSafeDocumentUrl(document.drive_web_url);
}

function getDocumentBusinessName(
  document: RequestDocument,
): string {
  if (document.document_category === REQUEST_DOCUMENT_CATEGORY.OTHER)
    return getOtherDocumentBusinessMetadata(document).displayName;
  return getRequestDocumentDisplayName(document);
}

function getSupplierDocumentStatusText(
  document: SupplierProjectedDocument,
): string {
  const activity =
    document.activity_state === SUPPLIER_DOCUMENT_ACTIVITY_STATE.ACTIVE
      ? "Activo"
      : "Inactivo";
  const eligibility =
    document.eligibility_state === SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.ELIGIBLE
      ? "Cuenta para el requisito."
      : "No cuenta para el requisito.";

  const reasonByCode: Record<
    NonNullable<SupplierProjectedDocument["reason_code"]>,
    string
  > = {
    [SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED]:
      "Falta un documento principal válido.",
    [SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_INELIGIBLE]:
      "El documento no cumple los requisitos.",
    [SUPPLIER_DOCUMENT_PROJECTION_REASON.REQUEST_OWNERSHIP_MISMATCH]:
      "El documento no pertenece a esta solicitud.",
    [SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_DELETED]:
      "El documento fue eliminado.",
    [SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_NOT_PERMANENT]:
      "Aún no terminó de guardarse.",
    [SUPPLIER_DOCUMENT_PROJECTION_REASON.CATEGORY_NOT_PRIMARY]:
      "Es un documento complementario.",
  };
  const reason = document.reason_code
    ? reasonByCode[document.reason_code]
    : document.eligible
      ? "Documento válido."
      : "Estado pendiente de confirmación.";

  return `${activity} · ${eligibility} ${reason}`;
}

const RECEIPT_DOCUMENT_CATEGORIES = new Set<string>([
  REQUEST_DOCUMENT_CATEGORY.RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.INVOICE,
  REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
]);

const REIMBURSEMENT_RECEIPT_CHOICES = [
  REQUEST_DOCUMENT_CATEGORY.RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.INVOICE,
  REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
] as const;

interface SupplierDocumentCategoryCard {
  category: RequestDocumentCategory;
  label: string;
  formats: string;
  supportsOcr?: boolean;
}

const SUPPLIER_PRIMARY_DOCUMENT_CARDS: readonly SupplierDocumentCategoryCard[] =
  [
    {
      category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
      label: "Factura",
      formats: "PDF, JPG, JPEG o PNG",
      supportsOcr: true,
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT,
      label: "Recibo por honorarios",
      formats: "PDF, JPG, JPEG o PNG",
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
      label: "Boleta",
      formats: "PDF, JPG, JPEG o PNG",
      supportsOcr: true,
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
      label: "Recibo de caja",
      formats: "PDF, JPG, JPEG o PNG",
    },
  ];

const SUPPLIER_COMPLEMENTARY_DOCUMENT_CARDS: readonly SupplierDocumentCategoryCard[] =
  [
    {
      category: REQUEST_DOCUMENT_CATEGORY.QUOTATION,
      label: "Cotización",
      formats: "PDF, JPG, JPEG o PNG",
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.CONTRACT,
      label: "Contrato o convenio",
      formats: "PDF",
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.EVIDENCE,
      label: "Evidencias",
      formats: "PDF, JPG, JPEG, PNG, XLSX, DOCX, RAR o ZIP",
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.FOURTH_CATEGORY_SUSPENSION,
      label: "Suspensión de 4ta categoría",
      formats: "PDF",
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET,
      label: "Planilla de movilidad",
      formats: "PDF o XLSX",
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION,
      label: "Declaración Jurada",
      formats: "PDF, XLSX o DOCX",
    },
    {
      category: REQUEST_DOCUMENT_CATEGORY.OTHER,
      label: "Otros documentos",
      formats: "PDF, JPG, JPEG, PNG, XLSX, DOCX, RAR o ZIP",
    },
  ];

function getPendingRequiredDocumentCategories(
  checklist: RequiredDocumentChecklistItem[],
): Set<RequestDocumentCategory> {
  return new Set(
    checklist
      .filter((item) => item.required && !item.satisfied)
      .map((item) => item.category),
  );
}

function getOptionalDocumentCategoryOptions(
  checklist: RequiredDocumentChecklistItem[],
): typeof REQUEST_DOCUMENT_CATEGORY_OPTIONS {
  const pendingRequiredCategories =
    getPendingRequiredDocumentCategories(checklist);

  return REQUEST_DOCUMENT_CATEGORY_OPTIONS.filter(
    (option) => !pendingRequiredCategories.has(option.value),
  );
}

function getGenericDocumentCategoryOptions(
  checklist: RequiredDocumentChecklistItem[],
  excludedCategories: Set<RequestDocumentCategory>,
): typeof REQUEST_DOCUMENT_CATEGORY_OPTIONS {
  const options = getOptionalDocumentCategoryOptions(checklist);
  if (excludedCategories.size === 0) return options;
  return options.filter((option) => !excludedCategories.has(option.value));
}

function getDefaultOptionalDocumentCategory(
  options: readonly { value: RequestDocumentCategory; label: string }[],
): RequestDocumentCategory | "" {
  return (
    options.find(
      (option) => option.value === REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT,
    )?.value ??
    options[0]?.value ??
    ""
  );
}

function isAllocationScopedDocument(document: RequestDocument): boolean {
  return (
    document.scope_type === REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION ||
    Boolean(document.request_allocation_id)
  );
}

function getRequestLevelDocuments(
  documents: RequestDocument[],
): RequestDocument[] {
  return documents.filter((document) => !isAllocationScopedDocument(document));
}

function getAllocationDocuments(
  allocation: RequestAllocation,
  documents: RequestDocument[],
): RequestDocument[] {
  const directDocuments = allocation.documents ?? [];
  if (!allocation.id) return directDocuments;

  const scopedDocuments = documents.filter(
    (document) => document.request_allocation_id === allocation.id,
  );
  const byId = new Map<string, RequestDocument>();
  [...directDocuments, ...scopedDocuments].forEach((document) =>
    byId.set(document.id, document),
  );

  return Array.from(byId.values());
}

function getPlanningLineDisplay(allocation: RequestAllocation): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  const code = line?.line_code?.trim();
  const description = line?.resource_description?.trim();

  return (
    [code, description].filter(Boolean).join(" · ") || "Línea POA sin detalle"
  );
}

function getPlanningLineCode(allocation: RequestAllocation): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  return line?.line_code?.trim() || "Sin código";
}

function getCompactPlanningLineLabel(
  allocation: RequestAllocation,
  index: number,
): string {
  return `Línea ${index + 1} · ${getPlanningLineCode(allocation)}`;
}

function getAllocationSummary(allocation: RequestAllocation): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  const orgUnit = allocation.org_unit ?? line?.org_unit ?? null;
  const fiscalYear = allocation.fiscal_year ?? line?.fiscal_year?.year ?? null;
  const parts = [
    orgUnit?.name ? `Unidad: ${orgUnit.name}` : null,
    fiscalYear ? `Año fiscal: ${fiscalYear}` : null,
    `Monto: ${formatRequestCurrency(Number(allocation.amount ?? 0), allocation.currency ?? null)}`,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

function getAllocationChecklist(): ReturnType<
  typeof getRequiredDocumentChecklist
> {
  return {
    items: [],
    conditionalNotes: [],
    missingMessages: [],
    isComplete: true,
  };
}

function getReceiptStatusLabel(receiptReview?: RequestReceiptReview): string {
  if (!receiptReview) return "Procesando comprobante";
  if (receiptReview.receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.DUPLICATE_CONFIRMED)
    return "Duplicado confirmado · no financiero";
  if (receiptReview.receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.NOT_DUPLICATE_REVIEWED)
    return receiptReview.duplicate_resolution?.fresh === true
      ? receiptReview.receipt.confirmed_at ? "Comprobante registrado" : "No es duplicado · pendiente de nueva confirmación"
      : "Decisión de duplicado no vigente";
  if (
    receiptReview.receipt.duplicate_status ===
    REQUEST_RECEIPT_DUPLICATE_STATUS.POSSIBLE_DUPLICATE
  )
    return "Comprobante duplicado por revisar";
  if (receiptReview.duplicate_candidates.length > 0)
    return "Comprobante duplicado por revisar";
  if (receiptReview.receipt.confirmed_at) return "Comprobante registrado";

  const status = receiptReview.receipt.ocr_status;
  if (
    status === REQUEST_RECEIPT_OCR_STATUS.PENDING ||
    status === REQUEST_RECEIPT_OCR_STATUS.PROCESSING
  )
    return "Procesando comprobante";
  if (
    status === REQUEST_RECEIPT_OCR_STATUS.REQUIRES_REVIEW ||
    status === REQUEST_RECEIPT_OCR_STATUS.FAILED
  )
    return "Requiere revisión";
  if (status === REQUEST_RECEIPT_OCR_STATUS.SUCCESS)
    return "Pendiente de confirmación";
  return "Lectura automática disponible";
}

function getReceiptStatusVariant(
  receiptReview?: RequestReceiptReview,
): "default" | "secondary" | "destructive" | "outline" {
  if (!receiptReview) return "outline";
  if (receiptReview.receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.DUPLICATE_CONFIRMED)
    return "destructive";
  if (receiptReview.receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.NOT_DUPLICATE_REVIEWED)
    return receiptReview.duplicate_resolution?.fresh === true ? "secondary" : "destructive";
  if (
    receiptReview.receipt.duplicate_status ===
      REQUEST_RECEIPT_DUPLICATE_STATUS.POSSIBLE_DUPLICATE ||
    receiptReview.duplicate_candidates.length > 0
  )
    return "destructive";
  if (
    receiptReview.receipt.ocr_status ===
      REQUEST_RECEIPT_OCR_STATUS.REQUIRES_REVIEW ||
    receiptReview.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.FAILED
  )
    return "secondary";
  if (
    receiptReview.receipt.confirmed_at ||
    receiptReview.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.SUCCESS
  )
    return "default";
  return "outline";
}

function canConfirmReceiptReview(receiptReview: RequestReceiptReview): boolean {
  const receipt = receiptReview.receipt;
  if (receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.DUPLICATE_CONFIRMED ||
      receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.POSSIBLE_DUPLICATE ||
      (receiptReview.duplicate_candidates.length > 0 && receipt.duplicate_status !== REQUEST_RECEIPT_DUPLICATE_STATUS.NOT_DUPLICATE_REVIEWED) ||
      (receipt.duplicate_status === REQUEST_RECEIPT_DUPLICATE_STATUS.NOT_DUPLICATE_REVIEWED &&
       (receiptReview.duplicate_resolution?.action !== REQUEST_RECEIPT_DUPLICATE_REVIEW_ACTION.NOT_DUPLICATE ||
        receiptReview.duplicate_resolution.fresh !== true))) return false;
  return Boolean(
    !receipt.confirmed_at &&
    receipt.issuer_document_number &&
    receipt.series &&
    receipt.number &&
    receipt.issue_date &&
    receipt.amount !== null &&
    (receipt.currency === REQUEST_CURRENCY.PEN ||
      receipt.currency === REQUEST_CURRENCY.USD),
  );
}

function toDateInputValue(value?: string | null): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

function getReceiptReviewFormState(
  receiptReview: RequestReceiptReview,
): ReceiptReviewFormState {
  return {
    issuer_document_number: receiptReview.receipt.issuer_document_number ?? "",
    issuer_name: receiptReview.receipt.issuer_name ?? "",
    series: receiptReview.receipt.series ?? "",
    number: receiptReview.receipt.number ?? "",
    issue_date: toDateInputValue(receiptReview.receipt.issue_date),
    amount:
      receiptReview.receipt.amount === null
        ? ""
        : String(receiptReview.receipt.amount),
    currency:
      receiptReview.receipt.currency === REQUEST_CURRENCY.PEN ||
      receiptReview.receipt.currency === REQUEST_CURRENCY.USD
        ? receiptReview.receipt.currency
        : "",
  };
}

function getReceiptReviewPayload(
  formState: ReceiptReviewFormState,
): UpdateRequestReceiptReviewInput {
  const amount = Number(formState.amount);
  return {
    issuer_document_number: formState.issuer_document_number.trim(),
    issuer_name: formState.issuer_name.trim(),
    series: formState.series.trim().toUpperCase(),
    number: formState.number.trim(),
    issue_date: formState.issue_date,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency:
      formState.currency === REQUEST_CURRENCY.USD
        ? REQUEST_CURRENCY.USD
        : formState.currency === REQUEST_CURRENCY.PEN
          ? REQUEST_CURRENCY.PEN
          : undefined,
  };
}

function getReceiptValueSummary(receiptReview: RequestReceiptReview): string {
  const receipt = receiptReview.receipt;
  const serieNumber =
    [receipt.series, receipt.number].filter(Boolean).join("-") ||
    "sin serie/número";
  const provider = receipt.issuer_name?.trim() || "proveedor no detectado";
  const amount =
    receipt.amount === null
      ? "monto no detectado"
      : receipt.currency === "PEN" || receipt.currency === "USD"
        ? `${receipt.currency} ${receipt.amount}`
        : `${receipt.amount} · Moneda pendiente de resolución`;
  return `${provider} · ${serieNumber} · ${amount}`;
}

function getReceiptConfirmationLabel(
  requestType: PaymentRequest["request_type"],
  document: RequestDocument | undefined,
): string {
  if (requestType === REQUEST_TYPE.ADVANCE_SETTLEMENT)
    return "Confirmar para informe";
  if (requestType !== REQUEST_TYPE.SUPPLIER_PAYMENT)
    return "Confirmar comprobante";
  const category = document?.document_category_normalized ?? document?.document_category;
  if (category === REQUEST_DOCUMENT_CATEGORY.INVOICE) return "Confirmar Factura";
  if (category === REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT)
    return "Confirmar Boleta";
  return "Confirmar comprobante";
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
  supplierEvidenceResource,
  onDocumentsChanged,
  hideOptionalUploader = false,
  uploadQueue: injectedUploadQueue,
  hideUploadQueueMonitor = false,
}: RequestDocumentsCardProps) {
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const effectiveStructuredReportLocked =
    structuredReportLocked && request.status !== REQUEST_STATUS.OBSERVED;
  const canManage = canManageRequestDocuments(
    roleCode,
    request.status,
    request,
    user?.id,
  );
  const canManageActions =
    canManage && !readOnly && !effectiveStructuredReportLocked;
  const canManageReturnProofWhileLocked =
    canManage &&
    !readOnly &&
    effectiveStructuredReportLocked &&
    request.status === REQUEST_STATUS.OBSERVED;
  const permissionMessage = getRequestDocumentPermissionMessage(
    roleCode,
    request.status,
    request,
    user?.id,
  );
  const internalDocuments = useRequestDocuments(request.id, {
    enabled: !documentsResource,
  });
  const effectiveDocumentsResource = documentsResource ?? internalDocuments;
  const documents = controlledDocuments ?? effectiveDocumentsResource.documents;
  const isLoading = documentsLoading ?? effectiveDocumentsResource.isLoading;
  const isRefreshingDocuments = effectiveDocumentsResource.isRefreshing;
  const error = documentsError ?? effectiveDocumentsResource.error;
  const refetch =
    onDocumentsChanged ??
    (() => effectiveDocumentsResource.refetch({ background: true }));
  const internalReceipts = useRequestReceiptReviews(request.id, {
    enabled: !receiptsResource,
  });
  const effectiveReceiptsResource = receiptsResource ?? internalReceipts;
  const {
    receipts,
    isLoading: receiptsLoading,
    isRefreshing: receiptsRefreshing,
    error: receiptsError,
    refetch: refetchReceipts,
    upsertReceipt,
  } = effectiveReceiptsResource;
  const internalSupplierEvidence = useSupplierDocumentEvidence(
    request.id,
    request.request_type,
    { enabled: !supplierEvidenceResource },
  );
  const effectiveSupplierEvidence =
    supplierEvidenceResource ?? internalSupplierEvidence;
  const { uploadDocument, isLoading: uploading } = useUploadRequestDocument();
  const { deleteDocument, isLoading: deleting } = useDeleteRequestDocument();
  const { updateReceiptReview, isLoading: updatingReceipt } =
    useUpdateRequestReceiptReview();
  const { confirmReceiptReview, isLoading: confirmingReceipt } =
    useConfirmRequestReceiptReview();
  const { retryReceiptOcr, isLoading: retryingReceiptOcr } =
    useRetryRequestReceiptOcr();
  const [category, setCategory] = useState<RequestDocumentCategory | "">(
    REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT,
  );
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [otherDisplayName, setOtherDisplayName] = useState("");
  const [otherQueueDrafts, setOtherQueueDrafts] = useState<
    { id: string; file: File; title: string }[]
  >([]);
  const [expandedDocumentGroups, setExpandedDocumentGroups] = useState<Record<string, boolean>>({});
  const [otherFile, setOtherFile] = useState<File | null>(null);
  const [otherTitleError, setOtherTitleError] = useState<string | null>(null);
  const [otherFileError, setOtherFileError] = useState<string | null>(null);
  const [otherUploadStatus, setOtherUploadStatus] = useState<string | null>(
    null,
  );
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [receiptToReview, setReceiptToReview] =
    useState<RequestReceiptReview | null>(null);
  const [resolvingDuplicate, setResolvingDuplicate] = useState(false);
  const [receiptToConfirm, setReceiptToConfirm] =
    useState<RequestReceiptReview | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptReviewFormState | null>(
    null,
  );
  const [activeUploadAction, setActiveUploadAction] =
    useState<DocumentUploadAction | null>(null);
  const [uploadAllocationId, setUploadAllocationId] = useState("");
  const [pendingUploadContextChange, setPendingUploadContextChange] =
    useState<PendingUploadContextChange | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const otherDraftsRef = useRef<HTMLDivElement>(null);
  const queueMonitorRef = useRef<HTMLDivElement>(null);
  const queueWasRunningRef = useRef(false);
  const operationErrorRef = useRef<HTMLDivElement>(null);
  const supplierEvidenceErrorRef = useRef<HTMLDivElement>(null);
  const supplierPrimaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const supplierEvidenceWasUnavailableRef = useRef(false);
  const otherTitleInputRef = useRef<HTMLInputElement>(null);
  const otherFileInputRef = useRef<HTMLInputElement>(null);
  const deleteFocusReturnRef = useRef<HTMLElement | null>(null);
  const deleteErrorRef = useRef<HTMLDivElement>(null);
  const deleteInFlightRef = useRef(false);
  const internalUploadQueue = useRequestDocumentUploadQueue({
    requestId: request.id,
    requestType: request.request_type,
    documents,
    receipts,
    upsertDocument: effectiveDocumentsResource.upsertDocument,
    commitSupplierEvidence: effectiveSupplierEvidence.commitEvidence,
    refreshDocuments: refetch,
    refreshSupplierEvidence: effectiveSupplierEvidence.refetch,
    refreshReceipts: () => refetchReceipts({ background: true }),
  });
  const uploadQueue = injectedUploadQueue ?? internalUploadQueue;
  const allocationGroups = request.allocations ?? [];
  const displayAllocationGroups =
    allocationGroups.length > 0 ? allocationGroups : guidanceAllocations;
  const isAdvanceSettlement =
    request.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT;
  const isAdvance = request.request_type === REQUEST_TYPE.ADVANCE;
  const isContextualDocumentFlow =
    isAdvance || request.request_type === REQUEST_TYPE.REIMBURSEMENT;
  const isSupplierPayment =
    request.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT;
  const documentToDeleteRecord = documentToDelete
    ? (documents.find((document) => document.id === documentToDelete) ?? null)
    : null;
  const documentToDeleteName = documentToDeleteRecord
    ? getDocumentBusinessName(documentToDeleteRecord)
    : null;
  const hasAllocationGroups = allocationGroups.length > 0;
  const hasDisplayAllocationGroups = displayAllocationGroups.length > 0;
  const isUsingGuidanceAllocations =
    isAdvanceSettlement &&
    !hasAllocationGroups &&
    guidanceAllocations.length > 0;
  const hasAllocationDocumentGroups =
    hasAllocationGroups && !isAdvanceSettlement;
  const requiresReceiptAllocation =
    isAdvanceSettlement &&
    hasAllocationGroups &&
    category === REQUEST_DOCUMENT_CATEGORY.RECEIPT;
  const requestLevelDocuments = getRequestLevelDocuments(documents);
  const requestLevelGeneralDocuments = requestLevelDocuments.filter(
    (document) =>
      document.document_category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
  );
  const legacyUnscopedReturnProofs = requestLevelDocuments.filter(
    (document) =>
      document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
  );
  const allocationReturnProofs = documents.filter(
    (document) =>
      document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF &&
      document.request_allocation_id,
  );
  const restrictGenericReturnProof =
    isAdvanceSettlement && hasDisplayAllocationGroups;
  const genericExcludedCategories = new Set<RequestDocumentCategory>();
  if (isAdvanceSettlement) {
    genericExcludedCategories.add(REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF);
    genericExcludedCategories.add(REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT);
  }
  const annualUitLookupEnabled =
    request.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT &&
    request.currency === "PEN" &&
    request.uit_year_applied == null &&
    request.uit_amount_applied == null;
  const annualUit = useRequestAnnualUit(
    request.fiscal_year,
    annualUitLookupEnabled,
  );
  const baseChecklist = getRequiredDocumentChecklist(
    request.request_type,
    documents,
    request,
    receipts.map((item) => item.receipt),
    annualUit.annualUit,
    effectiveSupplierEvidence.evidence,
  );
  const contractItem = baseChecklist.items.find(
    (item) => item.key === "supplier-contract",
  );
  const hasUitSnapshot =
    request.uit_year_applied != null || request.uit_amount_applied != null;
  const advisoryUit = hasUitSnapshot
    ? request.uit_year_applied != null
      ? request.uit_amount_applied
      : null
    : annualUit.annualUit;
  const showContractRecommendation =
    contractItem?.satisfied === false &&
    supplierContractRecommendation(
      request.currency,
      String(request.requested_amount),
      advisoryUit,
    ) === true;
  const checklist = restrictGenericReturnProof
    ? {
        ...baseChecklist,
        items: baseChecklist.items.filter(
          (item) => item.category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        ),
        missingMessages: baseChecklist.missingMessages.filter(
          (message) =>
            !message.toLowerCase().includes("constancia de devolución"),
        ),
        isComplete: baseChecklist.items.some(
          (item) => item.category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        )
          ? baseChecklist.items
              .filter(
                (item) =>
                  item.category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
              )
              .every((item) => !item.required || item.satisfied)
          : baseChecklist.isComplete,
      }
    : baseChecklist;
  const pendingRequiredCategories = getPendingRequiredDocumentCategories(checklist.items);
  const contextualOptions = isContextualDocumentFlow
    ? getPlannedRequestDocumentCategories(request.request_type, [...pendingRequiredCategories]).filter(
        (entry) => entry.placement === "grouped" &&
          !(request.request_type === REQUEST_TYPE.REIMBURSEMENT &&
            !checklist.isComplete && RECEIPT_DOCUMENT_CATEGORIES.has(entry.category)),
      )
    : [];
  const optionalCategoryOptions = isContextualDocumentFlow
    ? contextualOptions.filter((entry) => entry.category !== REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF).map((entry) => ({ value: entry.category, label: entry.label }))
    : getGenericDocumentCategoryOptions(checklist.items, genericExcludedCategories);
  const hasOptionalCategoryOptions = optionalCategoryOptions.length > 0;
  const acceptedFormatsLabel = category
    ? getRequestDocumentAcceptedFormatsLabel(category)
    : "selecciona una categoría";
  const uploadActionsDisabled =
    uploading || activeUploadAction !== null || uploadQueue.isRunning;
  const uploadRequiresAllocationSelection =
    requiresReceiptAllocation && !uploadAllocationId;
  const queuedPendingItems = uploadQueue.items.filter(
    (item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED,
  );
  const uploadButtonDisabled =
    uploadActionsDisabled ||
    Boolean(validationError) ||
    queuedPendingItems.length === 0 ||
    uploadRequiresAllocationSelection;
  const selectedUploadAllocation =
    allocationGroups.find(
      (allocation) => allocation.id === uploadAllocationId,
    ) ?? null;
  const hasUploadInProgress =
    uploadQueue.isRunning || activeUploadAction !== null;
  const queueSuccessMessage =
    uploadQueue.state.batchState ===
      REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.SETTLED &&
    uploadQueue.summary.saved > 0 &&
    uploadQueue.summary.errors === 0 &&
    uploadQueue.summary.persistentWarnings === 0
      ? `${uploadQueue.summary.saved} documento${uploadQueue.summary.saved === 1 ? " adjuntado" : "s adjuntados"} correctamente.`
      : null;
  const supplierEvidenceUnavailable =
    request.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT &&
    Boolean(supplierEvidenceResource) &&
    (effectiveSupplierEvidence.isInitialLoading ||
      effectiveSupplierEvidence.isRefreshing ||
      effectiveSupplierEvidence.error !== null ||
      effectiveSupplierEvidence.evidence === null);

  useEffect(() => {
    if (uploadQueue.isRunning) {
      queueWasRunningRef.current = true;
    } else if (queueWasRunningRef.current && uploadQueue.summary.errors > 0) {
      queueWasRunningRef.current = false;
      queueMonitorRef.current?.querySelector<HTMLElement>('[aria-label^="Reintentar "]')?.focus();
    }
  }, [uploadQueue.isRunning, uploadQueue.summary.errors]);

  useUploadNavigationGuard({
    active:
      !injectedUploadQueue &&
      (uploadQueue.isNavigationBlocked || activeUploadAction !== null),
    message:
      "Hay documentos pendientes o en curso. Si sales, el archivo activo puede terminar en el servidor aunque esta ventana deje de mostrarlo.",
  });

  useEffect(() => {
    if (optionalCategoryOptions.some((option) => option.value === category))
      return;
    setCategory(getDefaultOptionalDocumentCategory(optionalCategoryOptions));
    setFile(null);
    setValidationError(null);
  }, [category, optionalCategoryOptions]);

  useEffect(() => {
    if (!operationError) return;
    operationErrorRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
    operationErrorRef.current?.focus({ preventScroll: true });
  }, [operationError]);

  useEffect(() => {
    if (!deleteError) return;
    deleteErrorRef.current?.focus({ preventScroll: true });
  }, [deleteError]);

  useEffect(() => {
    if (!effectiveSupplierEvidence.error) return;
    supplierEvidenceErrorRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
    supplierEvidenceErrorRef.current
      ?.querySelector<HTMLElement>('[role="alert"]')
      ?.focus({ preventScroll: true });
  }, [effectiveSupplierEvidence.error]);

  useEffect(() => {
    if (supplierEvidenceUnavailable) {
      supplierEvidenceWasUnavailableRef.current = true;
      return;
    }
    if (!supplierEvidenceWasUnavailableRef.current) return;
    supplierEvidenceWasUnavailableRef.current = false;
    supplierPrimaryHeadingRef.current?.focus({ preventScroll: true });
  }, [supplierEvidenceUnavailable]);

  function handleQueueFileChange(fileList: FileList | null): void {
    const selectedFiles = Array.from(fileList ?? []);
    setFile(selectedFiles[0] ?? null);
    setSuccessMessage(null);
    if (selectedFiles.length === 0) return;
    if (!category) {
      setValidationError("Selecciona una categoría para adjuntar documentos.");
      return;
    }
    if (requiresReceiptAllocation && !uploadAllocationId) {
      setFile(null);
      setValidationError(
        "Selecciona la línea POA a la que corresponde el comprobante.",
      );
      return;
    }
    if (category === REQUEST_DOCUMENT_CATEGORY.OTHER) {
      setOtherQueueDrafts((drafts) => [
        ...drafts,
        ...selectedFiles.map((selectedFile) => ({
          id: crypto.randomUUID(),
          file: selectedFile,
          title: "",
        })),
      ]);
      setValidationError(null);
      return;
    }
    uploadQueue.enqueue(selectedFiles, {
      category,
      requiresAllocation: requiresReceiptAllocation,
      requestAllocationId: uploadAllocationId,
    });
    setValidationError(null);
  }

  function applyUploadContextChange(change: PendingUploadContextChange): void {
    uploadQueue.reset();
    setOtherQueueDrafts([]);
    if (change.kind === UPLOAD_CONTEXT_CHANGE_KIND.CATEGORY) {
      const nextCategory = change.value as RequestDocumentCategory;
      setCategory(nextCategory);
      if (nextCategory !== REQUEST_DOCUMENT_CATEGORY.RECEIPT)
        setUploadAllocationId("");
      setValidationError(validateRequestDocumentFile(file, nextCategory));
    } else {
      setUploadAllocationId(change.value);
      setValidationError(null);
    }
    setPendingUploadContextChange(null);
  }

  function requestUploadContextChange(
    change: PendingUploadContextChange,
  ): void {
    if (otherQueueDrafts.length > 0) {
      setValidationError("Agrega o retira los archivos seleccionados antes de cambiar la categoría.");
      return;
    }
    if (uploadQueue.isNavigationBlocked) {
      setPendingUploadContextChange(change);
      return;
    }
    applyUploadContextChange(change);
  }

  function handleCategoryChange(value: string): void {
    requestUploadContextChange({
      kind: UPLOAD_CONTEXT_CHANGE_KIND.CATEGORY,
      value,
    });
  }

  function addOtherDraftsToQueue(): void {
    if (otherQueueDrafts.length === 0) return;
    const invalidDraft = otherQueueDrafts.find((draft) => draft.title.trim() && validateOtherDocumentDisplayName(draft.title));
    if (invalidDraft) {
      otherDraftsRef.current?.querySelector<HTMLInputElement>(`[id="other-queue-title-${invalidDraft.id}"]`)?.focus();
      return;
    }
    uploadQueue.enqueue(otherQueueDrafts.map((draft) => draft.file), {
      category: REQUEST_DOCUMENT_CATEGORY.OTHER,
      fileTitles: otherQueueDrafts.map((draft) => draft.title),
    });
    setOtherQueueDrafts([]);
    setValidationError(null);
  }

  async function uploadSelectedFile(
    selectedFile: File,
    selectedCategory: RequestDocumentCategory,
    action: DocumentUploadAction,
    scope?: UploadScopeOptions,
    uploadInput?: { display_name?: string },
  ): Promise<boolean> {
    if (
      effectiveStructuredReportLocked &&
      selectedCategory !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF
    )
      return false;
    const fileError = validateRequestDocumentFile(
      selectedFile,
      selectedCategory,
    );
    if (fileError) {
      setValidationError(fileError);
      return false;
    }

    try {
      setActiveUploadAction(action);
      setOperationError(null);
      const uploaded = await uploadDocument(request.id, {
        file: selectedFile,
        document_category: selectedCategory,
        request_type: request.request_type,
        ...scope,
        ...uploadInput,
      });
      effectiveDocumentsResource.upsertDocument?.(uploaded);
      if (uploaded.supplier_document_evidence) {
        effectiveSupplierEvidence.commitEvidence(
          uploaded.supplier_document_evidence,
        );
      }
      if (uploaded.upload_status === REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED) {
        const warning =
          "El documento quedó guardado localmente, pero tuvo una incidencia al enviarse a Google Drive.";
        setOperationError(warning);
        toast.error(warning);
      } else {
        toast.success(REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE);
        if (selectedCategory !== REQUEST_DOCUMENT_CATEGORY.OTHER) {
          setSuccessMessage(REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE);
        }
      }
      if (uploaded.upload_status !== REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED) {
        setFile(null);
      }
      setValidationError(null);
      await Promise.all([
        refetch(),
        refetchReceipts(),
        effectiveSupplierEvidence.refetch(),
      ]);
      return uploaded.upload_status !== REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED;
    } catch (uploadError) {
      const message = getApiErrorMessage(uploadError);
      setOperationError(message);
      toast.error(message);
      await Promise.all([
        refetch(),
        refetchReceipts(),
        effectiveSupplierEvidence.refetch(),
      ]);
      return false;
    } finally {
      setActiveUploadAction(null);
    }
  }

  function handleOtherTitleChange(value: string): void {
    setOtherDisplayName(value);
    setOtherUploadStatus(null);
    if (otherTitleError) {
      setOtherTitleError(value.trim() ? validateOtherDocumentDisplayName(value) : null);
    }
  }

  function handleOtherFileChange(fileList: FileList | null): void {
    const titleError = otherDisplayName.trim() ? validateOtherDocumentDisplayName(otherDisplayName) : null;
    if (titleError) {
      setOtherTitleError(titleError);
      otherTitleInputRef.current?.focus();
      return;
    }
    const selectedFile = fileList?.[0] ?? null;
    setOtherFile(selectedFile);
    setOtherUploadStatus(null);
    setOtherFileError(
      selectedFile
        ? validateRequestDocumentFile(
            selectedFile,
            REQUEST_DOCUMENT_CATEGORY.OTHER,
          )
        : null,
    );
  }

  async function handleOtherUpload(): Promise<void> {
    const titleError = otherDisplayName.trim() ? validateOtherDocumentDisplayName(otherDisplayName) : null;
    if (titleError) {
      setOtherTitleError(titleError);
      otherTitleInputRef.current?.focus();
      return;
    }
    if (!otherFile) {
      setOtherFileError("Selecciona un archivo para adjuntar.");
      return;
    }
    const fileError = validateRequestDocumentFile(
      otherFile,
      REQUEST_DOCUMENT_CATEGORY.OTHER,
    );
    if (fileError) {
      setOtherFileError(fileError);
      return;
    }

    setOtherTitleError(null);
    setOtherFileError(null);
    setSuccessMessage(null);
    setOtherUploadStatus("Adjuntando documento…");
    const committed = await uploadSelectedFile(
      otherFile,
      REQUEST_DOCUMENT_CATEGORY.OTHER,
      REQUEST_DOCUMENT_CATEGORY.OTHER,
      undefined,
      { display_name: otherDisplayName.trim() || undefined },
    );
    if (!committed) {
      setOtherUploadStatus(null);
      return;
    }
    setOtherDisplayName("");
    setOtherFile(null);
    if (otherFileInputRef.current) otherFileInputRef.current.value = "";
    // Sonner is the single completion announcement path for this upload.
    setOtherUploadStatus(null);
  }

  function handleUpload(): void {
    if (!category) {
      setValidationError(
        "Selecciona una categoría para adjuntar el documento.",
      );
      return;
    }

    if (queuedPendingItems.length === 0) {
      setValidationError(
        "Selecciona al menos un archivo válido para adjuntar.",
      );
      return;
    }

    if (requiresReceiptAllocation && !uploadAllocationId) {
      setValidationError(
        "Selecciona la línea POA a la que corresponde el comprobante.",
      );
      return;
    }

    setOperationError(null);
    uploadQueue.start();
    setFile(null);
    setValidationError(null);
  }

  function handleChecklistAttach(
    nextCategory: RequestDocumentCategory,
    nextFile: File,
  ): void {
    flushSync(() => {
      setCategory(nextCategory);
      setFile(nextFile);
      setSuccessMessage(null);
    });
    void uploadSelectedFile(nextFile, nextCategory, nextCategory);
  }

  function handleAllocationChecklistAttach(
    allocationId: string,
    nextCategory: RequestDocumentCategory,
    nextFile: File,
  ): void {
    void uploadSelectedFile(
      nextFile,
      nextCategory,
      `${nextCategory}:${allocationId}` as DocumentUploadAction,
      {
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: allocationId,
      },
    );
  }

  async function handleDelete(documentId: string): Promise<void> {
    if (deleteInFlightRef.current) return;
    const existingDocument = documents.find(
      (document) => document.id === documentId,
    );
    if (
      effectiveStructuredReportLocked &&
      existingDocument?.document_category !==
        REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF
    )
      return;
    deleteInFlightRef.current = true;
    try {
      setOperationError(null);
      setDeleteError(null);
      await deleteDocument(request.id, documentId);
      effectiveDocumentsResource.removeDocument?.(documentId);
      toast.success("Documento eliminado correctamente");
      setDocumentToDelete(null);
      requestAnimationFrame(() =>
        deleteFocusReturnRef.current?.focus({ preventScroll: true }),
      );
      await Promise.all([
        refetch(),
        refetchReceipts({ background: true }),
        effectiveSupplierEvidence.refetch(),
      ]);
    } catch (deleteError) {
      const message = getApiErrorMessage(deleteError);
      setDeleteError(message);
      toast.error(message);
      await Promise.all([
        refetch(),
        refetchReceipts({ background: true }),
        effectiveSupplierEvidence.refetch(),
      ]);
    } finally {
      deleteInFlightRef.current = false;
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
    setResolvingDuplicate(false);
  }

  function openReceiptConfirm(receiptReview: RequestReceiptReview): void {
    if (effectiveStructuredReportLocked || !canConfirmReceiptReview(receiptReview)) return;
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

  function updateReceiptFormField(
    field: keyof ReceiptReviewFormState,
    value: string,
  ): void {
    setReceiptForm((current) =>
      current ? { ...current, [field]: value } : current,
    );
  }

  async function handleSaveReceiptReview(): Promise<void> {
    if (!receiptToReview || !receiptForm || !canManageActions || resolvingDuplicate || effectiveStructuredReportLocked)
      return;
    try {
      setOperationError(null);
      const updatedReceipt = await updateReceiptReview(
        request.id,
        receiptToReview.receipt.id,
        getReceiptReviewPayload(receiptForm),
      );
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
    if (!receiptToConfirm || effectiveStructuredReportLocked || !canConfirmReceiptReview(receiptToConfirm)) return;
    try {
      setOperationError(null);
      const confirmedReceipt = await confirmReceiptReview(
        request.id,
        receiptToConfirm.receipt.id,
      );
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

  async function handleRetryReceiptOcr(
    receiptReview: RequestReceiptReview,
  ): Promise<void> {
    if (effectiveStructuredReportLocked || retryingReceiptOcr) return;
    try {
      setOperationError(null);
      const terminal = await retryReceiptOcr(
        request.id,
        receiptReview.receipt.id,
      );
      upsertReceipt?.(terminal);
      if (terminal.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.SUCCESS) {
        toast.success("Lectura completada. Revisa y confirma los datos.");
      } else if (
        terminal.receipt.ocr_status ===
        REQUEST_RECEIPT_OCR_STATUS.REQUIRES_REVIEW
      ) {
        toast.success("Lectura completada con datos pendientes de revisión.");
      } else {
        const message =
          terminal.retry_reason === "OCR_TIMEOUT"
            ? "La lectura superó el tiempo límite. Revisa los datos manualmente o vuelve a intentar."
            : "La lectura no pudo completarse. Revisa los datos manualmente o vuelve a intentar.";
        setOperationError(message);
        toast.error(message);
      }
    } catch (retryError) {
      const message = getApiErrorMessage(retryError);
      setOperationError(message);
      toast.error(message);
    }
  }

  function renderDocumentRows(
    rows: RequestDocument[],
    options: { readOnly?: boolean; hideOcr?: boolean } = {},
  ): ReactNode {
    if (rows.length === 0)
      return (
        <p className="text-sm text-muted-foreground">
          Sin documentos adjuntos.
        </p>
      );

    return (
      <div className="space-y-3">
        {rows.map((document) => {
          const documentWebUrl = getRequestDocumentWebUrl(document);
          const receiptReview = receipts.find(
            (item) => item.receipt?.document_id === document.id,
          );
          const shouldShowReceiptReview =
            RECEIPT_DOCUMENT_CATEGORIES.has(document.document_category) &&
            (!isSupplierPayment ||
              document.document_category ===
                REQUEST_DOCUMENT_CATEGORY.INVOICE ||
              document.document_category ===
                REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT) &&
            !options.hideOcr &&
            (receiptsLoading || receiptReview);
          const otherMetadata = document.document_category === REQUEST_DOCUMENT_CATEGORY.OTHER
            ? getOtherDocumentBusinessMetadata(document) : null;
          const documentDisplayName = getDocumentBusinessName(document);
          const supplierProjectedDocument = isSupplierPayment
            ? effectiveSupplierEvidence.evidence?.documents.find(
                (projectedDocument) => projectedDocument.id === document.id,
              )
            : undefined;

          return (
            <div
              key={document.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 gap-3 overflow-hidden">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">
                    {documentDisplayName}
                  </p>
                  {otherMetadata && otherMetadata.titleSource !== "LEGACY" ? (
                    <p className="break-words text-xs text-muted-foreground">
                      {otherMetadata.titleSource === "CUSTOM" ? "Nombre personalizado" : "Nombre del archivo original"} · Archivo original: {otherMetadata.originalFilename}
                    </p>
                  ) : null}
                  {otherMetadata?.titleSource === "LEGACY" ? (
                    <p className="text-xs text-muted-foreground">
                      Nombre personalizado no registrado
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">
                      {getRequestDocumentCategoryLabel(
                        document.document_category,
                      )}
                    </Badge>
                    <RequestDocumentProvenanceBadge document={document} />
                    <span>
                      {getRequestDocumentMimeLabel(document.mime_type)}
                    </span>
                    <span>
                      {formatRequestDocumentSize(document.size_bytes)}
                    </span>
                    <span>
                      Subido: {formatRequestDateTime(document.created_at)}
                    </span>
                    <span>
                      Proveedor:{" "}
                      {getRequestDocumentStorageProviderLabel(
                        document.storage_provider,
                      )}
                    </span>
                    <span>
                      Estado:{" "}
                      {getRequestDocumentUploadStatusLabel(
                        document.upload_status,
                      )}
                    </span>
                  </div>
                  {supplierProjectedDocument ? (
                    <p className="max-w-full break-words text-xs font-medium">
                      {getSupplierDocumentStatusText(supplierProjectedDocument)}
                    </p>
                  ) : null}
                  {shouldShowReceiptReview && (
                    <div
                      className="mt-2 w-full min-w-0 rounded-md bg-muted p-2 text-xs sm:p-3"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getReceiptStatusVariant(receiptReview)}>
                          {getReceiptStatusLabel(receiptReview)}
                        </Badge>
                        <span className="text-muted-foreground">
                          Lectura automática del comprobante
                        </span>
                      </div>
                      {receiptReview ? (
                        <div className="mt-2 space-y-1 break-words text-muted-foreground">
                          <p>{getReceiptValueSummary(receiptReview)}</p>
                          {receiptReview.receipt.issuer_document_number && (
                            <p>
                              RUC:{" "}
                              {receiptReview.receipt.issuer_document_number}
                            </p>
                          )}
                          {receiptReview.receipt.issue_date && (
                            <p>Fecha: {receiptReview.receipt.issue_date}</p>
                          )}
                          {!receiptReview.receipt.confirmed_at && (
                            <div className="space-y-2 rounded-md border border-primary/30 bg-background p-2">
                              <p className="font-medium text-foreground">
                                {isAdvanceSettlement
                                  ? "Confirma los datos para usar este comprobante en el Informe de rendición. "
                                  : "Confirma los datos de este comprobante. "}
                                Si algún valor no coincide, selecciona Revisar
                                datos antes de confirmar.
                              </p>
                              {canManageActions && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="min-h-11 min-w-11 max-w-full w-full sm:w-auto"
                                  onClick={() =>
                                    openReceiptReview(receiptReview)
                                  }
                                  autoFocus
                                >
                                  Revisar datos del comprobante
                                </Button>
                              )}
                            </div>
                          )}
                          {receiptReview.latest_extraction?.error_message && (
                            <p>
                              Necesita revisión manual para completar la
                              información.
                            </p>
                          )}
                          {receiptReview.duplicate_candidates.length > 0 && (
                            <p>
                              Ya existe un comprobante con la misma serie y
                              número en otra solicitud activa.
                            </p>
                          )}
                          <ReceiptCandidateViewer
                            review={receiptReview}
                            onRefresh={() => effectiveReceiptsResource.refetch()}
                          />
                          <ReceiptDuplicateSummary review={receiptReview} />
                        </div>
                      ) : (
                        <p className="mt-2 text-muted-foreground">
                          Estamos leyendo el comprobante para ayudarte a validar
                          sus datos.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                {receiptReview && !readOnly && !effectiveStructuredReportLocked &&
                  (roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.GIOF_MANAGER) &&
                  receiptReview.receipt.duplicate_status !== REQUEST_RECEIPT_DUPLICATE_STATUS.UNIQUE && (
                    <Button type="button" variant="outline" onClick={() => openReceiptReview(receiptReview)}>
                      Revisar duplicado
                    </Button>
                  )}
                {documentWebUrl ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-11 min-w-11 max-w-full w-full sm:w-auto"
                  >
                    <a
                      href={documentWebUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={
                        options.readOnly
                          ? `Ver documento ${documentDisplayName} (se abre en una pestaña nueva)`
                          : `Ver documento ${documentDisplayName}`
                      }
                    >
                      <ExternalLink className="size-4" />
                      Ver documento
                    </a>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Enlace no disponible
                  </p>
                )}
                {receiptReview &&
                  !options.readOnly &&
                  canManageActions &&
                  receiptReview.receipt.confirmed_at && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 min-w-11 max-w-full w-full sm:w-auto"
                      onClick={() => openReceiptReview(receiptReview)}
                    >
                      Revisar datos
                    </Button>
                  )}
                {receiptReview &&
                  !options.readOnly &&
                  canManageActions &&
                  canConfirmReceiptReview(receiptReview) && (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 min-w-11 max-w-full w-full sm:w-auto"
                      onClick={() => openReceiptConfirm(receiptReview)}
                      disabled={confirmingReceipt}
                    >
                      {confirmingReceipt ? "Confirmando..." : "Confirmar datos"}
                    </Button>
                  )}
                {receiptReview &&
                  !options.readOnly &&
                  canManageActions &&
                  (roleCode === ROLE_CODE.GIOF_GESTOR ||
                    roleCode === ROLE_CODE.ADMIN_SISTEMA) &&
                  (receiptReview.receipt.ocr_status ===
                    REQUEST_RECEIPT_OCR_STATUS.FAILED ||
                    receiptReview.receipt.ocr_status ===
                      REQUEST_RECEIPT_OCR_STATUS.REQUIRES_REVIEW) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 min-w-11 max-w-full w-full sm:w-auto"
                      onClick={() => void handleRetryReceiptOcr(receiptReview)}
                      disabled={retryingReceiptOcr}
                    >
                      {retryingReceiptOcr
                        ? "Reintentando lectura..."
                        : "Reintentar lectura"}
                    </Button>
                  )}
                {!options.readOnly &&
                  (canManageActions ||
                    (canManageReturnProofWhileLocked &&
                      document.document_category ===
                        REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF)) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 min-w-11 max-w-full w-full sm:w-auto"
                      aria-label={`Eliminar ${documentDisplayName}`}
                      onClick={(event) => {
                        deleteFocusReturnRef.current =
                          event.currentTarget.closest<HTMLElement>("article") ??
                          event.currentTarget;
                        setDeleteError(null);
                        setDocumentToDelete(document.id);
                      }}
                      disabled={deleting}
                    >
                      <Trash2 className="size-4" />
                      {deleting && documentToDelete === document.id
                        ? "Eliminando..."
                        : "Eliminar"}
                    </Button>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderSupplierCategoryCard(
    card: SupplierDocumentCategoryCard,
  ): ReactNode {
    const categoryDocuments = requestLevelGeneralDocuments.filter(
      (document) => document.document_category === card.category,
    );
    const isOther = card.category === REQUEST_DOCUMENT_CATEGORY.OTHER;
    const item: RequiredDocumentChecklistItem = {
      key: `supplier-${card.category}`,
      category: card.category,
      label: card.label,
      description: "",
      required: false,
      satisfied: categoryDocuments.length > 0,
      acceptedFormatsLabel: card.formats,
      missingMessage: "",
    };

    return (
      <article
        key={card.category}
        data-testid={`supplier-category-${card.category}`}
        data-category={card.category}
        className="space-y-3 rounded-md border p-4"
        id={`supplier-category-${card.category}`}
        aria-label={card.label}
        tabIndex={-1}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">{card.label}</h4>
              {card.supportsOcr ? (
                <Badge variant="outline">Lectura automática</Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{card.formats}</p>
          </div>
          {canManageActions ? (
            isOther ? null : (
              <ChecklistAttachButton
                item={item}
                disabled={uploadActionsDisabled}
                isUploading={activeUploadAction === card.category}
                onAttach={handleChecklistAttach}
              />
            )
          ) : null}
        </div>
        {isOther ? (
          canManageActions ? (
            <div className="grid grid-cols-1 gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2 sm:items-end">
              <div className="space-y-2 sm:col-span-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="supplier-other-display-name"
                >
                  Nombre del documento
                </label>
                <Input
                  ref={otherTitleInputRef}
                  id="supplier-other-display-name"
                  value={otherDisplayName}
                  maxLength={121}
                  aria-invalid={otherTitleError ? true : undefined}
                  aria-describedby={`supplier-other-title-description${otherTitleError ? " supplier-other-title-error" : ""}`}
                  className="min-h-11 max-w-full"
                  disabled={uploadActionsDisabled}
                  onChange={(event) =>
                    handleOtherTitleChange(event.target.value)
                  }
                  onBlur={() =>
                    setOtherTitleError(
                      otherDisplayName.trim() ? validateOtherDocumentDisplayName(otherDisplayName) : null,
                    )
                  }
                />
                <p
                  id="supplier-other-title-description"
                  className="text-xs text-muted-foreground"
                >
                   Nombre opcional de 3 a 120 caracteres. En blanco se usa el nombre original del archivo.
                </p>
                {otherTitleError ? (
                  <p
                    id="supplier-other-title-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {otherTitleError}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="supplier-other-file"
                >
                  Archivo
                </label>
                <Input
                  ref={otherFileInputRef}
                  id="supplier-other-file"
                  type="file"
                  aria-label="Archivo de Otros documentos"
                  accept={getRequestDocumentAccept(
                    REQUEST_DOCUMENT_CATEGORY.OTHER,
                  )}
                  aria-invalid={otherFileError ? true : undefined}
                  aria-describedby={`supplier-other-file-description${otherFileError ? " supplier-other-file-error" : ""}`}
                  className="min-h-11 max-w-full"
                  disabled={
                    uploadActionsDisabled ||
                   (Boolean(otherDisplayName.trim()) && validateOtherDocumentDisplayName(otherDisplayName) !== null)
                  }
                  onChange={(event) =>
                    handleOtherFileChange(event.target.files)
                  }
                />
                <p
                  id="supplier-other-file-description"
                  className="text-xs text-muted-foreground"
                >
                   Selecciona un archivo; el nombre es opcional.
                </p>
                {otherFileError ? (
                  <p
                    id="supplier-other-file-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {otherFileError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                className="min-h-11 min-w-11 max-w-full sm:justify-self-start"
                aria-label="Adjuntar Otros documentos"
                aria-describedby="supplier-other-title-description supplier-other-file-description"
                disabled={
                  uploadActionsDisabled ||
                  !otherFile ||
                  Boolean(otherTitleError) ||
                  Boolean(otherFileError) ||
                   (Boolean(otherDisplayName.trim()) && validateOtherDocumentDisplayName(otherDisplayName) !== null)
                }
                onClick={() => void handleOtherUpload()}
              >
                <Upload className="size-4" />
                {activeUploadAction === REQUEST_DOCUMENT_CATEGORY.OTHER
                  ? "Adjuntando..."
                  : "Adjuntar"}
              </Button>
              {otherFile ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Archivo seleccionado: {otherFile.name}
                </p>
              ) : null}
              {otherUploadStatus ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-xs text-muted-foreground sm:col-span-2"
                >
                  {otherUploadStatus}
                </p>
              ) : null}
            </div>
          ) : null
        ) : null}
        {card.category === REQUEST_DOCUMENT_CATEGORY.CONTRACT ? (
          <>
            {request.currency === REQUEST_CURRENCY.USD ? (
              <p className="text-xs text-muted-foreground">
                Opcional para solicitudes en dólares. El umbral de ½ UIT solo se
                aplica a solicitudes en soles.
              </p>
            ) : null}
            {showContractRecommendation ? (
              <Alert
                aria-label="Recomendación de contrato"
                role="status"
                className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"
              >
                <Info className="h-4 w-4" />
                <AlertDescription>
                  El total en soles alcanza o supera ½ UIT del año de la
                  solicitud. Es recomendable adjuntar un contrato o convenio
                  PDF, pero no es obligatorio para continuar.
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}
        {renderDocumentRows(categoryDocuments)}
      </article>
    );
  }

  function renderSupplierDocumentGroups(): ReactNode {
    const authoritativeDocuments =
      effectiveSupplierEvidence.evidence?.documents ?? [];
    const validPrimaryCount = authoritativeDocuments.filter(
      (document) =>
        document.eligible &&
        SUPPLIER_PRIMARY_DOCUMENT_CARDS.some(
          (card) => card.category === document.effective_category,
        ),
    ).length;
    const primarySatisfied =
      effectiveSupplierEvidence.evidence?.primary_satisfied === true;
    const historicalReceipts = requestLevelGeneralDocuments.filter(
      (document) =>
        document.document_category === REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    );
    const paymentProofs = requestLevelGeneralDocuments.filter(
      (document) =>
        document.document_category === REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
    );

    return (
      <div className="space-y-4">
        <section
          aria-labelledby="supplier-primary-documents-heading"
          className="space-y-3 rounded-md border p-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h3
                ref={supplierPrimaryHeadingRef}
                id="supplier-primary-documents-heading"
                className="text-sm font-semibold"
                tabIndex={-1}
              >
                Documento principal
              </h3>
              <p className="text-xs text-muted-foreground">
                Debes adjuntar al menos uno.
              </p>
            </div>
            <Badge
              variant={primarySatisfied ? "secondary" : "destructive"}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Estado del requisito de documento principal"
            >
              {primarySatisfied ? (
                <CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />
              ) : (
                <XCircle className="mr-1 size-3.5" aria-hidden="true" />
              )}
              {primarySatisfied
                ? `Requisito cumplido · ${validPrimaryCount} documentos válidos`
                : `Pendiente · ${validPrimaryCount} válidos`}
            </Badge>
          </div>
          <div
            data-testid="supplier-primary-grid"
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
          >
            {SUPPLIER_PRIMARY_DOCUMENT_CARDS.map(renderSupplierCategoryCard)}
          </div>
        </section>

        <section
          aria-labelledby="supplier-complementary-documents-heading"
          className="space-y-3 rounded-md border p-4"
        >
          <h3
            id="supplier-complementary-documents-heading"
            className="text-sm font-semibold"
          >
            Documentos complementarios
          </h3>
          <div
            data-testid="supplier-complementary-grid"
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
          >
            {SUPPLIER_COMPLEMENTARY_DOCUMENT_CARDS.map(
              renderSupplierCategoryCard,
            )}
          </div>
        </section>

        {!canManageActions ? (
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "Vista de solo lectura: los documentos se gestionan desde el flujo de edición del borrador."
              : permissionMessage}
          </p>
        ) : null}

        {historicalReceipts.length > 0 ? (
          <section
            aria-labelledby="supplier-historical-documents-heading"
            className="space-y-3 rounded-md border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id="supplier-historical-documents-heading"
                className="text-sm font-semibold"
              >
                Documentos históricos
              </h3>
              <Badge variant="outline">Solo lectura</Badge>
            </div>
            {renderDocumentRows(historicalReceipts, {
              readOnly: true,
              hideOcr: true,
            })}
          </section>
        ) : null}

        {paymentProofs.length > 0 ? (
          <section
            aria-labelledby="supplier-payment-proofs-heading"
            className="space-y-3 rounded-md border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id="supplier-payment-proofs-heading"
                className="text-sm font-semibold"
              >
                Constancias de pago
              </h3>
              <Badge variant="outline">Solo lectura</Badge>
            </div>
            {renderDocumentRows(paymentProofs, {
              readOnly: true,
              hideOcr: true,
            })}
          </section>
        ) : null}
      </div>
    );
  }

  function renderAllocationGroups(): ReactNode {
    if (!hasAllocationDocumentGroups) return null;

    return (
      <section className="space-y-3" data-testid="allocation-documents-groups">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            Documentos asociados por línea POA
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAdvance
              ? "Los documentos por línea son opcionales en esta etapa. Un único PXQ activo asociado a la solicitud, en cualquier línea o a nivel general, satisface el requisito."
              : "Los documentos asociados a cada línea POA son opcionales en esta etapa."}
          </p>
        </div>
        {allocationGroups.map((allocation, index) => {
          const allocationDocuments = getAllocationDocuments(
            allocation,
            documents,
          );
          const allocationChecklist = getAllocationChecklist();
          const allocationId = allocation.id;

          return (
            <div
              key={
                allocationId ?? `${allocation.budget_planning_line_id}-${index}`
              }
              className="space-y-3 rounded-md border p-4"
              data-testid="allocation-documents-group"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold">
                    Bloque {index + 1}: {getPlanningLineDisplay(allocation)}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {getAllocationSummary(allocation)}
                  </p>
                </div>
                 <Badge variant="outline">
                   {allocationDocuments.length > 0 ? "Con adjuntos" : "Opcional · sin adjuntos"}
                 </Badge>
              </div>
              {!allocationId && canManageActions && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Guarda el borrador para adjuntar documentos opcionales a
                    esta línea POA.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-3">
                {allocationChecklist.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex gap-3">
                      {item.satisfied ? (
                        <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                      ) : item.required ? (
                        <XCircle className="mt-0.5 size-5 text-destructive" />
                      ) : (
                        <Info className="mt-0.5 size-5 text-muted-foreground" />
                      )}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.label}</p>
                          <Badge
                            variant={
                              item.satisfied
                                ? "secondary"
                                : item.required
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {item.satisfied
                              ? "Adjunto"
                              : item.required
                                ? "Pendiente"
                                : "Opcional"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Formatos esperados: {item.acceptedFormatsLabel}.
                        </p>
                        {item.required && !item.satisfied && (
                          <p className="text-xs text-muted-foreground">
                            {item.missingMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    {!item.satisfied && canManageActions && allocationId && (
                      <ChecklistAttachButton
                        item={item}
                        disabled={uploadActionsDisabled}
                        isUploading={
                          activeUploadAction ===
                          `${item.category}:${allocationId}`
                        }
                        onAttach={(nextCategory, nextFile) =>
                          handleAllocationChecklistAttach(
                            allocationId,
                            nextCategory,
                            nextFile,
                          )
                        }
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
          const allocationDocuments =
            !isUsingGuidanceAllocations && allocation.id
              ? getAllocationDocuments(allocation, documents)
              : [];
          const receiptDocuments = allocationDocuments.filter(
            (document) =>
              document.document_category === REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          );
          const hasReceipts = receiptDocuments.length > 0;

          return (
            <div
              key={
                allocation.id ??
                `${allocation.budget_planning_line_id}-${index}`
              }
              className="space-y-3 rounded-md border p-4"
              data-testid="settlement-receipt-group"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold">
                    Línea {index + 1}: {getPlanningLineDisplay(allocation)}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {getAllocationSummary(allocation)}
                  </p>
                </div>
                <Badge variant={hasReceipts ? "secondary" : "destructive"}>
                  {isUsingGuidanceAllocations
                    ? "Referencia"
                    : hasReceipts
                      ? "Con comprobante"
                      : "Pendiente"}
                </Badge>
              </div>
              {isUsingGuidanceAllocations ? (
                <p className="text-sm text-muted-foreground">
                  Cuando termine la actualización, adjunta el comprobante
                  seleccionando esta línea POA en el cargador.
                </p>
              ) : (
                renderDocumentRows(receiptDocuments)
              )}
            </div>
          );
        })}
      </section>
    );
  }

  function renderReturnProofGroups(): ReactNode {
    if (!isAdvanceSettlement || !hasDisplayAllocationGroups) return null;

    return (
      <section
        className="space-y-3"
        data-testid="settlement-return-proof-groups"
      >
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            Constancias de devolución por línea POA
          </h3>
          <p className="text-xs text-muted-foreground">
            Estas constancias se registran desde Saldos por línea POA con
            Registrar devolución. Solo una constancia asociada a la misma línea
            valida esa devolución.
          </p>
        </div>
        {displayAllocationGroups.map((allocation, index) => {
          const proofDocuments = allocation.id
            ? allocationReturnProofs.filter(
                (document) => document.request_allocation_id === allocation.id,
              )
            : [];
          return (
            <div
              key={
                allocation.id ??
                `${allocation.budget_planning_line_id}-${index}`
              }
              className="space-y-3 rounded-md border p-4"
              data-testid="settlement-return-proof-group"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold">
                    Línea {index + 1}: {getPlanningLineDisplay(allocation)}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {getAllocationSummary(allocation)}
                  </p>
                </div>
                <Badge
                  variant={proofDocuments.length > 0 ? "secondary" : "outline"}
                >
                  {proofDocuments.length > 0
                    ? "Con constancia"
                    : "Sin constancia"}
                </Badge>
              </div>
              {renderDocumentRows(proofDocuments)}
            </div>
          );
        })}
        {legacyUnscopedReturnProofs.length > 0 ? (
          <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-amber-950 dark:text-amber-100">
              Estas constancias no están asociadas a una línea POA y no validan
              una devolución por línea. Vuelve a registrar la devolución desde
              Saldos por línea POA → Registrar devolución.
              <div className="mt-3">
                {renderDocumentRows(legacyUnscopedReturnProofs)}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
      </section>
    );
  }

  return (
    <Card id="documents">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">Documentos adjuntos</h2>
        </CardTitle>
        <CardDescription>
          {readOnly
            ? "Consulta los sustentos adjuntos y el estado del checklist. Para cambiar documentos, ingresa al flujo de edición del borrador."
            : "Adjunta sustentos en PDF, JPG, PNG y Excel cuando la categoría lo requiera. Podrás abrir los documentos compartidos cuando el acceso haya sido habilitado."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {supplierEvidenceUnavailable && (
          <div ref={supplierEvidenceErrorRef}>
            <Alert
              variant="destructive"
              tabIndex={effectiveSupplierEvidence.error ? -1 : undefined}
              aria-live={
                effectiveSupplierEvidence.error ? "assertive" : "polite"
              }
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  No pudimos confirmar el estado de tus documentos. Reintenta
                  para continuar.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={
                    effectiveSupplierEvidence.isInitialLoading ||
                    effectiveSupplierEvidence.isRefreshing
                  }
                  onClick={() => void effectiveSupplierEvidence.retry()}
                >
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}
        {(isRefreshingDocuments || receiptsRefreshing) && (
          <p
            className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            role="status"
          >
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
        {request.status === REQUEST_STATUS.OBSERVED &&
        structuredReportLocked ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              La rendición fue observada; puedes actualizar sustentos y
              regenerar el informe antes de reenviar.
            </AlertDescription>
          </Alert>
        ) : null}
        {effectiveStructuredReportLocked ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              El informe generado bloquea la carga, eliminación y revisión de
              comprobantes. Si el informe es observado/reabierto o la generación
              falla, estas acciones volverán a estar disponibles.
            </AlertDescription>
          </Alert>
        ) : null}
        {isAdvance && hasAllocationDocumentGroups && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Esta solicitud requiere un único PXQ activo. Puede estar asociado
              a cualquier línea POA o a la solicitud general; no se requiere uno
              por línea.
            </AlertDescription>
          </Alert>
        )}
        {renderAllocationGroups()}
        {renderSettlementReceiptGroups()}
        {renderReturnProofGroups()}
        {isSupplierPayment ? (
          renderSupplierDocumentGroups()
        ) : (
          <div className="rounded-md border p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                Checklist de documentos generales
              </h3>
              <p className="text-xs text-muted-foreground">
                {readOnly
                  ? "Estado de los documentos requeridos para esta solicitud. Esta vista no permite adjuntar ni eliminar archivos."
                  : isAdvanceSettlement && hasAllocationGroups
                    ? "No hay un comprobante general obligatorio. Los comprobantes se gestionan por línea POA y luego se agregan al Informe de rendición."
                    : "Completa los documentos requeridos según el tipo y la moneda de la solicitud."}
              </p>
            </div>
            <div className="mt-3 space-y-3">
              {checklist.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay documentos obligatorios generales configurados para
                  este tipo de solicitud.
                </p>
              ) : (
                checklist.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex gap-3">
                      {item.satisfied ? (
                        <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                      ) : item.required ? (
                        <XCircle className="mt-0.5 size-5 text-destructive" />
                      ) : (
                        <Info className="mt-0.5 size-5 text-muted-foreground" />
                      )}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.label}</p>
                          <Badge
                            variant={
                              item.satisfied
                                ? "secondary"
                                : item.required
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {item.satisfied
                              ? "Adjunto"
                              : item.required
                                ? "Pendiente"
                                : "Opcional"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Formatos esperados: {item.acceptedFormatsLabel}.
                        </p>
                      </div>
                    </div>
                    {!item.satisfied && request.request_type === REQUEST_TYPE.REIMBURSEMENT && item.key === "request-primary" && canManageActions ? (
                      <div data-testid="reimbursement-receipt-choices" className="flex flex-wrap gap-2">
                        {REIMBURSEMENT_RECEIPT_CHOICES.map((receiptCategory) => (
                          <ChecklistAttachButton
                            key={receiptCategory}
                            item={{ ...item, category: receiptCategory, label: getRequestDocumentCategoryLabel(receiptCategory) }}
                            disabled={uploadActionsDisabled}
                            isUploading={activeUploadAction === receiptCategory}
                            onAttach={handleChecklistAttach}
                          />
                        ))}
                      </div>
                    ) : !item.satisfied &&
                      (canManageActions ||
                        (canManageReturnProofWhileLocked &&
                          item.category ===
                            REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF)) && (
                        <ChecklistAttachButton
                          item={item}
                          disabled={uploadActionsDisabled}
                          isUploading={activeUploadAction === item.category}
                          onAttach={handleChecklistAttach}
                        />
                      )}
                  </div>
                ))
              )}
            </div>
            {checklist.conditionalNotes.length > 0 && (
              <div className="mt-3 space-y-2 rounded-md bg-muted p-3">
                <p className="flex items-center gap-2 text-xs font-medium">
                  <Info className="size-4" /> Consideraciones adicionales
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {checklist.conditionalNotes.map((note) => (
                    <li key={note.key}>
                      <span className="font-medium text-foreground">
                        {note.label}:
                      </span>{" "}
                      {note.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {backendMissingMessages.length > 0 && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>
                  <p className="font-medium">
                    Documentos requeridos pendientes
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {backendMissingMessages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {isSupplierPayment && backendMissingMessages.length > 0 ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">Documentos requeridos pendientes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {backendMissingMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {!isSupplierPayment &&
          !hideOptionalUploader &&
          (canManageActions ? (
            <div className="rounded-md border p-4">
              <div className="mb-3 space-y-1">
                <h3 className="text-sm font-semibold">Otros documentos</h3>
                <p className="text-xs text-muted-foreground">
                   Usa este cargador para documentos adicionales. Puedes seleccionar hasta 20 archivos; se
                  adjuntarán de uno en uno para mantener estable la carga.
                </p>
                {isAdvanceSettlement ? (
                  <div className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                    <p>
                      Las constancias de devolución se adjuntan desde Saldos por
                      línea POA → Registrar devolución para que queden
                      vinculadas a la línea correcta.
                    </p>
                    <p>
                      El Informe de rendición se genera desde la acción de
                      rendición; no se adjunta manualmente en este cargador.
                    </p>
                  </div>
                ) : null}
              </div>
              {hasOptionalCategoryOptions ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_minmax(220px,320px)_auto] xl:items-end">
                   {isContextualDocumentFlow ? (
                     <fieldset className="min-w-0 space-y-2 md:col-span-2 xl:col-span-4" data-testid="contextual-document-options">
                       <legend className="text-sm font-medium">Categorías disponibles</legend>
                       {Object.values(REQUEST_DOCUMENT_PRESENTATION_GROUP).map((group) => {
                         const choices = contextualOptions.filter((entry) => entry.group === group);
                         if (choices.length === 0) return null;
                         return (
                            <details key={group} open={expandedDocumentGroups[group] ?? true} className="min-w-0 space-y-1">
                              <summary id={`document-group-${group}`} className="min-h-11 cursor-pointer py-3 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.preventDefault(); setExpandedDocumentGroups((current) => ({ ...current, [group]: !(current[group] ?? true) })); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedDocumentGroups((current) => ({ ...current, [group]: !(current[group] ?? true) })); } }}>{REQUEST_DOCUMENT_PRESENTATION_GROUP_LABELS[group]}</summary>
                              <div role="group" aria-labelledby={`document-group-${group}`} className="flex min-w-0 flex-wrap gap-2">
                               {choices.map((entry) => (
                                 <Button key={entry.category} type="button" size="sm" variant={category === entry.category ? "secondary" : "outline"}
                                   className="h-auto min-h-11 max-w-full whitespace-normal text-left"
                                    aria-pressed={category === entry.category}
                                    aria-describedby={entry.category === REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF || entry.category === REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT || entry.category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF ? "document-operation-limits" : undefined}
                                   disabled={uploadActionsDisabled || entry.category === REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF}
                                   onClick={() => handleCategoryChange(entry.category)}>
                                     {entry.category === REQUEST_DOCUMENT_CATEGORY.EVIDENCE ? "Evidencias" : entry.category === REQUEST_DOCUMENT_CATEGORY.OTHER ? "Otros documentos" : entry.label} · {entry.formats} · {entry.scope === "REQUEST" ? "Solicitud" : "Solicitud o línea POA"}
                                  </Button>
                                ))}
                              </div>
                            </details>
                         );
                       })}
                        <p id="document-operation-limits" className="text-xs text-muted-foreground">Constancia de pago: operación de pago; no se adjunta desde este cargador. Informe de rendición y constancia de devolución: sujetos a estado, rol y controles del servidor; en REXAN se gestionan desde sus acciones específicas.</p>
                     </fieldset>
                   ) : <div className="min-w-0 space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="document-category"
                    >
                      Categoría
                    </label>
                    <Select
                      value={category}
                      onValueChange={handleCategoryChange}
                    >
                      <SelectTrigger
                        id="document-category"
                        disabled={uploadActionsDisabled}
                      >
                        <SelectValue placeholder="Selecciona categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {optionalCategoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                   </div>}
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="request-document-file"
                    >
                      Archivo
                    </label>
                    <Input
                      id="request-document-file"
                      ref={fileInputRef}
                      key={file ? "selected" : "empty"}
                      type="file"
                      multiple
                      accept={
                        category
                          ? getRequestDocumentAccept(category)
                          : undefined
                      }
                      disabled={uploadActionsDisabled}
                      onChange={(event) => {
                        handleQueueFileChange(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Máximo 10 MB por archivo. Formatos permitidos:{" "}
                      {acceptedFormatsLabel}. Máximo 20 archivos por tanda.
                    </p>
                  </div>
                  {category === REQUEST_DOCUMENT_CATEGORY.OTHER && otherQueueDrafts.length > 0 ? (
                     <div ref={otherDraftsRef} className="min-w-0 space-y-2 md:col-span-2 xl:col-span-4">
                      <p className="text-sm font-medium">Título opcional por archivo</p>
                      {otherQueueDrafts.map((draft) => {
                        const error = draft.title.trim() ? validateOtherDocumentDisplayName(draft.title) : null;
                        return (
                          <div key={draft.id} className="min-w-0 space-y-1 rounded-md border p-2">
                            <label className="block text-sm" htmlFor={`other-queue-title-${draft.id}`}>Título de {draft.file.name}</label>
                            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                              <Input className="min-w-0 min-h-11" id={`other-queue-title-${draft.id}`} value={draft.title} aria-invalid={Boolean(error)} aria-describedby={error ? `other-queue-error-${draft.id}` : undefined} onChange={(event) => setOtherQueueDrafts((drafts) => drafts.map((item) => item.id === draft.id ? { ...item, title: event.target.value } : item))} />
                               <Button className="min-h-11" type="button" variant="outline" aria-label={`Retirar ${draft.file.name}`} onClick={() => setOtherQueueDrafts((drafts) => drafts.filter((item) => item.id !== draft.id))}>Retirar</Button>
                            </div>
                            {error ? <p role="alert" id={`other-queue-error-${draft.id}`} className="text-xs text-destructive">{error}</p> : null}
                          </div>
                        );
                      })}
                      <p className="text-xs text-muted-foreground">Deja el título en blanco para usar el nombre original del archivo.</p>
                       <Button type="button" variant="outline" className="min-h-11" onClick={addOtherDraftsToQueue}>Agregar a la cola</Button>
                    </div>
                  ) : null}
                  {requiresReceiptAllocation && (
                    <div className="min-w-0 space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="receipt-allocation"
                      >
                        Línea POA
                      </label>
                      <Select
                        value={uploadAllocationId}
                        onValueChange={(value) =>
                          requestUploadContextChange({
                            kind: UPLOAD_CONTEXT_CHANGE_KIND.ALLOCATION,
                            value,
                          })
                        }
                      >
                        <SelectTrigger
                          id="receipt-allocation"
                          className="max-w-full"
                          disabled={uploadActionsDisabled}
                        >
                          <SelectValue placeholder="Selecciona línea POA" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[min(92vw,28rem)]">
                          {allocationGroups.map((allocation, index) =>
                            allocation.id ? (
                              <SelectItem
                                key={allocation.id}
                                value={allocation.id}
                                title={`Línea ${index + 1}: ${getPlanningLineDisplay(allocation)}`}
                              >
                                {getCompactPlanningLineLabel(allocation, index)}
                              </SelectItem>
                            ) : null,
                          )}
                        </SelectContent>
                      </Select>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={
                          selectedUploadAllocation
                            ? getPlanningLineDisplay(selectedUploadAllocation)
                            : undefined
                        }
                      >
                        {selectedUploadAllocation
                          ? getPlanningLineDisplay(selectedUploadAllocation)
                          : "Selecciona la línea POA antes de adjuntar el comprobante."}
                      </p>
                    </div>
                  )}
                  <Button
                    type="button"
                    className="md:self-end"
                    onClick={() => void handleUpload()}
                    disabled={uploadButtonDisabled || otherQueueDrafts.length > 0}
                  >
                    <Upload className="size-4" />
                    {uploadQueue.isRunning ? "Adjuntando..." : "Adjuntar"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay categorías opcionales disponibles por ahora. Completa
                  los documentos requeridos desde el checklist.
                </p>
              )}
              {file && (
                <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium">Último archivo seleccionado</p>
                  <p className="text-muted-foreground">
                    {file.name} · {formatRequestDocumentSize(file.size)} ·{" "}
                    {getRequestDocumentMimeLabel(file.type)}
                  </p>
                </div>
              )}
              {!hideUploadQueueMonitor && uploadQueue.items.length > 0 && (
                 <div ref={queueMonitorRef} className="mt-3 min-w-0 space-y-3 rounded-md border p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium">Cola de carga</p>
                    <p className="text-xs text-muted-foreground">
                      {uploadQueue.summary.saved} guardado
                      {uploadQueue.summary.saved === 1 ? "" : "s"} ·{" "}
                      {uploadQueue.summary.errors +
                        uploadQueue.summary.persistentWarnings}{" "}
                      con incidencia · {uploadQueue.summary.queued} en cola
                    </p>
                  </div>
                  {uploadQueue.state.omittedCount > 0 ? (
                    <p className="text-sm text-destructive">
                      {uploadQueue.state.omittedCount} archivo
                      {uploadQueue.state.omittedCount === 1
                        ? " fue omitido"
                        : "s fueron omitidos"}
                      . Solo se conservan 20 archivos por tanda.
                    </p>
                  ) : null}
                  {queuedPendingItems.length > 0 && !uploadQueue.isRunning ? (
                    <p className="text-xs text-muted-foreground">
                      Los archivos en cola todavía no se envían. Presiona
                      Adjuntar para iniciar la carga o Retirar para quitarlos.
                    </p>
                  ) : null}
                  {hasUploadInProgress && (
                    <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-amber-950 dark:text-amber-100">
                        Estamos adjuntando documentos. Si sales, el archivo
                        activo puede terminar en el servidor aunque esta ventana
                        deje de mostrarlo.
                      </AlertDescription>
                    </Alert>
                  )}
                  <ul className="space-y-2">
                    {uploadQueue.items.map((item) => (
                      <SettlementUploadFileRow
                        key={item.id}
                        item={item}
                        disabled={uploadQueue.isRunning}
                        onRetry={uploadQueue.retry}
                        onRemove={uploadQueue.remove}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {validationError && (
                <p className="mt-2 text-sm text-destructive">
                  {validationError}
                </p>
              )}
              {uploadRequiresAllocationSelection && !validationError && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Selecciona la línea POA antes de adjuntar el comprobante.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? "Vista de solo lectura: los documentos se gestionan desde el flujo de edición del borrador."
                : permissionMessage}
            </p>
          ))}

        {(successMessage || queueSuccessMessage) && (
          <Alert role="status" aria-live="polite" aria-atomic="true">
            <AlertDescription>
              {successMessage ?? queueSuccessMessage}
            </AlertDescription>
          </Alert>
        )}

        {operationError && !receiptToReview && !receiptToConfirm && (
          <div
            ref={operationErrorRef}
            tabIndex={-1}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Alert variant="destructive">
              <AlertDescription>{operationError}</AlertDescription>
            </Alert>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{getApiErrorMessage(error)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {receiptsError && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                No se pudo cargar la lectura automática de comprobantes. Puedes
                reintentar sin afectar los documentos adjuntos.
              </span>
              {!effectiveStructuredReportLocked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchReceipts()}
                >
                  Volver a cargar estado
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        {!isSupplierPayment &&
          (isLoading && documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cargando documentos...
            </p>
          ) : (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Documentos generales</h3>
              {renderDocumentRows(requestLevelGeneralDocuments)}
            </section>
          ))}
        <Dialog
          open={Boolean(pendingUploadContextChange)}
          onOpenChange={(open) => !open && setPendingUploadContextChange(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Cambiar la selección de carga?</DialogTitle>
              <DialogDescription>
                Cambiar la categoría o línea POA retirará los archivos en cola y
                las incidencias locales de esta tanda. No cancela un archivo que
                el servidor ya haya empezado a procesar.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingUploadContextChange(null)}
              >
                Conservar cola
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  pendingUploadContextChange &&
                  applyUploadContextChange(pendingUploadContextChange)
                }
              >
                Cambiar y retirar cola
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(receiptToReview)}
          onOpenChange={(open) => !open && closeReceiptReview()}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revisar datos del comprobante</DialogTitle>
              <DialogDescription>
                Corrige los datos detectados por la lectura automática antes de
                continuar. No se cambia el archivo adjunto.
              </DialogDescription>
            </DialogHeader>
            {receiptForm && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-ruc">
                    RUC
                  </label>
                  <Input
                    id="receipt-ruc"
                    value={receiptForm.issuer_document_number}
                    onChange={(event) =>
                      updateReceiptFormField(
                        "issuer_document_number",
                        event.target.value,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="receipt-provider"
                  >
                    Proveedor
                  </label>
                  <Input
                    id="receipt-provider"
                    value={receiptForm.issuer_name}
                    onChange={(event) =>
                      updateReceiptFormField("issuer_name", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="receipt-series"
                  >
                    Serie
                  </label>
                  <Input
                    id="receipt-series"
                    value={receiptForm.series}
                    onChange={(event) =>
                      updateReceiptFormField("series", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="receipt-number"
                  >
                    Número
                  </label>
                  <Input
                    id="receipt-number"
                    value={receiptForm.number}
                    onChange={(event) =>
                      updateReceiptFormField("number", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="receipt-date">
                    Fecha del comprobante
                  </label>
                  <Input
                    id="receipt-date"
                    type="date"
                    value={receiptForm.issue_date}
                    aria-describedby="receipt-date-help"
                    onChange={(event) =>
                      updateReceiptFormField("issue_date", event.target.value)
                    }
                  />
                  <p
                    id="receipt-date-help"
                    className="text-xs text-muted-foreground"
                  >
                    Selecciona solo día, mes y año. No requiere hora.
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="receipt-amount"
                  >
                    Total
                  </label>
                  <Input
                    id="receipt-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiptForm.amount}
                    onChange={(event) =>
                      updateReceiptFormField("amount", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="receipt-currency"
                  >
                    Moneda
                  </label>
                  <Select
                    value={receiptForm.currency}
                    onValueChange={(value) =>
                      updateReceiptFormField("currency", value)
                    }
                  >
                    <SelectTrigger id="receipt-currency">
                      <SelectValue placeholder="Selecciona moneda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REQUEST_CURRENCY.PEN}>
                        Soles (PEN)
                      </SelectItem>
                      <SelectItem value={REQUEST_CURRENCY.USD}>
                        Dólares (USD)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {receiptToReview && (roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.GIOF_MANAGER) && (
              <ReceiptDuplicateDecision
                key={[getQueryCacheAuthNamespace(), user?.id, roleCode, receiptToReview.receipt.request_id, receiptToReview.receipt.id].join(":")}
                review={receiptToReview}
                disabled={effectiveStructuredReportLocked || readOnly || updatingReceipt ||
                  JSON.stringify(receiptForm) !== JSON.stringify(getReceiptReviewFormState(receiptToReview))}
                onBusyChange={setResolvingDuplicate}
                onUpdated={(fresh) => {
                  if (JSON.stringify(receiptForm) === JSON.stringify(getReceiptReviewFormState(receiptToReview))) {
                    setReceiptForm(getReceiptReviewFormState(fresh));
                  }
                  setReceiptToReview(fresh);
                  upsertReceipt?.(fresh);
                }}
              />
            )}
            {operationError && receiptToReview ? (
              <div
                ref={operationErrorRef}
                tabIndex={-1}
                className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Alert variant="destructive">
                  <AlertDescription>
                    {operationError}. Conservamos este formulario abierto para
                    que corrijas el comprobante sin perder contexto.
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeReceiptReview}
                disabled={updatingReceipt}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveReceiptReview()}
                disabled={
                  updatingReceipt ||
                  resolvingDuplicate ||
                  !canManageActions ||
                  !receiptForm ||
                  !["PEN", "USD"].includes(receiptForm.currency)
                }
              >
                {updatingReceipt ? "Guardando..." : "Guardar corrección"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(receiptToConfirm)}
          onOpenChange={(open) => !open && closeReceiptConfirm()}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar datos del comprobante</DialogTitle>
              <DialogDescription>
                {isAdvanceSettlement
                  ? "Esta confirmación es necesaria para que el comprobante pueda agregarse al Informe de rendición. "
                  : "Confirma que los datos coincidan con el documento adjunto. "}
                Revisa el resumen y, si algo no coincide con el documento, usa
                Revisar datos antes de continuar.
              </DialogDescription>
            </DialogHeader>
            {receiptToConfirm && (
              <div className="space-y-3 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Pendiente de confirmación</Badge>
                  <span className="text-muted-foreground">
                    Datos detectados por lectura automática
                  </span>
                </div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Proveedor</dt>
                    <dd className="font-medium">
                      {receiptToConfirm.receipt.issuer_name ||
                        "Proveedor no detectado"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">RUC</dt>
                    <dd className="font-medium">
                      {receiptToConfirm.receipt.issuer_document_number ||
                        "RUC no detectado"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Comprobante
                    </dt>
                    <dd className="font-medium">
                      {[
                        receiptToConfirm.receipt.series,
                        receiptToConfirm.receipt.number,
                      ]
                        .filter(Boolean)
                        .join("-") || "Serie y número no detectados"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Fecha</dt>
                    <dd className="font-medium">
                      {receiptToConfirm.receipt.issue_date ||
                        "Fecha no detectada"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Monto</dt>
                    <dd className="font-medium">
                      {receiptToConfirm.receipt.amount === null
                        ? "Monto no detectado"
                        : formatRequestCurrency(
                            receiptToConfirm.receipt.amount,
                            receiptToConfirm.receipt.currency ?? null,
                          )}
                    </dd>
                  </div>
                </dl>
                {isAdvanceSettlement && (
                  <p className="text-xs text-muted-foreground">
                    Después de confirmar, podrás seleccionar la línea POA y
                    agregar este comprobante al Informe de rendición.
                  </p>
                )}
              </div>
            )}
            {operationError && receiptToConfirm ? (
              <div
                ref={operationErrorRef}
                tabIndex={-1}
                className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Alert variant="destructive">
                  <AlertDescription>
                    {operationError}. La confirmación sigue abierta para que
                    revises los datos o vuelvas a intentarlo.
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeReceiptConfirm}
                disabled={confirmingReceipt}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={moveReceiptConfirmToReview}
                disabled={confirmingReceipt}
              >
                Revisar datos
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmReceiptReview()}
                disabled={confirmingReceipt || !receiptToConfirm}
              >
                {confirmingReceipt
                  ? "Confirmando..."
                  : getReceiptConfirmationLabel(
                      request.request_type,
                      documents.find(
                        (document) =>
                          document.id === receiptToConfirm?.receipt.document_id,
                      ),
                    )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(documentToDelete)}
          onOpenChange={(open) => {
            if (!open && !deleting && !deleteInFlightRef.current) {
              setDeleteError(null);
              setDocumentToDelete(null);
            }
          }}
        >
          <DialogContent closeDisabled={deleting}>
            <DialogHeader>
              <DialogTitle>Eliminar documento</DialogTitle>
              <DialogDescription>
                Esta acción quitará el documento de la solicitud si cuentas con
                los permisos necesarios.
              </DialogDescription>
            </DialogHeader>
            {documentToDeleteName ? (
              <p className="max-w-full break-words text-sm font-medium">
                {documentToDeleteName}
              </p>
            ) : null}
            {deleteError ? (
              <div ref={deleteErrorRef} tabIndex={-1}>
                <Alert variant="destructive">
                  <AlertDescription>
                    {deleteError}. El documento no fue eliminado; puedes volver
                    a intentarlo o cancelar.
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 min-w-11 max-w-full"
                onClick={() => {
                  setDeleteError(null);
                  setDocumentToDelete(null);
                }}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11 min-w-11 max-w-full"
                onClick={() =>
                  documentToDelete && void handleDelete(documentToDelete)
                }
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
