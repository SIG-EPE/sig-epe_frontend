"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueueTableRowsSkeleton } from "@/components/performance/route-skeletons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatRequestCurrency,
  formatRequestDate,
  getRenditionAction,
  getRenditionDueLabel,
  getRenditionStatusLabel,
  getRenditionStatusTone,
  getRegisteredByDisplayName,
  getRegisteredPartyDisplay,
  getRegisteredPartyDocumentLabel,
} from "@/lib/requests";
import type { RenditionInboxRow } from "@/types/requests";
import { GiofWorkStatus } from "@/components/giof-work/giof-work-controls";

interface RenditionsTableProps {
  renditions: RenditionInboxRow[];
  isLoading: boolean;
  currentUserId?: string | null;
  isGiofManager?: boolean;
  selectedAssignmentIds?: string[];
  onToggleAssignment?: (requestId: string, checked: boolean) => void;
  onToggleAllAssignments?: (checked: boolean) => void;
}

export function RenditionsTable({ renditions, isLoading, currentUserId, isGiofManager = false, selectedAssignmentIds = [], onToggleAssignment, onToggleAllAssignments }: RenditionsTableProps) {
  if (isLoading) {
    return <QueueTableRowsSkeleton rows={5} columns={8} />;
  }

  if (renditions.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">No hay rendiciones para este filtro.</p>;
  }

  const assignableRenditions = renditions.filter((row) => row.giof_work?.requestId && row.giof_work.canAssign === true);

  return (
    <div className="overflow-x-auto"><Table>
      <TableHeader>
        <TableRow>
          {isGiofManager && <TableHead className="w-10"><span className="sr-only">Seleccionar para asignar</span></TableHead>}
          <TableHead>Código</TableHead>
          <TableHead>A nombre de</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Fecha de pago</TableHead>
          <TableHead>Fecha límite</TableHead>
          <TableHead>Días</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Asignación</TableHead>
          <TableHead className="text-right">REXAN / acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isGiofManager && onToggleAllAssignments && assignableRenditions.length > 0 && <TableRow><TableCell colSpan={10}><label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="size-4" checked={assignableRenditions.every((row) => selectedAssignmentIds.includes(row.giof_work?.requestId as string))} onChange={(event) => onToggleAllAssignments(event.target.checked)} />Seleccionar rendiciones asignables visibles</label></TableCell></TableRow>}
        {renditions.map((row) => {
          const action = getRenditionAction(row);
          const registeredParty = getRegisteredPartyDisplay(row);
          const registeredPartyDocument = getRegisteredPartyDocumentLabel(row);
          const registeredBy = getRegisteredByDisplayName(row);
          return (
            <TableRow key={row.advance_id} data-testid="rendition-row">
              {isGiofManager && <TableCell>{row.giof_work?.requestId ? <input type="checkbox" className="size-4" checked={selectedAssignmentIds.includes(row.giof_work.requestId)} disabled={row.giof_work.canAssign !== true} title={row.giof_work.canAssign === true ? "Seleccionar para asignar" : "Rendición finalizada: no tiene seguimiento REXAN pendiente"} onChange={(event) => onToggleAssignment?.(row.giof_work?.requestId as string, event.target.checked)} aria-label={row.giof_work.canAssign === true ? `Seleccionar ${row.request_code ?? "rendición"} para asignar` : `${row.request_code ?? "Rendición"}: rendición finalizada`} /> : null}</TableCell>}
              <TableCell className="font-medium whitespace-nowrap">
                <div className="flex flex-col">
                  <span>{row.request_code ?? row.advance_id}</span>
                  <span className="text-xs text-muted-foreground">{row.concept}</span>
                </div>
              </TableCell>
              <TableCell className="max-w-xs">
                <div className="flex flex-col gap-1">
                  <span className="truncate font-medium">{registeredParty}</span>
                  <span className="truncate text-xs text-muted-foreground">{registeredPartyDocument}</span>
                  <span className="truncate text-xs text-muted-foreground">Registrado por: {registeredBy}</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">{formatRequestCurrency(row.amount_paid ?? row.requested_amount)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatRequestDate(row.paid_at)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatRequestDate(row.scheduled_rendition_at)}</TableCell>
              <TableCell className="whitespace-nowrap">{getRenditionDueLabel(row)}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={getRenditionStatusTone(row.rendition_status)}>{getRenditionStatusLabel(row.rendition_status)}</Badge>
                  {row.settlement_request_id && (
                    <span className="text-xs text-muted-foreground">
                      {row.settlement_documents_complete ? "Sustentos completos" : "Faltan documentos"}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>{row.giof_work?.requestId && <GiofWorkStatus requestId={row.giof_work.requestId} work={row.giof_work} currentUserId={currentUserId} isManager={isGiofManager} />}</TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant={row.settlement_request_id ? "default" : "outline"}>
                  <Link href={row.settlement_request_id && row.giof_work?.canAcquire ? `${action.href}?mode=process` : action.href}>{row.settlement_request_id && row.giof_work && !row.giof_work.canAcquire ? "Ver" : action.label}</Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table></div>
  );
}
