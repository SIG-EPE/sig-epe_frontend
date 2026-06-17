"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRequestDocuments, useRequestReceiptReviews, useRequestRenditionReport, useRequestRenditionReportActions, useUploadRequestDocument } from "@/hooks/use-requests";
import { formatRequestCurrency, formatRequestDate, getApiErrorMessage, getPlanningLineDisplay, getRequestDocumentDisplayName } from "@/lib/requests";
import { cn } from "@/lib/utils";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_SCOPE_TYPE,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  LINE_RETURN_VALIDATION_STATUS,
  REQUEST_RENDITION_EXPORT_PENDING_STATE,
  REQUEST_RENDITION_REPORT_STATUS,
  REQUEST_RENDITION_ROW_TYPE,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type CreateManualRenditionRowInput,
  type PaymentRequest,
  type RequestAllocation,
  type RequestDocument,
  type RequestReceiptReview,
  type RequestRenditionReport,
  type RequestRenditionRow,
  type RequestRenditionValidationBlocker,
  type UpdateRenditionRowInput,
} from "@/types/requests";

interface StructuredRenditionReportCardProps {
  request: PaymentRequest;
  guidanceAllocations?: RequestAllocation[];
  refreshSignal?: number;
  readOnly?: boolean;
  reportResource?: ReturnType<typeof useRequestRenditionReport>;
  documentsResource?: ReturnType<typeof useRequestDocuments>;
  receiptsResource?: ReturnType<typeof useRequestReceiptReviews>;
  onChanged?: () => Promise<void> | void;
  onReadinessChange?: (ready: boolean, blockers: string[]) => void;
  onLockChange?: (locked: boolean) => void;
}

interface LineReturnFormState {
  returned_amount: string;
  justification: string;
  return_proof_document_id: string;
}

interface RowFormState {
  request_document_id: string;
  request_allocation_id: string;
  purchase_date: string;
  provider_name: string;
  receipt_number: string;
  detail: string;
  amount: string;
}

interface AllocationOption {
  id: string;
  label: string;
  allocation: RequestAllocation | null;
}

const RENDITION_CHECKLIST_RESPONSIBLE = {
  REQUESTER: "Solicitante",
  GIOF: "GIOF",
  SYSTEM: "Sistema",
} as const;

type RenditionChecklistResponsible = (typeof RENDITION_CHECKLIST_RESPONSIBLE)[keyof typeof RENDITION_CHECKLIST_RESPONSIBLE];

const RENDITION_CHECKLIST_STATUS = {
  OK: "ok",
  BLOCKER: "blocker",
  WARNING: "warning",
} as const;

type RenditionChecklistStatus = (typeof RENDITION_CHECKLIST_STATUS)[keyof typeof RENDITION_CHECKLIST_STATUS];

interface RenditionChecklistItem {
  id: string;
  title: string;
  description: string;
  responsible: RenditionChecklistResponsible;
  status: RenditionChecklistStatus;
}

const BULK_RECEIPT_ADD_STATUS = {
  IDLE: "idle",
  PROCESSING: "processing",
  SUCCESS: "success",
  ERROR: "error",
} as const;

type BulkReceiptAddStatus = (typeof BULK_RECEIPT_ADD_STATUS)[keyof typeof BULK_RECEIPT_ADD_STATUS];

interface BulkReceiptAddResult {
  status: BulkReceiptAddStatus;
  message?: string;
}

const EMPTY_ROW_FORM: RowFormState = {
  request_document_id: "",
  request_allocation_id: "",
  purchase_date: "",
  provider_name: "",
  receipt_number: "",
  detail: "",
  amount: "",
};

function getAllocationLabel(allocation: RequestAllocation, index: number): string {
  const lineLabel = getPlanningLineDisplay(allocation.planning_line ?? allocation.budgetPlanningLine);
  const amountLabel = Number(allocation.amount) > 0 ? ` · ${formatRequestCurrency(Number(allocation.amount), allocation.currency)}` : "";
  return `Línea ${index + 1}: ${lineLabel}${amountLabel}`;
}

function getCoverageAllocationLabel(plannedAmount: number, currency: string, index: number, backendLabel?: string): string {
  if (backendLabel?.trim()) return backendLabel.trim();
  const amountLabel = plannedAmount > 0 ? ` · ${formatRequestCurrency(plannedAmount, currency)}` : "";
  return `Línea POA ${index + 1}${amountLabel}`;
}

function toDateInputValue(value?: string | null): string {
  const dateOnly = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  return dateOnly;
}

function getAllocationOptions(request: PaymentRequest, report: RequestRenditionReport | null): AllocationOption[] {
  const options = new Map<string, AllocationOption>();
  const fallbackCurrency = report?.currency || request.currency;

  (request.allocations ?? []).forEach((allocation, index) => {
    if (!allocation.id) return;
    options.set(allocation.id, {
      id: allocation.id,
      label: getAllocationLabel(allocation, index),
      allocation,
    });
  });

  (report?.allocation_coverage ?? []).forEach((coverage, index) => {
    if (options.has(coverage.request_allocation_id)) return;
    options.set(coverage.request_allocation_id, {
      id: coverage.request_allocation_id,
      label: getCoverageAllocationLabel(Number(coverage.planned_amount), fallbackCurrency, index, coverage.request_allocation_label),
      allocation: null,
    });
  });

  return Array.from(options.values());
}

function getDocumentById(documents: RequestDocument[], documentId: string): RequestDocument | null {
  return documents.find((document) => document.id === documentId) ?? null;
}

function getReceiptDocumentAllocationId(receiptReview: RequestReceiptReview, documents: RequestDocument[]): string {
  if (receiptReview.receipt.request_allocation_id) return receiptReview.receipt.request_allocation_id;
  const document = receiptReview.receipt.document_id ? getDocumentById(documents, receiptReview.receipt.document_id) : null;
  return document?.request_allocation_id ?? "";
}

function getValidReceiptAllocationId(receiptReview: RequestReceiptReview, documents: RequestDocument[], allocationOptions: AllocationOption[]): string {
  const scopedAllocationId = getReceiptDocumentAllocationId(receiptReview, documents);
  return allocationOptions.some((option) => option.id === scopedAllocationId) ? scopedAllocationId : "";
}

function hasActiveReceiptDocument(receiptReview: RequestReceiptReview, documents: RequestDocument[]): boolean {
  return Boolean(receiptReview.receipt.document_id && getDocumentById(documents, receiptReview.receipt.document_id));
}

function getRowSourceLabel(row: RequestRenditionRow): string {
  return row.row_type === REQUEST_RENDITION_ROW_TYPE.MANUAL_EXTRA ? "Ingreso manual" : "Lectura revisada";
}

function getReportStatusLabel(report: RequestRenditionReport | null): string {
  if (!report) return "Preparando";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.EXPORTED) return "Informe generado";
  if (isExportPendingRetryAvailable(report)) return "Generación atascada";
  if (isExportPendingInProgress(report)) return "Generando informe";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_FAILED) return "Requiere regenerar informe";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.READY) return "Listo para generar";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.SUBMITTED) return "En revisión";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.OBSERVED) return "Observado";
  return "En preparación";
}

function isExportPendingWithoutDocument(report: RequestRenditionReport | null): boolean {
  return report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING && !report.settlement_report_document_id;
}

function isExportPendingRetryAvailable(report: RequestRenditionReport | null): boolean {
  return isExportPendingWithoutDocument(report)
    && (report?.can_retry_generation === true || report?.export_pending_state === REQUEST_RENDITION_EXPORT_PENDING_STATE.STALE_RETRY_AVAILABLE);
}

function isExportPendingInProgress(report: RequestRenditionReport | null): boolean {
  return isExportPendingWithoutDocument(report) && !isExportPendingRetryAvailable(report);
}

function toRowForm(row: RequestRenditionRow): RowFormState {
  return {
    request_document_id: row.request_document_id,
    request_allocation_id: row.request_allocation_id,
    purchase_date: toDateInputValue(row.purchase_date),
    provider_name: row.provider_name,
    receipt_number: row.receipt_number ?? "",
    detail: row.detail,
    amount: String(row.amount),
  };
}

function toManualPayload(form: RowFormState): CreateManualRenditionRowInput | null {
  const amount = Number(form.amount);
  if (!form.request_document_id || !form.request_allocation_id || !form.purchase_date || !form.provider_name.trim() || !form.detail.trim() || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    request_document_id: form.request_document_id,
    request_allocation_id: form.request_allocation_id,
    purchase_date: form.purchase_date,
    provider_name: form.provider_name.trim(),
    receipt_number: form.receipt_number.trim() || null,
    detail: form.detail.trim(),
    amount,
  };
}

function toUpdatePayload(form: RowFormState): UpdateRenditionRowInput | null {
  const manual = toManualPayload(form);
  if (!manual) return null;
  return manual;
}

function getReceiptSummary(receiptReview: RequestReceiptReview): string {
  const receipt = receiptReview.receipt;
  const number = [receipt.series, receipt.number].filter(Boolean).join("-") || "sin número";
  const provider = receipt.issuer_name?.trim() || "proveedor pendiente";
  const amount = receipt.amount === null ? "monto pendiente" : formatRequestCurrency(receipt.amount, receipt.currency || REQUEST_CURRENCY.PEN);
  return `${provider} · ${number} · ${amount}`;
}

function isReportStatusReady(report: RequestRenditionReport | null): boolean {
  switch (report?.status) {
    case REQUEST_RENDITION_REPORT_STATUS.READY:
    case REQUEST_RENDITION_REPORT_STATUS.SUBMITTED:
    case REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING:
    case REQUEST_RENDITION_REPORT_STATUS.EXPORTED:
      return true;
    default:
      return false;
  }
}

function getLineReturnChecklistTitle(code: string): string {
  switch (code) {
    case "LINE_RETURN_MISSING_EXECUTION":
      return "Pendiente administrativo GIOF";
    case "LINE_RETURN_REQUIRED":
    case "LINE_RETURN_PROOF_REQUIRED":
    case "LINE_RETURN_JUSTIFICATION_REQUIRED":
    case "LINE_RETURN_AMOUNT_MISMATCH":
      return "Devolución requerida";
    default:
      return "Pendiente de devolución";
  }
}

