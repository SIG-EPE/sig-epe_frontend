"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
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
import { useRequestDocuments, useRequestReceiptReviews, useRequestRenditionReport, useRequestRenditionReportActions } from "@/hooks/use-requests";
import { formatRequestCurrency, formatRequestDate, getApiErrorMessage, getPlanningLineDisplay, getRequestDocumentDisplayName } from "@/lib/requests";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_RENDITION_REPORT_STATUS,
  REQUEST_RENDITION_ROW_TYPE,
  REQUEST_STATUS,
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
  onChanged?: () => Promise<void> | void;
  onReadinessChange?: (ready: boolean, blockers: string[]) => void;
  onLockChange?: (locked: boolean) => void;
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
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_FAILED) return "Requiere regenerar informe";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.READY) return "Listo para generar";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.SUBMITTED) return "En revisión";
  if (report.status === REQUEST_RENDITION_REPORT_STATUS.OBSERVED) return "Observado";
  return "En preparación";
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

function renderBlockers(blockers: RequestRenditionValidationBlocker[]): ReactNode {
  if (blockers.length === 0) return null;
  return (
    <Alert variant={blockers.some((blocker) => blocker.code !== "UNCONFIRMED_RECEIPTS_PENDING") ? "destructive" : undefined}>
      <AlertDescription>
        <p className="font-medium">Pendientes del informe</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {blockers.map((blocker, index) => <li key={`${blocker.code}-${blocker.row_id ?? blocker.request_allocation_id ?? index}`}>{blocker.message}</li>)}
        </ul>
      </AlertDescription>
    </Alert>
  );
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
  return report.rows.every((row) => (
    Boolean(row.request_document_id)
    && Boolean(row.request_allocation_id)
    && Boolean(row.purchase_date)
    && Boolean(row.provider_name.trim())
    && Boolean(row.detail.trim())
    && Number(row.amount) > 0
  ));
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

export function StructuredRenditionReportCard({ request, guidanceAllocations = [], refreshSignal = 0, readOnly = false, onChanged, onReadinessChange, onLockChange }: StructuredRenditionReportCardProps) {
  const reportState = useRequestRenditionReport(request.id);
  const documentsState = useRequestDocuments(request.id);
  const receiptState = useRequestReceiptReviews(request.id);
  const actions = useRequestRenditionReportActions();
  const [manualForm, setManualForm] = useState<RowFormState>(EMPTY_ROW_FORM);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RowFormState>(EMPTY_ROW_FORM);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [blockers, setBlockers] = useState<RequestRenditionValidationBlocker[]>([]);
  const [ready, setReady] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<RequestRenditionRow | null>(null);
  const [isGenerateConfirmOpen, setIsGenerateConfirmOpen] = useState(false);
  const lastReadinessNotificationRef = useRef<string | null>(null);
  const lastLockNotificationRef = useRef<boolean | null>(null);

  const report = reportState.report;
  const allocationOptions = getAllocationOptions(request, report);
  const hasGuidanceAllocations = guidanceAllocations.length > 0;
  const documents = documentsState.documents;
  const rows = report?.rows ?? [];
  const evidenceDocuments = documents.filter((document) => document.document_category !== REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT);
  const generatedDocument = report?.settlement_report_document_id ? getDocumentById(documents, report.settlement_report_document_id) : null;
  const missingAllocations = report?.totals.missing_allocations ?? [];
  const allocationLabelsById = new Map(allocationOptions.map((option) => [option.id, option.label]));
  const receiptsWithoutRows = receiptState.receipts.filter((receiptReview) => !rows.some((row) => row.request_receipt_id === receiptReview.receipt.id));
  const confirmedReceipts = receiptsWithoutRows.filter((receiptReview) => receiptReview.receipt.confirmed_at);
  const unconfirmedReceipts = receiptsWithoutRows.filter((receiptReview) => !receiptReview.receipt.confirmed_at);
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
    || isObservedGeneratedReport
  );
  const reportGeneratedForReview = isReportGeneratedForReview(report);
  const reportLocked = isReportLocked(report, isObservedRequest);
  const validationReady = ready || isReportStatusReady(report);
  const derivedReady = reportGeneratedForReview;
  const canGenerateFromLoadedReport = validationReady || hasSafeReportCoverage(report) || report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_FAILED;
  const effectiveBlockers = (blockers.length > 0 ? blockers : missingAllocations.map((allocationId) => ({
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
  const unconfirmedReceiptsMessage = "Hay comprobantes pendientes de revisión. Confirma sus datos o elimínalos si no corresponden.";
  const hasUnconfirmedReceiptBlocker = effectiveBlockers.some((blocker) => blocker.code === "UNCONFIRMED_RECEIPT_EVIDENCE");
  const validationSummaryBlockers = [
    ...effectiveBlockers,
    ...(unconfirmedReceipts.length > 0 && !hasUnconfirmedReceiptBlocker ? [{ code: "UNCONFIRMED_RECEIPTS_PENDING", message: unconfirmedReceiptsMessage }] : []),
  ];
  const hasHardBlockers = effectiveBlockers.length > 0;
  const hasPendingValidationItems = validationSummaryBlockers.length > 0;
  const canUseGenerationAction = canRegenerateReport || (isReportEditable && canGenerateFromLoadedReport && !hasHardBlockers);
  const generationButtonLabel = canRegenerateReport ? "Regenerar informe" : "Generar informe";
  const readinessMessages = reportGeneratedForReview ? [] : ["Genera el informe antes de continuar a revisión."];
  const readinessMessagesKey = readinessMessages.join("\n");
  const hasEvidenceDocuments = evidenceDocuments.length > 0;
  const manualDisabledReason = allocationOptions.length === 0
    ? hasGuidanceAllocations
      ? "Estamos actualizando las líneas POA de esta rendición. Vuelve a intentar en unos segundos."
      : "No hay líneas POA disponibles para asociar comprobantes."
    : null;

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

  async function refreshAll(): Promise<void> {
    await Promise.all([reportState.refetch(), documentsState.refetch(), receiptState.refetch(), onChanged?.()]);
    setBlockers([]);
    setReady(false);
  }

  async function handleAddReceiptRow(receiptReview: RequestReceiptReview): Promise<void> {
    if (!isReportEditable) return;
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
      await actions.addReceiptRow(request.id, receiptReview.receipt.id, allocationId);
      toast.success("Comprobante agregado al informe");
      await refreshAll();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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
      await actions.createManualRow(request.id, payload);
      toast.success("Fila agregada al informe");
      setManualForm(EMPTY_ROW_FORM);
      setIsManualDialogOpen(false);
      await refreshAll();
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
      await actions.updateRow(request.id, editingRowId, payload);
      toast.success("Fila actualizada");
      setEditingRowId(null);
      await refreshAll();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleDeleteRow(): Promise<void> {
    if (!rowToDelete || !isReportEditable) return;
    try {
      await actions.deleteRow(request.id, rowToDelete.id);
      toast.success("Fila retirada del informe");
      setRowToDelete(null);
      await refreshAll();
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
        toast.warning("Hay pendientes del informe por resolver antes de continuar.");
      } else if (unconfirmedReceipts.length > 0) {
        toast.warning(unconfirmedReceiptsMessage);
      } else {
        toast.success("Informe validado correctamente");
      }
      await reportState.refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!canUseGenerationAction) return;
    try {
      await actions.generateReport(request.id);
      toast.success("Informe generado correctamente");
      setReady(true);
      setBlockers([]);
      await refreshAll();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      await reportState.refetch();
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
        {reportState.isLoading ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Cargando informe...</p> : null}
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

        {renderBlockers(validationSummaryBlockers)}

        {isObservedRequest ? (
          <Alert>
            <AlertDescription>La rendición fue observada; puedes actualizar sustentos y regenerar el informe antes de reenviar.</AlertDescription>
          </Alert>
        ) : null}

        {reportLocked ? (
          <Alert>
            <AlertDescription>El informe generado bloquea los comprobantes, documentos y filas. Podrás volver a editarlos si el informe es observado/reabierto o si la generación falla.</AlertDescription>
          </Alert>
        ) : null}

        {unconfirmedReceipts.length > 0 && isReportEditable ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Comprobantes por revisar</h3>
            <p className="text-sm text-muted-foreground">Confirma los datos detectados para usar estos comprobantes en el informe. Si no corresponden a la rendición, elimínalos desde Documentos adjuntos.</p>
            {unconfirmedReceipts.map((receiptReview) => (
              <div key={receiptReview.receipt.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-center">
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
            {confirmedReceipts.map((receiptReview) => {
              const selectedAllocationId = getValidReceiptAllocationId(receiptReview, documents, allocationOptions);
              const hasActiveDocument = hasActiveReceiptDocument(receiptReview, documents);
              const canAddReceipt = Boolean(selectedAllocationId && hasActiveDocument);
              return (
                <div key={receiptReview.receipt.id} className="grid min-w-0 gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={getReceiptSummary(receiptReview)}>{getReceiptSummary(receiptReview)}</p>
                    {canAddReceipt ? (
                      <p className="text-xs text-muted-foreground">Este comprobante pertenece a esta línea POA.</p>
                    ) : hasActiveDocument ? (
                      <p className="text-xs text-muted-foreground">Este comprobante no tiene una línea POA válida. Revísalo para asignarla o vuelve a adjuntarlo en la línea correcta.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">El documento de sustento ya no está activo. Vuelve a adjuntarlo para agregarlo al informe.</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    {selectedAllocationId ? renderAllocationSelect(selectedAllocationId, () => undefined, undefined, true) : <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">Línea POA no asignada</p>}
                  </div>
                  <Button type="button" onClick={() => void handleAddReceiptRow(receiptReview)} disabled={actions.isLoading || allocationOptions.length === 0 || !canAddReceipt}>Agregar al informe</Button>
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

        <section className="space-y-3 rounded-md border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Validación y generación</h3>
              <p className="text-xs text-muted-foreground">Valida que todas las líneas POA tengan comprobantes y luego genera el informe final.</p>
              {hasPendingValidationItems ? <p className="mt-1 text-xs text-muted-foreground">Revisa los pendientes agrupados arriba antes de continuar.</p> : null}
            </div>
            {isReportEditable || canRegenerateReport ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                {isReportEditable ? <Button type="button" variant="outline" onClick={() => void handleValidate()} disabled={actions.isLoading}>Validar informe</Button> : null}
                <Button type="button" onClick={openGenerateConfirmation} disabled={actions.isLoading || !canUseGenerationAction}>{generationButtonLabel}</Button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {reportGeneratedForReview ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-muted-foreground" />}
            <span>{generatedDocument ? `Documento generado: ${getRequestDocumentDisplayName(generatedDocument)}` : "Documento generado pendiente"}</span>
            {report?.drive_sync_error ? <span className="text-destructive">{report.drive_sync_error}</span> : null}
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
              <DialogTitle>Generar informe de rendición</DialogTitle>
              <DialogDescription>
                Al generar el informe se bloqueará los comprobantes, documentos y filas de esta rendición. Solo podrán editarse nuevamente si el informe es observado/reabierto o si la generación falla.
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
