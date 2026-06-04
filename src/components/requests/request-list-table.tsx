import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REQUEST_TYPE_LABELS, formatRequestCurrency, formatRequestDateTime, getPaymentRequestParty, getPlanningLineDisplay, getRequiredDocumentChecklist, getRequestListActions, getRequestMonthLabel, getRequestTimelineDate, getRequestTimelineLabel } from "@/lib/requests";
import { REQUEST_TYPE, type PaymentRequest } from "@/types/requests";
import { StatusBadge } from "./status-badge";

interface RequestListTableProps {
  requests: PaymentRequest[];
  isLoading: boolean;
  roleCode?: string | null;
  showResponsible?: boolean;
}

export function RequestListTable({ requests, isLoading, roleCode, showResponsible = false }: RequestListTableProps) {
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
          const actions = getRequestListActions(roleCode, request.status, request.id);
          const timelineDate = getRequestTimelineDate(request);
          const timelineLabel = getRequestTimelineLabel(request);
          const responsible = getPaymentRequestParty(request) || "—";
          const documentsChecklist = request.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT
            ? getRequiredDocumentChecklist(request.request_type, request.documents ?? [])
            : null;

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
              <TableCell className="max-w-xs truncate">{getPlanningLineDisplay(request.budgetPlanningLine)}</TableCell>
              <TableCell className="whitespace-nowrap">{getRequestMonthLabel(request.budget_month)}</TableCell>
              <TableCell className="text-right font-medium">{formatRequestCurrency(Number(request.requested_amount), request.currency)}</TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="flex flex-col">
                  <span>{formatRequestDateTime(timelineDate)}</span>
                  <span className="text-xs text-muted-foreground">{timelineLabel}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
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
