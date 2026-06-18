"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetPreview, useCreateRequest, useRequestDocuments, useRequestPlanningLines, useRequestReceiptReviews, useSubmitRequest, useUpdateRequest } from "@/hooks/use-requests";
import { getBusinessDateString } from "@/lib/business-timezone";
import { ROUTES } from "@/lib/constants";
import {
  REQUEST_EDIT_STEP,
  getApiErrorMessage,
  getMissingDocumentMessagesFromError,
  getNewAdvancePendingSettlementBlockMessage,
  getRequestReviewNavigationIssues,
  getRequestEditStepperItems,
  getRequiredDocumentChecklist,
  REQUEST_TYPE_LABELS,
  getRequestStatusLabel,
  BENEFICIARY_DOCUMENT_TYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  formatRequestCurrency,
  formatRequestDate,
  getPlanningLineDisplay,
  getRequestMonthLabel,
  isBudgetPreviewBlocking,
  isBankCciRequired,
  isBcpBank,
  isKnownBankCode,
  isOtherBank,
  validateRequestDataForSubmit,
  validateRequestDataForSubmitIssues,
  type RequestSubmitDataWithAllocations,
  type RequestEditStep,
  type RequestSubmitValidationIssue,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import {
  ACCOUNT_TYPE,
  BANK_CODE,
  BENEFICIARY_DOCUMENT_TYPE,
  REQUEST_STATUS,
  REQUEST_CURRENCY,
  REQUEST_TYPE,
  type AccountType,
  type BankCode,
  type BeneficiaryDocumentType,
  type CreateRequestDto,
  type PaymentRequest,
  type RequestPlanningLineLookupItem,
  type RequestStatus,
  type RequestType,
  type UpdateRequestDto,
  type SettlementContextResponse,
} from "@/types/requests";
import { BeneficiaryFields } from "./beneficiary-fields";
import { BudgetPreviewCard } from "./budget-preview-card";
import { PlanningLineSelector } from "./planning-line-selector";
import { RequestTypeSelector } from "./request-type-selector";
import { RequestDocumentsCard } from "./request-documents-card";
import { SettlementContextCard } from "./settlement-context-card";
import { StructuredRenditionReportCard } from "./structured-rendition-report-card";
import { SupplierFields } from "./supplier-fields";

const STRUCTURED_REPORT_PENDING_MESSAGE = "Informe pendiente de generación: genera el Excel validado antes de enviar a revisión.";

export const requestFormSchema = z.object({
  request_type: z.enum([
    REQUEST_TYPE.ADVANCE,
    REQUEST_TYPE.REIMBURSEMENT,
    REQUEST_TYPE.SUPPLIER_PAYMENT,
    REQUEST_TYPE.ADVANCE_SETTLEMENT,
  ], { errorMap: () => ({ message: "Selecciona un tipo de solicitud válido" }) }),
  budget_planning_line_id: z.string().optional(),
  requested_amount: z.coerce.number().optional(),
  allocations: z.array(z.object({
    client_key: z.string(),
    budget_planning_line_id: z.string().min(1, "Selecciona una línea POA"),
    amount: z.coerce.number().positive("El monto de la línea POA debe ser mayor a cero"),
  })).min(1, "Debe agregar al menos una línea POA."),
  concept: z.string().min(5, "Describe el concepto o justificación").max(120, "El concepto o justificación debe tener máximo 120 caracteres."),
  scheduled_rendition_at: z.string().optional(),
  beneficiary_name: z.string().optional(),
  beneficiary_document_type: z.union([z.enum([
    BENEFICIARY_DOCUMENT_TYPE.DNI,
    BENEFICIARY_DOCUMENT_TYPE.CE,
    BENEFICIARY_DOCUMENT_TYPE.RUC,
  ]), z.literal("")]).optional(),
  beneficiary_document_number: z.string().optional(),
  bank_code: z.union([z.enum([
    BANK_CODE.BCP,
    BANK_CODE.BBVA,
    BANK_CODE.INTERBANK,
    BANK_CODE.SCOTIABANK,
    BANK_CODE.BANBIF,
    BANK_CODE.PICHINCHA,
    BANK_CODE.NACION,
    BANK_CODE.COMERCIO,
    BANK_CODE.MIBANCO,
    BANK_CODE.GNB,
    BANK_CODE.OTROS_BANCOS,
  ]), z.literal("")]).optional(),
  bank_name: z.string().max(100, "El nombre del banco debe tener máximo 100 caracteres.").optional(),
  bank_account: z.string().optional(),
  bank_cci: z.string().optional(),
  account_type: z.union([z.enum([ACCOUNT_TYPE.SAVINGS, ACCOUNT_TYPE.CHECKING]), z.literal("")]).optional(),
  supplier_ruc: z.string().optional(),
  supplier_name: z.string().optional(),
}).superRefine((value, ctx) => {
  const scheduledRenditionAt = value.scheduled_rendition_at?.trim();
  if (value.request_type === REQUEST_TYPE.ADVANCE && scheduledRenditionAt && scheduledRenditionAt < getScheduledRenditionMinDate()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduled_rendition_at"], message: "La fecha límite de rendición no puede ser anterior a hoy" });
  }
  const seenPlanningLineIds = new Set<string>();
  value.allocations.forEach((allocation, index) => {
    if (allocation.budget_planning_line_id && seenPlanningLineIds.has(allocation.budget_planning_line_id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocations", index, "budget_planning_line_id"], message: "Esta línea POA ya fue agregada; edite el monto del bloque existente." });
    }
    seenPlanningLineIds.add(allocation.budget_planning_line_id);
  });
}).superRefine((value, ctx) => {
  if (value.request_type !== REQUEST_TYPE.SUPPLIER_PAYMENT) return;
  if (!value.supplier_ruc?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supplier_ruc"], message: "El RUC del proveedor es requerido" });
  }
  if (!value.supplier_name?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supplier_name"], message: "El nombre del proveedor es requerido" });
  }
  if (value.supplier_ruc?.trim() && !/^\d{11}$/.test(value.supplier_ruc.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supplier_ruc"], message: "El RUC del proveedor debe tener 11 dígitos" });
  }
}).superRefine((value, ctx) => {
  const documentType = value.beneficiary_document_type;
  const documentNumber = value.beneficiary_document_number?.trim().toUpperCase() ?? "";
  if (documentNumber && !documentType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beneficiary_document_type"], message: "Selecciona el tipo de documento" });
  }
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.DNI && !/^\d{8}$/.test(documentNumber)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beneficiary_document_number"], message: "El DNI debe tener 8 dígitos" });
  }
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.RUC && !/^\d{11}$/.test(documentNumber)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beneficiary_document_number"], message: "El RUC debe tener 11 dígitos" });
  }
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.CE && !/^[A-Z0-9]{6,12}$/.test(documentNumber)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beneficiary_document_number"], message: "El CE debe tener de 6 a 12 letras o números" });
  }
  const bankCode = value.bank_code && isKnownBankCode(value.bank_code) ? value.bank_code : null;
  const bankName = value.bank_name?.trim() ?? "";
  const bankCci = value.bank_cci?.trim() ?? "";
  if (value.bank_account?.trim() && !/^\d{6,30}$/.test(value.bank_account.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_account"], message: "La cuenta debe tener entre 6 y 30 dígitos" });
  }
  if (isOtherBank(bankCode) && !bankName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_name"], message: "Ingresa el nombre del banco." });
  }
  if (isBankCciRequired(bankCode) && !bankCci) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_cci"], message: "Ingresa el CCI de 20 dígitos." });
  } else if (isBankCciRequired(bankCode) && !/^\d{20}$/.test(bankCci)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_cci"], message: "El CCI debe tener exactamente 20 dígitos" });
  }
});

