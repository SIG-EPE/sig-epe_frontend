"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetPreview, useCreateRequest, useRequestDocuments, useSubmitRequest, useUpdateRequest } from "@/hooks/use-requests";
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
  isBudgetPreviewBlocking,
  isBankCciRequired,
  isBcpBank,
  isKnownBankCode,
  validateRequestDataForSubmit,
  validateRequestDataForSubmitIssues,
  type RequestSubmitData,
  type RequestEditStep,
  type RequestSubmitValidationIssue,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import {
  ACCOUNT_TYPE,
  BANK_CODE,
  BENEFICIARY_DOCUMENT_TYPE,
  REQUEST_CURRENCY,
  REQUEST_TYPE,
  type AccountType,
  type BankCode,
  type BeneficiaryDocumentType,
  type CreateRequestDto,
  type PaymentRequest,
  type RequestPlanningLineLookupItem,
  type RequestType,
  type UpdateRequestDto,
} from "@/types/requests";
import { BeneficiaryFields } from "./beneficiary-fields";
import { BudgetPreviewCard } from "./budget-preview-card";
import { PlanningLineSelector } from "./planning-line-selector";
import { RequestTypeSelector } from "./request-type-selector";
import { RequestDocumentsCard } from "./request-documents-card";
import { SupplierFields } from "./supplier-fields";

export const requestFormSchema = z.object({
  request_type: z.enum([
    REQUEST_TYPE.ADVANCE,
    REQUEST_TYPE.REIMBURSEMENT,
    REQUEST_TYPE.SUPPLIER_PAYMENT,
    REQUEST_TYPE.ADVANCE_SETTLEMENT,
  ], { errorMap: () => ({ message: "Selecciona un tipo de solicitud válido" }) }),
  budget_planning_line_id: z.string().min(1, "Selecciona una línea POA"),
  requested_amount: z.coerce.number().positive("Ingresa un monto mayor a cero"),
  concept: z.string().min(5, "Describe el concepto o justificación"),
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
  ]), z.literal("")]).optional(),
  bank_name: z.string().optional(),
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
  const bankCci = value.bank_cci?.trim() ?? "";
  if (value.bank_account?.trim() && !/^\d{6,30}$/.test(value.bank_account.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_account"], message: "La cuenta debe tener entre 6 y 30 dígitos" });
  }
  if (isBankCciRequired(bankCode) && !bankCci) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_cci"], message: "Ingresa el CCI de 20 dígitos." });
  } else if (isBankCciRequired(bankCode) && !/^\d{20}$/.test(bankCci)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_cci"], message: "El CCI debe tener exactamente 20 dígitos" });
  }
});

export type RequestFormValues = z.infer<typeof requestFormSchema>;

