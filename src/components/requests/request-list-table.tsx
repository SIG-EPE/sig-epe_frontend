import Link from "next/link";
import type { Route } from "next";
import { FileText, FolderOpen, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROUTES } from "@/lib/constants";
import { REQUEST_TYPE_LABELS, formatRequestCurrency, formatRequestDateTime, getPaymentRequestParty, getPlanningLineDisplay, getRequiredDocumentChecklist, getRequestListActions, getRequestMonthLabel, getRequestTimelineDate, getRequestTimelineLabel } from "@/lib/requests";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import { REQUEST_TYPE, type PaymentRequest } from "@/types/requests";
import { StatusBadge } from "./status-badge";

interface RequestListTableProps {
  requests: PaymentRequest[];
  isLoading: boolean;
  roleCode?: string | null;
  currentUserId?: string | null;
  showResponsible?: boolean;
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

export function RequestListTable({ requests, isLoading, roleCode, currentUserId, showResponsible = false }: RequestListTableProps) {
  if (isLoading) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Cargando solicitudes...</p>;
  }

  if (requests.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Aún no hay solicitudes registradas.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Tipo</TableHead>
          {showResponsible && <TableHead className="max-w-48">Responsable</TableHead>}
          <TableHead>Estado</TableHead>
          <TableHead>Línea POA</TableHead>
          <TableHead>Mes</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Fecha y hora</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => {
          const actions = getRequestListActions(roleCode, request.status, request.id, request.requester_id, currentUserId);
          const driveFolderUrl = getSafeDocumentUrl(request.drive_folder_url);
          const documentsCount = request.documents_count ?? request.documents?.length ?? 0;
          const hasDocuments = documentsCount > 0;
          const documentsHref = `${ROUTES.REQUESTS}/${request.id}#documents` as Route;
          const timelineDate = getRequestTimelineDate(request);
          const timelineLabel = getRequestTimelineLabel(request);
          const responsible = getPaymentRequestParty(request) || "—";
          const documentsChecklist = request.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT
            ? getRequiredDocumentChecklist(request.request_type, request.documents ?? [])
            : null;

          const allocationCount = request.allocation_count ?? request.allocations?.length ?? 0;
          const poaLines = getRequestPoaLines(request);
          const firstPoaLine = poaLines[0]?.label ?? "—";
          const poaSummary = allocationCount > 1 ? `${allocationCount} líneas POA` : firstPoaLine;
          const conceptLabel = getRequestConceptLabel(request);

          return (
            <TableRow key={request.id} data-testid="request-list-row">
              <TableCell className="font-medium whitespace-nowrap">{request.request_code ?? request.sequential_number ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{REQUEST_TYPE_LABELS[request.request_type]}</TableCell>
              {showResponsible && <TableCell className="max-w-48 truncate">{responsible}</TableCell>}
              <TableCell>
                <div className="flex flex-col gap-1">
                  <StatusBadge status={request.status} context={request} />
                  {documentsChecklist && (
                    <span className="text-xs text-muted-foreground">
                      {documentsChecklist.isComplete ? "Sustentos completos" : "Faltan documentos"}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="min-w-64 max-w-md align-top">
                <div className="space-y-1 text-sm">
                  {allocationCount > 1 ? (
                    <details className="group" data-testid="request-poa-details">
                      <summary className="cursor-pointer font-medium leading-snug text-foreground marker:text-muted-foreground">
                        {poaSummary} · {firstPoaLine}
                      </summary>
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
                    <p className="font-medium leading-snug text-foreground">{poaSummary}</p>
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
    </Table>
  );
}
