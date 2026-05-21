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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetPreview, useCreateRequest, useRequestDocuments, useSubmitRequest, useUpdateRequest } from "@/hooks/use-requests";
import { ROUTES } from "@/lib/constants";
import {
  MONTH_OPTIONS,
  REQUEST_EDIT_STEP,
  getApiErrorMessage,
  getMissingDocumentMessagesFromError,
  getNewAdvancePendingSettlementBlockMessage,
  getRequestEditStepperItems,
  getRequiredDocumentChecklist,
  REQUEST_TYPE_LABELS,
  isBudgetPreviewBlocking,
  isKnownBankCode,
  type RequestEditStep,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import {
  ACCOUNT_TYPE,
  BANK_CODE,
  BENEFICIARY_DOCUMENT_TYPE,
  REQUEST_CURRENCY,
  REQUEST_TYPE,
  type AccountType,
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

const requestFormSchema = z.object({
  request_type: z.enum([
    REQUEST_TYPE.ADVANCE,
    REQUEST_TYPE.REIMBURSEMENT,
    REQUEST_TYPE.SUPPLIER_PAYMENT,
    REQUEST_TYPE.ADVANCE_SETTLEMENT,
  ], { errorMap: () => ({ message: "Selecciona un tipo de solicitud válido" }) }),
  budget_planning_line_id: z.string().min(1, "Selecciona una línea POA"),
  budget_month: z.coerce.number().int().min(1, "Selecciona un mes").max(12, "Selecciona un mes válido"),
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
  if (value.bank_account?.trim() && !/^\d{6,30}$/.test(value.bank_account.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_account"], message: "La cuenta debe tener entre 6 y 30 dígitos" });
  }
  if (value.bank_cci?.trim() && !/^\d{20}$/.test(value.bank_cci.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_cci"], message: "El CCI debe tener exactamente 20 dígitos" });
  }
});

export type RequestFormValues = z.infer<typeof requestFormSchema>;

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

export function toCreateRequestDto(values: RequestFormValues): CreateRequestDto {
  const bankCode = values.bank_code && isKnownBankCode(values.bank_code) ? values.bank_code : undefined;
  const dto: CreateRequestDto = {
    request_type: values.request_type,
    budget_planning_line_id: values.budget_planning_line_id,
    budget_month: values.budget_month,
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
    bank_cci: emptyToUndefined(values.bank_cci),
    account_type: optionalAccountType(values.account_type),
  };

  if (values.request_type === REQUEST_TYPE.ADVANCE) {
    dto.scheduled_rendition_at = emptyToUndefined(values.scheduled_rendition_at);
  }

  return dto;
}

export function toUpdateRequestDto(values: RequestFormValues, currentRequestType?: RequestType | null): UpdateRequestDto {
  const bankCode = values.bank_code && isKnownBankCode(values.bank_code) ? values.bank_code : undefined;
  const effectiveRequestType = currentRequestType ?? values.request_type;
  const dto: UpdateRequestDto = {
    budget_planning_line_id: values.budget_planning_line_id,
    budget_month: values.budget_month,
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
    bank_cci: emptyToUndefined(values.bank_cci),
    account_type: optionalAccountType(values.account_type),
  };

  if (effectiveRequestType === REQUEST_TYPE.ADVANCE) {
    dto.scheduled_rendition_at = emptyToUndefined(values.scheduled_rendition_at);
  }

  return dto;
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
  const [selectedLine, setSelectedLine] = useState<RequestPlanningLineLookupItem | null>(
    initialRequest?.budgetPlanningLine
      ? {
          id: initialRequest.budgetPlanningLine.id,
          line_code: initialRequest.budgetPlanningLine.line_code,
          resource_description: initialRequest.budgetPlanningLine.resource_description ?? "Línea POA seleccionada",
          planning_type: null,
          type_resource: null,
          total_cost: 0,
          status: "APPROVED",
          fiscal_year: initialRequest.budgetPlanningLine.fiscalYear ?? null,
          org_unit: initialRequest.budgetPlanningLine.organizationalUnit ?? null,
          category: initialRequest.budgetPlanningLine.budgetCategory ?? null,
          program: null,
          action: null,
          monthly_summary: [],
        }
      : null,
  );

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      request_type: initialRequest?.request_type ?? REQUEST_TYPE.ADVANCE,
      budget_planning_line_id: initialRequest?.budget_planning_line_id ?? "",
      budget_month: initialRequest?.budget_month ?? new Date().getMonth() + 1,
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
  const budgetMonth = form.watch("budget_month");
  const requestedAmount = form.watch("requested_amount");

  const preview = useBudgetPreview({
    planningLineId,
    month: Number(budgetMonth),
    amount: Number(requestedAmount),
  });
  const { createRequest, isLoading: creating } = useCreateRequest();
  const { updateRequest, isLoading: updating } = useUpdateRequest();
  const { submitRequest, isLoading: submitting } = useSubmitRequest();
  const reviewDocuments = useRequestDocuments(draftId ?? undefined);

  const isSaving = creating || updating;
  const stepperItems = getRequestEditStepperItems(mode === "create" ? REQUEST_EDIT_STEP.DATA : activeStep);
  const checklist = getRequiredDocumentChecklist(effectiveRequestType, reviewDocuments.documents);
  const canSubmitReview = checklist.isComplete && !isBudgetPreviewBlocking(preview.data);

  useEffect(() => {
    if (activeStep === REQUEST_EDIT_STEP.REVIEW && draftId) {
      void reviewDocuments.refetch();
    }
  }, [activeStep, draftId, reviewDocuments.refetch]);

  function navigateToStep(step: RequestEditStep, requestId = draftId): void {
    if (!requestId) return;
    router.push(`${ROUTES.REQUESTS}/${requestId}/edit?step=${step}` as Parameters<typeof router.push>[0]);
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
    const requestTypeForBlocking = effectiveRequestType;
    try {
      const saved = await saveDraft(values);
      toast.success(`Borrador guardado: ${saved.request_code ?? saved.sequential_number ?? saved.id}`);
      if (mode === "create") {
        router.push(`${ROUTES.REQUESTS}/${saved.id}/edit?step=${REQUEST_EDIT_STEP.DOCUMENTS}` as Parameters<typeof router.push>[0]);
        return;
      }
      navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS, saved.id);
    } catch (error) {
      toast.error(getNewAdvancePendingSettlementBlockMessage(requestTypeForBlocking, error) ?? getApiErrorMessage(error));
    }
  }

  async function handleSubmitDraft(values: RequestFormValues): Promise<void> {
    const requestTypeForBlocking = effectiveRequestType;
    setSubmitErrors([]);
    if (isBudgetPreviewBlocking(preview.data)) {
      toast.error("El techo de la unidad orgánica bloquea el envío. Puedes guardar el borrador para corregirlo luego.");
      return;
    }

    if (!checklist.isComplete) {
      setSubmitErrors(checklist.missingMessages);
      toast.error("Adjunta los documentos requeridos antes de enviar. La validación final se realizará al enviar la solicitud.");
      return;
    }

    let saved: PaymentRequest;
    try {
      saved = await saveDraft(values);
      toast.success("Borrador guardado. Enviando solicitud...");
    } catch (error) {
      toast.error(getNewAdvancePendingSettlementBlockMessage(requestTypeForBlocking, error) ?? getApiErrorMessage(error));
      return;
    }

    try {
      const submitted = await submitRequest(saved.id);
      toast.success(mode === "edit" ? "Solicitud reenviada correctamente" : "Solicitud enviada correctamente");
      router.push(`${ROUTES.REQUESTS}/${submitted.id}`);
    } catch (error) {
      const missingMessages = getMissingDocumentMessagesFromError(error);
      const pendingSettlementMessage = getNewAdvancePendingSettlementBlockMessage(saved.request_type, error);
      const message = pendingSettlementMessage ?? getApiErrorMessage(error);
      setSubmitErrors(missingMessages.length > 0 ? missingMessages : [message]);
      toast.error(`El borrador fue guardado, pero el envío falló: ${message}`);
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
            onClick={() => navigateToStep(item.step)}
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
            <section className="space-y-4">
              <h2 className="border-b pb-2 text-base font-semibold">1. Datos de la solicitud</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {effectiveRequestType === REQUEST_TYPE.ADVANCE_SETTLEMENT ? (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-sm font-medium">Tipo de solicitud</p>
                    <p className="mt-1 text-sm">{REQUEST_TYPE_LABELS[REQUEST_TYPE.ADVANCE_SETTLEMENT]} (REXAN)</p>
                    <p className="mt-1 text-xs text-muted-foreground">La rendición se origina desde un anticipo pagado y no se cambia a anticipo durante la edición.</p>
                  </div>
                ) : <RequestTypeSelector control={form.control} />}
                <FormField control={form.control} name="budget_month" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mes presupuestal *</FormLabel>
                    <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                      <FormControl><SelectTrigger data-testid="request-month-select"><SelectValue placeholder="Selecciona mes" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {MONTH_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
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
                    <FormControl><Input type="date" data-testid="request-scheduled-rendition-input" {...field} /></FormControl>
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
          <Button type="button" variant="outline" onClick={() => router.push(ROUTES.REQUESTS)} disabled={isSaving || submitting}>Cancelar</Button>
          <Button type="button" onClick={form.handleSubmit(handleSaveDraft)} disabled={isSaving || submitting} data-testid="request-save-draft-button">
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
        <RequestDocumentsCard request={currentRequest} />
        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => navigateToStep(REQUEST_EDIT_STEP.DATA)}>Volver a datos</Button>
          <Button type="button" onClick={() => navigateToStep(REQUEST_EDIT_STEP.REVIEW)}>Continuar a revisión</Button>
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
        <RequestDocumentsCard request={currentRequest} backendMissingMessages={submitErrors} />
        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => navigateToStep(REQUEST_EDIT_STEP.DOCUMENTS)} disabled={isSaving || submitting}>Volver a documentos</Button>
          <Button type="button" onClick={form.handleSubmit(handleSubmitDraft)} disabled={isSaving || submitting || !canSubmitReview}>
            {submitting ? "Enviando..." : mode === "edit" ? "Reenviar solicitud" : "Enviar solicitud"}
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
