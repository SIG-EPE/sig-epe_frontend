import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import {
  formatRequestCurrency,
  formatRequestDate,
  formatRequestDateTime,
  formatRequestDocumentSize,
  getPlanningLineDisplay,
  getRequestDocumentCategoryLabel,
  getRequestDocumentDisplayName,
  getRequestDocumentMimeLabel,
  getRequestDocumentUploadStatusLabel,
} from "@/lib/requests";
import { REQUEST_CURRENCY, type RequestAllocation, type RequestCurrency, type SettlementContextResponse, type SettlementContextDocument } from "@/types/requests";

interface SettlementContextCardProps {
  context: SettlementContextResponse;
  showDocuments?: boolean;
}

function formatOptionalText(value?: string | number | null): string {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text.length > 0 ? text : "—";
}

function getAdvanceCode(context: SettlementContextResponse): string {
  return context.original_advance.request_code
    ?? context.original_advance.sequential_number
    ?? context.original_advance.id;
}

function getPaidDate(context: SettlementContextResponse): string | null {
  return context.payment?.paid_at
    ?? context.original_advance.paid_at
    ?? context.original_advance.disbursed_at
    ?? null;
}

function getPaidAmount(context: SettlementContextResponse): number {
  return Number(context.payment?.amount_paid ?? context.original_advance.amount_disbursed ?? context.original_advance.requested_amount ?? 0);
}

function getDocumentWebUrl(document: SettlementContextDocument): string | null {
  return getSafeDocumentUrl(document.drive_web_url);
}

