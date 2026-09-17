"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRequestDocumentUploadQueue } from "@/hooks/use-request-document-upload-queue";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { useBudgetPreview, useCreateRequest, useHydrateRequestPlanningLines, useRequestDocuments, useRequestReceiptReviews, useRequestRenditionReport, useSubmitRequest, useUpdateRequest } from "@/hooks/use-requests";
import { getBusinessDateString } from "@/lib/business-timezone";
import { ROUTES } from "@/lib/constants";
import {
  SETTLEMENT_PREPARATION_EXPERIENCE,
  getSettlementPreparationExperience,
} from "@/lib/feature-flags";
import {
  REQUEST_EDIT_STEP,
  getApiErrorMessage,
  getMissingDocumentMessagesFromError,
  getRequestErrorStep,
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
  isRequestStateConflict,
  validateRequestDataForSubmit,
  validateRequestDataForSubmitIssues,
  type RequestSubmitDataWithAllocations,
  type RequestEditStep,
  type RequestSubmitValidationIssue,
} from "@/lib/requests";
import {
  SETTLEMENT_PREPARATION_STEP,
  buildSettlementPreparationVm,
  type SettlementPreparationStep,
} from "@/lib/settlement-preparation-vm";
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
import { SettlementPreparationFlow } from "./settlement-preparation/settlement-preparation-flow";
import { hasBudgetClassification, SettlementBudgetClassification } from "./settlement-preparation/settlement-budget-classification";
import { SettlementUploadProgressPanel } from "./settlement-preparation/settlement-upload-progress-panel";
import { StructuredRenditionReportCard } from "./structured-rendition-report-card";
import { SupplierFields } from "./supplier-fields";
import { resolveSupplierIdentity, supplierIdentityPayload, supplierMatchesPayee, supplierPayeeConsentKey, sumRequestAmounts } from "@/lib/request-supplier-policy";
import { useRequestAnnualUit } from "@/hooks/use-request-currency";
import { validatePoaCurrencies } from "@/lib/request-currency-policy";
import { requestMoneyError, requestMoneyInput, requestMoneyTotal } from "@/lib/request-form-money";

const STRUCTURED_REPORT_PENDING_MESSAGE = "Informe pendiente de generación: genera el Excel validado antes de enviar a revisión.";
const SUPPLIER_IDENTITY_ERROR_MESSAGE = "Completa el nombre y documento válido del proveedor (RUC, DNI o CE).";
const SUPPLIER_IDENTITY_ERROR_MESSAGES = new Set([
  SUPPLIER_IDENTITY_ERROR_MESSAGE,
  "Completa el nombre y documento válido del proveedor, independientemente del beneficiario bancario.",
  "Revisa el nombre, tipo y número de documento del proveedor: RUC de 11 dígitos, DNI de 8 o CE de 6 a 12 letras o números.",
  "La identidad del proveedor y el RUC registrado no coinciden. Actualiza la solicitud y revisa los datos antes de guardar nuevamente.",
]);

function toSettlementPreparationStep(step: RequestEditStep): SettlementPreparationStep {
  if (step === REQUEST_EDIT_STEP.DOCUMENTS) return SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS;
  if (step === REQUEST_EDIT_STEP.REVIEW) return SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT;
  return SETTLEMENT_PREPARATION_STEP.REVIEW_ADVANCE;
}

function toRequestEditStep(step: SettlementPreparationStep): RequestEditStep {
  if (step === SETTLEMENT_PREPARATION_STEP.REGISTER_RECEIPTS) return REQUEST_EDIT_STEP.DOCUMENTS;
  if (step === SETTLEMENT_PREPARATION_STEP.GENERATE_AND_SUBMIT) return REQUEST_EDIT_STEP.REVIEW;
  return REQUEST_EDIT_STEP.DATA;
}