export type RequestFormValues = z.infer<typeof requestFormSchema>;

const DEFAULT_ALLOCATION_CLIENT_KEY = "allocation-1";

export function getScheduledRenditionMinDate(): string {
  return getBusinessDateString();
}

export function normalizeRequestAmountInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? String(numericValue) : trimmed;
}

function emptyToUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalDocumentType(value?: string): BeneficiaryDocumentType | undefined {
  return value === BENEFICIARY_DOCUMENT_TYPE.DNI || value === BENEFICIARY_DOCUMENT_TYPE.CE || value === BENEFICIARY_DOCUMENT_TYPE.RUC
    ? value
    : undefined;
}

function optionalAccountType(value?: string): AccountType | undefined {
  return value === ACCOUNT_TYPE.SAVINGS || value === ACCOUNT_TYPE.CHECKING ? value : undefined;
}

function optionalBankCode(value?: string): BankCode | undefined {
  return value && isKnownBankCode(value) ? value : undefined;
}

function conditionalBankCci(bankCode: BankCode | undefined, value?: string): string | undefined {
  return bankCode && !isBcpBank(bankCode) ? emptyToUndefined(value) : undefined;
}

function conditionalBankName(bankCode: BankCode | undefined, value?: string): string | undefined {
  return bankCode && isOtherBank(bankCode) ? emptyToUndefined(value) : undefined;
}

function formatOptionalText(value?: string | number | null): string {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text.length > 0 ? text : "—";
}

function formatOptionalCodeName(code?: string | null, name?: string | null): string {
  const cleanCode = code?.trim();
  const cleanName = name?.trim();
  if (cleanCode && cleanName) return `${cleanCode} ${cleanName}`;
  return cleanName ?? cleanCode ?? "—";
}

export function toCreateRequestDto(values: RequestFormValues): CreateRequestDto {
  const bankCode = optionalBankCode(values.bank_code);
  const bankCci = conditionalBankCci(bankCode, values.bank_cci);
  const bankName = conditionalBankName(bankCode, values.bank_name);
  const allocations = values.allocations.map((allocation) => ({
    client_key: allocation.client_key,
    budget_planning_line_id: allocation.budget_planning_line_id,
    amount: Number(allocation.amount),
  }));
  const dto: CreateRequestDto = {
    request_type: values.request_type,
    budget_planning_line_id: allocations[0]?.budget_planning_line_id,
    requested_amount: allocations.reduce((total, allocation) => total + allocation.amount, 0),
    allocations,
    currency: REQUEST_CURRENCY.PEN,
    concept: values.concept.trim(),
    supplier_ruc: emptyToUndefined(values.supplier_ruc),
    supplier_name: emptyToUndefined(values.supplier_name),
    beneficiary_name: emptyToUndefined(values.beneficiary_name),
    beneficiary_document_type: optionalDocumentType(values.beneficiary_document_type),
    beneficiary_document_number: emptyToUndefined(values.beneficiary_document_number)?.toUpperCase(),
    bank_code: bankCode,
    bank_account: emptyToUndefined(values.bank_account),
    account_type: optionalAccountType(values.account_type),
  };

  if (bankName) dto.bank_name = bankName;
  if (bankCci) dto.bank_cci = bankCci;

  if (values.request_type === REQUEST_TYPE.ADVANCE) {
    dto.scheduled_rendition_at = emptyToUndefined(values.scheduled_rendition_at);
  }

  return dto;
}

export function toUpdateRequestDto(values: RequestFormValues, currentRequestType?: RequestType | null): UpdateRequestDto {
  const effectiveRequestType = currentRequestType ?? values.request_type;
  if (effectiveRequestType === REQUEST_TYPE.ADVANCE_SETTLEMENT) return {};

  const bankCode = optionalBankCode(values.bank_code);
  const bankCci = conditionalBankCci(bankCode, values.bank_cci);
  const bankName = conditionalBankName(bankCode, values.bank_name);
  const allocations = values.allocations.map((allocation) => ({
    client_key: allocation.client_key,
    budget_planning_line_id: allocation.budget_planning_line_id,
    amount: Number(allocation.amount),
  }));
  const dto: UpdateRequestDto = {
    budget_planning_line_id: allocations[0]?.budget_planning_line_id,
    requested_amount: allocations.reduce((total, allocation) => total + allocation.amount, 0),
    allocations,
    currency: REQUEST_CURRENCY.PEN,
    concept: values.concept.trim(),
    supplier_ruc: emptyToUndefined(values.supplier_ruc),
    supplier_name: emptyToUndefined(values.supplier_name),
    beneficiary_name: emptyToUndefined(values.beneficiary_name),
    beneficiary_document_type: optionalDocumentType(values.beneficiary_document_type),
    beneficiary_document_number: emptyToUndefined(values.beneficiary_document_number)?.toUpperCase(),
    bank_code: bankCode,
    bank_account: emptyToUndefined(values.bank_account),
    account_type: optionalAccountType(values.account_type),
  };

  if (bankName) dto.bank_name = bankName;
  if (bankCci) dto.bank_cci = bankCci;

  if (effectiveRequestType === REQUEST_TYPE.ADVANCE) {
    dto.scheduled_rendition_at = emptyToUndefined(values.scheduled_rendition_at);
  }

  return dto;
}

function toRequestSubmitData(values: RequestFormValues): RequestSubmitDataWithAllocations {
  const totalRequestedAmount = values.allocations.reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
  return {
    request_type: values.request_type,
    budget_planning_line_id: values.allocations[0]?.budget_planning_line_id ?? "",
    requested_amount: totalRequestedAmount,
    allocations: values.allocations.map((allocation) => ({
      budget_planning_line_id: allocation.budget_planning_line_id,
      amount: Number(allocation.amount || 0),
    })),
    concept: values.concept,
    beneficiary_name: values.beneficiary_name ?? null,
    beneficiary_document_type: optionalDocumentType(values.beneficiary_document_type) ?? null,
    beneficiary_document_number: values.beneficiary_document_number ?? null,
    bank_code: values.bank_code && isKnownBankCode(values.bank_code) ? values.bank_code : null,
    bank_name: values.bank_name ?? null,
    account_type: optionalAccountType(values.account_type) ?? null,
    bank_account: values.bank_account ?? null,
    bank_cci: values.bank_cci ?? null,
  };
}

function getRequestIdentifier(request: PaymentRequest): string {
  return request.request_code ?? request.sequential_number ?? request.id;
}

export function getRequestSaveSuccessToast(request: PaymentRequest): string {
  const identifier = getRequestIdentifier(request);
  if (request.status === REQUEST_STATUS.OBSERVED) return `Corrección guardada: ${identifier}`;
  if (request.status === REQUEST_STATUS.DRAFT) return `Borrador guardado: ${identifier}`;
  return `Cambios guardados: ${identifier}`;
}

