"use client";

import { Fragment, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/requests/status-badge";
import { DriveProjectionState } from "@/components/requests/drive-projection-state";
import { PaymentAllocationProofCoverage } from "@/components/payments/payment-allocation-proof-coverage";
import { PaymentCompletenessStatus } from "@/components/payments/payment-completeness-status";
import { getDriveRouteModelLabel } from "@/components/payments/payment-form-sections";
import { QueueTableRowsSkeleton } from "@/components/performance/route-skeletons";
import { ROUTES } from "@/lib/constants";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import {
  REQUEST_TYPE_LABELS,
  formatRequestCurrency,
  formatRequestDate,
  getPaymentId,
  getPaymentProofDisplayItems,
  getPaymentRexanStatusLabel,
  getPlanningLineDisplay,
  getRegisteredByDisplayName,
  getRegisteredPartyDisplay,
  getRegisteredPartyDocumentLabel,
  getRequestPayableAmount,
  isRexanExcessRequest,
  canRejectBankPayment,
} from "@/lib/requests";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import {
  REQUEST_STATUS,
  REQUEST_PAYMENT_STATUS,
  type PaymentRejectionProjection,
  type PaymentRequest,
} from "@/types/requests";
import { GiofWorkStatus } from "@/components/giof-work/giof-work-controls";
import { GiofOwnershipActions } from "@/components/giof-work/giof-ownership-actions";
import {
  canManageGiofAssignments,
  canOperateAssignedGiofWork,
} from "@/lib/role-capabilities";
import { isGiofLeaseCurrent } from "@/lib/giof-work-lease-session";
import {
  GIOF_BULK_ASSIGNMENT_MODE,
  GIOF_WORK_POOL,
  type GiofBulkAssignmentMode,
  type GiofWorkLease,
} from "@/types/giof-work";
import { isGiofBulkSelectable } from "@/lib/giof-bulk-selection";
import { REQUEST_STATUS_SURFACE } from "@/lib/request-status-vocabulary";
import { PaymentValuation } from "./payment-valuation";
import { formatExactMoney, getExactPayablePrincipal } from "@/lib/payment-fx";

interface PaymentQueueTableProps {
  requests: PaymentRequest[];
  isLoading: boolean;
  onRegisterPayment: (request: PaymentRequest) => void;
  onRejectPayment?: (request: PaymentRequest) => void;
  onRejectBankPayment?: (request: PaymentRequest) => void;
  selectedRequestIds?: string[];
  onToggleRequest?: (requestId: string, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
  onCompletePaymentDetails?: (request: PaymentRequest) => void;
  onAttachPaymentProof?: (request: PaymentRequest) => void;
  onRetryRexanActivation?: (request: PaymentRequest) => void;
  currentUserId?: string | null;
  isGiofManager?: boolean;
  bulkAssignmentMode?: GiofBulkAssignmentMode | null;
  canManagePayments?: boolean;
  paymentLeases?: GiofWorkLease[];
  selectedAssignmentIds?: string[];
  onToggleAssignment?: (requestId: string, checked: boolean) => void;
  onToggleAllAssignments?: (checked: boolean) => void;
  maxSelectedRequests?: number;
  roleCode?: string | null;
  refetchPoolQueue?: (options?: { force?: boolean }) => Promise<void>;
}

interface PaymentSelectionCheckboxProps
  extends Omit<ComponentProps<"input">, "type" | "checked" | "onChange"> {
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
}

// Mismo control nativo que Revisión y Rendiciones, con estado mixto en cabecera.
function PaymentSelectionCheckbox({
  checked,
  onCheckedChange,
  ...props
}: PaymentSelectionCheckboxProps) {
  return (
    <input
      {...props}
      type="checkbox"
      className="size-4"
      checked={checked === true}
      aria-checked={checked === "indeterminate" ? "mixed" : checked}
      ref={(input) => {
        if (input) input.indeterminate = checked === "indeterminate";
      }}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  );
}

export function isBulkPaymentSelectable(
  request: PaymentRequest,
  currentUserId?: string | null,
): boolean {
  const work = request.giof_work;
  if (
    request.status !== REQUEST_STATUS.APPROVED ||
    request.payment ||
    request.payment_id ||
    !work ||
    work.pool !== GIOF_WORK_POOL.PAYMENT ||
    !currentUserId
  )
    return false;
  if (
    !canOperateAssignedGiofWork(work, currentUserId) ||
    (request.currency !== "USD" && request.currency !== "PEN")
  )
    return false;
  const foreignLeaseIsActive = Boolean(
    work.lease?.ownerId &&
    work.lease.ownerId !== currentUserId &&
    work.lease.expiresAt &&
    new Date(work.lease.expiresAt).getTime() > Date.now(),
  );
  return !foreignLeaseIsActive;
}

export function PaymentQueueTable({
  requests,
  isLoading,
  onRegisterPayment,
  onRejectPayment,
  onRejectBankPayment,
  selectedRequestIds = [],
  onToggleRequest,
  onToggleAll,
  onCompletePaymentDetails,
  onRetryRexanActivation,
  currentUserId,
  isGiofManager = false,
  bulkAssignmentMode,
  canManagePayments = true,
  paymentLeases = [],
  selectedAssignmentIds = [],
  onToggleAssignment,
  onToggleAllAssignments,
  maxSelectedRequests = 50,
  roleCode,
  refetchPoolQueue,
}: PaymentQueueTableProps) {
  if (isLoading) {
    return <QueueTableRowsSkeleton rows={5} columns={7} />;
  }

  if (requests.length === 0) {
    return (
      <p className="rounded-md border p-6 text-sm text-muted-foreground">
        No hay solicitudes para este filtro.
      </p>
    );
  }

  const selectableRequests = requests.filter((request) =>
    isBulkPaymentSelectable(request, currentUserId),
  );
  const effectiveBulkAssignmentMode =
    bulkAssignmentMode === undefined && isGiofManager
      ? GIOF_BULK_ASSIGNMENT_MODE.MANAGER_TARGET
      : (bulkAssignmentMode ?? undefined);
  const assignableRequests = effectiveBulkAssignmentMode
    ? requests.filter(
        (request) =>
          request.giof_work &&
          isGiofBulkSelectable(request.giof_work, effectiveBulkAssignmentMode),
      )
    : [];
  const allSelectableSelected =
    selectableRequests.length > 0 &&
    selectableRequests.every((request) =>
      selectedRequestIds.includes(request.id),
    );
  const allAssignableSelected =
    assignableRequests.length > 0 &&
    assignableRequests.every((request) =>
      selectedAssignmentIds.includes(request.id),
    );
  const someSelectableSelected = selectableRequests.some((request) =>
    selectedRequestIds.includes(request.id),
  );
  const someAssignableSelected = assignableRequests.some((request) =>
    selectedAssignmentIds.includes(request.id),
  );
  const paymentSelectAllState = allSelectableSelected
    ? true
    : someSelectableSelected
      ? "indeterminate"
      : false;
  const assignmentSelectAllState = allAssignableSelected
    ? true
    : someAssignableSelected
      ? "indeterminate"
      : false;

  return (
    <div className="overflow-x-auto">
      {(effectiveBulkAssignmentMode && onToggleAllAssignments) || onToggleRequest ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Asignar selecciona trabajos; Pagar confirma transferencias realizadas (máx. {maxSelectedRequests})
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-20 w-16 min-w-16 border-r bg-background px-1 py-2 text-center whitespace-normal [&:has([role=checkbox])]:pr-1">
              {effectiveBulkAssignmentMode && onToggleAllAssignments ? (
                <div className="flex flex-col items-center gap-1">
                  <span>Asignar</span>
                  <label className="inline-flex size-8 items-center justify-center">
                    <PaymentSelectionCheckbox
                      checked={assignmentSelectAllState}
                      disabled={assignableRequests.length === 0}
                      onCheckedChange={(checked) =>
                        onToggleAllAssignments(checked === true)
                      }
                      aria-label="Asignar trabajos: seleccionar esta página"
                      title="Seleccionar trabajos asignables visibles"
                      data-testid="assignment-select-all-checkbox"
                    />
                  </label>
                </div>
              ) : null}
            </TableHead>
            {onToggleRequest && (
              <TableHead className="w-16 min-w-16 bg-background px-1 py-2 text-center whitespace-normal [&:has([role=checkbox])]:pr-1">
                <div className="flex flex-col items-center gap-1">
                  <span>Pagar</span>
                  <label className="inline-flex size-8 items-center justify-center">
                    <span className="sr-only">Seleccionar pago</span>
                    <PaymentSelectionCheckbox
                      checked={paymentSelectAllState}
                      disabled={!onToggleAll || selectableRequests.length === 0}
                      onCheckedChange={(checked) =>
                        onToggleAll?.(checked === true)
                      }
                      aria-label="Seleccionar solicitudes elegibles de esta página para pago masivo"
                      title={`Seleccionar pagos (máx. ${maxSelectedRequests})`}
                      data-testid="payment-select-all-checkbox"
                    />
                  </label>
                </div>
              </TableHead>
            )}
            <TableHead className="min-w-25">Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>A nombre de</TableHead>
            <TableHead>Área</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Fechas / estado</TableHead>
            <TableHead className="min-w-40">
              Asignación
            </TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => {
            const bankRejected =
              request.payment?.status === REQUEST_PAYMENT_STATUS.BANK_REJECTED;
            const canOperate = canOperateAssignedGiofWork(
              request.giof_work,
              currentUserId,
            );
            const hasActivePaymentLease = Boolean(
              canOperate &&
              request.giof_work &&
              isGiofLeaseCurrent(
                paymentLeases.find((lease) => lease.requestId === request.id),
                {
                  requestId: request.id,
                  pool: GIOF_WORK_POOL.PAYMENT,
                  assignmentVersion: request.giof_work.assignmentVersion,
                  ownerId: currentUserId,
                },
              ),
            );
            const allocationCount =
              request.allocation_count ?? request.allocations?.length ?? 0;
            const hasAllocations = allocationCount > 0;
            const isPendingPayment = request.status === REQUEST_STATUS.APPROVED;
            const paymentProofUrl =
              request.status === REQUEST_STATUS.PAID
                ? (getPaymentProofDisplayItems(request.payment).find(
                    (item) => item.url,
                  )?.url ??
                  getSafeDocumentUrl(
                    request.payment?.proofDocument?.drive_web_url,
                  ))
                : null;
            const firstAllocationLine =
              request.allocations?.[0]?.planning_line ??
              request.allocations?.[0]?.budgetPlanningLine;
            const areaSummary =
              allocationCount > 1
                ? `${allocationCount} líneas POA · ${request.allocations?.[0]?.org_unit?.name ?? getPlanningLineDisplay(firstAllocationLine)}`
                : (request.organizationalUnit?.name ??
                  request.allocations?.[0]?.org_unit?.name ??
                  getPlanningLineDisplay(
                    firstAllocationLine ?? request.budgetPlanningLine,
                  ));
            const registeredParty = getRegisteredPartyDisplay(request);
            const registeredPartyDocument =
              getRegisteredPartyDocumentLabel(request);
            const registeredBy = getRegisteredByDisplayName(request);
            const paymentCompleteness = getPaymentCompletenessPresentation({
              completeness: request.payment?.completeness,
              missing_fields: request.payment?.missing_fields,
              proof_pending:
                request.payment?.proof_pending ??
                request.payment_proof_pending ??
                request.proof_pending,
              details_pending:
                request.payment?.details_pending ??
                request.payment_details_pending ??
                request.details_pending,
            });
            const assignmentDisabledReason =
              request.status === REQUEST_STATUS.PAID
                ? "Trabajo de pago completo: no hay constancia ni referencia pendiente"
                : "No asignable en su estado actual";
            const paymentRejection =
              request.status === REQUEST_STATUS.REJECTED &&
              "payment_rejection" in request
                ? (request.payment_rejection as PaymentRejectionProjection)
                : null;
            const paymentRejectionActor = paymentRejection?.actor
              ? [
                  paymentRejection.actor.first_name,
                  paymentRejection.actor.last_name,
                ]
                  .filter((value): value is string => Boolean(value?.trim()))
                  .join(" ") || "No informado"
              : "No informado";

            return (
              <Fragment key={request.id}>
                <TableRow data-testid="payment-queue-row">
                  <TableCell
                    className="sticky left-0 z-10 w-16 min-w-16 border-r bg-background px-1 text-center [&:has([role=checkbox])]:pr-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {effectiveBulkAssignmentMode && request.giof_work ? (
                      <label className="inline-flex size-8 items-center justify-center">
                        <PaymentSelectionCheckbox
                          checked={selectedAssignmentIds.includes(request.id)}
                          disabled={
                            !isGiofBulkSelectable(request.giof_work, effectiveBulkAssignmentMode)
                          }
                          title={
                            isGiofBulkSelectable(request.giof_work, effectiveBulkAssignmentMode)
                              ? "Seleccionar para asignar"
                              : assignmentDisabledReason
                          }
                          onCheckedChange={(checked) =>
                            onToggleAssignment?.(request.id, checked === true)
                          }
                          aria-label={
                            isGiofBulkSelectable(request.giof_work, effectiveBulkAssignmentMode)
                              ? `Seleccionar ${request.request_code ?? "pago"} para asignar`
                              : `${request.request_code ?? "Pago"}: ${request.status === REQUEST_STATUS.PAID ? "trabajo de pago completo" : "no asignable en su estado actual"}`
                          }
                        />
                      </label>
                    ) : null}
                  </TableCell>
                  {onToggleRequest && (
                    <TableCell className="w-16 min-w-16 bg-background px-1 text-center [&:has([role=checkbox])]:pr-1">
                      {isBulkPaymentSelectable(request, currentUserId) ? (
                        <label className="inline-flex size-8 items-center justify-center">
                          <PaymentSelectionCheckbox
                            checked={selectedRequestIds.includes(request.id)}
                            disabled={
                              !selectedRequestIds.includes(request.id) &&
                              selectedRequestIds.length >= maxSelectedRequests
                            }
                            title={
                              !selectedRequestIds.includes(request.id) &&
                              selectedRequestIds.length >= maxSelectedRequests
                                ? `Puedes seleccionar como máximo ${maxSelectedRequests} solicitudes.`
                                : undefined
                            }
                            onCheckedChange={(checked) =>
                              onToggleRequest(request.id, checked === true)
                            }
                            aria-label={`Seleccionar ${request.request_code ?? request.sequential_number ?? request.id} para pago masivo`}
                            data-testid="payment-row-checkbox"
                          />
                        </label>
                      ) : null}
                    </TableCell>
                  )}
                  <TableCell className="font-medium whitespace-nowrap">
                    {request.request_code ?? request.sequential_number ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {REQUEST_TYPE_LABELS[request.request_type]}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex flex-col gap-1">
                      <span className="truncate font-medium">
                        {registeredParty}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {registeredPartyDocument}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Registrado por: {registeredBy}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {areaSummary}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <div className="flex flex-col gap-1">
                      <span>
                        {formatExactMoney(
                          getExactPayablePrincipal(request),
                          request.currency ?? "Moneda sin resolver",
                        )}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Principal original de solicitud
                      </span>
                      <PaymentValuation
                        request={request}
                        monthlyReference={request.payment?.monthly_fx_reference}
                        valuation={
                          request.payment?.valuation ?? request.valuation
                        }
                      />
                      {isRexanExcessRequest(request) && (
                        <span className="text-xs font-normal text-muted-foreground">
                          Saldo REXAN
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {request.status === REQUEST_STATUS.PAID ? (
                        <>
                          <span className="text-sm">
                            Fecha de pago:{" "}
                            {formatRequestDate(
                              request.payment?.paid_at ?? request.paid_at,
                            )}
                          </span>
                          {request.payment?.drive_route_classified_at ? (
                            <span className="text-xs text-muted-foreground">
                              Registrado en SIG-EPE:{" "}
                              {formatRequestDate(
                                request.payment.drive_route_classified_at,
                              )}
                            </span>
                          ) : null}
                          {request.payment?.drive_routing_date ? (
                            <span className="text-xs text-muted-foreground">
                              Fecha de destino:{" "}
                              {formatRequestDate(
                                request.payment.drive_routing_date,
                              )}
                            </span>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {getDriveRouteModelLabel(
                              request.payment?.drive_route_model,
                            )}
                          </span>
                        </>
                      ) : request.status === REQUEST_STATUS.REJECTED &&
                        paymentRejection ? (
                        <>
                          <span className="text-sm">
                            Rechazado:{" "}
                            {formatRequestDate(paymentRejection.rejected_at)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Motivo: {paymentRejection.reason ?? "No informado"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Actor: {paymentRejectionActor}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm">
                          Aprobado: {formatRequestDate(request.approved_at)}
                        </span>
                      )}
                      {bankRejected ? (
                        <Badge variant="destructive">Rechazado por el banco</Badge>
                      ) : (
                        <StatusBadge
                          status={request.status}
                          context={request}
                          surface={REQUEST_STATUS_SURFACE.PAYMENT}
                        />
                      )}
                      {request.rexan_activation && (
                        <Badge
                          variant={
                            request.rexan_activation.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {getPaymentRexanStatusLabel(
                            request.rexan_activation.status,
                            false,
                          )}
                        </Badge>
                      )}
                      {request.payment ? (
                        <DriveProjectionState
                          payment={request.payment}
                          compact
                        />
                      ) : null}
                      {canManagePayments &&
                      onRejectPayment &&
                      request.status === REQUEST_STATUS.APPROVED &&
                      request.giof_work?.pool === GIOF_WORK_POOL.PAYMENT &&
                      canOperate ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onRejectPayment(request)}
                          data-testid="reject-payment-button"
                        >
                          Rechazar pago
                        </Button>
                      ) : null}
                      {request.status === REQUEST_STATUS.PAID ? (
                        <PaymentCompletenessStatus request={request} />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-36 items-start gap-2">
                      <GiofWorkStatus
                        requestId={request.id}
                        work={request.giof_work}
                        currentUserId={currentUserId}
                        isManager={canManageGiofAssignments(roleCode)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-2">
                      {!bankRejected && request.giof_work && refetchPoolQueue && (
                        <GiofOwnershipActions
                          requestId={request.id}
                          label={request.request_code ?? "Pago"}
                          work={request.giof_work}
                          roleCode={roleCode}
                          currentUserId={currentUserId}
                          refetchPoolQueue={refetchPoolQueue}
                        />
                      )}
                      {onRejectBankPayment && canRejectBankPayment(request, roleCode) ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onRejectBankPayment(request)}
                        >
                          Rechazar por el banco
                        </Button>
                      ) : null}
                      {!bankRejected && canManagePayments &&
                      request.status === REQUEST_STATUS.APPROVED &&
                      hasActivePaymentLease ? (
                        <Button
                          size="sm"
                          onClick={() => onRegisterPayment(request)}
                          data-testid="register-payment-button"
                        >
                          Registrar pago
                        </Button>
                      ) : !bankRejected && canManagePayments &&
                        request.status === REQUEST_STATUS.APPROVED &&
                        canOperate ? (
                        <Button
                          size="sm"
                          onClick={() => onRegisterPayment(request)}
                          data-testid="process-payment-button"
                        >
                          Procesar
                        </Button>
                      ) : !bankRejected && canManagePayments &&
                        paymentCompleteness.hasPendingDetails &&
                        getPaymentId(request) &&
                        canOperate ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onCompletePaymentDetails?.(request)}
                          data-testid="complete-payment-details-button"
                        >
                          Completar pago
                        </Button>
                      ) : request.status === REQUEST_STATUS.PAID ? (
                        <span className="text-sm text-muted-foreground">
                          {bankRejected ? "Registro histórico" : "Registrado"}
                        </span>
                      ) : null}
                      {!bankRejected && request.rexan_activation?.status === "FAILED" &&
                        onRetryRexanActivation &&
                        (canOperate || isGiofManager) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRetryRexanActivation(request)}
                            data-testid="retry-rexan-button"
                          >
                            Reintentar REXAN
                          </Button>
                        )}
                      {(request.status === REQUEST_STATUS.PAID ||
                        !canOperate) && (
                        <>
                          <Button size="sm" variant="ghost" asChild>
                            <a href={`${ROUTES.REQUESTS}/${request.id}`}>
                              {request.status === REQUEST_STATUS.PAID
                                ? "Ver solicitud"
                                : "Ver"}
                            </a>
                          </Button>
                          {paymentProofUrl && (
                            <Button size="sm" variant="ghost" asChild>
                              <a
                                href={paymentProofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Ver constancia
                              </a>
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {hasAllocations && (
                  <TableRow data-testid="payment-allocation-accordion-row">
                    <TableCell
                      colSpan={(onToggleRequest ? 1 : 0) + 9}
                      className="bg-muted/30 p-0"
                    >
                      <details className="group px-4 py-3">
                        <summary
                          className="cursor-pointer text-sm font-medium text-muted-foreground group-open:mb-3"
                          data-testid="payment-allocation-accordion-summary"
                        >
                          {isPendingPayment
                            ? "Desglose de líneas POA incluidas en el pago"
                            : "Líneas POA cubiertas por la constancia global"}
                        </summary>
                        <PaymentAllocationProofCoverage
                          request={request}
                          mode="register-general-proof"
                        />
                      </details>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