export const requestFormSchema = z.object({
  currency: z.enum(["PEN", "USD"]).nullable().optional(),
  supplier_document_type: z.enum(["RUC", "DNI", "CE"]).optional(),
  supplier_document_number: z.string().optional(),
  declares_rus: z.boolean().nullable().optional(),
  declares_casa_de_retiro: z.boolean().nullable().optional(),
  request_type: z.enum([
    REQUEST_TYPE.ADVANCE,
    REQUEST_TYPE.REIMBURSEMENT,
    REQUEST_TYPE.SUPPLIER_PAYMENT,
    REQUEST_TYPE.ADVANCE_SETTLEMENT,
  ], { errorMap: () => ({ message: "Selecciona un tipo de solicitud válido" }) }),
  budget_planning_line_id: z.string().optional(),
  requested_amount: z.string().superRefine((value, ctx) => {
    if (value === "") return;
    const message = requestMoneyError(value, 16, true);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }).optional(),
  allocations: z.array(z.object({
    client_key: z.string(),
    budget_planning_line_id: z.string().min(1, "Selecciona una línea POA"),
    amount: z.string().superRefine((value, ctx) => {
      const message = requestMoneyError(value);
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }),
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
  if (!resolveSupplierIdentity(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supplier_document_number"], message: SUPPLIER_IDENTITY_ERROR_MESSAGE });
  }
}).superRefine((value, ctx) => {
  // Supplier identity is validated above; the hidden historical payee is not an editor.
  const documentType = value.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT ? undefined : value.beneficiary_document_type;
  const documentNumber = value.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT ? "" : value.beneficiary_document_number?.trim().toUpperCase() ?? "";
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
  return value.trim();
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

function exactAllocationTotal(values: RequestFormValues): string {
  return requestMoneyTotal(values.allocations.map((allocation) => allocation.amount));
}

export function toCreateRequestDto(values: RequestFormValues): CreateRequestDto {
  values = withSupplierAsPayee(values);
  if (values.currency !== "PEN" && values.currency !== "USD") throw new Error("Selecciona la moneda de la solicitud.");
  const bankCode = optionalBankCode(values.bank_code);
  const bankCci = conditionalBankCci(bankCode, values.bank_cci);
  const bankName = conditionalBankName(bankCode, values.bank_name);
  const allocations = values.allocations.map((allocation) => ({
    client_key: allocation.client_key,
    budget_planning_line_id: allocation.budget_planning_line_id,
    amount: requestMoneyInput(allocation.amount),
  }));
  const dto: CreateRequestDto = {
    request_type: values.request_type,
    budget_planning_line_id: allocations[0]?.budget_planning_line_id,
    requested_amount: exactAllocationTotal(values),
    allocations,
    currency: values.currency,
    concept: values.concept.trim(),
    ...toSupplierPayload(values),
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
  values = withSupplierAsPayee({ ...values, request_type: effectiveRequestType });

  const bankCode = optionalBankCode(values.bank_code);
  const bankCci = conditionalBankCci(bankCode, values.bank_cci);
  const bankName = conditionalBankName(bankCode, values.bank_name);
  const allocations = values.allocations.map((allocation) => ({
    client_key: allocation.client_key,
    budget_planning_line_id: allocation.budget_planning_line_id,
    amount: requestMoneyInput(allocation.amount),
  }));
  const dto: UpdateRequestDto = {
    budget_planning_line_id: allocations[0]?.budget_planning_line_id,
    requested_amount: exactAllocationTotal(values),
    allocations,
    currency: values.currency ?? undefined,
    concept: values.concept.trim(),
    ...toSupplierPayload(values),
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
  values = withSupplierAsPayee(values);
  const totalRequestedAmount = exactAllocationTotal(values);
  return {
    request_type: values.request_type,
    budget_planning_line_id: values.allocations[0]?.budget_planning_line_id ?? "",
    requested_amount: totalRequestedAmount,
    allocations: values.allocations.map((allocation) => ({
      budget_planning_line_id: allocation.budget_planning_line_id,
      amount: requestMoneyInput(allocation.amount),
    })),
    concept: values.concept,
    currency: values.currency,
    supplier_document_type: values.supplier_document_type,
    supplier_document_number: values.supplier_document_number,
    supplier_name: values.supplier_name,
    supplier_ruc: values.supplier_ruc,
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

function toSupplierPayload(values: RequestFormValues) {
  if (values.request_type !== REQUEST_TYPE.SUPPLIER_PAYMENT) return {};
  return { ...supplierIdentityPayload({
    supplier_document_type: values.supplier_document_type,
    supplier_document_number: values.supplier_document_number,
    supplier_name: emptyToUndefined(values.supplier_name),
    supplier_ruc: values.supplier_document_type ? undefined : emptyToUndefined(values.supplier_ruc),
  }),
    declares_rus: values.declares_rus ?? undefined,
    declares_casa_de_retiro: values.declares_casa_de_retiro ?? undefined,
  };
}

/** Command-only projection. Never writes into hydrated form/history or banking. */
function withSupplierAsPayee(values: RequestFormValues): RequestFormValues {
  if (values.request_type !== REQUEST_TYPE.SUPPLIER_PAYMENT) return values;
  const identity = resolveSupplierIdentity(values);
  if (!identity) return values; // Schema/submit validation reports the unresolved provider.
  return {
    ...values,
    ...identity,
    supplier_ruc: identity.supplier_document_type === "RUC" ? identity.supplier_document_number : undefined,
    beneficiary_document_type: identity.supplier_document_type,
    beneficiary_document_number: identity.supplier_document_number,
    beneficiary_name: identity.supplier_name,
  };
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
    currency: line.currency ?? null,
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
      amount: requestMoneyInput(allocation.amount),
    }));
  }
  return [{
    client_key: DEFAULT_ALLOCATION_CLIENT_KEY,
    budget_planning_line_id: initialRequest?.budget_planning_line_id ?? "",
    amount: requestMoneyInput(initialRequest?.requested_amount),
  }];
}

function getInitialSelectedLines(initialRequest?: PaymentRequest): Array<RequestPlanningLineLookupItem | null> {
  const allocations = initialRequest?.allocations ?? [];
  if (allocations.length > 0) {
    return allocations.map((allocation) => {
      const line = allocation.planning_line ?? allocation.budgetPlanningLine ?? null;
      if (!line) return null;
      return {
        id: line.id,
        currency: line.currency ?? null,
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
      };
    });
  }
  const legacyLine = mapRequestPlanningLineToLookup(initialRequest?.budgetPlanningLine);
  return legacyLine ? [legacyLine] : [];
}

export function getRequestFormDefaultValues(initialRequest?: PaymentRequest): RequestFormValues {
  const supplierIdentity = initialRequest ? resolveSupplierIdentity(initialRequest) : null;
  return {
    supplier_document_type: supplierIdentity?.supplier_document_type,
    supplier_document_number: supplierIdentity?.supplier_document_number,
    currency: initialRequest
      ? initialRequest.currency === REQUEST_CURRENCY.PEN || initialRequest.currency === REQUEST_CURRENCY.USD
        ? initialRequest.currency
        : null
      : REQUEST_CURRENCY.PEN,
    request_type: initialRequest?.request_type ?? REQUEST_TYPE.ADVANCE,
    budget_planning_line_id: initialRequest?.budget_planning_line_id ?? "",
    requested_amount: requestMoneyInput(initialRequest?.requested_amount),
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
    declares_rus: initialRequest?.declares_rus ?? null,
    declares_casa_de_retiro: initialRequest?.declares_casa_de_retiro ?? null,
  };
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
  onRequestStateConflict?: () => Promise<void> | void;
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
  onRequestStateConflict,
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
  const [confirmedSupplierPayeeKey, setConfirmedSupplierPayeeKey] = useState<string | null>(null);
  const hydratedRequestId = useRef(initialRequest?.id);

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: getRequestFormDefaultValues(initialRequest),
  });

  const requestType = form.watch("request_type");
  const [supplierDocumentType, supplierDocumentNumber, supplierName] = useWatch({
    control: form.control,
    name: ["supplier_document_type", "supplier_document_number", "supplier_name"],
  });
  const supplierIdentityKey = JSON.stringify([requestType, supplierDocumentType, supplierDocumentNumber, supplierName]);
  const lastValidatedSupplierIdentityKey = useRef(supplierIdentityKey);
  const liveSupplierIdentity = requestType === REQUEST_TYPE.SUPPLIER_PAYMENT
    ? resolveSupplierIdentity({
        supplier_document_type: supplierDocumentType,
        supplier_document_number: supplierDocumentNumber,
        supplier_name: supplierName,
      })
    : null;
  // RHF requires this subscription for keepDirtyValues on delayed refresh/reset.
  const { dirtyFields } = form.formState;
  const currency = form.watch("currency");
  const conceptLength = form.watch("concept")?.length ?? 0;
  const effectiveRequestType = currentRequest?.request_type ?? initialRequest?.request_type ?? requestType;
  const isAdvanceSettlement = effectiveRequestType === REQUEST_TYPE.ADVANCE_SETTLEMENT;
  const supplierPayeeKey = currentRequest?.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT
    ? supplierPayeeConsentKey(currentRequest) : null;
  const hasRepairedHistoricalSupplierIdentity = currentRequest?.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT
    && !resolveSupplierIdentity(currentRequest)
    && liveSupplierIdentity !== null;
  const needsSupplierPayeeConsent = supplierPayeeKey !== null
    && currentRequest !== null && !supplierMatchesPayee(currentRequest)
    && !hasRepairedHistoricalSupplierIdentity
    && confirmedSupplierPayeeKey !== supplierPayeeKey;
  const allocations = form.watch("allocations");
  const totalRequestedAmount = sumRequestAmounts(allocations.map((allocation) => allocation.amount)) ?? "—";
  const scheduledRenditionMinDate = getScheduledRenditionMinDate();
  const allocationFields = useFieldArray({ control: form.control, name: "allocations" });
  const selectedFiscalYears = selectedLines.map(getLineFiscalYear).filter((year): year is number => typeof year === "number");
  const hasMixedFiscalYears = new Set(selectedFiscalYears).size > 1;
  const currencyIssue = isAdvanceSettlement ? null : validatePoaCurrencies(currency, allocations.map((allocation) => selectedLines.find((line) => line?.id === allocation.budget_planning_line_id)?.currency));
  const selectedAllocationLineIds = allocations.map((allocation) => allocation.budget_planning_line_id).filter((lineId) => lineId.trim().length > 0);
  const duplicateAllocationLineIds = selectedAllocationLineIds.filter((lineId, index) => selectedAllocationLineIds.indexOf(lineId) !== index);
  const hasDuplicateAllocations = duplicateAllocationLineIds.length > 0;
  const hydratedPlanningLines = useHydrateRequestPlanningLines(
    mode === "edit" ? [...new Set(selectedAllocationLineIds)] : [],
  );

  const preview = useBudgetPreview({
    currency,
    planningLineCurrencies: allocations.map((allocation) => selectedLines.find((line) => line?.id === allocation.budget_planning_line_id)?.currency),
    requestId: draftId ?? initialRequest?.id,
    allocations: isAdvanceSettlement ? [] : allocations.map((allocation) => ({
      client_key: allocation.client_key,
      budget_planning_line_id: allocation.budget_planning_line_id,
      amount: allocation.amount,
    })),
  });
  const { createRequest, isLoading: creating } = useCreateRequest();
  const { updateRequest, isLoading: updating } = useUpdateRequest();
  const { submitRequest, isLoading: submitting } = useSubmitRequest();
  const reviewDocuments = useRequestDocuments(draftId ?? undefined);
  const reviewReceipts = useRequestReceiptReviews(draftId ?? undefined);
  const renditionReport = useRequestRenditionReport(draftId ?? undefined, isAdvanceSettlement && mode === "edit");
  const documentUploadQueue = useRequestDocumentUploadQueue({
    requestId: draftId ?? undefined,
    documents: reviewDocuments.documents,
    receipts: reviewReceipts.receipts,
    upsertDocument: reviewDocuments.upsertDocument,
    refreshDocuments: () => reviewDocuments.refetch({ background: true }),
    refreshReceipts: () => reviewReceipts.refetch({ background: true }),
  });
  const uploadNavigationGuard = useUploadNavigationGuard({
    active: documentUploadQueue.isNavigationBlocked,
    managed: true,
    message: "Hay archivos pendientes o en curso. Si sales, el archivo activo puede terminar en el servidor aunque esta ventana deje de mostrarlo. Al volver actualizaremos la lista.",
  });

  const isSaving = creating || updating || pendingAction === "save" || pendingAction === "submit";
  const isSubmitting = submitting || pendingAction === "submit";
  const isBusy = isSaving || isSubmitting || isNavigatingStep;
  const annualUitLookupEnabled = effectiveRequestType === REQUEST_TYPE.SUPPLIER_PAYMENT && currency === "PEN" && currentRequest?.uit_year_applied == null && currentRequest?.uit_amount_applied == null;
  const annualUit = useRequestAnnualUit(currentRequest?.fiscal_year ?? (hasMixedFiscalYears ? null : selectedFiscalYears[0]), annualUitLookupEnabled);
  const checklist = getRequiredDocumentChecklist(effectiveRequestType, reviewDocuments.documents, currentRequest ?? undefined, reviewReceipts.receipts.map((item) => item.receipt), annualUit.annualUit);
  const areDocumentsReady = !reviewDocuments.isLoading && !reviewReceipts.isLoading;
  const liveCurrentRequest = currentRequest?.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT
    ? {
        ...currentRequest,
        supplier_document_type: supplierDocumentType,
        supplier_document_number: supplierDocumentNumber,
        supplier_name: supplierName,
      }
    : currentRequest;
  const currentRequestDataIssues = liveCurrentRequest ? validateRequestDataForSubmitIssues(liveCurrentRequest) : [];
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
  const settlementPreparationExperience = getSettlementPreparationExperience({
    mode,
    requestType: effectiveRequestType,
    status: currentRequest?.status ?? initialRequest?.status ?? null,
  });
  const settlementPreparationVm = currentRequest && isAdvanceSettlement
    ? buildSettlementPreparationVm({
        request: currentRequest,
        activeStep: toSettlementPreparationStep(activeStep),
        documents: reviewDocuments.documents,
        receipts: reviewReceipts.receipts,
        report: renditionReport.report,
        resourcesReady: !reviewDocuments.isLoading
          && !reviewReceipts.isLoading
          && !renditionReport.isLoading
          && !reviewDocuments.error
          && !reviewReceipts.error
          && !renditionReport.error,
        requestDataComplete: hasCompleteRequestData,
        documentChecklistComplete: checklist.isComplete,
        extrasHasBlocker: Boolean(renditionReport.error),
        guidanceAllocations: settlementGuidanceAllocations,
      })
    : null;

  useEffect(() => {
    if (!initialRequest) return;
    const preserveSupplierEdits = initialRequest.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT
      && (!hydratedRequestId.current || hydratedRequestId.current === initialRequest.id);
    form.reset(getRequestFormDefaultValues(initialRequest), { keepDirtyValues: preserveSupplierEdits });
    hydratedRequestId.current = initialRequest.id;
    setDraftId(initialRequest.id);
    setCurrentRequest(initialRequest);
    if (!preserveSupplierEdits || !dirtyFields.allocations) setSelectedLines(getInitialSelectedLines(initialRequest));
    setSubmitErrors([]);
    setDocumentStepErrors([]);
  }, [form, initialRequest]);

  useEffect(() => {
    if (hydratedPlanningLines.items.length === 0) return;
    const byId = new Map(hydratedPlanningLines.items.map((line) => [line.id, line]));
    setSelectedLines((current) => allocations.map((allocation, index) =>
      byId.get(allocation.budget_planning_line_id) ?? (current[index]?.id === allocation.budget_planning_line_id ? current[index] : null),
    ));
  }, [hydratedPlanningLines.items, selectedAllocationLineIds.join("|")]);

  useEffect(() => {
    setIsNavigatingStep(false);
  }, [activeStep]);

  useEffect(() => {
    if (form.getValues("request_type") === REQUEST_TYPE.SUPPLIER_PAYMENT) return;
    const initialBankCode = form.getValues("bank_code");
    const shouldClearHiddenCci = !initialBankCode || !isKnownBankCode(initialBankCode) || isBcpBank(initialBankCode);
    if (shouldClearHiddenCci && form.getValues("bank_cci")?.trim()) {
      form.setValue("bank_cci", "", { shouldDirty: false, shouldValidate: false });
    }
  }, [form]);

  useEffect(() => {
    if (lastValidatedSupplierIdentityKey.current === supplierIdentityKey) return;
    lastValidatedSupplierIdentityKey.current = supplierIdentityKey;
    let cancelled = false;

    void form.trigger(["supplier_name", "supplier_document_type", "supplier_document_number"]).then(() => {
      if (cancelled) return;
      const values = form.getValues();
      const identityIsValid = values.request_type !== REQUEST_TYPE.SUPPLIER_PAYMENT
        || resolveSupplierIdentity(values) !== null;
      if (!identityIsValid) return;

      const supplierDocumentError = form.getFieldState("supplier_document_number").error;
      if (supplierDocumentError?.message && SUPPLIER_IDENTITY_ERROR_MESSAGES.has(supplierDocumentError.message)) {
        form.clearErrors("supplier_document_number");
      }
      setSubmitErrors((messages) => {
        const remainingMessages = messages.filter((message) => !SUPPLIER_IDENTITY_ERROR_MESSAGES.has(message));
        return remainingMessages.length === messages.length ? messages : remainingMessages;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [form, supplierIdentityKey]);

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

  function navigateToStep(step: RequestEditStep, requestId = draftId, targetId?: string): void {
    if (!requestId) return;
    setIsNavigatingStep(true);
    const hash = targetId ? `#${targetId}` : "";
    router.push(`${ROUTES.REQUESTS}/${requestId}/edit?step=${step}${hash}` as Parameters<typeof router.push>[0]);
  }

  function showApiErrorStep(error: unknown, requestId = draftId): void {
    const step = getRequestErrorStep(error);
    if (!step) return;
    const messages = [getApiErrorMessage(error)];
    setSubmitErrors(messages);
    setDocumentStepErrors(step === REQUEST_EDIT_STEP.DOCUMENTS ? messages : []);
    if (mode === "edit" && step !== activeStep) navigateToStep(step, requestId);
  }

  function navigateAway(href: Parameters<typeof router.push>[0]): void {
    uploadNavigationGuard.requestNavigation(() => router.push(href));
  }

  function handleSettlementPendingNavigation(item: NonNullable<typeof settlementPreparationVm>["pendingItems"][number]): void {
    const targetStep = toRequestEditStep(item.targetStep);
    const lineTask = item.allocationId
      ? settlementPreparationVm?.lineTasks.find((task) => task.id === item.allocationId)
      : null;
    const targetId = lineTask?.state === "needs-confirmation" || lineTask?.state === "needs-report-row"
      ? "structured-rendition-report-card"
      : item.allocationId
        ? `settlement-task-${item.allocationId}`
        : targetStep === REQUEST_EDIT_STEP.DATA
          ? "request-form"
          : "documents";

    if (targetStep !== activeStep) {
      navigateToStep(targetStep, draftId, targetId);
      return;
    }

    const target = document.getElementById(targetId);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
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

      if (isAdvanceSettlement
        && !structuredReportReady
        && settlementPreparationExperience !== SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION) {
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

    if (isAdvanceSettlement
      && !structuredReportReady
      && settlementPreparationExperience !== SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION) {
      setDocumentStepErrors(structuredReportMessages.length > 0 ? structuredReportMessages : [STRUCTURED_REPORT_PENDING_MESSAGE]);
      toast.error(structuredReportMessages[0] ?? STRUCTURED_REPORT_PENDING_MESSAGE);
      focusStructuredReportActions();
      return;
    }

    setDocumentStepErrors([]);
    navigateToStep(REQUEST_EDIT_STEP.REVIEW, currentRequest.id);
  }

  function blockUnconfirmedSupplierPayee(): boolean {
    if (!needsSupplierPayeeConsent) return false;
    toast.error("Confirma el proveedor como beneficiario antes de guardar.");
    if (activeStep !== REQUEST_EDIT_STEP.DATA) navigateToStep(REQUEST_EDIT_STEP.DATA);
    return true;
  }

  async function saveDraft(values: RequestFormValues): Promise<PaymentRequest> {
    if (needsSupplierPayeeConsent) throw new Error("Confirma el proveedor como beneficiario antes de guardar.");
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
    if (blockUnconfirmedSupplierPayee()) return;
    if (currencyIssue) { setSubmitErrors([currencyIssue]); toast.error(currencyIssue); return; }
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
      showApiErrorStep(error);
      if (isRequestStateConflict(error)) {
        await onRequestStateConflict?.();
      }
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSubmitDraft(values: RequestFormValues): Promise<void> {
    if (isBusy) return;
    if (blockUnconfirmedSupplierPayee()) return;
    if (currencyIssue) { setSubmitErrors([currencyIssue]); toast.error(currencyIssue); return; }
    if (documentUploadQueue.isNavigationBlocked) {
      toast.error("Finaliza, pausa o retira los archivos pendientes antes de enviar la rendición.");
      return;
    }

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
      showApiErrorStep(error);
      if (isRequestStateConflict(error)) {
        await onRequestStateConflict?.();
      }
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
      showApiErrorStep(error, saved.id);
      if (isRequestStateConflict(error)) {
        await onRequestStateConflict?.();
      }
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
    allocationFields.append({ client_key: makeAllocationClientKey(), budget_planning_line_id: "", amount: "" });
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
          <Button type="button" variant="outline" onClick={addAllocationBlock} disabled={isBusy} data-testid="request-add-allocation-button">Agregar línea POA</Button>
        </div>
        {hydratedPlanningLines.isLoading && <p className="text-xs text-muted-foreground" role="status">Recuperando líneas POA seleccionadas...</p>}
        {hydratedPlanningLines.error && (
          <div className="flex items-center gap-2 text-xs text-destructive" role="alert">
            <span>{hydratedPlanningLines.error.message}</span>
            <Button type="button" variant="outline" size="sm" onClick={hydratedPlanningLines.retry}>Reintentar</Button>
          </div>
        )}
        {hydratedPlanningLines.unavailableIds.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Una o más líneas POA seleccionadas ya no están disponibles. Corrige esos bloques antes de guardar.
            </AlertDescription>
          </Alert>
        )}

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
                  otherSelectedCurrencies={allocations.filter((allocation, otherIndex) => otherIndex !== index && allocation.budget_planning_line_id).map((allocation) => selectedLines.find((line) => line?.id === allocation.budget_planning_line_id)?.currency)}
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
          <p className="text-lg font-semibold" data-testid="request-total-amount">{totalRequestedAmount} · {currency ?? "Moneda pendiente de resolución"}</p>
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
            <Button type="button" variant="outline" onClick={() => navigateAway(ROUTES.REQUESTS)} disabled={isBusy}>Cancelar</Button>
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
                <RequestTypeSelector
                  control={form.control}
                  disabled={Boolean(draftId || currentRequest)}
                  persistedType={currentRequest?.request_type ?? initialRequest?.request_type}
                />
                <FormField control={form.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda de la solicitud</FormLabel>
                    <FormControl><select {...field} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} className="h-10 w-full rounded-md border bg-background px-3" disabled={isBusy}>
                      <option value="">Pendiente de resolución</option>
                      <option value="PEN">PEN · Soles</option><option value="USD">USD · Dólares</option>
                    </select></FormControl>
                    <p className="text-xs text-muted-foreground">Cambiar la moneda conserva los montos ingresados. Revisa las líneas POA y comprobantes; el servidor valida las dependencias existentes.</p>
                    <FormMessage />
                  </FormItem>
                )} />
                {currencyIssue && <p role="status" className="text-sm text-muted-foreground">{currencyIssue}</p>}
              </div>
            </section>

            {renderAllocationBlocks()}

            <section className="space-y-4">
              <h2 className="border-b pb-2 text-base font-semibold">3. Justificación</h2>
              {effectiveRequestType === REQUEST_TYPE.ADVANCE && (
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

            {effectiveRequestType === REQUEST_TYPE.SUPPLIER_PAYMENT && (
              <div className="space-y-4">
                {needsSupplierPayeeConsent && (
                  <Alert data-testid="supplier-payee-mismatch">
                    <AlertDescription className="space-y-2">
                      <p>{currentRequest && resolveSupplierIdentity(currentRequest)
                        ? "Este borrador tiene un beneficiario distinto del proveedor. Al guardar, se usará el proveedor como beneficiario; la cuenta bancaria se conserva."
                        : "Completa la identidad del proveedor: este borrador no tiene una identidad válida. No se copiará del beneficiario anterior. Al guardar, el proveedor ingresado será el beneficiario y la cuenta bancaria se conserva."}</p>
                      <Button type="button" variant="outline" disabled={isBusy} onClick={() => setConfirmedSupplierPayeeKey(supplierPayeeKey)}>
                        Confirmar proveedor como beneficiario
                      </Button>
                      <p>Puedes cancelar para salir sin guardar cambios.</p>
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-sm text-muted-foreground">El proveedor es el beneficiario del pago. Ingresa su identidad una sola vez.</p>
                <SupplierFields control={form.control} />
              </div>
            )}
            <BeneficiaryFields bankOnly={effectiveRequestType === REQUEST_TYPE.SUPPLIER_PAYMENT} control={form.control} user={user} setValue={form.setValue} watch={form.watch} onDocumentFieldsChange={clearBeneficiaryDocumentSubmitErrors} />

            <BudgetPreviewCard
              currency={currency}
              preview={preview.data}
              isLoading={preview.isLoading}
              error={preview.error}
              canPreview={preview.canPreview}
              onRetry={() => void preview.refetch()}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigateAway(ROUTES.REQUESTS)} disabled={isBusy}>Cancelar</Button>
          <Button type="button" onClick={form.handleSubmit(handleSaveDraft)} disabled={isBusy} data-testid="request-save-draft-button">
            {isSaving ? "Guardando..." : mode === "edit" ? "Guardar cambios y continuar" : "Guardar borrador y continuar"}
          </Button>
        </div>
      </>
    );
  }

  function renderStructuredReport(): ReactNode {
    if (!currentRequest || currentRequest.request_type !== REQUEST_TYPE.ADVANCE_SETTLEMENT) return null;

    return (
      <StructuredRenditionReportCard
        request={currentRequest}
        guidanceAllocations={settlementGuidanceAllocations}
        hideBudgetClassification={settlementPreparationExperience === SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION}
        refreshSignal={structuredReportRefreshSignal}
        reportResource={renditionReport}
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
    );
  }

  function renderDocumentsStep(includeSettlementContext = true, includeStructuredReport = true): ReactNode {
    if (!currentRequest) return null;

    return (
      <>
        {includeSettlementContext && renderSettlementContextState()}
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
          uploadQueue={documentUploadQueue}
          hideUploadQueueMonitor={settlementPreparationExperience === SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION}
        />
        {includeStructuredReport && renderStructuredReport()}
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
              {currentRequest.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT && renderSummaryItem("Documento del proveedor", resolveSupplierIdentity(currentRequest) ? `${resolveSupplierIdentity(currentRequest)!.supplier_document_type} ${resolveSupplierIdentity(currentRequest)!.supplier_document_number}` : "Pendiente de resolución")}
              {currentRequest.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT && renderSummaryItem("RUS", currentRequest.declares_rus == null ? "Sin declarar" : currentRequest.declares_rus ? "Sí" : "No")}
              {currentRequest.request_type === REQUEST_TYPE.SUPPLIER_PAYMENT && renderSummaryItem("Casa de Retiro", currentRequest.declares_casa_de_retiro == null ? "Sin declarar" : currentRequest.declares_casa_de_retiro ? "Sí" : "No")}
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

  function renderReviewStep(includePreparationResources = true, includeSettlementContext = true): ReactNode {
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
        {includeSettlementContext && renderSettlementContextState()}
        {renderReviewSummary()}
        {includePreparationResources && (
          <>
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
              uploadQueue={documentUploadQueue}
              hideUploadQueueMonitor
            />
            {currentRequest.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT && (
              <StructuredRenditionReportCard
                request={currentRequest}
                readOnly
                guidanceAllocations={settlementGuidanceAllocations}
                refreshSignal={structuredReportRefreshSignal}
                reportResource={renditionReport}
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
          </>
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

  function renderLegacyStepContent(): ReactNode {
    return (
      <>
        {renderStepper()}
        {(mode === "create" || activeStep === REQUEST_EDIT_STEP.DATA) && renderDataStep()}
        {mode === "edit" && activeStep === REQUEST_EDIT_STEP.DOCUMENTS && renderDocumentsStep()}
        {mode === "edit" && activeStep === REQUEST_EDIT_STEP.REVIEW && renderReviewStep()}
      </>
    );
  }

  function renderStepContent(): ReactNode {
    if (settlementPreparationExperience === SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION && settlementPreparationVm) {
      return (
        <SettlementPreparationFlow
          vm={settlementPreparationVm}
          disabled={isBusy}
          onStepChange={(step) => handleStepperNavigation(toRequestEditStep(step))}
          onGoToTask={handleSettlementPendingNavigation}
          extrasReference={settlementContext?.payment?.operation_reference ?? null}
          extrasOptionalContent={hasBudgetClassification(renditionReport.report) || renditionReport.error ? (
            <SettlementBudgetClassification
              report={renditionReport.report}
              allocationLabels={Object.fromEntries(settlementPreparationVm.lineTasks.map((task) => [task.id, task.label]))}
              loadError={renditionReport.error}
            />
          ) : undefined}
          uploadProgress={<SettlementUploadProgressPanel queue={documentUploadQueue} />}
          reviewAdvance={renderDataStep()}
          registerReceipts={renderDocumentsStep(false, false)}
          generateAndSubmit={(
            <div className="space-y-6">
              {renderStructuredReport()}
              {renderReviewStep(false, false)}
            </div>
          )}
        />
      );
    }

    return renderLegacyStepContent();
  }

  return (
    <Form {...form}>
      <form
        id="request-form"
        tabIndex={-1}
        aria-label="Formulario de solicitud"
        className="space-y-6"
        data-settlement-preparation-experience={settlementPreparationExperience}
      >
        {renderStepContent()}
        <Dialog open={uploadNavigationGuard.isConfirmationOpen} onOpenChange={(open) => !open && uploadNavigationGuard.cancelNavigation()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Salir mientras hay archivos pendientes?</DialogTitle>
              <DialogDescription>
                El archivo activo puede terminar en el servidor aunque esta ventana deje de mostrarlo. Los archivos en cola no se iniciarán después de salir y, al volver, actualizaremos la lista autoritativa.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={uploadNavigationGuard.cancelNavigation}>Seguir aquí</Button>
              <Button type="button" variant="destructive" onClick={uploadNavigationGuard.confirmNavigation}>Salir de todos modos</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </form>
    </Form>
  );
}
