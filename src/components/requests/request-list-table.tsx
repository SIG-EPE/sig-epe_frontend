import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { FileText, FolderOpen, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROUTES } from "@/lib/constants";
import { REQUEST_TYPE_LABELS, formatRequestCurrency, formatRequestDateTime, getPaymentRequestCreatorDisplayName, getPlanningLineDisplay, getRegisteredPartyDisplay, getRegisteredPartyDocumentLabel, getRequiredDocumentChecklist, getRequestListActions, getRequestMonthLabel, getRequestTimelineDate, getRequestTimelineLabel } from "@/lib/requests";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import { REQUEST_TYPE, type PaymentRequest } from "@/types/requests";
import { StatusBadge } from "./status-badge";
import { DriveProjectionState } from "./drive-projection-state";
import { GiofWorkStatus } from "@/components/giof-work/giof-work-controls";
import { canOperateAssignedGiofWork, isGiofOperationalRole } from "@/lib/role-capabilities";

interface RequestListTableProps {
  requests: PaymentRequest[];
  isLoading: boolean;
  roleCode?: string | null;
  currentUserId?: string | null;
  showResponsible?: boolean;
  showAssignment?: boolean;
  isGiofManager?: boolean;
  selectedAssignmentIds?: string[];
  onToggleAssignment?: (requestId: string, checked: boolean) => void;
  onToggleAllAssignments?: (checked: boolean) => void;
}

interface RequestPoaLineDisplay {
  key: string;
  label: string;
  amount: number | null;
}

function getRequestPoaLines(request: PaymentRequest): RequestPoaLineDisplay[] {
  const allocations = request.allocations ?? [];
  const allocationLines = allocations.map((allocation, index) => {
    const line = allocation.planning_line ?? allocation.budgetPlanningLine;
    return {
      key: allocation.id ?? `${allocation.budget_planning_line_id}-${index}`,
      label: getPlanningLineDisplay(line),
      amount: Number.isFinite(Number(allocation.amount)) ? Number(allocation.amount) : null,
    };
  }).filter((line) => line.label !== "—");

  if (allocationLines.length > 0) return allocationLines;

  const fallbackLine = getPlanningLineDisplay(request.budgetPlanningLine);
  return fallbackLine === "—" ? [] : [{ key: request.budget_planning_line_id ?? request.id, label: fallbackLine, amount: null }];
}

function getRequestConceptLabel(request: PaymentRequest): string | null {
  const concept = request.concept?.trim();
  return concept ? concept : null;
}

function getRequestPoaTooltipText(poaLines: RequestPoaLineDisplay[], conceptLabel: string | null, currency: PaymentRequest["currency"]): string {
  const poaText = poaLines.length > 0
    ? poaLines.map((line, index) => {
      const amountLabel = line.amount !== null ? ` · ${formatRequestCurrency(line.amount, currency)}` : "";
      return `${index + 1}. ${line.label}${amountLabel}`;
    }).join("\n")
    : "—";

  return conceptLabel ? `${poaText}\nConcepto: ${conceptLabel}` : poaText;
}

interface RequestPoaTooltipProps {
  poaLines: RequestPoaLineDisplay[];
  conceptLabel: string | null;
  currency: PaymentRequest["currency"];
  children: ReactNode;
}