function getChecklistResponsibleForBlocker(code: string): RenditionChecklistResponsible {
  if (code === "LINE_RETURN_MISSING_EXECUTION") return RENDITION_CHECKLIST_RESPONSIBLE.GIOF;
  if (code.startsWith("EXPORT") || code.includes("REPORT")) return RENDITION_CHECKLIST_RESPONSIBLE.SYSTEM;
  return RENDITION_CHECKLIST_RESPONSIBLE.REQUESTER;
}

function getChecklistTitleForBlocker(blocker: RequestRenditionValidationBlocker): string {
  switch (blocker.code) {
    case "ALLOCATION_WITHOUT_ROWS":
    case "MISSING_ALLOCATION_COVERAGE":
      return "Comprobantes por completar";
    case "UNCONFIRMED_RECEIPTS_PENDING":
    case "UNCONFIRMED_RECEIPT_EVIDENCE":
      return "Comprobantes pendientes de revisión";
    case "LINE_RETURN_MISSING_EXECUTION":
    case "LINE_RETURN_REQUIRED":
    case "LINE_RETURN_PROOF_REQUIRED":
    case "LINE_RETURN_JUSTIFICATION_REQUIRED":
    case "LINE_RETURN_AMOUNT_MISMATCH":
      return getLineReturnChecklistTitle(blocker.code);
    default:
      return "Pendiente para enviar a revisión";
  }
}

function getChecklistDescriptionForBlocker(blocker: RequestRenditionValidationBlocker): string {
  switch (blocker.code) {
    case "LINE_RETURN_MISSING_EXECUTION":
      return "Falta registrar o vincular la base efectivamente pagada del anticipo. No se corrige en la rendición: GIOF debe regularizar el pago/ejecución antes de generar el informe.";
    case "LINE_RETURN_REQUIRED":
      return "La base pagada del anticipo supera el monto rendido. Registra la devolución exacta del saldo de la línea POA y adjunta la constancia correspondiente.";
    case "LINE_RETURN_PROOF_REQUIRED":
      return "La devolución ya requiere constancia: adjunta o selecciona un documento de devolución activo para la misma línea POA.";
    case "LINE_RETURN_JUSTIFICATION_REQUIRED":
      return "Completa una justificación breve para documentar la devolución del saldo no utilizado.";
    case "LINE_RETURN_AMOUNT_MISMATCH":
      return "El monto devuelto debe coincidir exactamente con el saldo esperado calculado para la línea POA.";
    default:
      return blocker.message;
  }
}

function getChecklistIcon(status: RenditionChecklistStatus): ReactNode {
  if (status === RENDITION_CHECKLIST_STATUS.OK) return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === RENDITION_CHECKLIST_STATUS.WARNING) return <AlertTriangle className="size-4 text-amber-600" />;
  return <XCircle className="size-4 text-destructive" />;
}

function getChecklistStatusLabel(status: RenditionChecklistStatus): string {
  if (status === RENDITION_CHECKLIST_STATUS.OK) return "Listo";
  if (status === RENDITION_CHECKLIST_STATUS.WARNING) return "Revisión";
  return "Bloquea envío";
}

function getChecklistStatusClassName(status: RenditionChecklistStatus): string {
  if (status === RENDITION_CHECKLIST_STATUS.OK) return "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20";
  if (status === RENDITION_CHECKLIST_STATUS.WARNING) return "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20";
  return "border-destructive/30 bg-destructive/5";
}

function isReportLocked(report: RequestRenditionReport | null, isObservedRequest = false): boolean {
  if (isObservedRequest) return false;

  return report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING
    || report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORTED
    || report?.status === REQUEST_RENDITION_REPORT_STATUS.SUBMITTED;
}

function isReportGeneratedForReview(report: RequestRenditionReport | null): boolean {
  if (!report?.settlement_report_document_id) return false;
  return report.status === REQUEST_RENDITION_REPORT_STATUS.EXPORTED || report.status === REQUEST_RENDITION_REPORT_STATUS.SUBMITTED;
}

function hasSafeReportCoverage(report: RequestRenditionReport | null): boolean {
  if (!report || report.rows.length === 0 || report.totals.missing_allocations.length > 0) return false;
  if (report.allocation_coverage.some((coverage) => !coverage.has_rows)) return false;
  if (report.allocation_coverage.some((coverage) => {
    const expectedReturn = Number(coverage.expected_return_amount ?? 0);
    if (expectedReturn <= 0) return false;
    return coverage.return_validation_status !== LINE_RETURN_VALIDATION_STATUS.VALID
      && coverage.return_validation_status !== LINE_RETURN_VALIDATION_STATUS.NOT_REQUIRED;
  })) return false;
  return report.rows.every((row) => (
    Boolean(row.request_document_id)
    && Boolean(row.request_allocation_id)
    && Boolean(row.purchase_date)
    && Boolean(row.provider_name.trim())
    && Boolean(row.detail.trim())
    && Number(row.amount) > 0
  ));
}