export function getRequestSubmitSavingToast(status?: RequestStatus | null): string {
  if (status === REQUEST_STATUS.OBSERVED) return "Corrección guardada. Enviando corrección...";
  return "Borrador guardado. Enviando solicitud...";
}

export function getRequestSubmitSuccessToast(status?: RequestStatus | null): string {
  if (status === REQUEST_STATUS.OBSERVED) return "Corrección enviada a revisión";
  return "Solicitud enviada a revisión";
}

export function getRequestSubmitFailureToast(message: string, status?: RequestStatus | null): string {
  if (status === REQUEST_STATUS.OBSERVED) return `La corrección fue guardada, pero el envío falló: ${message}`;
  return `El borrador fue guardado, pero el envío falló: ${message}`;
}

function makeAllocationClientKey(): string {
  return `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLineFiscalYear(line?: RequestPlanningLineLookupItem | null): number | null {
  return line?.fiscal_year?.year ?? null;
}

function getLineFinanciers(line?: RequestPlanningLineLookupItem | null) {
  return line?.financiers ?? line?.funding_sources ?? [];
}

function mapRequestPlanningLineToLookup(line: PaymentRequest["budgetPlanningLine"] | undefined | null): RequestPlanningLineLookupItem | null {
  if (!line) return null;
  return {
    id: line.id,
    line_code: line.line_code,
    resource_description: line.resource_description ?? "Línea POA seleccionada",
    planning_type: line.planning_type ?? null,
    type_resource: line.type_resource ?? null,
    unit_price: line.unit_price ?? null,
    quantity: line.quantity ?? null,
    total_cost: Number(line.total_cost ?? 0),
    status: "APPROVED",
    fiscal_year: line.fiscalYear ?? null,
    org_unit: line.organizationalUnit ?? null,
    category: line.budgetCategory ?? null,
    territory: line.territory ?? null,
    program: line.program ?? null,
    action: line.operativeAction ?? null,
    monthly_summary: [],
  };
}

function getInitialAllocationValues(initialRequest?: PaymentRequest): RequestFormValues["allocations"] {
  const allocations = initialRequest?.allocations ?? [];
  if (allocations.length > 0) {
    return allocations.map((allocation, index) => ({
      client_key: allocation.id ?? `allocation-${index + 1}`,
      budget_planning_line_id: allocation.budget_planning_line_id,
      amount: Number(allocation.amount ?? 0),
    }));
  }
  return [{
    client_key: DEFAULT_ALLOCATION_CLIENT_KEY,
    budget_planning_line_id: initialRequest?.budget_planning_line_id ?? "",
    amount: Number(initialRequest?.requested_amount ?? 0),
  }];
}

function getInitialSelectedLines(initialRequest?: PaymentRequest): RequestPlanningLineLookupItem[] {
  const allocations = initialRequest?.allocations ?? [];
  if (allocations.length > 0) {
    return allocations.reduce<RequestPlanningLineLookupItem[]>((lines, allocation) => {
      const line = allocation.planning_line ?? allocation.budgetPlanningLine ?? null;
      if (!line) return lines;
      lines.push({
        id: line.id,
        line_code: line.line_code,
        resource_description: line.resource_description,
        planning_type: line.planning_type ?? null,
        type_resource: line.type_resource ?? null,
        unit_price: line.unit_price ?? null,
        quantity: line.quantity ?? null,
        total_cost: Number(line.total_cost ?? 0),
        status: line.status,
        fiscal_year: line.fiscal_year,
        org_unit: line.org_unit,
        category: line.category,
        territory: line.territory,
        program: line.program,
        action: line.action,
        monthly_summary: line.monthly_summary ?? [],
        funding_sources: line.funding_sources,
        financiers: allocation.financiers ?? allocation.funding_sources ?? line.financiers ?? line.funding_sources,
      });
      return lines;
    }, []);
  }
  const legacyLine = mapRequestPlanningLineToLookup(initialRequest?.budgetPlanningLine);
  return legacyLine ? [legacyLine] : [];
}

export const REQUEST_BUDGET_CEILING_BLOCK_MESSAGE =
  "El monto supera el techo presupuestal disponible de la unidad orgánica. Ajusta el monto o selecciona otra línea POA antes de continuar.";

interface RequestFormProps {
  initialRequest?: PaymentRequest;
  mode?: "create" | "edit";
  activeStep?: RequestEditStep;
  settlementContext?: SettlementContextResponse | null;
  settlementContextError?: Error | null;
  settlementContextLoading?: boolean;
  onRetrySettlementContext?: () => Promise<void> | void;
  onRequestChanged?: () => Promise<void> | void;
}

export function RequestForm({
  initialRequest,
  mode = "create",
  activeStep = REQUEST_EDIT_STEP.DATA,
  settlementContext = null,
  settlementContextError = null,
  settlementContextLoading = false,
  onRetrySettlementContext,
  onRequestChanged,
}: RequestFormProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [draftId, setDraftId] = useState<string | null>(initialRequest?.id ?? null);
  const [currentRequest, setCurrentRequest] = useState<PaymentRequest | null>(initialRequest ?? null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [documentStepErrors, setDocumentStepErrors] = useState<string[]>([]);
  const [isNavigatingStep, setIsNavigatingStep] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(null);
  const [selectedLines, setSelectedLines] = useState<Array<RequestPlanningLineLookupItem | null>>(() => getInitialSelectedLines(initialRequest));
  const [structuredReportReady, setStructuredReportReady] = useState(false);
  const [structuredReportLocked, setStructuredReportLocked] = useState(false);
  const [structuredReportMessages, setStructuredReportMessages] = useState<string[]>([]);
  const [structuredReportRefreshSignal, setStructuredReportRefreshSignal] = useState(0);

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      request_type: initialRequest?.request_type ?? REQUEST_TYPE.ADVANCE,
      budget_planning_line_id: initialRequest?.budget_planning_line_id ?? "",
      requested_amount: Number(initialRequest?.requested_amount ?? 0),
      allocations: getInitialAllocationValues(initialRequest),
      concept: initialRequest?.concept ?? "",
      scheduled_rendition_at: initialRequest?.request_type === REQUEST_TYPE.ADVANCE ? initialRequest.scheduled_rendition_at ?? "" : "",
      beneficiary_name: initialRequest?.beneficiary_name ?? "",
      beneficiary_document_type: initialRequest?.beneficiary_document_type ?? "",
      beneficiary_document_number: initialRequest?.beneficiary_document_number ?? "",
      bank_code: initialRequest?.bank_code ?? "",
      bank_name: initialRequest?.bank_name ?? "",
      bank_account: initialRequest?.bank_account ?? "",
      bank_cci: initialRequest?.bank_cci ?? "",
      account_type: initialRequest?.account_type ?? "",
      supplier_ruc: initialRequest?.supplier_ruc ?? "",
      supplier_name: initialRequest?.supplier_name ?? "",
    },
  });

  const requestType = form.watch("request_type");
  const conceptLength = form.watch("concept")?.length ?? 0;
  const effectiveRequestType = currentRequest?.request_type ?? initialRequest?.request_type ?? requestType;
  const isAdvanceSettlement = effectiveRequestType === REQUEST_TYPE.ADVANCE_SETTLEMENT;
  const allocations = form.watch("allocations");
  const totalRequestedAmount = allocations.reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
  const scheduledRenditionMinDate = getScheduledRenditionMinDate();
  const allocationFields = useFieldArray({ control: form.control, name: "allocations" });
  const selectedFiscalYears = selectedLines.map(getLineFiscalYear).filter((year): year is number => typeof year === "number");
  const hasMixedFiscalYears = new Set(selectedFiscalYears).size > 1;
  const selectedAllocationLineIds = allocations.map((allocation) => allocation.budget_planning_line_id).filter((lineId) => lineId.trim().length > 0);
  const duplicateAllocationLineIds = selectedAllocationLineIds.filter((lineId, index) => selectedAllocationLineIds.indexOf(lineId) !== index);
  const hasDuplicateAllocations = duplicateAllocationLineIds.length > 0;

  const preview = useBudgetPreview({
    requestId: draftId ?? initialRequest?.id,
    allocations: isAdvanceSettlement ? [] : allocations.map((allocation) => ({
      client_key: allocation.client_key,
      budget_planning_line_id: allocation.budget_planning_line_id,
      amount: Number(allocation.amount || 0),
    })),
  });
  const planningLinesLookup = useRequestPlanningLines();
  const { createRequest, isLoading: creating } = useCreateRequest();
  const { updateRequest, isLoading: updating } = useUpdateRequest();
  const { submitRequest, isLoading: submitting } = useSubmitRequest();
  const reviewDocuments = useRequestDocuments(draftId ?? undefined);
  const reviewReceipts = useRequestReceiptReviews(draftId ?? undefined);

  const isSaving = creating || updating || pendingAction === "save" || pendingAction === "submit";
  const isSubmitting = submitting || pendingAction === "submit";
  const isBusy = isSaving || isSubmitting || isNavigatingStep;
  const checklist = getRequiredDocumentChecklist(effectiveRequestType, reviewDocuments.documents);
  const areDocumentsReady = !reviewDocuments.isLoading;
  const currentRequestDataIssues = currentRequest ? validateRequestDataForSubmitIssues(currentRequest) : [];
  const currentRequestDataErrors = currentRequestDataIssues.length > 0 ? getDataValidationMessages(currentRequestDataIssues) : [];
  const hasCompleteRequestData = currentRequestDataErrors.length === 0;
  const dataStepBlockingMessages = submitErrors.length > 0 ? submitErrors : currentRequestDataErrors;

  async function refreshDocumentsAndStructuredReport(): Promise<void> {
    await Promise.all([reviewDocuments.refetch({ background: true }), reviewReceipts.refetch({ background: true })]);
    if (isAdvanceSettlement) {
      setStructuredReportRefreshSignal((current) => current + 1);
    }
  }
  const hasBudgetCeilingSubmitError = dataStepBlockingMessages.includes(REQUEST_BUDGET_CEILING_BLOCK_MESSAGE);
  const stepperItems = getRequestEditStepperItems(mode === "create" ? REQUEST_EDIT_STEP.DATA : activeStep, {
    isDataComplete: hasCompleteRequestData,
    isDocumentsComplete: checklist.isComplete,
    requestType: effectiveRequestType,
  });
  const reviewNavigationIssues = currentRequest ? getRequestReviewNavigationIssues(currentRequest, checklist) : null;
  const isBudgetCeilingBlocked = !isAdvanceSettlement && isBudgetPreviewBlocking(preview.data);
  const canSubmitReview = hasCompleteRequestData && areDocumentsReady && checklist.isComplete && !isBudgetCeilingBlocked && (!isAdvanceSettlement || structuredReportReady);
  const settlementGuidanceAllocations = isAdvanceSettlement && (currentRequest?.allocations?.length ?? 0) === 0
    ? settlementContext?.original_advance.allocations ?? []
    : [];

  useEffect(() => {
    if (!initialRequest) return;
    setDraftId(initialRequest.id);
    setCurrentRequest(initialRequest);
  }, [initialRequest]);

  useEffect(() => {
    setIsNavigatingStep(false);
  }, [activeStep]);

  useEffect(() => {
    const initialBankCode = form.getValues("bank_code");
    const shouldClearHiddenCci = !initialBankCode || !isKnownBankCode(initialBankCode) || isBcpBank(initialBankCode);
    if (shouldClearHiddenCci && form.getValues("bank_cci")?.trim()) {
      form.setValue("bank_cci", "", { shouldDirty: false, shouldValidate: false });
    }
  }, [form]);

  useEffect(() => {
    if (activeStep === REQUEST_EDIT_STEP.REVIEW && draftId) {
      void reviewDocuments.refetch();
    }
  }, [activeStep, draftId, reviewDocuments.refetch]);

  useEffect(() => {
    if (mode !== "edit" || activeStep !== REQUEST_EDIT_STEP.REVIEW || !currentRequest || !reviewNavigationIssues || isNavigatingStep || !areDocumentsReady) return;
    if (reviewNavigationIssues.canEnterReview) return;

    if (reviewNavigationIssues.dataIssues.length > 0) {
      showDataValidationIssues(reviewNavigationIssues.dataIssues);
      toast.error("Completa los datos obligatorios antes de pasar a revisión.");
      navigateToStep(REQUEST_EDIT_STEP.DATA, currentRequest.id);
      return;
    }

    setDocumentStepErrors(reviewNavigationIssues.documentMessages);
    toast.error("Adjunta los documentos requeridos antes de pasar a revisión.");
    navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS, currentRequest.id);
  }, [activeStep, areDocumentsReady, currentRequest, isNavigatingStep, mode, reviewNavigationIssues]);

  useEffect(() => {
    if (activeStep !== REQUEST_EDIT_STEP.DATA || !currentRequest) return;
    const dataIssues = validateRequestDataForSubmitIssues(currentRequest);
    if (dataIssues.length === 0) return;
    showDataValidationIssues(dataIssues);
  }, [activeStep, currentRequest]);

  function getDataValidationMessages(issues: RequestSubmitValidationIssue[]): string[] {
    return Array.from(new Set(issues.map((issue) => issue.message)));
  }

  function showDataValidationIssues(issues: RequestSubmitValidationIssue[]): void {
    const messages = getDataValidationMessages(issues);
    setSubmitErrors(messages);
    issues.forEach((issue) => {
      form.setError(issue.field, { type: "manual", message: issue.message });
    });
  }

  function isBeneficiaryDocumentSubmitMessage(message: string): boolean {
    return /documento del beneficiario|DNI del beneficiario|RUC del beneficiario|carné de extranjería del beneficiario/i.test(message);
  }

  function clearBeneficiaryDocumentSubmitErrors(): void {
    setSubmitErrors((messages) => messages.filter((message) => !isBeneficiaryDocumentSubmitMessage(message)));
  }

  function navigateToStep(step: RequestEditStep, requestId = draftId): void {
    if (!requestId) return;
    setIsNavigatingStep(true);
    router.push(`${ROUTES.REQUESTS}/${requestId}/edit?step=${step}` as Parameters<typeof router.push>[0]);
  }

  function focusStructuredReportActions(): void {
    const target = document.querySelector<HTMLElement>('[data-testid="rendition-generation-actions"]')
      ?? document.querySelector<HTMLElement>('[data-testid="rendition-readiness-checklist"]')
      ?? document.querySelector<HTMLElement>('[data-testid="structured-rendition-report-card"]');
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  function validateStepNavigation(step: RequestEditStep): boolean {
    if (step === REQUEST_EDIT_STEP.REVIEW) {
      if (!areDocumentsReady) {
        toast.error("Estamos validando los documentos adjuntos. Intenta nuevamente en unos segundos.");
        return false;
      }

      if (currentRequest && reviewNavigationIssues?.dataIssues.length) {
        showDataValidationIssues(reviewNavigationIssues.dataIssues);
        toast.error("Completa los datos obligatorios antes de pasar a revisión.");
        navigateToStep(REQUEST_EDIT_STEP.DATA, currentRequest.id);
        return false;
      }

      if (reviewNavigationIssues && reviewNavigationIssues.documentMessages.length > 0) {
        setDocumentStepErrors(reviewNavigationIssues.documentMessages);
        toast.error("Adjunta los documentos requeridos antes de pasar a revisión.");
        navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS);
        return false;
      }

      if (isAdvanceSettlement && !structuredReportReady) {
        setDocumentStepErrors(structuredReportMessages.length > 0 ? structuredReportMessages : [STRUCTURED_REPORT_PENDING_MESSAGE]);
        toast.error(structuredReportMessages[0] ?? STRUCTURED_REPORT_PENDING_MESSAGE);
        navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS);
        return false;
      }
    }

    return true;
  }

  function handleStepperNavigation(step: RequestEditStep): void {
    if (isBusy) return;
    if (!validateStepNavigation(step)) return;
    setSubmitErrors([]);
    if (step !== REQUEST_EDIT_STEP.DOCUMENTS) setDocumentStepErrors([]);
    navigateToStep(step);
  }

  function handleContinueToReview(): void {
    if (!currentRequest || isBusy) return;
    if (!areDocumentsReady) {
      toast.error("Estamos validando los documentos adjuntos. Intenta nuevamente en unos segundos.");
      return;
    }

    const navigationIssues = getRequestReviewNavigationIssues(currentRequest, checklist);
    if (navigationIssues.dataIssues.length > 0) {
      showDataValidationIssues(navigationIssues.dataIssues);
      toast.error("Completa los datos obligatorios antes de pasar a revisión.");
      navigateToStep(REQUEST_EDIT_STEP.DATA, currentRequest.id);
      return;
    }

    if (navigationIssues.documentMessages.length > 0) {
      setDocumentStepErrors(navigationIssues.documentMessages);
      toast.error("Adjunta los documentos requeridos antes de pasar a revisión.");
      return;
    }

    if (isAdvanceSettlement && !structuredReportReady) {
      setDocumentStepErrors(structuredReportMessages.length > 0 ? structuredReportMessages : [STRUCTURED_REPORT_PENDING_MESSAGE]);
      toast.error(structuredReportMessages[0] ?? STRUCTURED_REPORT_PENDING_MESSAGE);
      focusStructuredReportActions();
      return;
    }

    setDocumentStepErrors([]);
    navigateToStep(REQUEST_EDIT_STEP.REVIEW, currentRequest.id);
  }

  async function saveDraft(values: RequestFormValues): Promise<PaymentRequest> {
    if (draftId && isAdvanceSettlement && currentRequest) return currentRequest;

    const saved = draftId
      ? await updateRequest(draftId, toUpdateRequestDto(values, effectiveRequestType))
      : await createRequest(toCreateRequestDto(values));
    setDraftId(saved.id);
    setCurrentRequest(saved);
    return saved;
  }

  async function handleSaveDraft(values: RequestFormValues): Promise<void> {
    if (isBusy) return;
    const requestTypeForBlocking = effectiveRequestType;
    setPendingAction("save");
    setSubmitErrors([]);
    const dataIssues = validateRequestDataForSubmitIssues(toRequestSubmitData(values));
    if (dataIssues.length > 0) {
      showDataValidationIssues(dataIssues);
      toast.error("Completa los datos obligatorios antes de continuar a documentos.");
      setPendingAction(null);
      return;
    }

    if (hasDuplicateAllocations) {
      const message = "Esta línea POA ya fue agregada; edite el monto del bloque existente.";
      setSubmitErrors([message]);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    if (hasMixedFiscalYears) {
      const message = "Todas las líneas POA deben pertenecer al mismo año fiscal.";
      setSubmitErrors([message]);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    if (isBudgetCeilingBlocked) {
      setSubmitErrors([REQUEST_BUDGET_CEILING_BLOCK_MESSAGE]);
      toast.error(REQUEST_BUDGET_CEILING_BLOCK_MESSAGE);
      setPendingAction(null);
      return;
    }

    try {
      const saved = await saveDraft(values);
      toast.success(getRequestSaveSuccessToast(saved));
      if (mode === "create") {
        setIsNavigatingStep(true);
        router.push(`${ROUTES.REQUESTS}/${saved.id}/edit?step=${REQUEST_EDIT_STEP.DOCUMENTS}` as Parameters<typeof router.push>[0]);
        return;
      }
      navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS, saved.id);
    } catch (error) {
      toast.error(getNewAdvancePendingSettlementBlockMessage(requestTypeForBlocking, error) ?? getApiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSubmitDraft(values: RequestFormValues): Promise<void> {
    if (isBusy) return;
    const requestTypeForBlocking = effectiveRequestType;
    setPendingAction("submit");
    setSubmitErrors([]);
    const dataIssues = validateRequestDataForSubmitIssues(toRequestSubmitData(values));
    if (dataIssues.length > 0) {
      showDataValidationIssues(dataIssues);
      toast.error("Completa los datos obligatorios antes de enviar la solicitud.");
      navigateToStep(REQUEST_EDIT_STEP.DATA);
      setPendingAction(null);
      return;
    }

    if (hasDuplicateAllocations) {
      const message = "Esta línea POA ya fue agregada; edite el monto del bloque existente.";
      setSubmitErrors([message]);
      toast.error(message);
      navigateToStep(REQUEST_EDIT_STEP.DATA);
      setPendingAction(null);
      return;
    }

    if (hasMixedFiscalYears) {
      const message = "Todas las líneas POA deben pertenecer al mismo año fiscal.";
      setSubmitErrors([message]);
      toast.error(message);
      navigateToStep(REQUEST_EDIT_STEP.DATA);
      setPendingAction(null);
      return;
    }

    if (isBudgetCeilingBlocked) {
      toast.error(REQUEST_BUDGET_CEILING_BLOCK_MESSAGE);
      setPendingAction(null);
      return;
    }

    if (!checklist.isComplete) {
      setSubmitErrors(checklist.missingMessages);
      setDocumentStepErrors(checklist.missingMessages);
      toast.error("Adjunta los documentos requeridos antes de enviar. La validación final se realizará al enviar la solicitud.");
      setPendingAction(null);
      return;
    }

    if (isAdvanceSettlement && !structuredReportReady) {
      const messages = structuredReportMessages.length > 0 ? structuredReportMessages : [STRUCTURED_REPORT_PENDING_MESSAGE];
      setSubmitErrors(messages);
      setDocumentStepErrors(messages);
      toast.error(messages[0]);
      setPendingAction(null);
      return;
    }

    let saved: PaymentRequest;
    try {
      saved = await saveDraft(values);
      toast.success(getRequestSubmitSavingToast(saved.status));
    } catch (error) {
      toast.error(getNewAdvancePendingSettlementBlockMessage(requestTypeForBlocking, error) ?? getApiErrorMessage(error));
      setPendingAction(null);
      return;
    }

    try {
      const submitted = await submitRequest(saved.id);
      toast.success(getRequestSubmitSuccessToast(saved.status));
      setIsNavigatingStep(true);
      router.push(`${ROUTES.REQUESTS}/${submitted.id}`);
    } catch (error) {
      const missingMessages = getMissingDocumentMessagesFromError(error);
      const pendingSettlementMessage = getNewAdvancePendingSettlementBlockMessage(saved.request_type, error);
      const message = pendingSettlementMessage ?? getApiErrorMessage(error);
      setSubmitErrors(missingMessages.length > 0 ? missingMessages : [message]);
      toast.error(getRequestSubmitFailureToast(message, saved.status));
      setPendingAction(null);
    }
  }

  function renderStepper(): ReactNode {
    if (mode === "create") return null;

    return (
      <nav aria-label="Pasos de edición" className="grid gap-2 md:grid-cols-3">
        {stepperItems.map((item, index) => (
          <button
            key={item.step}
            type="button"
            className="rounded-md border p-3 text-left transition hover:bg-muted"
            onClick={() => handleStepperNavigation(item.step)}
            disabled={isBusy}
            data-testid={`request-edit-step-${item.step}`}
          >
            <span className="text-xs font-medium text-muted-foreground">Paso {index + 1}</span>
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className="text-xs text-muted-foreground">
              {item.state === "completed" ? "Completado" : item.state === "current" ? "Actual" : "Pendiente"}
            </span>
          </button>
        ))}
      </nav>
    );
  }

  function renderSettlementContextState(): ReactNode {
    if (effectiveRequestType !== REQUEST_TYPE.ADVANCE_SETTLEMENT) return null;
    if (settlementContextLoading) {
      return <p className="rounded-md border p-4 text-sm text-muted-foreground">Cargando contexto del anticipo original...</p>;
    }
    if (settlementContextError) {
      return (
        <Alert>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>No se pudo cargar el contexto del anticipo original. Puedes continuar sin perder los datos de la rendición.</span>
            {onRetrySettlementContext && <Button type="button" variant="outline" size="sm" onClick={() => void onRetrySettlementContext()}>Reintentar</Button>}
          </AlertDescription>
        </Alert>
      );
    }
    if (!settlementContext) return null;
    return <SettlementContextCard context={settlementContext} showDocuments={activeStep !== REQUEST_EDIT_STEP.REVIEW} />;
  }

  function setAllocationLine(index: number, line: RequestPlanningLineLookupItem | null): void {
    setSelectedLines((current) => {
      const next = [...current];
      next[index] = line;
      return next;
    });
  }

  function addAllocationBlock(): void {
    allocationFields.append({ client_key: makeAllocationClientKey(), budget_planning_line_id: "", amount: 0 });
    setSelectedLines((current) => [...current, null]);
  }

  function removeAllocationBlock(index: number): void {
    if (allocationFields.fields.length <= 1) return;
    allocationFields.remove(index);
    setSelectedLines((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function renderFinanciers(line: RequestPlanningLineLookupItem | null): ReactNode {
    const financiers = getLineFinanciers(line);
    if (!line) return <p className="text-xs text-muted-foreground">Selecciona una línea POA para ver financiador(es).</p>;
    if (financiers.length === 0) return <p className="text-xs text-muted-foreground">Sin financiadores informados para esta línea.</p>;

    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        {financiers.map((financier) => (
          <div key={financier.id} className="flex flex-col rounded-md bg-background/70 px-2 py-1 sm:flex-row sm:items-center sm:justify-between">
            <span>{formatOptionalCodeName(financier.code, financier.name)}</span>
            <span>{financier.allocated_amount === null || financier.allocated_amount === undefined ? "" : formatRequestCurrency(Number(financier.allocated_amount))}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderAllocationBlocks(): ReactNode {
    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-3 border-b pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">2. Líneas POA y montos</h2>
            <p className="text-sm text-muted-foreground">Agrega una o más líneas POA. El total se calcula automáticamente.</p>
          </div>
          <Button type="button" variant="outline" onClick={addAllocationBlock} disabled={isBusy || planningLinesLookup.isInitialLoading} data-testid="request-add-allocation-button">Agregar línea POA</Button>
        </div>
        {planningLinesLookup.isRefreshing && <p className="text-xs text-muted-foreground">Actualizando líneas POA en segundo plano...</p>}
        {planningLinesLookup.error && <p className="text-xs text-destructive">{planningLinesLookup.error.message}</p>}

        {hasMixedFiscalYears && (
          <Alert variant="destructive">
            <AlertDescription>Todas las líneas POA deben pertenecer al mismo año fiscal.</AlertDescription>
          </Alert>
        )}
        {hasDuplicateAllocations && (
          <Alert variant="destructive">
            <AlertDescription>Esta línea POA ya fue agregada; edite el monto del bloque existente.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {allocationFields.fields.map((field, index) => (
            <Card key={field.id} className="border-dashed" data-testid="request-allocation-block">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Bloque {index + 1}</CardTitle>
                {allocationFields.fields.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removeAllocationBlock(index)} disabled={isBusy}>Quitar bloque</Button>}
              </CardHeader>
              <CardContent className="space-y-4">
                <PlanningLineSelector
                  control={form.control}
                  name={`allocations.${index}.budget_planning_line_id`}
                  selectedLine={selectedLines[index] ?? null}
                  lines={planningLinesLookup.lines}
                  isLoading={planningLinesLookup.isInitialLoading}
                  isRefreshing={planningLinesLookup.isRefreshing}
                  error={planningLinesLookup.error}
                  onSelectedLineChange={(line) => setAllocationLine(index, line)}
                />
                <FormField control={form.control} name={`allocations.${index}.amount`} render={({ field: amountField }) => (
                  <FormItem>
                    <FormLabel>Monto de la línea *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        data-testid={index === 0 ? "request-amount-input" : "request-allocation-amount-input"}
                        {...amountField}
                        value={amountField.value ?? ""}
                        onChange={(event) => amountField.onChange(event.target.value)}
                        onBlur={(event) => {
                          amountField.onBlur();
                          amountField.onChange(normalizeRequestAmountInput(event.target.value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Financiador(es)</p>
                  {renderFinanciers(selectedLines[index] ?? null)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="rounded-md border bg-muted/40 p-4 text-sm">
          <p className="text-muted-foreground">Total solicitado</p>
          <p className="text-lg font-semibold" data-testid="request-total-amount">{formatRequestCurrency(totalRequestedAmount)}</p>
        </div>
      </section>
    );
  }

  function renderDataStep(): ReactNode {
    if (isAdvanceSettlement) {
      return (
        <>
          {renderSettlementContextState()}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <section className="space-y-3">
                <h2 className="border-b pb-2 text-base font-semibold">Datos del anticipo</h2>
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-sm font-medium">{REQUEST_TYPE_LABELS[REQUEST_TYPE.ADVANCE_SETTLEMENT]} (REXAN)</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Esta rendición usa los datos del anticipo original como contexto de solo lectura. El monto, beneficiario, banco, cuenta, CCI y POA no se editan desde este formulario.
                  </p>
                </div>
              </section>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.push(ROUTES.REQUESTS)} disabled={isBusy}>Cancelar</Button>
            <Button type="button" onClick={form.handleSubmit(handleSaveDraft)} disabled={isBusy} data-testid="request-save-draft-button">
              {isSaving ? "Validando..." : "Continuar a documentos"}
            </Button>
          </div>
        </>
      );
    }

    return (
      <>
        {renderSettlementContextState()}
        <Card>
          <CardContent className="space-y-6 pt-6">
            {dataStepBlockingMessages.length > 0 && activeStep === REQUEST_EDIT_STEP.DATA && (
              <Alert variant="destructive">
                <AlertDescription>
                  <p className="font-medium">{hasBudgetCeilingSubmitError ? "No se puede continuar a documentos" : "Completa los datos obligatorios para continuar"}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {dataStepBlockingMessages.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <section className="space-y-4">
              <h2 className="border-b pb-2 text-base font-semibold">1. Datos de la solicitud</h2>
              <div className="max-w-xl">
                <RequestTypeSelector control={form.control} />
              </div>
            </section>

            {renderAllocationBlocks()}

            <section className="space-y-4">
              <h2 className="border-b pb-2 text-base font-semibold">3. Justificación</h2>
              {requestType === REQUEST_TYPE.ADVANCE && (
                <FormField control={form.control} name="scheduled_rendition_at" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha límite de rendición</FormLabel>
                    <FormControl><Input type="date" min={scheduledRenditionMinDate} data-testid="request-scheduled-rendition-input" {...field} /></FormControl>
                    <p className="text-xs text-muted-foreground">Fecha límite para presentar la rendición una vez pagado el anticipo.</p>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="concept" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>Concepto / justificación *</FormLabel>
                    <span className="text-xs text-muted-foreground" data-testid="request-concept-counter">{conceptLength}/120</span>
                  </div>
                  <FormControl><Textarea {...field} rows={4} maxLength={120} placeholder="Describe el motivo de la solicitud" data-testid="request-concept-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </section>

            <BeneficiaryFields control={form.control} user={user} setValue={form.setValue} watch={form.watch} onDocumentFieldsChange={clearBeneficiaryDocumentSubmitErrors} />
            {requestType === REQUEST_TYPE.SUPPLIER_PAYMENT && <SupplierFields control={form.control} />}

            <BudgetPreviewCard
              preview={preview.data}
              isLoading={preview.isLoading}
              error={preview.error}
              canPreview={preview.canPreview}
              onRetry={() => void preview.refetch()}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.push(ROUTES.REQUESTS)} disabled={isBusy}>Cancelar</Button>
          <Button type="button" onClick={form.handleSubmit(handleSaveDraft)} disabled={isBusy} data-testid="request-save-draft-button">
            {isSaving ? "Guardando..." : mode === "edit" ? "Guardar cambios y continuar" : "Guardar borrador y continuar"}
          </Button>
        </div>
      </>
    );
  }

  function renderDocumentsStep(): ReactNode {
    if (!currentRequest) return null;

    return (
      <>
        {renderSettlementContextState()}
        <RequestDocumentsCard
          request={currentRequest}
          guidanceAllocations={settlementGuidanceAllocations}
          structuredReportLocked={structuredReportLocked}
          documents={reviewDocuments.documents}
          documentsLoading={reviewDocuments.isLoading}
          documentsError={reviewDocuments.error}
          documentsResource={reviewDocuments}
          receiptsResource={reviewReceipts}
          onDocumentsChanged={refreshDocumentsAndStructuredReport}
        />
        {currentRequest.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT && (
          <StructuredRenditionReportCard
            request={currentRequest}
            guidanceAllocations={settlementGuidanceAllocations}
            refreshSignal={structuredReportRefreshSignal}
            documentsResource={reviewDocuments}
            receiptsResource={reviewReceipts}
            onChanged={async () => {
              await reviewDocuments.refetch({ background: true });
            }}
            onReadinessChange={(ready, messages) => {
              setStructuredReportReady(ready);
              setStructuredReportMessages(messages);
            }}
            onLockChange={setStructuredReportLocked}
          />
        )}
        {documentStepErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">Completa los documentos requeridos para continuar</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {documentStepErrors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {currentRequestDataErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">No se puede pasar a revisión todavía</p>
              <p className="mt-1">Completa primero los datos obligatorios de la solicitud:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {currentRequestDataErrors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => navigateToStep(REQUEST_EDIT_STEP.DATA)} disabled={isBusy}>Volver a datos</Button>
          <Button type="button" onClick={handleContinueToReview} disabled={isBusy || !areDocumentsReady}>
            {isNavigatingStep || !areDocumentsReady ? "Validando..." : currentRequestDataErrors.length > 0 ? "Corregir datos" : !checklist.isComplete ? "Adjuntar documentos para continuar" : isAdvanceSettlement && !structuredReportReady ? "Ir a generar informe" : "Continuar a revisión"}
          </Button>
        </div>
      </>
    );
  }

  function renderSummaryItem(label: string, value: ReactNode, className = ""): ReactNode {
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    );
  }

  function renderAllocationSummary(request: PaymentRequest): ReactNode {
    const allocationsToRender = request.allocations ?? [];
    if (allocationsToRender.length === 0) return null;

    return (
      <section className="space-y-3">
        <h3 className="border-b pb-2 text-sm font-semibold">Distribución POA</h3>
        <div className="space-y-2">
          {allocationsToRender.map((allocation, index) => {
            const line = allocation.planning_line ?? allocation.budgetPlanningLine;
            const financiers = allocation.financiers ?? allocation.funding_sources ?? line?.financiers ?? line?.funding_sources ?? [];
            return (
              <div key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`} className="rounded-md border p-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">Bloque {index + 1}: {getPlanningLineDisplay(line)}</p>
                    <p className="text-xs text-muted-foreground">Unidad: {formatOptionalCodeName(allocation.org_unit?.code ?? line?.org_unit?.code, allocation.org_unit?.name ?? line?.org_unit?.name)} · Año fiscal: {allocation.fiscal_year}</p>
                  </div>
                  <p className="font-semibold">{formatRequestCurrency(Number(allocation.amount), request.currency)}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Financiador(es): {financiers.length > 0 ? financiers.map((financier) => formatOptionalCodeName(financier.code, financier.name)).join(", ") : "Sin financiadores informados"}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderReviewSummary(): ReactNode {
    if (!currentRequest) return null;

    if (currentRequest.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Resumen de rendición</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 md:grid-cols-2">
              {renderSummaryItem("Tipo", REQUEST_TYPE_LABELS[currentRequest.request_type])}
              {renderSummaryItem("Estado actual", getRequestStatusLabel(currentRequest.status, currentRequest))}
              {currentRequest.relatedRequest && renderSummaryItem("Anticipo original", `${currentRequest.relatedRequest.request_code ?? currentRequest.relatedRequest.sequential_number ?? currentRequest.relatedRequest.id} · ${formatRequestCurrency(Number(currentRequest.relatedRequest.requested_amount), currentRequest.relatedRequest.currency)}`, "md:col-span-2")}
            </div>
            <p className="text-sm text-muted-foreground">
              Los datos económicos, beneficiario, pago y POA se muestran arriba como contexto del anticipo original y no se modifican en esta rendición.
            </p>
          </CardContent>
        </Card>
      );
    }

    const planningLine = currentRequest.budgetPlanningLine;
    const orgUnit = planningLine?.organizationalUnit ?? currentRequest.organizationalUnit ?? null;
    const beneficiaryDocument = currentRequest.beneficiary_document_type
      ? `${BENEFICIARY_DOCUMENT_TYPE_LABELS[currentRequest.beneficiary_document_type]} ${formatOptionalText(currentRequest.beneficiary_document_number)}`
      : formatOptionalText(currentRequest.beneficiary_document_number);
    const accountType = currentRequest.account_type ? ACCOUNT_TYPE_LABELS[currentRequest.account_type] : "—";

    return (
      <Card>
        <CardHeader>
          <CardTitle>Resumen para revisión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <h3 className="border-b pb-2 text-sm font-semibold">Datos de la solicitud</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {renderSummaryItem("Tipo", REQUEST_TYPE_LABELS[currentRequest.request_type])}
              {renderSummaryItem("Estado actual", getRequestStatusLabel(currentRequest.status, currentRequest))}
              {renderSummaryItem("Monto", formatRequestCurrency(Number(currentRequest.requested_amount), currentRequest.currency))}
              {renderSummaryItem("Mes presupuestal", getRequestMonthLabel(currentRequest.budget_month))}
              {currentRequest.request_type === REQUEST_TYPE.ADVANCE && renderSummaryItem("Fecha límite de rendición", formatRequestDate(currentRequest.scheduled_rendition_at))}
              {renderSummaryItem("Concepto / justificación", formatOptionalText(currentRequest.concept), "md:col-span-2")}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="border-b pb-2 text-sm font-semibold">Planificación y POA</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {renderSummaryItem("Línea POA", getPlanningLineDisplay(planningLine), "md:col-span-2")}
              {renderSummaryItem("Unidad organizacional", formatOptionalCodeName(orgUnit?.code, orgUnit?.name))}
              {renderSummaryItem("Año fiscal", planningLine?.fiscalYear?.year ?? currentRequest.fiscal_year)}
              {renderSummaryItem("Categoría presupuestal", planningLine?.budgetCategory?.name ?? "—")}
              {renderSummaryItem("Programa", planningLine?.program?.name ?? "—")}
              {renderSummaryItem("Acción operativa", planningLine?.operativeAction?.name ?? "—")}
              {renderSummaryItem("Territorio", planningLine?.territory?.name ?? "—")}
            </div>
          </section>

          {renderAllocationSummary(currentRequest)}

          <section className="space-y-3">
            <h3 className="border-b pb-2 text-sm font-semibold">Beneficiario y pago</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {renderSummaryItem("Beneficiario", formatOptionalText(currentRequest.beneficiary_name))}
              {renderSummaryItem("Documento", beneficiaryDocument)}
              {renderSummaryItem("Banco", formatOptionalText(currentRequest.bank_name))}
              {renderSummaryItem("Tipo de cuenta", accountType)}
              {renderSummaryItem("Cuenta", formatOptionalText(currentRequest.bank_account))}
              {renderSummaryItem("CCI", formatOptionalText(currentRequest.bank_cci))}
              {currentRequest.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT && renderSummaryItem("Proveedor", formatOptionalText(currentRequest.supplier_name))}
              {currentRequest.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT && renderSummaryItem("RUC proveedor", formatOptionalText(currentRequest.supplier_ruc))}
              {currentRequest.relatedRequest && renderSummaryItem("Solicitud relacionada", `${currentRequest.relatedRequest.request_code ?? currentRequest.relatedRequest.sequential_number ?? currentRequest.relatedRequest.id} · ${formatRequestCurrency(Number(currentRequest.relatedRequest.requested_amount), currentRequest.relatedRequest.currency)}`, "md:col-span-2")}
            </div>
          </section>
        </CardContent>
      </Card>
    );
  }

  function getReviewSubmitLabel(): string {
    if (currentRequest?.status === REQUEST_STATUS.OBSERVED) return "Enviar corrección";
    if (currentRequest?.status === REQUEST_STATUS.DRAFT) return "Enviar a revisión";
    return mode === "edit" ? "Enviar actualización" : "Enviar solicitud";
  }

  function renderReviewStep(): ReactNode {
    if (!currentRequest) return null;

    return (
      <>
        <Alert>
          <AlertDescription>
            Revisa datos y documentos antes del envío. La validación final se realizará al enviar la solicitud.
          </AlertDescription>
        </Alert>
        {submitErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">No se puede enviar todavía</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {submitErrors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {!checklist.isComplete && submitErrors.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Faltan documentos requeridos: {checklist.missingMessages.join(" ")}
            </AlertDescription>
          </Alert>
        )}
        {renderSettlementContextState()}
        {renderReviewSummary()}
        <RequestDocumentsCard
          request={currentRequest}
          guidanceAllocations={settlementGuidanceAllocations}
          backendMissingMessages={submitErrors}
          readOnly
          hideOptionalUploader
          structuredReportLocked={structuredReportLocked}
          documents={reviewDocuments.documents}
          documentsLoading={reviewDocuments.isLoading}
          documentsError={reviewDocuments.error}
          documentsResource={reviewDocuments}
          receiptsResource={reviewReceipts}
          onDocumentsChanged={refreshDocumentsAndStructuredReport}
        />
        {currentRequest.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT && (
          <StructuredRenditionReportCard
            request={currentRequest}
            readOnly
            guidanceAllocations={settlementGuidanceAllocations}
            refreshSignal={structuredReportRefreshSignal}
            documentsResource={reviewDocuments}
            receiptsResource={reviewReceipts}
            onChanged={async () => {
              await reviewDocuments.refetch({ background: true });
            }}
            onReadinessChange={(ready, messages) => {
              setStructuredReportReady(ready);
              setStructuredReportMessages(messages);
            }}
            onLockChange={setStructuredReportLocked}
          />
        )}
        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS)} disabled={isBusy}>Volver a documentos</Button>
          <Button type="button" onClick={form.handleSubmit(handleSubmitDraft)} disabled={isBusy || !canSubmitReview}>
            {isSaving && !isSubmitting ? "Guardando..." : isSubmitting ? "Enviando..." : getReviewSubmitLabel()}
          </Button>
        </div>
      </>
    );
  }

  return (
    <Form {...form}>
      <form className="space-y-6">
        {renderStepper()}
        {(mode === "create" || activeStep === REQUEST_EDIT_STEP.DATA) && renderDataStep()}
        {mode === "edit" && activeStep === REQUEST_EDIT_STEP.DOCUMENTS && renderDocumentsStep()}
        {mode === "edit" && activeStep === REQUEST_EDIT_STEP.REVIEW && renderReviewStep()}
      </form>
    </Form>
  );
}
