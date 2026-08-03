import {
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_RENDITION_REPORT_STATUS,
  REQUEST_STATUS,
  type PaymentRequest,
  type RequestAllocation,
  type RequestDocument,
  type RequestReceiptReview,
  type RequestRenditionReport,
} from "@/types/requests";

export const SETTLEMENT_PREPARATION_STEP = {
  REVIEW_ADVANCE: "review-advance",
  REGISTER_RECEIPTS: "register-receipts",
  GENERATE_AND_SUBMIT: "generate-and-submit",
} as const;

export type SettlementPreparationStep =
  (typeof SETTLEMENT_PREPARATION_STEP)[keyof typeof SETTLEMENT_PREPARATION_STEP];

export const SETTLEMENT_PREPARATION_STEP_STATE = {
  COMPLETED: "completed",
  CURRENT: "current",
  PENDING: "pending",
} as const;

export type SettlementPreparationStepState =
  (typeof SETTLEMENT_PREPARATION_STEP_STATE)[keyof typeof SETTLEMENT_PREPARATION_STEP_STATE];

export const SETTLEMENT_LINE_TASK_STATE = {
  NEEDS_RECEIPT: "needs-receipt",
  PROCESSING: "processing",
  NEEDS_CONFIRMATION: "needs-confirmation",
  NEEDS_REPORT_ROW: "needs-report-row",
  COMPLETE: "complete",
} as const;

export type SettlementLineTaskState =
  (typeof SETTLEMENT_LINE_TASK_STATE)[keyof typeof SETTLEMENT_LINE_TASK_STATE];

export const SETTLEMENT_PREPARATION_CTA = {
  WAIT_FOR_DATA: "wait-for-data",
  LOCKED: "locked",
  RESOLVE_PENDING: "resolve-pending",
  CONTINUE: "continue",
  GENERATE: "generate",
  SUBMIT: "submit",
} as const;

export type SettlementPreparationCtaKind =
  (typeof SETTLEMENT_PREPARATION_CTA)[keyof typeof SETTLEMENT_PREPARATION_CTA];

export interface SettlementPreparationStepItem {
  id: SettlementPreparationStep;
  label: string;
  state: SettlementPreparationStepState;
}

export interface SettlementLineTask {
  id: string;
  label: string;
  amount: number;
  state: SettlementLineTaskState;
  nextAction: string | null;
  blocker: string | null;
}

export interface SettlementPendingItem {
  id: string;
  label: string;
  message: string;
  targetStep: SettlementPreparationStep;
  allocationId: string | null;
}

export interface SettlementPreparationReadiness {
  isReady: boolean;
  pendingCount: number;
}

export interface SettlementPreparationTotals {
  allocatedAmount: number;
  reportedAmount: number;
  differenceAmount: number;
  currency: string;
}

export interface SettlementPreparationLocks {
  isEditable: boolean;
  isReportLocked: boolean;
  canUpload: boolean;
  canGenerate: boolean;
  canSubmit: boolean;
}

export interface SettlementPreparationCta {
  kind: SettlementPreparationCtaKind;
  label: string;
  targetStep: SettlementPreparationStep | null;
  disabled: boolean;
  reason: string | null;
}

export interface SettlementPreparationExtras {
  hasBlocker: boolean;
}

export interface SettlementPreparationVm {
  activeStep: SettlementPreparationStep;
  steps: SettlementPreparationStepItem[];
  lineTasks: SettlementLineTask[];
  pendingItems: SettlementPendingItem[];
  readiness: SettlementPreparationReadiness;
  totals: SettlementPreparationTotals;
  locks: SettlementPreparationLocks;
  extras: SettlementPreparationExtras;
  cta: SettlementPreparationCta;
}

export interface BuildSettlementPreparationVmInput {
  request: PaymentRequest;
  activeStep: SettlementPreparationStep;
  documents: RequestDocument[];
  receipts: RequestReceiptReview[];
  report: RequestRenditionReport | null;
  resourcesReady: boolean;
  requestDataComplete: boolean;
  documentChecklistComplete: boolean;
  extrasHasBlocker?: boolean;
  guidanceAllocations?: RequestAllocation[];
}

const STEP_LABELS: Record<SettlementPreparationStep, string> = {
  [SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE]: "Revisa el anticipo",
  [SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS]: "Registra comprobantes",
  [SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT]: "Genera y envía",
};

function getAllocations(request: PaymentRequest, guidanceAllocations: RequestAllocation[]): RequestAllocation[] {
  return (request.allocations?.length ?? 0) > 0 ? request.allocations ?? [] : guidanceAllocations;
}

function getAllocationLabel(allocation: RequestAllocation, index: number): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  const code = line?.line_code?.trim();
  const description = line?.resource_description?.trim();
  const detail = [code, description].filter(Boolean).join(" — ");
  return detail ? `Línea ${index + 1}: ${detail}` : `Línea POA ${index + 1}`;
}