function renderSummaryItem(label: string, value: ReactNode, className = ""): ReactNode {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function getAllocationDocuments(allocation: RequestAllocation, documents: SettlementContextDocument[]): SettlementContextDocument[] {
  if (!allocation.id) return [];
  return documents.filter((document) => document.request_allocation_id === allocation.id);
}

function getGeneralDocuments(documents: SettlementContextDocument[]): SettlementContextDocument[] {
  return documents.filter((document) => !document.request_allocation_id);
}

function getAllocationSummary(allocation: RequestAllocation): string {
  const line = allocation.planning_line ?? allocation.budgetPlanningLine;
  const orgUnit = allocation.org_unit ?? line?.org_unit ?? null;
  const fiscalYear = allocation.fiscal_year ?? line?.fiscal_year?.year ?? null;
  const parts = [
    orgUnit?.name ? `Unidad: ${orgUnit.name}` : null,
    fiscalYear ? `Año fiscal: ${fiscalYear}` : null,
    `Monto: ${formatRequestCurrency(Number(allocation.amount ?? 0), allocation.currency || REQUEST_CURRENCY.PEN)}`,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

function getAllocationOrgUnitLabel(allocation: RequestAllocation): string {
  const orgUnit = allocation.org_unit ?? allocation.planning_line?.org_unit ?? allocation.budgetPlanningLine?.org_unit ?? null;
  const label = [orgUnit?.code, orgUnit?.name].filter(Boolean).join(" ").trim();
  return label || "No informado";
}

function OriginalAdvanceLines({ allocations, currency }: { allocations: RequestAllocation[]; currency: RequestCurrency }) {
  return (
    <section className="space-y-3" data-testid="original-advance-lines">
      <div>
        <h3 className="text-sm font-semibold">Líneas del anticipo original</h3>
        <p className="text-xs text-muted-foreground">
          El anticipo puede incluir una o más líneas POA y unidades; por eso la referencia se muestra por línea, no como un único POA o una única unidad.
        </p>
      </div>
      {allocations.length === 0 ? <p className="rounded-md border p-3 text-sm text-muted-foreground">El anticipo original no tiene líneas POA disponibles para mostrar.</p> : null}
      <div className="grid gap-3">
        {allocations.map((allocation, index) => (
          <div key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,9rem)] md:items-start">
            <div className="min-w-0">
              <p className="font-medium">Línea {index + 1}: {getPlanningLineDisplay(allocation.planning_line ?? allocation.budgetPlanningLine)}</p>
              <p className="text-xs text-muted-foreground">{getAllocationOrgUnitLabel(allocation)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monto del anticipo</p>
              <p className="font-semibold">{formatRequestCurrency(Number(allocation.amount ?? 0), allocation.currency || currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Año fiscal</p>
              <p className="font-medium">{formatOptionalText(allocation.fiscal_year ?? allocation.budgetPlanningLine?.fiscal_year?.year)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DocumentRows({ documents, emptyMessage = "Sin documentos visibles." }: { documents: SettlementContextDocument[]; emptyMessage?: string }) {
  if (documents.length === 0) return <p className="rounded-md border p-3 text-sm text-muted-foreground">{emptyMessage}</p>;

  return (
    <div className="space-y-3">
      {documents.map((document) => {
        const documentWebUrl = getDocumentWebUrl(document);

        return (
          <div key={document.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{getRequestDocumentDisplayName(document)}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{getRequestDocumentCategoryLabel(document.document_category)}</Badge>
                  <Badge variant="outline">Solo lectura</Badge>
                  <span>{getRequestDocumentMimeLabel(document.mime_type)}</span>
                  <span>{formatRequestDocumentSize(document.size_bytes)}</span>
                  <span>Subido: {formatRequestDateTime(document.created_at)}</span>
                  <span>Estado: {getRequestDocumentUploadStatusLabel(document.upload_status)}</span>
                </div>
              </div>
            </div>
            {documentWebUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={documentWebUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Ver documento
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Enlace no disponible</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OriginalAdvanceDocuments({ documents, allocations }: { documents: SettlementContextDocument[]; allocations: RequestAllocation[] }) {
  const generalDocuments = allocations.length > 0 ? getGeneralDocuments(documents) : documents;

  return (
    <section className="space-y-3" data-testid="original-advance-documents">
      <div>
        <h3 className="text-sm font-semibold">Documentos del anticipo original</h3>
        <p className="text-xs text-muted-foreground">Consulta los documentos de referencia del anticipo. Esta sección no permite adjuntar ni eliminar archivos.</p>
      </div>
      {documents.length === 0 ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">El anticipo original no tiene documentos visibles.</p>
      ) : (
        <div className="space-y-3">
          {allocations.map((allocation, index) => {
            const allocationDocuments = getAllocationDocuments(allocation, documents);
            if (allocationDocuments.length === 0) return null;

            return (
              <div key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`} className="space-y-3 rounded-md border p-4" data-testid="original-advance-allocation-documents">
                <div>
                  <h4 className="text-sm font-semibold">Línea {index + 1}: {getPlanningLineDisplay(allocation.planning_line ?? allocation.budgetPlanningLine)}</h4>
                  <p className="text-xs text-muted-foreground">{getAllocationSummary(allocation)}</p>
                </div>
                <DocumentRows documents={allocationDocuments} />
              </div>
            );
          })}
          {generalDocuments.length > 0 && (
            <div className="space-y-3 rounded-md border p-4" data-testid="original-advance-general-documents">
              <h4 className="text-sm font-semibold">Documentos generales del anticipo</h4>
              <DocumentRows documents={generalDocuments} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function SettlementContextCard({ context, showDocuments = true }: SettlementContextCardProps) {
  const advanceCode = getAdvanceCode(context);
  const paidDate = getPaidDate(context);
  const allocations = context.original_advance.allocations ?? [];

  return (
    <Card data-testid="settlement-context-card">
      <CardHeader>
        <CardTitle>Resumen del anticipo original</CardTitle>
        <CardDescription>Información de referencia para preparar la rendición sin modificar el anticipo pagado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2">
          {renderSummaryItem("Código", advanceCode)}
          {renderSummaryItem("Monto pagado", formatRequestCurrency(getPaidAmount(context), context.original_advance.currency))}
          {renderSummaryItem("Monto solicitado", formatRequestCurrency(Number(context.original_advance.requested_amount ?? 0), context.original_advance.currency))}
          {renderSummaryItem("Fecha de pago", formatRequestDate(paidDate))}
          {renderSummaryItem("Fecha límite de rendición", formatRequestDate(context.due_date?.due_date ?? context.original_advance.scheduled_rendition_at))}
          {renderSummaryItem("Cantidad de líneas POA", allocations.length > 0 ? `${allocations.length} línea(s)` : "No informado")}
          {renderSummaryItem("Concepto", formatOptionalText(context.original_advance.concept), "md:col-span-2")}
          {renderSummaryItem(
            "Anticipo original",
            <Button asChild variant="outline" size="sm">
              <Link href={`${ROUTES.REQUESTS}/${context.original_advance.id}`}>
                Ver anticipo {advanceCode}
              </Link>
            </Button>,
            "md:col-span-2",
          )}
        </section>
        <OriginalAdvanceLines allocations={allocations} currency={context.original_advance.currency} />
        {showDocuments && <OriginalAdvanceDocuments documents={context.original_advance_documents} allocations={context.original_advance.allocations ?? []} />}
      </CardContent>
    </Card>
  );
}