function RequestPoaTooltip({ poaLines, conceptLabel, currency, children }: RequestPoaTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent align="start" side="top" className="max-w-xl whitespace-normal p-3 text-left leading-snug">
        <div className="space-y-2">
          <div>
            <p className="font-semibold">Líneas POA completas</p>
            {poaLines.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {poaLines.map((line, index) => (
                  <li key={line.key}>
                    <span>{index + 1}. {line.label}</span>
                    {line.amount !== null ? <span> · {formatRequestCurrency(line.amount, currency)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1">—</p>}
          </div>
          {conceptLabel ? (
            <div>
              <p className="font-semibold">Concepto completo</p>
              <p className="mt-1">{conceptLabel}</p>
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function RequestListTable({ requests, isLoading, roleCode, currentUserId, showAssignment = false, isGiofManager = false, selectedAssignmentIds = [], onToggleAssignment, onToggleAllAssignments }: RequestListTableProps) {
  if (isLoading) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Cargando solicitudes...</p>;
  }

  if (requests.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Aún no hay solicitudes registradas.</p>;
  }

  const assignableRequests = requests.filter((request) => request.giof_work?.canAssign === true);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="overflow-x-auto"><Table>
        <TableHeader>
          <TableRow>
            {isGiofManager && <TableHead className="w-10"><span className="sr-only">Seleccionar para asignar</span></TableHead>}
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="max-w-48">Registrado por</TableHead>
            <TableHead className="max-w-56">A nombre de</TableHead>
            <TableHead>Estado</TableHead>
            {showAssignment && <TableHead>Asignación</TableHead>}
            <TableHead>Línea POA</TableHead>
            <TableHead>Mes</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Fecha y hora</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isGiofManager && onToggleAllAssignments && assignableRequests.length > 0 && (
            <TableRow><TableCell colSpan={12}><label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="size-4" checked={assignableRequests.every((request) => selectedAssignmentIds.includes(request.id))} onChange={(event) => onToggleAllAssignments(event.target.checked)} />Seleccionar los trabajos asignables visibles</label></TableCell></TableRow>
          )}
          {requests.map((request) => {
          const defaultActions = getRequestListActions(roleCode, request.status, request.id, request.requester_id, currentUserId);
           const canOperate = canOperateAssignedGiofWork(request.giof_work, currentUserId);
           const actions = isGiofOperationalRole(roleCode) && request.giof_work
             ? [{ kind: "detail" as const, label: canOperate ? "Procesar" : "Ver", href: `${ROUTES.REQUESTS}/${request.id}${canOperate ? "?mode=process" : ""}` as Route, testId: "request-detail-link" }]
            : defaultActions;
          const driveFolderUrl = getSafeDocumentUrl(request.drive_folder_url);
          const documentsCount = request.documents_count ?? request.documents?.length ?? 0;
          const hasDocuments = documentsCount > 0;
          const documentsHref = `${ROUTES.REQUESTS}/${request.id}#documents` as Route;
          const timelineDate = getRequestTimelineDate(request);
          const timelineLabel = getRequestTimelineLabel(request);
          const createdBy = getPaymentRequestCreatorDisplayName(request);
          const registeredParty = getRegisteredPartyDisplay(request);
          const registeredPartyDocument = getRegisteredPartyDocumentLabel(request);
          const documentsChecklist = request.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT
            ? getRequiredDocumentChecklist(request.request_type, request.documents ?? [])
            : null;

          const allocationCount = request.allocation_count ?? request.allocations?.length ?? 0;
          const poaLines = getRequestPoaLines(request);
          const firstPoaLine = poaLines[0]?.label ?? "—";
          const poaSummary = allocationCount > 1 ? `${allocationCount} líneas POA` : firstPoaLine;
          const conceptLabel = getRequestConceptLabel(request);
          const poaTooltipText = getRequestPoaTooltipText(poaLines, conceptLabel, request.currency);

          return (
            <TableRow key={request.id} data-testid="request-list-row">
              {isGiofManager && <TableCell><input type="checkbox" className="size-4" checked={selectedAssignmentIds.includes(request.id)} disabled={request.giof_work?.canAssign !== true} title={request.giof_work?.canAssign === true ? "Seleccionar para asignar" : "No asignable en su estado actual"} onChange={(event) => onToggleAssignment?.(request.id, event.target.checked)} aria-label={request.giof_work?.canAssign === true ? `Seleccionar ${request.request_code ?? "solicitud"} para asignar` : `${request.request_code ?? "Solicitud"}: no asignable en su estado actual`} /></TableCell>}
              <TableCell className="font-medium whitespace-nowrap">{request.request_code ?? request.sequential_number ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{REQUEST_TYPE_LABELS[request.request_type]}</TableCell>
              <TableCell className="max-w-48 truncate">{createdBy}</TableCell>
              <TableCell className="max-w-56">
                <div className="flex flex-col">
                  <span className="truncate font-medium">{registeredParty}</span>
                  <span className="truncate text-xs text-muted-foreground">{registeredPartyDocument}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                   <StatusBadge status={request.status} context={request} />
                   {request.payment ? (
                     <DriveProjectionState payment={request.payment} compact />
                   ) : null}
                  {documentsChecklist && (
                    <span className="text-xs text-muted-foreground">
                      {documentsChecklist.isComplete ? "Sustentos completos" : "Faltan documentos"}
                    </span>
                  )}
                </div>
              </TableCell>
              {showAssignment && <TableCell><GiofWorkStatus requestId={request.id} work={request.giof_work} currentUserId={currentUserId} isManager={isGiofManager} /></TableCell>}
              <TableCell className="min-w-64 max-w-md align-top">
                <div className="space-y-1 text-sm">
                  {allocationCount > 1 ? (
                    <details className="group" data-testid="request-poa-details">
                      <RequestPoaTooltip poaLines={poaLines} conceptLabel={conceptLabel} currency={request.currency}>
                        <summary
                          tabIndex={0}
                          className="cursor-pointer rounded-sm font-medium leading-snug text-foreground outline-none marker:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          title={poaTooltipText}
                          aria-label={`Ver líneas POA y concepto completos: ${poaTooltipText}`}
                          data-testid="request-poa-tooltip-trigger"
                        >
                          {poaSummary} · {firstPoaLine}
                        </summary>
                      </RequestPoaTooltip>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {poaLines.map((line, index) => (
                          <li key={line.key}>
                            <span className="font-medium text-foreground">{index + 1}. {line.label}</span>
                            {line.amount !== null ? <span> · {formatRequestCurrency(line.amount, request.currency)}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <RequestPoaTooltip poaLines={poaLines} conceptLabel={conceptLabel} currency={request.currency}>
                      <p
                        tabIndex={0}
                        className="rounded-sm font-medium leading-snug text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        title={poaTooltipText}
                        aria-label={`Ver línea POA y concepto completos: ${poaTooltipText}`}
                        data-testid="request-poa-tooltip-trigger"
                      >
                        {poaSummary}
                      </p>
                    </RequestPoaTooltip>
                  )}
                  {conceptLabel ? <p className="line-clamp-2 leading-snug text-muted-foreground" title={conceptLabel}>Concepto: {conceptLabel}</p> : null}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{getRequestMonthLabel(request.budget_month)}</TableCell>
              <TableCell className="text-right font-medium">{formatRequestCurrency(Number(request.requested_amount), request.currency)}</TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="flex flex-col">
                  <span>{formatRequestDateTime(timelineDate)}</span>
                  <span className="text-xs text-muted-foreground">{timelineLabel}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {hasDocuments ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Ver documentos">
                      <Link href={documentsHref} data-testid="request-documents-link" aria-label="Ver documentos">
                        <FileText className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled title="Sin documentos" aria-label="Sin documentos" data-testid="request-documents-disabled">
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                  {driveFolderUrl && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Abrir carpeta Drive">
                      <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" data-testid="request-drive-folder-link" aria-label="Abrir carpeta Drive">
                        <FolderOpen className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid="request-action-menu-trigger"
                        aria-label="Más acciones de solicitud"
                        title="Más acciones de solicitud"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {actions.map((action) => (
                        <DropdownMenuItem key={`${request.id}-${action.kind}`} asChild>
                          <Link href={action.href} data-testid={action.testId}>{action.label}</Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
          })}
        </TableBody>
      </Table></div>
    </TooltipProvider>
  );
}