function isActiveReceiptDocument(document: RequestDocument): boolean {
  return document.document_category === REQUEST_DOCUMENT_CATEGORY.RECEIPT
    && document.upload_status !== REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED;
}

function buildLineTask(
  allocation: RequestAllocation,
  index: number,
  documents: RequestDocument[],
  receipts: RequestReceiptReview[],
  report: RequestRenditionReport | null,
): SettlementLineTask {
  const allocationId = allocation.id ?? allocation.budget_planning_line_id;
  const allocationDocuments = documents.filter((document) => document.request_allocation_id === allocationId && isActiveReceiptDocument(document));
  const documentIds = new Set(allocationDocuments.map((document) => document.id));
  const allocationReceipts = receipts.filter(({ receipt }) => (
    receipt.request_allocation_id === allocationId
    || Boolean(receipt.document_id && documentIds.has(receipt.document_id))
  ));
  const hasReportRow = Boolean(report?.rows.some((row) => row.request_allocation_id === allocationId));
  const coverage = report?.allocation_coverage.find((item) => item.request_allocation_id === allocationId);
  const hasAuthoritativeCoverage = hasReportRow || coverage?.has_rows === true;

  if (allocationDocuments.length === 0) {
    return {
      id: allocationId,
      label: getAllocationLabel(allocation, index),
      amount: Number(allocation.amount),
      state: SETTLEMENT_LINE_TASK_STATE.NEEDS_RECEIPT,
      nextAction: "Adjunta un comprobante",
      blocker: "Falta al menos un comprobante asociado a esta línea POA.",
    };
  }

  if (allocationReceipts.length === 0) {
    return {
      id: allocationId,
      label: getAllocationLabel(allocation, index),
      amount: Number(allocation.amount),
      state: SETTLEMENT_LINE_TASK_STATE.PROCESSING,
      nextAction: "Espera la lectura del comprobante",
      blocker: "El comprobante todavía no está disponible para revisión.",
    };
  }

  if (allocationReceipts.some(({ receipt }) => !receipt.confirmed_at)) {
    return {
      id: allocationId,
      label: getAllocationLabel(allocation, index),
      amount: Number(allocation.amount),
      state: SETTLEMENT_LINE_TASK_STATE.NEEDS_CONFIRMATION,
      nextAction: "Confirma los datos del comprobante",
      blocker: "Hay comprobantes cuyos datos todavía no han sido confirmados.",
    };
  }

  if (!hasAuthoritativeCoverage) {
    return {
      id: allocationId,
      label: getAllocationLabel(allocation, index),
      amount: Number(allocation.amount),
      state: SETTLEMENT_LINE_TASK_STATE.NEEDS_REPORT_ROW,
      nextAction: "Agrega el comprobante al informe",
      blocker: "El comprobante confirmado todavía no forma parte del informe.",
    };
  }

  return {
    id: allocationId,
    label: getAllocationLabel(allocation, index),
    amount: Number(allocation.amount),
    state: SETTLEMENT_LINE_TASK_STATE.COMPLETE,
    nextAction: null,
    blocker: null,
  };
}

function isGeneratedReportAligned(report: RequestRenditionReport | null, allocations: RequestAllocation[]): boolean {
  if (!report?.settlement_report_document_id) return false;
  if (report.status !== REQUEST_RENDITION_REPORT_STATUS.EXPORTED && report.status !== REQUEST_RENDITION_REPORT_STATUS.SUBMITTED) return false;
  if (report.rows.length === 0 || report.totals.missing_allocations.length > 0) return false;
  return allocations.every((allocation) => (
    report.rows.some((row) => row.request_allocation_id === (allocation.id ?? allocation.budget_planning_line_id))
    || report.allocation_coverage.some((coverage) => coverage.request_allocation_id === (allocation.id ?? allocation.budget_planning_line_id) && coverage.has_rows)
  ));
}

function isReportLocked(report: RequestRenditionReport | null, isObserved: boolean): boolean {
  if (isObserved) return false;
  return report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORT_PENDING
    || report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORTED
    || report?.status === REQUEST_RENDITION_REPORT_STATUS.SUBMITTED;
}

function getStepState(activeStep: SettlementPreparationStep, step: SettlementPreparationStep, completed: boolean): SettlementPreparationStepState {
  if (activeStep === step) return SETTLEMENT_PREPARATION_STEP_STATE.CURRENT;
  return completed ? SETTLEMENT_PREPARATION_STEP_STATE.COMPLETED : SETTLEMENT_PREPARATION_STEP_STATE.PENDING;
}