export function getScheduledRenditionMinDate(): string {
  return getBusinessDateString();
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

export function toCreateRequestDto(values: RequestFormValues): CreateRequestDto {
  const bankCode = optionalBankCode(values.bank_code);
  const bankCci = conditionalBankCci(bankCode, values.bank_cci);
  const dto: CreateRequestDto = {
    request_type: values.request_type,
    budget_planning_line_id: values.budget_planning_line_id,
    requested_amount: values.requested_amount,
    currency: REQUEST_CURRENCY.PEN,
    concept: values.concept.trim(),
    supplier_ruc: emptyToUndefined(values.supplier_ruc),
    supplier_name: emptyToUndefined(values.supplier_name),
    beneficiary_name: emptyToUndefined(values.beneficiary_name),
    beneficiary_document_type: optionalDocumentType(values.beneficiary_document_type),
    beneficiary_document_number: emptyToUndefined(values.beneficiary_document_number)?.toUpperCase(),
    bank_code: bankCode,
    bank_name: emptyToUndefined(values.bank_name),
    bank_account: emptyToUndefined(values.bank_account),
    account_type: optionalAccountType(values.account_type),
  };

  if (bankCci) dto.bank_cci = bankCci;

  if (values.request_type === REQUEST_TYPE.ADVANCE) {
    dto.scheduled_rendition_at = emptyToUndefined(values.scheduled_rendition_at);
  }

  return dto;
}

export function toUpdateRequestDto(values: RequestFormValues, currentRequestType?: RequestType | null): UpdateRequestDto {
  const bankCode = optionalBankCode(values.bank_code);
  const bankCci = conditionalBankCci(bankCode, values.bank_cci);
  const effectiveRequestType = currentRequestType ?? values.request_type;
  const dto: UpdateRequestDto = {
    budget_planning_line_id: values.budget_planning_line_id,
    requested_amount: values.requested_amount,
    currency: REQUEST_CURRENCY.PEN,
    concept: values.concept.trim(),
    supplier_ruc: emptyToUndefined(values.supplier_ruc),
    supplier_name: emptyToUndefined(values.supplier_name),
    beneficiary_name: emptyToUndefined(values.beneficiary_name),
    beneficiary_document_type: optionalDocumentType(values.beneficiary_document_type),
    beneficiary_document_number: emptyToUndefined(values.beneficiary_document_number)?.toUpperCase(),
    bank_code: bankCode,
    bank_name: emptyToUndefined(values.bank_name),
    bank_account: emptyToUndefined(values.bank_account),
    account_type: optionalAccountType(values.account_type),
  };

  if (bankCci) dto.bank_cci = bankCci;

  if (effectiveRequestType === REQUEST_TYPE.ADVANCE) {
    dto.scheduled_rendition_at = emptyToUndefined(values.scheduled_rendition_at);
  }

  return dto;
}

function toRequestSubmitData(values: RequestFormValues): RequestSubmitData {
  return {
    budget_planning_line_id: values.budget_planning_line_id,
    requested_amount: values.requested_amount,
    concept: values.concept,
    beneficiary_name: values.beneficiary_name ?? null,
    beneficiary_document_type: optionalDocumentType(values.beneficiary_document_type) ?? null,
    beneficiary_document_number: values.beneficiary_document_number ?? null,
    bank_code: values.bank_code && isKnownBankCode(values.bank_code) ? values.bank_code : null,
    account_type: optionalAccountType(values.account_type) ?? null,
    bank_account: values.bank_account ?? null,
    bank_cci: values.bank_cci ?? null,
  };
}

interface RequestFormProps {
  initialRequest?: PaymentRequest;
  mode?: "create" | "edit";
  activeStep?: RequestEditStep;
}

export function RequestForm({ initialRequest, mode = "create", activeStep = REQUEST_EDIT_STEP.DATA }: RequestFormProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [draftId, setDraftId] = useState<string | null>(initialRequest?.id ?? null);
  const [currentRequest, setCurrentRequest] = useState<PaymentRequest | null>(initialRequest ?? null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [documentStepErrors, setDocumentStepErrors] = useState<string[]>([]);
  const [isNavigatingStep, setIsNavigatingStep] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(null);
  const [selectedLine, setSelectedLine] = useState<RequestPlanningLineLookupItem | null>(
    initialRequest?.budgetPlanningLine
      ? {
          id: initialRequest.budgetPlanningLine.id,
          line_code: initialRequest.budgetPlanningLine.line_code,
          resource_description: initialRequest.budgetPlanningLine.resource_description ?? "Línea POA seleccionada",
          planning_type: initialRequest.budgetPlanningLine.planning_type ?? null,
          type_resource: initialRequest.budgetPlanningLine.type_resource ?? null,
          unit_price: initialRequest.budgetPlanningLine.unit_price ?? null,
          quantity: initialRequest.budgetPlanningLine.quantity ?? null,
          total_cost: Number(initialRequest.budgetPlanningLine.total_cost ?? 0),
          status: "APPROVED",
          fiscal_year: initialRequest.budgetPlanningLine.fiscalYear ?? null,
          org_unit: initialRequest.budgetPlanningLine.organizationalUnit ?? null,
          category: initialRequest.budgetPlanningLine.budgetCategory ?? null,
          territory: initialRequest.budgetPlanningLine.territory ?? null,
          program: initialRequest.budgetPlanningLine.program ?? null,
          action: initialRequest.budgetPlanningLine.operativeAction ?? null,
          monthly_summary: [],
        }
      : null,
  );

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      request_type: initialRequest?.request_type ?? REQUEST_TYPE.ADVANCE,
      budget_planning_line_id: initialRequest?.budget_planning_line_id ?? "",
      requested_amount: Number(initialRequest?.requested_amount ?? 0),
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
  const effectiveRequestType = currentRequest?.request_type ?? initialRequest?.request_type ?? requestType;
  const planningLineId = form.watch("budget_planning_line_id");
  const requestedAmount = form.watch("requested_amount");
  const scheduledRenditionMinDate = getScheduledRenditionMinDate();

  const preview = useBudgetPreview({
    planningLineId,
    amount: Number(requestedAmount),
  });
  const { createRequest, isLoading: creating } = useCreateRequest();
  const { updateRequest, isLoading: updating } = useUpdateRequest();
  const { submitRequest, isLoading: submitting } = useSubmitRequest();
  const reviewDocuments = useRequestDocuments(draftId ?? undefined);

  const isSaving = creating || updating || pendingAction === "save" || pendingAction === "submit";
  const isSubmitting = submitting || pendingAction === "submit";
  const isBusy = isSaving || isSubmitting || isNavigatingStep;
  const checklist = getRequiredDocumentChecklist(effectiveRequestType, reviewDocuments.documents);
  const areDocumentsReady = !reviewDocuments.isLoading;
  const currentRequestDataIssues = currentRequest ? validateRequestDataForSubmitIssues(currentRequest) : [];
  const currentRequestDataErrors = currentRequestDataIssues.length > 0 ? getDataValidationMessages(currentRequestDataIssues) : [];
  const hasCompleteRequestData = currentRequestDataErrors.length === 0;
  const dataStepBlockingMessages = submitErrors.length > 0 ? submitErrors : currentRequestDataErrors;
  const stepperItems = getRequestEditStepperItems(mode === "create" ? REQUEST_EDIT_STEP.DATA : activeStep, {
    isDataComplete: hasCompleteRequestData,
    isDocumentsComplete: checklist.isComplete,
  });
  const reviewNavigationIssues = currentRequest ? getRequestReviewNavigationIssues(currentRequest, checklist) : null;
  const canSubmitReview = hasCompleteRequestData && areDocumentsReady && checklist.isComplete && !isBudgetPreviewBlocking(preview.data);

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

  function navigateToStep(step: RequestEditStep, requestId = draftId): void {
    if (!requestId) return;
    setIsNavigatingStep(true);
    router.push(`${ROUTES.REQUESTS}/${requestId}/edit?step=${step}` as Parameters<typeof router.push>[0]);
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

    setDocumentStepErrors([]);
    navigateToStep(REQUEST_EDIT_STEP.REVIEW, currentRequest.id);
  }

  async function saveDraft(values: RequestFormValues): Promise<PaymentRequest> {
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

    try {
      const saved = await saveDraft(values);
      toast.success(`Borrador guardado: ${saved.request_code ?? saved.sequential_number ?? saved.id}`);
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

    if (isBudgetPreviewBlocking(preview.data)) {
      toast.error("El techo de la unidad orgánica bloquea el envío. Puedes guardar el borrador para corregirlo luego.");
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

    let saved: PaymentRequest;
    try {
      saved = await saveDraft(values);
      toast.success("Borrador guardado. Enviando solicitud...");
    } catch (error) {
      toast.error(getNewAdvancePendingSettlementBlockMessage(requestTypeForBlocking, error) ?? getApiErrorMessage(error));
      setPendingAction(null);
      return;
    }

    try {
      const submitted = await submitRequest(saved.id);
      toast.success(mode === "edit" ? "Solicitud reenviada correctamente" : "Solicitud enviada correctamente");
      setIsNavigatingStep(true);
      router.push(`${ROUTES.REQUESTS}/${submitted.id}`);
    } catch (error) {
      const missingMessages = getMissingDocumentMessagesFromError(error);
      const pendingSettlementMessage = getNewAdvancePendingSettlementBlockMessage(saved.request_type, error);
      const message = pendingSettlementMessage ?? getApiErrorMessage(error);
      setSubmitErrors(missingMessages.length > 0 ? missingMessages : [message]);
      toast.error(`El borrador fue guardado, pero el envío falló: ${message}`);
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

  function renderDataStep(): ReactNode {
    return (
      <>
        <Card>
          <CardContent className="space-y-6 pt-6">
            {dataStepBlockingMessages.length > 0 && activeStep === REQUEST_EDIT_STEP.DATA && (
              <Alert variant="destructive">
                <AlertDescription>
                  <p className="font-medium">Completa los datos obligatorios para continuar</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {dataStepBlockingMessages.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <section className="space-y-4">
              <h2 className="border-b pb-2 text-base font-semibold">1. Datos de la solicitud</h2>
              <div className="max-w-xl">
                {effectiveRequestType === REQUEST_TYPE.ADVANCE_SETTLEMENT ? (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-sm font-medium">Tipo de solicitud</p>
                    <p className="mt-1 text-sm">{REQUEST_TYPE_LABELS[REQUEST_TYPE.ADVANCE_SETTLEMENT]} (REXAN)</p>
                    <p className="mt-1 text-xs text-muted-foreground">La rendición se origina desde un anticipo pagado y no se cambia a anticipo durante la edición.</p>
                  </div>
                ) : <RequestTypeSelector control={form.control} />}
              </div>
              <PlanningLineSelector control={form.control} selectedLine={selectedLine} onSelectedLineChange={setSelectedLine} />
            </section>

            <section className="space-y-4">
              <h2 className="border-b pb-2 text-base font-semibold">2. Monto y justificación</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="requested_amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto *</FormLabel>
                    <FormControl><Input type="number" min={0} step="0.01" data-testid="request-amount-input" {...field} onChange={(event) => field.onChange(Number(event.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {requestType === REQUEST_TYPE.ADVANCE && (
                <FormField control={form.control} name="scheduled_rendition_at" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha límite de rendición</FormLabel>
                    <FormControl><Input type="date" min={scheduledRenditionMinDate} data-testid="request-scheduled-rendition-input" {...field} /></FormControl>
                    <p className="text-xs text-muted-foreground">Opcional. Se usará para dar seguimiento a la rendición del anticipo pagado.</p>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="concept" render={({ field }) => (
                <FormItem>
                  <FormLabel>Concepto / justificación *</FormLabel>
                  <FormControl><Textarea {...field} rows={4} placeholder="Describe el motivo de la solicitud" data-testid="request-concept-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </section>

            <BeneficiaryFields control={form.control} user={user} setValue={form.setValue} watch={form.watch} />
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
        <RequestDocumentsCard
          request={currentRequest}
          documents={reviewDocuments.documents}
          documentsLoading={reviewDocuments.isLoading}
          documentsError={reviewDocuments.error}
          onDocumentsChanged={reviewDocuments.refetch}
        />
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
            {isNavigatingStep || !areDocumentsReady ? "Validando..." : currentRequestDataErrors.length > 0 ? "Corregir datos" : !checklist.isComplete ? "Adjuntar documentos para continuar" : "Continuar a revisión"}
          </Button>
        </div>
      </>
    );
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
        <RequestDocumentsCard
          request={currentRequest}
          backendMissingMessages={submitErrors}
          documents={reviewDocuments.documents}
          documentsLoading={reviewDocuments.isLoading}
          documentsError={reviewDocuments.error}
          onDocumentsChanged={reviewDocuments.refetch}
        />
        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS)} disabled={isBusy}>Volver a documentos</Button>
          <Button type="button" onClick={form.handleSubmit(handleSubmitDraft)} disabled={isBusy || !canSubmitReview}>
            {isSaving && !isSubmitting ? "Guardando..." : isSubmitting ? "Enviando..." : mode === "edit" ? "Reenviar solicitud" : "Enviar solicitud"}
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
