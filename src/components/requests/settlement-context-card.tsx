import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
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
import type { SettlementContextResponse, SettlementContextDocument } from "@/types/requests";

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
  const webUrl = document.drive_web_url?.trim();
  return webUrl && webUrl.length > 0 ? webUrl : null;
}

function renderSummaryItem(label: string, value: ReactNode, className = ""): ReactNode {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function OriginalAdvanceDocuments({ documents }: { documents: SettlementContextDocument[] }) {
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
      )}
    </section>
  );
}

export function SettlementContextCard({ context, showDocuments = true }: SettlementContextCardProps) {
  const advanceCode = getAdvanceCode(context);
  const paidDate = getPaidDate(context);
  const planningLine = context.original_advance.budgetPlanningLine ?? null;
  const orgUnit = planningLine?.organizationalUnit ?? context.original_advance.organizationalUnit ?? null;

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
          {renderSummaryItem("Beneficiario", formatOptionalText(context.original_advance.beneficiary_name))}
          {renderSummaryItem("POA", getPlanningLineDisplay(planningLine), "md:col-span-2")}
          {renderSummaryItem("Unidad organizacional", formatOptionalText(orgUnit ? [orgUnit.code, orgUnit.name].filter(Boolean).join(" ") : null))}
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
        {showDocuments && <OriginalAdvanceDocuments documents={context.original_advance_documents} />}
      </CardContent>
    </Card>
  );
}
