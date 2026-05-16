"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatRequestCurrency,
  formatRequestDate,
  getRenditionAction,
  getRenditionDueLabel,
  getRenditionStatusLabel,
  getRenditionStatusTone,
} from "@/lib/requests";
import type { RenditionInboxRow } from "@/types/requests";

interface RenditionsTableProps {
  renditions: RenditionInboxRow[];
  isLoading: boolean;
}

export function RenditionsTable({ renditions, isLoading }: RenditionsTableProps) {
  if (isLoading) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Cargando rendiciones...</p>;
  }

  if (renditions.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">No hay rendiciones para este filtro.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Solicitante</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Fecha de pago</TableHead>
          <TableHead>Fecha límite</TableHead>
          <TableHead>Días</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">REXAN / acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {renditions.map((row) => {
          const action = getRenditionAction(row);
          return (
            <TableRow key={row.advance_id} data-testid="rendition-row">
              <TableCell className="font-medium whitespace-nowrap">
                <div className="flex flex-col">
                  <span>{row.request_code ?? row.advance_id}</span>
                  <span className="text-xs text-muted-foreground">{row.concept}</span>
                </div>
              </TableCell>
              <TableCell className="max-w-xs truncate">{row.requester ?? "—"}</TableCell>
              <TableCell className="text-right font-medium">{formatRequestCurrency(row.amount_paid ?? row.requested_amount)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatRequestDate(row.paid_at)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatRequestDate(row.scheduled_rendition_at)}</TableCell>
              <TableCell className="whitespace-nowrap">{getRenditionDueLabel(row)}</TableCell>
              <TableCell>
                <Badge variant={getRenditionStatusTone(row.rendition_status)}>{getRenditionStatusLabel(row.rendition_status)}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant={row.settlement_request_id ? "default" : "outline"}>
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