function buildCta(
  activeStep: SettlementPreparationStep,
  resourcesReady: boolean,
  locks: SettlementPreparationLocks,
  pendingItems: SettlementPendingItem[],
): SettlementPreparationCta {
  if (!resourcesReady) {
    return { kind: SETTLEMENT_PREPARATION_CTA.WAIT_FOR_DATA, label: "Validando información...", targetStep: null, disabled: true, reason: "Los datos de la rendición todavía están cargando." };
  }
  if (!locks.isEditable) {
    return { kind: SETTLEMENT_PREPARATION_CTA.LOCKED, label: "Rendición no editable", targetStep: null, disabled: true, reason: "El estado actual no permite modificar ni enviar la rendición." };
  }
  if (pendingItems.length > 0) {
    const firstPending = pendingItems[0];
    return { kind: SETTLEMENT_PREPARATION_CTA.RESOLVE_PENDING, label: "Resolver siguiente pendiente", targetStep: firstPending.targetStep, disabled: false, reason: firstPending.message };
  }
  if (locks.canSubmit) {
    return { kind: SETTLEMENT_PREPARATION_CTA.SUBMIT, label: "Enviar a revisión", targetStep: SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT, disabled: false, reason: null };
  }
  if (locks.canGenerate) {
    return { kind: SETTLEMENT_PREPARATION_CTA.GENERATE, label: "Generar informe", targetStep: SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT, disabled: false, reason: null };
  }
  const targetStep = activeStep === SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE
    ? SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS
    : SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT;
  return { kind: SETTLEMENT_PREPARATION_CTA.CONTINUE, label: "Continuar", targetStep, disabled: false, reason: null };
}

export function buildSettlementPreparationVm({
  request,
  activeStep,
  documents,
  receipts,
  report,
  resourcesReady,
  requestDataComplete,
  documentChecklistComplete,
  extrasHasBlocker = false,
  guidanceAllocations = [],
}: BuildSettlementPreparationVmInput): SettlementPreparationVm {
  const allocations = getAllocations(request, guidanceAllocations);
  const lineTasks = allocations.map((allocation, index) => buildLineTask(allocation, index, documents, receipts, report));
  const linePendingItems: SettlementPendingItem[] = lineTasks
    .filter((task) => task.blocker)
    .map((task) => ({
      id: `line-${task.id}`,
      label: task.label,
      message: task.blocker ?? "Completa esta línea POA.",
      targetStep: task.state === SETTLEMENT_LINE_TASK_STATE.NEEDS_REPORT_ROW
        ? SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT
        : SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS,
      allocationId: task.id,
    }));
  const pendingItems: SettlementPendingItem[] = [
    ...(!requestDataComplete ? [{ id: "request-data", label: "Revisa el anticipo", message: "Falta información obligatoria de la solicitud.", targetStep: SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE, allocationId: null }] : []),
    ...linePendingItems,
    ...(requestDataComplete && linePendingItems.length === 0 && !documentChecklistComplete
      ? [{ id: "document-checklist", label: "Documentos requeridos", message: "Faltan documentos requeridos para continuar.", targetStep: SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS, allocationId: null }]
      : []),
  ];
  const isEditable = request.status === REQUEST_STATUS.DRAFT || request.status === REQUEST_STATUS.OBSERVED;
  const reportLocked = isReportLocked(report, request.status === REQUEST_STATUS.OBSERVED);
  const linesComplete = lineTasks.length > 0 && lineTasks.every((task) => task.state === SETTLEMENT_LINE_TASK_STATE.COMPLETE);
  const generatedReportAligned = isGeneratedReportAligned(report, allocations);
  const preparationComplete = requestDataComplete && documentChecklistComplete && linesComplete;
  const locks: SettlementPreparationLocks = {
    isEditable,
    isReportLocked: reportLocked,
    canUpload: isEditable && !reportLocked,
    canGenerate: resourcesReady && isEditable && !reportLocked && preparationComplete && !generatedReportAligned,
    canSubmit: resourcesReady && isEditable && preparationComplete && generatedReportAligned,
  };
  const stepCompletion = {
    [SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE]: requestDataComplete,
    [SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS]: documentChecklistComplete && linesComplete,
    [SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT]: generatedReportAligned,
  };
  const steps = Object.values(SETTLEMENT_PREPARATION_STEP).map((step): SettlementPreparationStepItem => ({
    id: step,
    label: STEP_LABELS[step],
    state: getStepState(activeStep, step, stepCompletion[step]),
  }));
  const readiness = {
    isReady: resourcesReady && preparationComplete && generatedReportAligned,
    pendingCount: pendingItems.length,
  };
  const allocatedAmount = allocations.reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
  const reportedAmount = Number(report?.totals.total_amount ?? report?.total_amount ?? 0);
  const totals: SettlementPreparationTotals = {
    allocatedAmount,
    reportedAmount,
    differenceAmount: allocatedAmount - reportedAmount,
    currency: request.currency,
  };

  return {
    activeStep,
    steps,
    lineTasks,
    pendingItems,
    readiness,
    totals,
    locks,
    extras: { hasBlocker: extrasHasBlocker },
    cta: buildCta(activeStep, resourcesReady, locks, pendingItems),
  };
}