function toMoneyInput(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function getReturnValidationLabel(status?: string | null): string {
  switch (status) {
    case LINE_RETURN_VALIDATION_STATUS.VALID:
      return "Devolución conforme";
    case LINE_RETURN_VALIDATION_STATUS.NOT_REQUIRED:
      return "No requiere devolución";
    case LINE_RETURN_VALIDATION_STATUS.MISSING:
      return "Devolución requerida";
    case LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF:
      return "Falta constancia";
    case LINE_RETURN_VALIDATION_STATUS.MISSING_JUSTIFICATION:
      return "Falta justificación";
    case LINE_RETURN_VALIDATION_STATUS.MISMATCH:
      return "Monto no coincide";
    case LINE_RETURN_VALIDATION_STATUS.EXCESS:
      return "Exceso rendido para revisión GIOF";
    case LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION:
      return "Pendiente administrativo GIOF";
    default:
      return "Pendiente";
  }
}

function getLineBalanceStatusLabel(status: string | null | undefined, requiresReturnProof: boolean, expectedReturn: number): string {
  if (!requiresReturnProof && expectedReturn > 0) return "Saldo estimado";
  return getReturnValidationLabel(status);
}

function getLineReturnBlockerMessage(status: string | null | undefined, requiresReturnProof: boolean): string | null {
  if (!requiresReturnProof && status !== LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION) return null;
  switch (status) {
    case LINE_RETURN_VALIDATION_STATUS.MISSING:
      return "Devolución requerida: registra el saldo exacto no utilizado y adjunta la constancia de devolución de esta línea POA.";
    case LINE_RETURN_VALIDATION_STATUS.MISSING_PROOF:
      return "Selecciona o adjunta una constancia de devolución para esta línea.";
    case LINE_RETURN_VALIDATION_STATUS.MISSING_JUSTIFICATION:
      return "Ingresa una justificación breve para esta devolución.";
    case LINE_RETURN_VALIDATION_STATUS.MISMATCH:
      return "El monto devuelto debe coincidir exactamente con el saldo esperado.";
    case LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION:
      return "Pendiente administrativo GIOF: no se encontró la base efectivamente pagada de esta línea POA. Este dato proviene del pago/ejecución del anticipo original, no se ingresa en la rendición; GIOF debe regularizarlo antes de generar el informe.";
    default:
      return null;
  }
}

function getLineReturnMeaningMessage(expectedReturn: number, excessAmount: number, currency: string, requiresReturnProof: boolean): string | null {
  if (expectedReturn > 0) {
    if (!requiresReturnProof) {
      return `Saldo estimado: la base pagada supera lo rendido por ${formatRequestCurrency(expectedReturn, currency)}. En esta preparación inicial no se solicita constancia de devolución; GIOF decidirá si observa la rendición y pide sustento de devolución.`;
    }
    return `Devolución requerida: la base pagada es mayor al monto rendido. Debes devolver ${formatRequestCurrency(expectedReturn, currency)} y adjuntar una constancia para esta línea POA.`;
  }
  if (excessAmount > 0) {
    return `Exceso rendido para revisión GIOF: los gastos superan la base pagada por ${formatRequestCurrency(excessAmount, currency)}. No se solicita devolución ni constancia, pero GIOF debe revisar si corresponde observar o aceptar el exceso.`;
  }
  return null;
}

function cleanText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function joinMetadataParts(parts: Array<string | null | undefined>, separator = " / "): string | null {
  const visibleParts = parts.map(cleanText).filter((part): part is string => Boolean(part));
  return visibleParts.length > 0 ? visibleParts.join(separator) : null;
}

function formatBudgetMonth(month?: number | null): string | null {
  if (!month || month < 1 || month > 12) return null;
  return new Intl.DateTimeFormat("es-PE", { month: "long" }).format(new Date(2026, month - 1, 1));
}

function getCoverageClassificationItems(coverage: RequestRenditionReport["allocation_coverage"][number]): Array<{ label: string; value: string }> {
  const lineLabel = joinMetadataParts([coverage.line_code, coverage.line_name ?? coverage.resource_description], " · ");
  const periodLabel = joinMetadataParts([formatBudgetMonth(coverage.budget_month), coverage.fiscal_year ? String(coverage.fiscal_year) : null]);
  const items = [
    { label: "Clasificación / categoría", value: joinMetadataParts([coverage.classification_label, coverage.budget_category_label]) },
    { label: "Área / unidad", value: joinMetadataParts([coverage.area_label, coverage.org_unit_label]) },
    { label: "Centro de costos", value: cleanText(coverage.cost_center_label) },
    { label: "Línea / recurso", value: lineLabel },
    { label: "Programa / acción", value: joinMetadataParts([coverage.program_label, coverage.operative_action_label]) },
    { label: "Importancia / frecuencia", value: joinMetadataParts([coverage.importance_label, coverage.frequency_label]) },
    { label: "Periodo", value: periodLabel },
  ];

  return items.filter((item): item is { label: string; value: string } => Boolean(item.value));
}

function hasLineBalanceAmount(coverage: RequestRenditionReport["allocation_coverage"][number]): boolean {
  return Number(coverage.expected_return_amount ?? 0) > 0
    || Number(coverage.returned_amount ?? 0) > 0
    || Number(coverage.excess_amount ?? 0) > 0;
}

function hasRenditionActivity(report: RequestRenditionReport | null, confirmedReceiptCount: number): boolean {
  if (!report) return confirmedReceiptCount > 0;
  if (report.rows.length > 0 || confirmedReceiptCount > 0) return true;
  return report.allocation_coverage.some((coverage) => (
    coverage.has_rows
    || Number(coverage.row_count ?? 0) > 0
    || Number(coverage.row_total_amount ?? 0) > 0
    || Number(coverage.rendered_amount ?? 0) > 0
  ));
}

function hasGeneratedOrObservedReportStatus(report: RequestRenditionReport | null, isObservedRequest: boolean): boolean {
  if (isObservedRequest) return true;
  switch (report?.status) {
    case REQUEST_RENDITION_REPORT_STATUS.READY:
    case REQUEST_RENDITION_REPORT_STATUS.SUBMITTED:
    case REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING:
    case REQUEST_RENDITION_REPORT_STATUS.EXPORTED:
    case REQUEST_RENDITION_REPORT_STATUS.OBSERVED:
      return true;
    default:
      return false;
  }
}

function shouldRequireLineReturnProof(
  coverage: RequestRenditionReport["allocation_coverage"][number],
  isObservedRequest: boolean,
): boolean {
  return isObservedRequest || Boolean(coverage.line_return);
}

function isActiveReturnProofDocument(document: RequestDocument): boolean {
  return document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF
    && document.upload_status !== REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED;
}

export function StructuredRenditionReportCard({ request, guidanceAllocations = [], refreshSignal = 0, readOnly = false, reportResource, documentsResource, receiptsResource, onChanged, onReadinessChange, onLockChange }: StructuredRenditionReportCardProps) {
  const internalReportState = useRequestRenditionReport(request.id);
  const internalDocumentsState = useRequestDocuments(request.id);
  const internalReceiptState = useRequestReceiptReviews(request.id);
  const reportState = reportResource ?? internalReportState;
  const documentsState = documentsResource ?? internalDocumentsState;
  const receiptState = receiptsResource ?? internalReceiptState;
  const actions = useRequestRenditionReportActions();
  const uploadDocument = useUploadRequestDocument();
  const [manualForm, setManualForm] = useState<RowFormState>(EMPTY_ROW_FORM);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RowFormState>(EMPTY_ROW_FORM);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [blockers, setBlockers] = useState<RequestRenditionValidationBlocker[]>([]);
  const [ready, setReady] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<RequestRenditionRow | null>(null);
  const [isGenerateConfirmOpen, setIsGenerateConfirmOpen] = useState(false);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<string>>(() => new Set());
  const [bulkReceiptResults, setBulkReceiptResults] = useState<Record<string, BulkReceiptAddResult>>({});
  const [bulkReceiptProgress, setBulkReceiptProgress] = useState<{ completed: number; total: number; failed: number } | null>(null);
  const [isBulkAddingReceipts, setIsBulkAddingReceipts] = useState(false);
  const [lineReturnForms, setLineReturnForms] = useState<Record<string, LineReturnFormState>>({});
  const [openLineReturnForms, setOpenLineReturnForms] = useState<Set<string>>(() => new Set());
  const lastReadinessNotificationRef = useRef<string | null>(null);
  const lastLockNotificationRef = useRef<boolean | null>(null);
  const blockerSummaryRef = useRef<HTMLDivElement>(null);
  const firstReceiptBlockerRef = useRef<HTMLDivElement>(null);
  const shouldFocusBlockerRef = useRef(false);

  const report = reportState.report;
  const allocationOptions = getAllocationOptions(request, report);
  const hasGuidanceAllocations = guidanceAllocations.length > 0;
  const documents = documentsState.documents;
  const rows = report?.rows ?? [];
  const evidenceDocuments = documents.filter((document) => document.document_category !== REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT && document.document_category !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF);
  const returnProofDocuments = documents.filter(isActiveReturnProofDocument);
  const generatedDocument = report?.settlement_report_document_id ? getDocumentById(documents, report.settlement_report_document_id) : null;
  const missingAllocations = report?.totals.missing_allocations ?? [];
  const allocationLabelsById = new Map(allocationOptions.map((option) => [option.id, option.label]));
  const receiptsWithoutRows = receiptState.receipts.filter((receiptReview) => !rows.some((row) => row.request_receipt_id === receiptReview.receipt.id));
  const confirmedReceipts = receiptsWithoutRows.filter((receiptReview) => receiptReview.receipt.confirmed_at);
  const unconfirmedReceipts = receiptsWithoutRows.filter((receiptReview) => !receiptReview.receipt.confirmed_at);
  const unconfirmedActiveReceipts = receiptState.receipts.filter((receiptReview) => !receiptReview.receipt.confirmed_at && hasActiveReceiptDocument(receiptReview, documents));
  const isObservedRequest = request.status === REQUEST_STATUS.OBSERVED;
  const isObservedGeneratedReport = isObservedRequest && (
    report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORTED
    || report?.status === REQUEST_RENDITION_REPORT_STATUS.SUBMITTED
  );
  const isReportEditable = !readOnly && (
    report?.status === REQUEST_RENDITION_REPORT_STATUS.DRAFT
    || report?.status === REQUEST_RENDITION_REPORT_STATUS.OBSERVED
    || isObservedGeneratedReport
  );
  const canRegenerateReport = !readOnly && (
    report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_FAILED
    || isExportPendingRetryAvailable(report)
    || isObservedGeneratedReport
  );
  const reportGeneratedForReview = isReportGeneratedForReview(report);
  const lineBalanceCoverages = (report?.allocation_coverage ?? []).filter(hasLineBalanceAmount);
  const hasLineBalanceCandidates = lineBalanceCoverages.length > 0;
  const shouldShowLineBalances = hasLineBalanceCandidates
    && (hasRenditionActivity(report, confirmedReceipts.length) || hasGeneratedOrObservedReportStatus(report, isObservedRequest));
  const reportLocked = isReportLocked(report, isObservedRequest);
  const validationReady = ready || isReportStatusReady(report);
  const generatedReportMatchesCurrentRows = reportGeneratedForReview && hasSafeReportCoverage(report);
  const derivedReady = generatedReportMatchesCurrentRows;
  const canGenerateFromLoadedReport = validationReady || hasSafeReportCoverage(report) || report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_FAILED;
  const effectiveBlockers: RequestRenditionValidationBlocker[] = (blockers.length > 0 ? blockers : missingAllocations.map((allocationId): RequestRenditionValidationBlocker => ({
    code: "MISSING_ALLOCATION_COVERAGE",
    message: `Falta al menos un comprobante para ${allocationLabelsById.get(allocationId) ?? "una línea POA pendiente"}.`,
    request_allocation_id: allocationId,
    request_allocation_label: allocationLabelsById.get(allocationId),
  }))).map((blocker) => {
    if (!blocker.request_allocation_id) return blocker;
    const allocationLabel = blocker.request_allocation_label ?? allocationLabelsById.get(blocker.request_allocation_id);
    if (!allocationLabel) return blocker;
    if (blocker.code === "ALLOCATION_WITHOUT_ROWS") {
      return { ...blocker, request_allocation_label: allocationLabel, message: `Falta al menos un comprobante para ${allocationLabel}.` };
    }
    return { ...blocker, request_allocation_label: allocationLabel };
  });
  const unconfirmedReceiptsMessage = unconfirmedActiveReceipts.length === 1
    ? "Hay 1 comprobante pendiente de revisión. Confirma sus datos o elimínalo si no corresponde antes de generar el informe."
    : `Hay ${unconfirmedActiveReceipts.length} comprobantes pendientes de revisión. Confirma sus datos o elimínalos si no corresponden antes de generar el informe.`;
  const hasUnconfirmedReceiptBlocker = effectiveBlockers.some((blocker) => blocker.code === "UNCONFIRMED_RECEIPT_EVIDENCE");
  const validationSummaryBlockers = [
    ...effectiveBlockers,
    ...(unconfirmedActiveReceipts.length > 0 && !hasUnconfirmedReceiptBlocker ? [{ code: "UNCONFIRMED_RECEIPTS_PENDING", message: unconfirmedReceiptsMessage, pending_count: unconfirmedActiveReceipts.length }] : []),
  ];
  const administrativeCoverageBlockers = (report?.allocation_coverage ?? [])
    .filter((coverage) => coverage.return_validation_status === LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION)
    .map((coverage, index): RequestRenditionValidationBlocker => ({
      code: "LINE_RETURN_MISSING_EXECUTION",
      message: "No se encontró el registro administrativo del monto efectivamente pagado para esta línea POA. GIOF debe regularizar el pago/ejecución del anticipo antes de generar el informe.",
      request_allocation_id: coverage.request_allocation_id,
      request_allocation_label: allocationLabelsById.get(coverage.request_allocation_id) ?? coverage.request_allocation_label ?? `Línea POA ${index + 1}`,
    }));
  const administrativeBlockerKeys = new Set(validationSummaryBlockers.map((blocker) => `${blocker.code}:${blocker.request_allocation_id ?? blocker.row_id ?? blocker.message}`));
  const checklistBlockers = [
    ...validationSummaryBlockers,
    ...administrativeCoverageBlockers.filter((blocker) => !administrativeBlockerKeys.has(`${blocker.code}:${blocker.request_allocation_id ?? blocker.row_id ?? blocker.message}`)),
  ];
  const hasHardBlockers = effectiveBlockers.length > 0 || administrativeCoverageBlockers.length > 0;
  const hasPendingValidationItems = checklistBlockers.length > 0;
  const canGeneratePendingReport = !readOnly && !reportGeneratedForReview && !reportLocked && canGenerateFromLoadedReport && !hasHardBlockers;
  const canUseGenerationAction = !hasPendingValidationItems && (canRegenerateReport || canGeneratePendingReport);
  const canUseValidationAction = isReportEditable;
  const generationButtonLabel = isExportPendingRetryAvailable(report) ? "Reintentar generación" : canRegenerateReport ? "Regenerar informe actualizado" : "Generar informe";
  const exportPendingInProgress = isExportPendingInProgress(report);
  const exportPendingRetryAvailable = isExportPendingRetryAvailable(report);
  const paidBaseLabel = request.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT ? "Base pagada del anticipo" : "Base pagada";
  const readinessMessages = generatedReportMatchesCurrentRows
    ? []
    : reportGeneratedForReview
      ? ["Informe generado desactualizado: el Excel no coincide con la validación actual. Revisa los pendientes y regenera el informe actualizado antes de enviar."]
      : ["Informe pendiente de generación: genera el Excel validado antes de enviar a revisión."];
  const readinessMessagesKey = readinessMessages.join("\n");
  const excessCoverageWarnings = (report?.allocation_coverage ?? []).filter((coverage) => Number(coverage.excess_amount ?? 0) > 0 && coverage.return_validation_status !== LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION);
  const checklistItems: RenditionChecklistItem[] = [
    ...(checklistBlockers.length > 0
      ? checklistBlockers.map((blocker, index): RenditionChecklistItem => ({
        id: `${blocker.code}-${blocker.request_allocation_id ?? blocker.row_id ?? index}`,
        title: getChecklistTitleForBlocker(blocker),
        description: getChecklistDescriptionForBlocker(blocker),
        responsible: getChecklistResponsibleForBlocker(blocker.code),
        status: RENDITION_CHECKLIST_STATUS.BLOCKER,
      }))
      : [{
        id: "validation-ok",
        title: "Validación sin bloqueos",
        description: "Las líneas POA, comprobantes confirmados y devoluciones requeridas no presentan bloqueos para generar el informe.",
        responsible: RENDITION_CHECKLIST_RESPONSIBLE.REQUESTER,
        status: RENDITION_CHECKLIST_STATUS.OK,
      }]),
    ...(excessCoverageWarnings.length > 0 ? [{
      id: "excess-review",
      title: "Exceso rendido para revisión GIOF",
      description: excessCoverageWarnings.length === 1
        ? "Hay una línea donde el monto rendido supera la base pagada. No requiere constancia de devolución; GIOF revisará si corresponde aceptar u observar el exceso."
        : `Hay ${excessCoverageWarnings.length} líneas donde el monto rendido supera la base pagada. No requieren constancia de devolución; GIOF revisará si corresponde aceptar u observar el exceso.`,
      responsible: RENDITION_CHECKLIST_RESPONSIBLE.GIOF,
      status: RENDITION_CHECKLIST_STATUS.WARNING,
    } satisfies RenditionChecklistItem] : []),
    reportGeneratedForReview
      ? {
        id: "generated-report",
        title: generatedReportMatchesCurrentRows ? "Informe generado alineado" : "Informe generado desactualizado",
        description: generatedReportMatchesCurrentRows
          ? "El Excel generado coincide con la validación actual y está listo para adjuntarse al envío a revisión."
          : "El Excel generado ya no coincide con los datos o validaciones actuales. Regenera el informe actualizado antes de enviarlo a revisión.",
        responsible: RENDITION_CHECKLIST_RESPONSIBLE.SYSTEM,
        status: generatedReportMatchesCurrentRows ? RENDITION_CHECKLIST_STATUS.OK : RENDITION_CHECKLIST_STATUS.BLOCKER,
      }
      : {
        id: "generated-report",
        title: "Informe pendiente de generación",
        description: canUseGenerationAction
          ? "La rendición ya puede generar el Excel final desde la validación actual."
          : "Aún falta generar el Excel final; primero resuelve los bloqueos del checklist y luego genera el informe.",
        responsible: RENDITION_CHECKLIST_RESPONSIBLE.SYSTEM,
        status: RENDITION_CHECKLIST_STATUS.BLOCKER,
      },
  ];
  const checklistBlockerCount = checklistItems.filter((item) => item.status === RENDITION_CHECKLIST_STATUS.BLOCKER).length;
  const checklistWarningCount = checklistItems.filter((item) => item.status === RENDITION_CHECKLIST_STATUS.WARNING).length;
  const checklistReadyToSend = checklistBlockerCount === 0 && generatedReportMatchesCurrentRows;
  const finalChecklistCopy = checklistReadyToSend
    ? "Listo para enviar a revisión: el informe generado está alineado con la validación actual."
    : canUseGenerationAction
      ? "Siguiente paso: genera el informe final desde la validación actual."
      : reportGeneratedForReview && !generatedReportMatchesCurrentRows && canRegenerateReport
        ? "Siguiente paso: regenera el informe actualizado antes de reenviar."
        : "Siguiente paso: resuelve los pendientes indicados antes de generar o enviar.";
  const hasEvidenceDocuments = evidenceDocuments.length > 0;
  const manualDisabledReason = allocationOptions.length === 0
    ? hasGuidanceAllocations
      ? "Estamos actualizando las líneas POA de esta rendición. Vuelve a intentar en unos segundos."
      : "No hay líneas POA disponibles para asociar comprobantes."
    : null;
  const addableConfirmedReceipts = confirmedReceipts.filter((receiptReview) => canAddConfirmedReceipt(receiptReview));
  const addableReceiptIds = addableConfirmedReceipts.map((receiptReview) => receiptReview.receipt.id);
  const selectedAddableReceiptIds = addableReceiptIds.filter((receiptId) => selectedReceiptIds.has(receiptId));
  const areAllAddableReceiptsSelected = addableReceiptIds.length > 0 && selectedAddableReceiptIds.length === addableReceiptIds.length;

  useEffect(() => {
    const readinessNotificationKey = `${derivedReady ? "ready" : "pending"}:${readinessMessagesKey}`;
    if (lastReadinessNotificationRef.current === readinessNotificationKey) return;
    lastReadinessNotificationRef.current = readinessNotificationKey;
    onReadinessChange?.(derivedReady, readinessMessages);
  }, [derivedReady, onReadinessChange, readinessMessagesKey]);

  useEffect(() => {
    if (lastLockNotificationRef.current === reportLocked) return;
    lastLockNotificationRef.current = reportLocked;
    onLockChange?.(reportLocked);
  }, [onLockChange, reportLocked]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    void refreshAll();
  }, [refreshSignal]);

  useEffect(() => {
    if (!shouldFocusBlockerRef.current || validationSummaryBlockers.length === 0) return;
    shouldFocusBlockerRef.current = false;
    focusFirstBlocker();
  }, [validationSummaryBlockers.length]);

  useEffect(() => {
    const addableIds = new Set(addableReceiptIds);
    setSelectedReceiptIds((current) => {
      const next = new Set(Array.from(current).filter((receiptId) => addableIds.has(receiptId)));
      return next.size === current.size ? current : next;
    });
    setBulkReceiptResults((current) => {
      const nextEntries = Object.entries(current).filter(([receiptId]) => addableIds.has(receiptId));
      return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries);
    });
  }, [addableReceiptIds.join("|")]);

  function focusFirstBlocker(): void {
    const target = firstReceiptBlockerRef.current ?? blockerSummaryRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  function getLineReturnForm(coverage: RequestRenditionReport["allocation_coverage"][number]): LineReturnFormState {
    const existingForm = lineReturnForms[coverage.request_allocation_id];
    if (existingForm) return existingForm;
    return {
      returned_amount: toMoneyInput(coverage.line_return?.returned_amount ?? coverage.expected_return_amount ?? 0),
      justification: coverage.line_return?.justification ?? "",
      return_proof_document_id: coverage.line_return?.return_proof_document_id ?? "",
    };
  }

  function updateLineReturnForm(allocationId: string, patch: Partial<LineReturnFormState>): void {
    setLineReturnForms((current) => {
      const coverage = report?.allocation_coverage.find((item) => item.request_allocation_id === allocationId);
      const base = coverage ? getLineReturnForm(coverage) : { returned_amount: "0.00", justification: "", return_proof_document_id: "" };
      return { ...current, [allocationId]: { ...base, ...patch } };
    });
  }

  function openLineReturnForm(coverage: RequestRenditionReport["allocation_coverage"][number]): void {
    setLineReturnForms((current) => ({ ...current, [coverage.request_allocation_id]: getLineReturnForm(coverage) }));
    setOpenLineReturnForms((current) => new Set(current).add(coverage.request_allocation_id));
  }

  function closeLineReturnForm(allocationId: string): void {
    setOpenLineReturnForms((current) => {
      const next = new Set(current);
      next.delete(allocationId);
      return next;
    });
  }

  async function handleUploadReturnProof(allocationId: string, files: FileList | null): Promise<void> {
    const file = files?.item(0);
    if (!file || !isReportEditable) return;
    try {
      const document = await uploadDocument.uploadDocument(request.id, {
        file,
        document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: allocationId,
      });
      documentsState.upsertDocument?.(document);
      updateLineReturnForm(allocationId, { return_proof_document_id: document.id });
      toast.success("Constancia de devolución adjuntada a la línea POA");
      await documentsState.refetch({ background: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleSaveLineReturn(coverage: RequestRenditionReport["allocation_coverage"][number]): Promise<void> {
    if (!isReportEditable) return;
    const form = getLineReturnForm(coverage);
    const expectedReturn = Number(coverage.expected_return_amount ?? 0);
    const returnedAmount = Number(form.returned_amount);
    if (!Number.isFinite(returnedAmount) || returnedAmount < 0) {
      toast.error("Ingresa un monto devuelto válido.");
      return;
    }
    if (Math.round(returnedAmount * 100) !== Math.round(expectedReturn * 100)) {
      toast.error("El monto devuelto debe coincidir exactamente con el saldo esperado de la línea POA.");
      return;
    }
    if (!form.return_proof_document_id) {
      toast.error("Selecciona o adjunta la constancia de devolución de esta línea POA.");
      return;
    }
    if (!form.justification.trim()) {
      toast.error("Ingresa una justificación para la devolución de esta línea POA.");
      return;
    }
    try {
      const nextReport = await actions.upsertLineReturn(request.id, coverage.request_allocation_id, {
        returned_amount: returnedAmount,
        justification: form.justification.trim(),
        return_proof_document_id: form.return_proof_document_id,
      });
      reportState.replaceReport?.(nextReport);
      setLineReturnForms((current) => {
        const next = { ...current };
        delete next[coverage.request_allocation_id];
        return next;
      });
      closeLineReturnForm(coverage.request_allocation_id);
      toast.success("Devolución de línea POA guardada");
      await refreshReportOnly();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleDeleteLineReturn(allocationId: string): Promise<void> {
    if (!isReportEditable) return;
    try {
      await actions.deleteLineReturn(request.id, allocationId);
      setLineReturnForms((current) => {
        const next = { ...current };
        delete next[allocationId];
        return next;
      });
      toast.success("Devolución retirada de la línea POA");
      await refreshReportOnly();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([reportState.refetch({ background: true }), documentsState.refetch({ background: true }), receiptState.refetch({ background: true }), onChanged?.()]);
    setBlockers([]);
    setReady(false);
  }

  async function refreshReportOnly(): Promise<void> {
    await reportState.refetch({ background: true });
    setBlockers([]);
    setReady(false);
  }

  async function handleRefreshExportStatus(): Promise<void> {
    try {
      await refreshAll();
      toast.success("Estado de generación actualizado");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleAddReceiptRow(receiptReview: RequestReceiptReview): Promise<void> {
    if (!isReportEditable || isBulkAddingReceipts) return;
    if (!receiptReview.receipt.confirmed_at) {
      toast.error("Confirma los datos del comprobante antes de agregarlo al informe.");
      return;
    }
    const allocationId = getValidReceiptAllocationId(receiptReview, documents, allocationOptions);
    if (!allocationId) {
      toast.error("Este comprobante no tiene una línea POA válida. Revísalo para asignarla o vuelve a adjuntarlo en la línea correcta.");
      return;
    }
    try {
      const row = await actions.addReceiptRow(request.id, receiptReview.receipt.id, allocationId);
      reportState.upsertReportRow?.(row);
      toast.success("Comprobante agregado al informe");
      await refreshReportOnly();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function canAddConfirmedReceipt(receiptReview: RequestReceiptReview): boolean {
    const selectedAllocationId = getValidReceiptAllocationId(receiptReview, documents, allocationOptions);
    return Boolean(receiptReview.receipt.confirmed_at && selectedAllocationId && hasActiveReceiptDocument(receiptReview, documents));
  }

  function toggleReceiptSelection(receiptId: string, checked: boolean): void {
    setSelectedReceiptIds((current) => {
      const next = new Set(current);
      if (checked) next.add(receiptId);
      else next.delete(receiptId);
      return next;
    });
  }

  function toggleSelectAllAddableReceipts(checked: boolean): void {
    setSelectedReceiptIds((current) => {
      const next = new Set(current);
      addableReceiptIds.forEach((receiptId) => {
        if (checked) next.add(receiptId);
        else next.delete(receiptId);
      });
      return next;
    });
  }

  async function handleAddSelectedReceiptRows(): Promise<void> {
    if (!isReportEditable || isBulkAddingReceipts || selectedAddableReceiptIds.length === 0) return;
    const selectedReceipts = addableConfirmedReceipts.filter((receiptReview) => selectedReceiptIds.has(receiptReview.receipt.id));
    setIsBulkAddingReceipts(true);
    setBulkReceiptProgress({ completed: 0, total: selectedReceipts.length, failed: 0 });
    setBulkReceiptResults((current) => {
      const next = { ...current };
      selectedReceipts.forEach((receiptReview) => {
        next[receiptReview.receipt.id] = { status: BULK_RECEIPT_ADD_STATUS.IDLE };
      });
      return next;
    });

    let completed = 0;
    let failed = 0;
    const failedReceiptIds = new Set<string>();

    try {
      for (const receiptReview of selectedReceipts) {
        const receiptId = receiptReview.receipt.id;
        const allocationId = getValidReceiptAllocationId(receiptReview, documents, allocationOptions);
        if (!allocationId || !hasActiveReceiptDocument(receiptReview, documents)) {
          failed += 1;
          failedReceiptIds.add(receiptId);
          setBulkReceiptResults((current) => ({ ...current, [receiptId]: { status: BULK_RECEIPT_ADD_STATUS.ERROR, message: "No se puede agregar: falta línea POA válida o sustento activo." } }));
          setBulkReceiptProgress({ completed, total: selectedReceipts.length, failed });
          continue;
        }

        setBulkReceiptResults((current) => ({ ...current, [receiptId]: { status: BULK_RECEIPT_ADD_STATUS.PROCESSING } }));
        try {
          const row = await actions.addReceiptRow(request.id, receiptId, allocationId);
          reportState.upsertReportRow?.(row);
          completed += 1;
          setBulkReceiptResults((current) => ({ ...current, [receiptId]: { status: BULK_RECEIPT_ADD_STATUS.SUCCESS, message: "Agregado al informe." } }));
        } catch (error) {
          failed += 1;
          failedReceiptIds.add(receiptId);
          setBulkReceiptResults((current) => ({ ...current, [receiptId]: { status: BULK_RECEIPT_ADD_STATUS.ERROR, message: getApiErrorMessage(error) } }));
        }
        setBulkReceiptProgress({ completed, total: selectedReceipts.length, failed });
      }

      await refreshReportOnly();
      setSelectedReceiptIds(failedReceiptIds);
      if (failed > 0) {
        toast.error(`${failed} de ${selectedReceipts.length} comprobantes no se pudieron agregar. Revisa los resultados y reintenta.`);
      } else {
        toast.success(`${completed} comprobante${completed === 1 ? " agregado" : "s agregados"} al informe`);
      }
    } finally {
      setIsBulkAddingReceipts(false);
    }
  }

  async function handleCreateManualRow(): Promise<void> {
    if (!isReportEditable) return;
    const payload = toManualPayload(manualForm);
    if (!payload) {
      toast.error("Completa documento, línea POA, fecha, proveedor, detalle y monto.");
      return;
    }
    try {
      const row = await actions.createManualRow(request.id, payload);
      reportState.upsertReportRow?.(row);
      toast.success("Fila agregada al informe");
      setManualForm(EMPTY_ROW_FORM);
      setIsManualDialogOpen(false);
      await refreshReportOnly();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleUpdateRow(): Promise<void> {
    if (!editingRowId || !isReportEditable) return;
    const payload = toUpdatePayload(editForm);
    if (!payload) {
      toast.error("Completa los datos obligatorios de la fila.");
      return;
    }
    try {
      const row = await actions.updateRow(request.id, editingRowId, payload);
      reportState.upsertReportRow?.(row);
      toast.success("Fila actualizada");
      setEditingRowId(null);
      await refreshReportOnly();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleDeleteRow(): Promise<void> {
    if (!rowToDelete || !isReportEditable) return;
    try {
      await actions.deleteRow(request.id, rowToDelete.id);
      reportState.removeReportRow?.(rowToDelete.id);
      toast.success("Fila retirada del informe");
      setRowToDelete(null);
      await refreshReportOnly();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleValidate(): Promise<void> {
    if (!isReportEditable) return;
    try {
      const validation = await actions.validateReport(request.id);
      setReady(validation.ready);
      setBlockers(validation.blockers);
      if (!validation.ready) {
        shouldFocusBlockerRef.current = true;
        toast.warning("Hay pendientes del informe por resolver antes de continuar.");
      } else if (unconfirmedReceipts.length > 0) {
        shouldFocusBlockerRef.current = true;
        toast.warning(unconfirmedReceiptsMessage);
      } else {
        toast.success("Informe validado correctamente");
      }
      await reportState.refetch({ background: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!canUseGenerationAction) return;
    try {
      const generated = await actions.generateReport(request.id);
      if (generated.report) reportState.replaceReport?.(generated.report);
      if (generated.document) documentsState.upsertDocument?.(generated.document);
      toast.success("Informe generado correctamente");
      setReady(true);
      setBlockers([]);
      await Promise.all([reportState.refetch({ background: true }), documentsState.refetch({ background: true }), onChanged?.()]);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      await reportState.refetch({ background: true });
    }
  }

  function openGenerateConfirmation(): void {
    if (!canUseGenerationAction) return;
    setIsGenerateConfirmOpen(true);
  }

  async function confirmGenerate(): Promise<void> {
    await handleGenerate();
    setIsGenerateConfirmOpen(false);
  }

  function renderAllocationSelect(value: string, onValueChange: (value: string) => void, id?: string, disabled = false): ReactNode {
    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled || !isReportEditable || actions.isLoading || allocationOptions.length === 0}>
        <SelectTrigger id={id} className="w-full min-w-0 [&>span]:truncate"><SelectValue placeholder="Selecciona línea POA" /></SelectTrigger>
        <SelectContent className="max-w-[min(92vw,32rem)]">
          {allocationOptions.map((allocationOption) => (
            <SelectItem key={allocationOption.id} value={allocationOption.id} title={allocationOption.label}>{allocationOption.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  function renderDocumentSelect(value: string, onValueChange: (value: string) => void, id?: string): ReactNode {
    return (
      <Select value={value} onValueChange={onValueChange} disabled={!isReportEditable || actions.isLoading}>
        <SelectTrigger id={id}><SelectValue placeholder="Selecciona sustento" /></SelectTrigger>
        <SelectContent>
          {evidenceDocuments.map((document) => (
            <SelectItem key={document.id} value={document.id}>{getRequestDocumentDisplayName(document)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  function renderRowForm(form: RowFormState, setForm: (next: RowFormState) => void, isEdit = false): ReactNode {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={isEdit ? "edit-row-date" : "manual-row-date"}>Fecha *</label>
          <Input id={isEdit ? "edit-row-date" : "manual-row-date"} type="date" value={form.purchase_date} aria-describedby={isEdit ? "edit-row-date-help" : "manual-row-date-help"} disabled={!isReportEditable || actions.isLoading} onChange={(event) => setForm({ ...form, purchase_date: event.target.value })} />
          <p id={isEdit ? "edit-row-date-help" : "manual-row-date-help"} className="text-xs text-muted-foreground">Fecha del comprobante (día/mes/año). No requiere hora.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={isEdit ? "edit-row-provider" : "manual-row-provider"}>Proveedor *</label>
          <Input id={isEdit ? "edit-row-provider" : "manual-row-provider"} value={form.provider_name} disabled={!isReportEditable || actions.isLoading} onChange={(event) => setForm({ ...form, provider_name: event.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={isEdit ? "edit-row-receipt" : "manual-row-receipt"}>Nro. comprobante</label>
          <Input id={isEdit ? "edit-row-receipt" : "manual-row-receipt"} value={form.receipt_number} disabled={!isReportEditable || actions.isLoading} onChange={(event) => setForm({ ...form, receipt_number: event.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={isEdit ? "edit-row-amount" : "manual-row-amount"}>Monto *</label>
          <Input id={isEdit ? "edit-row-amount" : "manual-row-amount"} type="number" min="0.01" step="0.01" value={form.amount} disabled={!isReportEditable || actions.isLoading} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Línea POA *</label>
          {renderAllocationSelect(form.request_allocation_id, (value) => setForm({ ...form, request_allocation_id: value }))}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Sustento *</label>
          {renderDocumentSelect(form.request_document_id, (value) => setForm({ ...form, request_document_id: value }))}
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor={isEdit ? "edit-row-detail" : "manual-row-detail"}>Detalle *</label>
          <Textarea id={isEdit ? "edit-row-detail" : "manual-row-detail"} rows={2} value={form.detail} disabled={!isReportEditable || actions.isLoading} onChange={(event) => setForm({ ...form, detail: event.target.value })} />
        </div>
      </div>
    );
  }

  return (
    <Card data-testid="structured-rendition-report-card">
      <CardHeader>
        <CardTitle>Informe de rendición</CardTitle>
        <CardDescription>Revisa comprobantes, completa filas y genera el informe final desde la información validada.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {reportState.isLoading && !report ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Cargando informe...</p> : null}
        {reportState.isRefreshing ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">Actualizando informe en segundo plano…</p> : null}
        {reportState.error ? (
          <Alert variant="destructive"><AlertDescription>No se pudo cargar el informe. Intenta nuevamente.</AlertDescription></Alert>
        ) : null}

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Total rendido</p><p className="text-lg font-semibold">{formatRequestCurrency(report?.totals.total_amount ?? 0, report?.currency || request.currency)}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Filas registradas</p><p className="text-lg font-semibold">{rows.length}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Líneas POA pendientes</p><p className="text-lg font-semibold">{missingAllocations.length}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Estado</p><p className="text-lg font-semibold">{getReportStatusLabel(report)}</p></div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Total por línea POA</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {allocationOptions.map((allocationOption) => {
              const coverage = report?.allocation_coverage.find((item) => item.request_allocation_id === allocationOption.id);
              const allocation = allocationOption.allocation;
              return (
                <div key={allocationOption.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-medium">{allocationOption.label}</p><p className="text-xs text-muted-foreground">Planificado: {formatRequestCurrency(Number(allocation?.amount ?? coverage?.planned_amount ?? 0), allocation?.currency || report?.currency || request.currency)}</p></div>
                    <Badge variant={coverage?.has_rows ? "secondary" : "destructive"}>{coverage?.has_rows ? "Con comprobante" : "Pendiente"}</Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">Rendido: {formatRequestCurrency(coverage?.row_total_amount ?? 0, allocation?.currency || report?.currency || request.currency)} · {coverage?.row_count ?? 0} fila(s)</p>
                </div>
              );
            })}
            {allocationOptions.length === 0 && !hasGuidanceAllocations ? <p className="rounded-md border p-4 text-sm text-muted-foreground md:col-span-2">Aún no se cargaron líneas POA para esta rendición.</p> : null}
            {allocationOptions.length === 0 && hasGuidanceAllocations ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">
                <p className="font-medium text-foreground">Líneas del anticipo original como referencia</p>
                <p className="mt-1">Estamos actualizando las líneas de esta rendición. Cuando termine, podrás seleccionar cada línea POA para los comprobantes.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {guidanceAllocations.map((allocation, index) => (
                    <li key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`}>{getAllocationLabel(allocation, index)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        {hasLineBalanceCandidates && !shouldShowLineBalances ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Agrega y revisa comprobantes para calcular saldos por línea POA.
          </div>
        ) : null}

        {shouldShowLineBalances ? (
          <section className="space-y-3 rounded-md border p-4">
            <div>
              <h3 className="text-sm font-semibold">Saldos por línea POA</h3>
              <p className="text-xs text-muted-foreground">Durante la preparación inicial los saldos son informativos. La constancia de devolución se solicita solo si GIOF observa la rendición y pide sustento de devolución; el exceso rendido queda visible como advertencia de revisión.</p>
            </div>
            <div className="grid gap-3">
              {lineBalanceCoverages.map((coverage, index) => {
                const allocationLabel = allocationLabelsById.get(coverage.request_allocation_id) ?? coverage.request_allocation_label ?? `Línea POA ${index + 1}`;
                const currency = report?.currency || request.currency;
                const expectedReturn = Number(coverage.expected_return_amount ?? 0);
                const returnedAmount = Number(coverage.returned_amount ?? coverage.line_return?.returned_amount ?? 0);
                const excessAmount = Number(coverage.excess_amount ?? 0);
                const validationStatus = coverage.return_validation_status ?? (expectedReturn > 0 ? LINE_RETURN_VALIDATION_STATUS.MISSING : LINE_RETURN_VALIDATION_STATUS.NOT_REQUIRED);
                const requiresReturnProof = shouldRequireLineReturnProof(coverage, isObservedRequest);
                const isMissingExecution = validationStatus === LINE_RETURN_VALIDATION_STATUS.MISSING_EXECUTION;
                const blockerMessage = getLineReturnBlockerMessage(validationStatus, requiresReturnProof);
                const meaningMessage = getLineReturnMeaningMessage(expectedReturn, excessAmount, currency, requiresReturnProof);
                const form = getLineReturnForm(coverage);
                const lineReturnProofs = returnProofDocuments.filter((document) => document.request_allocation_id === coverage.request_allocation_id || document.id === coverage.line_return?.return_proof_document_id);
                const selectedProof = form.return_proof_document_id ? getDocumentById(documents, form.return_proof_document_id) : null;
                const amountMatches = Math.round(Number(form.returned_amount || 0) * 100) === Math.round(expectedReturn * 100);
                const isLineReturnFormOpen = openLineReturnForms.has(coverage.request_allocation_id);
                const savedProof = coverage.line_return?.return_proof_document_id ? getDocumentById(documents, coverage.line_return.return_proof_document_id) : null;
                const savedProofName = savedProof ? getRequestDocumentDisplayName(savedProof) : coverage.line_return?.return_proof_filename || coverage.line_return?.return_proof_document_id || null;
                const returnProofSelectId = `return-proof-${coverage.request_allocation_id}`;
                const returnProofUploadId = `return-proof-upload-${coverage.request_allocation_id}`;
                return (
                  <div key={coverage.request_allocation_id} className="space-y-4 rounded-md border bg-muted/20 p-3 text-sm" data-testid={`line-return-${coverage.request_allocation_id}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">{allocationLabel}</p>
                        <p className="text-xs text-muted-foreground">Saldo calculado contra la base efectivamente pagada para esta línea POA.</p>
                      </div>
                      <Badge variant={!requiresReturnProof || validationStatus === LINE_RETURN_VALIDATION_STATUS.VALID || validationStatus === LINE_RETURN_VALIDATION_STATUS.NOT_REQUIRED ? "secondary" : isMissingExecution ? "outline" : "destructive"}>{getLineBalanceStatusLabel(validationStatus, requiresReturnProof, expectedReturn)}</Badge>
                    </div>
                    <dl className="grid gap-2 sm:grid-cols-5">
                      <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted-foreground">{paidBaseLabel}</dt><dd className="font-semibold">{formatRequestCurrency(Number(coverage.paid_base_amount ?? coverage.planned_amount ?? 0), currency)}</dd></div>
                      <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted-foreground">Rendido</dt><dd className="font-semibold">{formatRequestCurrency(Number(coverage.rendered_amount ?? coverage.row_total_amount ?? 0), currency)}</dd></div>
                      <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted-foreground">Saldo esperado</dt><dd className="font-semibold">{formatRequestCurrency(expectedReturn, currency)}</dd></div>
                      <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted-foreground">Monto devuelto</dt><dd className="font-semibold">{formatRequestCurrency(returnedAmount, currency)}</dd></div>
                      <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted-foreground">Exceso</dt><dd className="font-semibold">{formatRequestCurrency(excessAmount, currency)}</dd></div>
                    </dl>
                    {meaningMessage ? <Alert><AlertDescription>{meaningMessage}</AlertDescription></Alert> : null}
                    {blockerMessage ? <Alert variant={isMissingExecution ? undefined : "destructive"} className={isMissingExecution ? "border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" : undefined}><AlertDescription className={isMissingExecution ? "text-amber-950 dark:text-amber-100" : undefined}>{blockerMessage}</AlertDescription></Alert> : null}
                    {coverage.line_return ? (
                      <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium">Devolución registrada</p>
                            <p className="text-xs">Monto: {formatRequestCurrency(Number(coverage.line_return.returned_amount), currency)}</p>
                          </div>
                          <Badge variant="secondary">Constancia vinculada</Badge>
                        </div>
                        <p className="text-xs">Constancia: {savedProofName ?? "pendiente de identificar"}</p>
                        <p className="text-xs">Justificación: {coverage.line_return.justification}</p>
                        {isObservedRequest || (reportGeneratedForReview && !generatedReportMatchesCurrentRows) ? (
                          <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                            <AlertDescription className="text-amber-950 dark:text-amber-100">Después de guardar esta devolución, regenera el informe actualizado antes de reenviar la rendición.</AlertDescription>
                          </Alert>
                        ) : null}
                      </div>
                    ) : null}
                    {expectedReturn > 0 && requiresReturnProof ? (
                      <div className="space-y-3">
                        {!isLineReturnFormOpen && !coverage.line_return ? (
                          <div className="flex flex-col gap-3 rounded-md border border-dashed bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">Registra la devolución de esta línea POA con su monto, justificación y constancia propia. No uses documentos generales para este sustento.</p>
                            {isReportEditable ? <Button type="button" onClick={() => openLineReturnForm(coverage)}>Registrar devolución</Button> : null}
                          </div>
                        ) : null}
                        {coverage.line_return && isReportEditable && !isLineReturnFormOpen ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button type="button" variant="outline" onClick={() => openLineReturnForm(coverage)}>Editar devolución</Button>
                            <Button type="button" variant="outline" onClick={() => void handleDeleteLineReturn(coverage.request_allocation_id)} disabled={actions.isLoading || uploadDocument.isLoading}>Quitar devolución</Button>
                          </div>
                        ) : null}
                        {isLineReturnFormOpen ? (
                          <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium" htmlFor={`return-amount-${coverage.request_allocation_id}`}>Monto devuelto *</label>
                              <Input id={`return-amount-${coverage.request_allocation_id}`} type="number" min="0" step="0.01" value={form.returned_amount} disabled={!isReportEditable || actions.isLoading} onChange={(event) => updateLineReturnForm(coverage.request_allocation_id, { returned_amount: event.target.value })} />
                              {!amountMatches ? <p className="text-xs text-destructive">Debe coincidir exactamente con {formatRequestCurrency(expectedReturn, currency)}.</p> : <p className="text-xs text-muted-foreground">Se completa con el saldo esperado; solo corrige si el sistema recalculó la línea.</p>}
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium" htmlFor={lineReturnProofs.length > 0 ? returnProofSelectId : returnProofUploadId}>Constancia de devolución *</label>
                              {lineReturnProofs.length > 0 ? (
                                <Select value={form.return_proof_document_id || undefined} onValueChange={(value) => updateLineReturnForm(coverage.request_allocation_id, { return_proof_document_id: value })} disabled={!isReportEditable || actions.isLoading || uploadDocument.isLoading}>
                                  <SelectTrigger id={returnProofSelectId}><SelectValue placeholder="Selecciona constancia de esta línea" /></SelectTrigger>
                                  <SelectContent>
                                    {lineReturnProofs.map((document) => (
                                      <SelectItem key={document.id} value={document.id}>{getRequestDocumentDisplayName(document)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">Aún no hay constancia activa para esta línea POA. Adjunta el archivo aquí para vincularlo automáticamente.</p>
                              )}
                              {selectedProof ? <p className="text-xs text-muted-foreground">Seleccionada: {getRequestDocumentDisplayName(selectedProof)}</p> : <p className="text-xs text-muted-foreground">Solo se muestran constancias activas de esta misma línea POA.</p>}
                              {isReportEditable ? <Input id={returnProofUploadId} aria-label={`Adjuntar constancia de devolución para ${allocationLabel}`} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={actions.isLoading || uploadDocument.isLoading} onChange={(event) => void handleUploadReturnProof(coverage.request_allocation_id, event.target.files)} /> : null}
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium" htmlFor={`return-justification-${coverage.request_allocation_id}`}>Justificación *</label>
                              <Textarea id={`return-justification-${coverage.request_allocation_id}`} rows={2} value={form.justification} disabled={!isReportEditable || actions.isLoading} onChange={(event) => updateLineReturnForm(coverage.request_allocation_id, { justification: event.target.value })} placeholder="Ej.: devolución por saldo no utilizado de la línea POA." />
                            </div>
                            {isReportEditable ? (
                              <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
                                <Button type="button" onClick={() => void handleSaveLineReturn(coverage)} disabled={actions.isLoading || uploadDocument.isLoading}>Guardar devolución de línea</Button>
                                <Button type="button" variant="outline" onClick={() => closeLineReturnForm(coverage.request_allocation_id)} disabled={actions.isLoading || uploadDocument.isLoading}>Cancelar</Button>
                                {coverage.line_return ? <Button type="button" variant="outline" onClick={() => void handleDeleteLineReturn(coverage.request_allocation_id)} disabled={actions.isLoading || uploadDocument.isLoading}>Quitar devolución</Button> : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : excessAmount > 0 ? (
                      <p className="text-xs text-muted-foreground">No adjuntes constancia de devolución para esta línea: no hay saldo a devolver. El exceso queda documentado para la revisión presupuestal de GIOF.</p>
                    ) : expectedReturn > 0 ? (
                      <p className="text-xs text-muted-foreground">No adjuntes constancia de devolución en esta preparación inicial. Completa comprobantes y genera el informe; si GIOF observa la rendición, esta línea se reabrirá para cargar la constancia solicitada.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {report?.allocation_coverage.some((coverage) => getCoverageClassificationItems(coverage).length > 0) ? (
          <section className="space-y-3 rounded-md border p-4">
            <div>
              <h3 className="text-sm font-semibold">Clasificación presupuestal</h3>
              <p className="text-xs text-muted-foreground">Datos que se incluirán en el informe generado, sin mostrar identificadores internos.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {report.allocation_coverage.map((coverage, index) => {
                const metadataItems = getCoverageClassificationItems(coverage);
                if (metadataItems.length === 0) return null;
                const allocationLabel = allocationLabelsById.get(coverage.request_allocation_id) ?? coverage.request_allocation_label ?? `Línea POA ${index + 1}`;
                return (
                  <div key={coverage.request_allocation_id} className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">{allocationLabel}</p>
                    <dl className="mt-3 grid gap-2">
                      {metadataItems.map((item) => (
                        <div key={item.label} className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
                          <dt className="text-xs text-muted-foreground">{item.label}</dt>
                          <dd className="font-medium">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section ref={blockerSummaryRef} tabIndex={-1} className="space-y-3 rounded-md border p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="rendition-readiness-checklist">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Estado para enviar a revisión</h3>
              <p className="text-xs text-muted-foreground">Checklist único de bloqueos, advertencias de revisión y estado del Excel generado.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={checklistBlockerCount > 0 ? "destructive" : "secondary"}>{checklistBlockerCount} bloqueo(s)</Badge>
              {checklistWarningCount > 0 ? <Badge variant="outline">{checklistWarningCount} revisión GIOF</Badge> : null}
            </div>
          </div>
          <div className="grid gap-2">
            {checklistItems.map((item) => (
              <div key={item.id} className={cn("flex gap-3 rounded-md border p-3 text-sm", getChecklistStatusClassName(item.status))}>
                <div className="mt-0.5">{getChecklistIcon(item.status)}</div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    <Badge variant="outline">{item.responsible}</Badge>
                    <Badge variant={item.status === RENDITION_CHECKLIST_STATUS.BLOCKER ? "destructive" : "secondary"}>{getChecklistStatusLabel(item.status)}</Badge>
                  </div>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className={cn("rounded-md px-3 py-2 text-sm font-medium", checklistReadyToSend ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200" : "bg-muted text-foreground")}>{finalChecklistCopy}</p>
        </section>

        {isObservedRequest ? (
          <Alert>
            <AlertDescription>La rendición fue observada; puedes actualizar sustentos y regenerar el informe antes de reenviar.</AlertDescription>
          </Alert>
        ) : null}

        {exportPendingInProgress ? (
          <Alert>
            <AlertDescription>
              La generación del informe está en proceso. Actualiza el estado en unos minutos para verificar si el Excel ya quedó disponible.
            </AlertDescription>
          </Alert>
        ) : null}

        {exportPendingRetryAvailable ? (
          <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertDescription className="text-amber-950 dark:text-amber-100">
              La generación anterior quedó atascada y no hay documento generado. Puedes reintentar la generación o actualizar el estado antes de hacerlo.
            </AlertDescription>
          </Alert>
        ) : null}

        {reportLocked && !exportPendingRetryAvailable && !exportPendingInProgress ? (
          <Alert>
            <AlertDescription>
              {reportGeneratedForReview || generatedDocument
                ? "El informe generado bloquea los comprobantes, documentos y filas. Podrás volver a editarlos si el informe es observado/reabierto o si la generación falla."
                : "La generación del informe está en proceso. Cuando el Excel quede generado se bloquearán los comprobantes, documentos y filas hasta que sea observado/reabierto o falle la generación."}
            </AlertDescription>
          </Alert>
        ) : null}

        {unconfirmedReceipts.length > 0 && isReportEditable ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Comprobantes por revisar</h3>
            <p className="text-sm text-muted-foreground">Confirma los datos detectados para usar estos comprobantes en el informe. Si no corresponden a la rendición, elimínalos desde Documentos adjuntos.</p>
            {unconfirmedReceipts.map((receiptReview, index) => (
              <div
                key={receiptReview.receipt.id}
                ref={index === 0 ? firstReceiptBlockerRef : undefined}
                tabIndex={index === 0 ? -1 : undefined}
                className="grid gap-3 rounded-md border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{getReceiptSummary(receiptReview)}</p>
                    <Badge variant="outline">Pendiente de confirmación</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Confirma los datos para habilitar Agregar al informe y seleccionar la línea POA.</p>
                </div>
                <Button type="button" disabled>Agregar al informe</Button>
              </div>
            ))}
          </section>
        ) : null}

        {confirmedReceipts.length > 0 && isReportEditable ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Comprobantes revisados por agregar</h3>
            <Alert>
                <AlertDescription>
                Cada comprobante confirmado se agrega únicamente a su línea POA asignada. Si no tiene línea POA válida, revísalo o vuelve a adjuntarlo en la línea correcta.
              </AlertDescription>
            </Alert>
            {allocationOptions.length === 0 ? (
              <Alert variant="destructive"><AlertDescription>No se encontraron líneas POA disponibles para asociar los comprobantes.</AlertDescription></Alert>
            ) : null}
            <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  checked={areAllAddableReceiptsSelected}
                  disabled={isBulkAddingReceipts || actions.isLoading || addableReceiptIds.length === 0}
                  onChange={(event) => toggleSelectAllAddableReceipts(event.target.checked)}
                />
                Seleccionar todos
                <span className="text-xs font-normal text-muted-foreground">({selectedAddableReceiptIds.length} de {addableReceiptIds.length} disponibles)</span>
              </label>
              <div className="flex flex-col gap-2 sm:items-end">
                <Button type="button" onClick={() => void handleAddSelectedReceiptRows()} disabled={isBulkAddingReceipts || actions.isLoading || selectedAddableReceiptIds.length === 0}>
                  {isBulkAddingReceipts ? "Agregando seleccionados..." : "Agregar seleccionados al informe"}
                </Button>
                {bulkReceiptProgress ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {bulkReceiptProgress.completed} de {bulkReceiptProgress.total} comprobantes agregados{bulkReceiptProgress.failed > 0 ? ` · ${bulkReceiptProgress.failed} con error` : ""}
                  </p>
                ) : null}
              </div>
            </div>
            {confirmedReceipts.map((receiptReview) => {
              const selectedAllocationId = getValidReceiptAllocationId(receiptReview, documents, allocationOptions);
              const hasActiveDocument = hasActiveReceiptDocument(receiptReview, documents);
              const canAddReceipt = Boolean(selectedAllocationId && hasActiveDocument);
              const receiptResult = bulkReceiptResults[receiptReview.receipt.id];
              return (
                <div key={receiptReview.receipt.id} className="grid min-w-0 gap-3 rounded-md border p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,18rem)_auto] md:items-center">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 rounded border-input md:mt-0"
                    aria-label={`Seleccionar ${getReceiptSummary(receiptReview)}`}
                    checked={selectedReceiptIds.has(receiptReview.receipt.id)}
                    disabled={isBulkAddingReceipts || actions.isLoading || !canAddReceipt}
                    onChange={(event) => toggleReceiptSelection(receiptReview.receipt.id, event.target.checked)}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium" title={getReceiptSummary(receiptReview)}>{getReceiptSummary(receiptReview)}</p>
                      {receiptResult?.status === BULK_RECEIPT_ADD_STATUS.PROCESSING ? <Badge variant="outline">Agregando</Badge> : null}
                      {receiptResult?.status === BULK_RECEIPT_ADD_STATUS.SUCCESS ? <Badge variant="secondary">Agregado</Badge> : null}
                      {receiptResult?.status === BULK_RECEIPT_ADD_STATUS.ERROR ? <Badge variant="destructive">Error</Badge> : null}
                    </div>
                    {canAddReceipt ? (
                      <p className="text-xs text-muted-foreground">Este comprobante pertenece a esta línea POA.</p>
                    ) : hasActiveDocument ? (
                      <p className="text-xs text-muted-foreground">Este comprobante no tiene una línea POA válida. Revísalo para asignarla o vuelve a adjuntarlo en la línea correcta.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">El documento de sustento ya no está activo. Vuelve a adjuntarlo para agregarlo al informe.</p>
                    )}
                    {receiptResult?.message ? <p className="text-xs text-muted-foreground">{receiptResult.message}</p> : null}
                  </div>
                  <div className="min-w-0">
                    {selectedAllocationId ? renderAllocationSelect(selectedAllocationId, () => undefined, undefined, true) : <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">Línea POA no asignada</p>}
                  </div>
                  <Button type="button" onClick={() => void handleAddReceiptRow(receiptReview)} disabled={isBulkAddingReceipts || actions.isLoading || allocationOptions.length === 0 || !canAddReceipt}>Agregar al informe</Button>
                </div>
              );
            })}
          </section>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Filas del informe</h3>
          {rows.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">Aún no hay comprobantes agregados al informe.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Comprobante</TableHead><TableHead>Detalle</TableHead><TableHead>Línea POA</TableHead><TableHead>Sustento</TableHead><TableHead>Monto</TableHead><TableHead>Origen</TableHead>{isReportEditable ? <TableHead>Acciones</TableHead> : null}</TableRow></TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const allocationOption = allocationOptions.find((option) => option.id === row.request_allocation_id) ?? null;
                  const document = getDocumentById(documents, row.request_document_id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{formatRequestDate(row.purchase_date)}</TableCell>
                      <TableCell>{row.provider_name}</TableCell>
                      <TableCell>{row.receipt_number ?? "—"}</TableCell>
                      <TableCell>{row.detail}</TableCell>
                      <TableCell>{allocationOption ? allocationOption.label : "Línea POA no disponible"}</TableCell>
                      <TableCell>{document ? getRequestDocumentDisplayName(document) : row.request_document_id}</TableCell>
                      <TableCell>{formatRequestCurrency(row.amount, row.currency)}</TableCell>
                      <TableCell><Badge variant="outline">{getRowSourceLabel(row)}</Badge></TableCell>
                      {isReportEditable ? (
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={actions.isLoading} onClick={() => { setEditingRowId(row.id); setEditForm(toRowForm(row)); }}>Editar</Button>
                            <Button type="button" variant="outline" size="sm" disabled={actions.isLoading} onClick={() => setRowToDelete(row)}>Quitar</Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>

        {isReportEditable ? (
          <section className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Comprobantes adicionales</h3>
              <p className="text-xs text-muted-foreground">Agrega un comprobante adicional ya adjunto como sustento y asociado a una línea POA.</p>
              {!hasEvidenceDocuments && allocationOptions.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">Primero adjunta el documento de sustento; luego podrás seleccionarlo dentro del modal.</p> : null}
              {manualDisabledReason ? <p className="mt-1 text-xs text-muted-foreground">{manualDisabledReason}</p> : null}
            </div>
            <Button type="button" onClick={() => setIsManualDialogOpen(true)} disabled={actions.isLoading || allocationOptions.length === 0}>Agregar comprobante adicional</Button>
          </section>
        ) : null}

        <section className="space-y-3 rounded-md border p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="rendition-generation-actions" tabIndex={-1}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Validación y generación</h3>
              <p className="text-xs text-muted-foreground">Valida que todas las líneas POA tengan comprobantes y luego genera el informe final.</p>
              {hasPendingValidationItems ? <p className="mt-1 text-xs text-muted-foreground">Revisa los pendientes del checklist antes de continuar. La página se mantiene en esta sección para que puedas corregirlos sin recargar.</p> : null}
            </div>
            {canUseValidationAction || canUseGenerationAction || hasPendingValidationItems || isExportPendingWithoutDocument(report) ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                {canUseValidationAction ? <Button type="button" variant="outline" onClick={() => void handleValidate()} disabled={actions.isLoading}>Validar informe</Button> : null}
                {isExportPendingWithoutDocument(report) ? <Button type="button" variant="outline" onClick={() => void handleRefreshExportStatus()} disabled={actions.isLoading || reportState.isRefreshing}>Actualizar estado</Button> : null}
                {hasPendingValidationItems ? <Button type="button" variant="outline" onClick={focusFirstBlocker}>Ir al primer pendiente</Button> : null}
                {!exportPendingInProgress ? <Button type="button" onClick={openGenerateConfirmation} disabled={actions.isLoading || !canUseGenerationAction}>{generationButtonLabel}</Button> : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {reportGeneratedForReview ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-muted-foreground" />}
            <span>{generatedDocument ? `Documento generado: ${getRequestDocumentDisplayName(generatedDocument)}` : "Documento generado pendiente"}</span>
            {exportPendingInProgress ? <span className="text-muted-foreground">Generación en progreso; usa Actualizar estado para revisar avances.</span> : null}
            {exportPendingRetryAvailable ? <span className="text-amber-600">Generación atascada; reintenta para recuperar el informe.</span> : null}
            {report?.drive_sync_error ? <span className="text-destructive">{report.drive_sync_error}</span> : null}
            {reportGeneratedForReview && !generatedReportMatchesCurrentRows ? <span className="text-amber-600">Informe generado desactualizado: regenera el informe actualizado antes de enviar.</span> : null}
            {report?.exported_at ? <span className="text-muted-foreground">Generado: {formatRequestDate(report.exported_at)}</span> : null}
            <FileSpreadsheet className="size-4 text-muted-foreground" />
          </div>
        </section>

        <Dialog open={Boolean(editingRowId)} onOpenChange={(open) => { if (!open) setEditingRowId(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Editar fila del informe</DialogTitle><DialogDescription>Actualiza los datos revisados del comprobante.</DialogDescription></DialogHeader>
            {renderRowForm(editForm, setEditForm, true)}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingRowId(null)}>Cancelar</Button><Button type="button" onClick={() => void handleUpdateRow()} disabled={actions.isLoading || !isReportEditable}>Guardar cambios</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isManualDialogOpen} onOpenChange={(open) => { setIsManualDialogOpen(open); if (!open) setManualForm(EMPTY_ROW_FORM); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Agregar comprobante adicional</DialogTitle><DialogDescription>Completa los datos del comprobante, selecciona una línea POA y el documento de sustento adjunto.</DialogDescription></DialogHeader>
            {!hasEvidenceDocuments ? <Alert><AlertDescription>Adjunta primero el documento de sustento del comprobante para poder seleccionarlo aquí.</AlertDescription></Alert> : null}
            {renderRowForm(manualForm, setManualForm)}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsManualDialogOpen(false)}>Cancelar</Button><Button type="button" onClick={() => void handleCreateManualRow()} disabled={actions.isLoading || !isReportEditable || evidenceDocuments.length === 0 || allocationOptions.length === 0}>Guardar comprobante</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(rowToDelete)} onOpenChange={(open) => { if (!open) setRowToDelete(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Quitar fila del informe</DialogTitle><DialogDescription>La fila se retirará del informe, pero el documento de sustento permanecerá adjunto.</DialogDescription></DialogHeader>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setRowToDelete(null)}>Cancelar</Button><Button type="button" variant="destructive" onClick={() => void handleDeleteRow()} disabled={actions.isLoading || !isReportEditable}>Quitar fila</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isGenerateConfirmOpen} onOpenChange={setIsGenerateConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{exportPendingRetryAvailable ? "Reintentar generación del informe" : canRegenerateReport ? "Regenerar informe actualizado" : "Generar informe de rendición"}</DialogTitle>
              <DialogDescription>
                Al {exportPendingRetryAvailable ? "reintentar la generación" : canRegenerateReport ? "regenerar el informe actualizado" : "generar el informe"} se bloqueará los comprobantes, documentos y filas de esta rendición. Solo podrán editarse nuevamente si el informe es observado/reabierto o si la generación falla.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsGenerateConfirmOpen(false)} disabled={actions.isLoading}>Cancelar</Button>
              <Button type="button" onClick={() => void confirmGenerate()} disabled={actions.isLoading || !canUseGenerationAction}>{actions.isLoading ? "Generando..." : `Sí, ${generationButtonLabel.toLowerCase()}`}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
