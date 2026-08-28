"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

import { GiofBulkAssignmentBar } from "@/components/giof-work/giof-work-controls";
import { QueueFilterReset } from "@/components/queue-filters/queue-filter-reset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRenditionsInbox } from "@/hooks/use-requests";
import {
  parseRenditionsQueueUrl,
  serializeRenditionsQueueUrl,
  updateRenditionsQueueUrl,
  type RenditionsQueueUrlFilters,
} from "@/lib/queue-filters/renditions";
import {
  RENDITION_SUMMARY_CARDS,
  getApiErrorMessage,
  getRenditionSummaryCount,
} from "@/lib/requests";
import { isGiofManagerRole, isGiofOperationalRole } from "@/lib/role-capabilities";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { GIOF_WORK_POOL, GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import { RENDITION_DEADLINE_BUCKET } from "@/types/requests";
import { RenditionsFilters } from "./renditions-filters";
import { RenditionsTable } from "./renditions-table";

function buildRenditionsRoute(params: URLSearchParams): Route {
  const query = params.toString();
  return (query ? `/renditions?${query}` : "/renditions") as Route;
}

export function RenditionsInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const isGiofManager = isGiofManagerRole(roleCode);
  const isGiofOperational = isGiofOperationalRole(roleCode);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const currentParams = new URLSearchParams(searchParams.toString());
  const parsedUrl = parseRenditionsQueueUrl(currentParams);
  const urlFilters = parsedUrl.filters;
  const roleFilterInvalid = isGiofManager
    ? false
    : isGiofOperational
      ? Boolean(urlFilters.assignee_id || (urlFilters.work_scope && urlFilters.work_scope !== GIOF_WORK_SCOPE.MINE))
      : Boolean(urlFilters.work_scope || urlFilters.assignee_id);
  const hasInvalidUrl = parsedUrl.invalidKeys.length > 0 || parsedUrl.unknownKeys.length > 0 || roleFilterInvalid;
  const workScope: GiofWorkScope | undefined = isGiofOperational
    ? isGiofManager ? urlFilters.work_scope ?? GIOF_WORK_SCOPE.ALL : GIOF_WORK_SCOPE.MINE
    : undefined;
  const workAssigneeId = isGiofManager && workScope === GIOF_WORK_SCOPE.ASSIGNEE
    ? urlFilters.assignee_id
    : undefined;
  const effectiveFilters: RenditionsQueueUrlFilters = {
    ...urlFilters,
    work_scope: workScope,
    assignee_id: workAssigneeId,
  };
  const inbox = useRenditionsInbox(effectiveFilters, { enabled: !hasInvalidUrl });
  const canonicalParams = serializeRenditionsQueueUrl(urlFilters);
  const canonicalQuery = canonicalParams.toString();
  const rawQuery = currentParams.toString();
  const viewIdentity = serializeRenditionsQueueUrl(effectiveFilters).toString();

  useEffect(() => {
    if (!hasInvalidUrl && rawQuery !== canonicalQuery) {
      router.replace(buildRenditionsRoute(canonicalParams));
    }
  }, [canonicalQuery, hasInvalidUrl, rawQuery, router]);

  useEffect(() => {
    setSelectedAssignmentIds([]);
  }, [viewIdentity]);

  function replaceRenditionsUrl(params: URLSearchParams): void {
    router.replace(buildRenditionsRoute(params));
  }

  function changeFilters(patch: Partial<RenditionsQueueUrlFilters>): void {
    replaceRenditionsUrl(updateRenditionsQueueUrl(currentParams, patch));
  }

  function clearFilters(): void {
    replaceRenditionsUrl(new URLSearchParams());
  }

  function setStatusFilter(status: RenditionsQueueUrlFilters["status"]): void {
    changeFilters({ status });
  }

  function setDeadlineBucketFilter(deadlineBucket: RenditionsQueueUrlFilters["deadline_bucket"]): void {
    changeFilters({ deadline_bucket: deadlineBucket });
  }

  const currentPage = inbox.page;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage * inbox.limit < inbox.total;
  const exactCount = inbox.summary?.count ?? inbox.total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bandeja de Rendiciones</h1>
        <p className="text-muted-foreground">Da seguimiento a anticipos pagados, fechas límite y solicitudes REXAN vinculadas.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" data-testid="renditions-summary-cards">
        <Card data-testid="renditions-summary-card-results">
          <CardHeader className="p-4 pb-1"><CardTitle className="text-2xl">{exactCount}</CardTitle><CardDescription>Resultados filtrados</CardDescription></CardHeader>
          <CardContent className="px-4 pb-4 pt-0"><p className="text-xs text-muted-foreground">Aplica todos los filtros activos.</p></CardContent>
        </Card>
        {RENDITION_SUMMARY_CARDS.map((card) => {
          const isDeadlineFacet = card.bucket === "due_soon";
          const activeDeadlineBucket = isDeadlineFacet ? RENDITION_DEADLINE_BUCKET.DUE_SOON : undefined;
          const isActive = activeDeadlineBucket
            ? effectiveFilters.deadline_bucket === activeDeadlineBucket
            : card.status !== undefined && effectiveFilters.status === card.status;
          const count = activeDeadlineBucket
            ? inbox.facets?.deadline_bucket.counts[activeDeadlineBucket]
              ?? getRenditionSummaryCount(card, inbox.counts, inbox.renditions)
            : card.status
              ? inbox.facets?.status.counts[card.status]
                ?? getRenditionSummaryCount(card, inbox.counts, inbox.renditions)
              : 0;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => activeDeadlineBucket
                ? setDeadlineBucketFilter(isActive ? undefined : activeDeadlineBucket)
                : card.status && setStatusFilter(isActive ? undefined : card.status)}
              className={cn(
                "rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md",
                isActive ? "border-primary ring-2 ring-primary" : "border-border",
              )}
              data-testid={`renditions-summary-card-${card.key}`}
              aria-pressed={isActive}
            >
              <p className="text-2xl font-bold text-foreground">{count}</p>
              <p className="text-sm font-medium text-foreground">{card.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">{isDeadlineFacet ? "Facet: ignora solo el filtro de plazo." : "Facet: ignora solo el filtro de estado."}</p>
            </button>
          );
        })}
      </div>

      {hasInvalidUrl ? (
        <QueueFilterReset message="No se pudieron aplicar los filtros de la URL. Restablécelos para continuar sin exponer parámetros inválidos." onReset={clearFilters} />
      ) : (
        <RenditionsFilters filters={effectiveFilters} isManager={isGiofManager} isOperational={isGiofOperational} count={exactCount} isLoading={inbox.isLoading} isRefreshing={inbox.isRefreshing} onChange={changeFilters} onClear={clearFilters} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Anticipos por rendir</CardTitle>
          <CardDescription>Total exacto con todos los filtros: {inbox.total}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isGiofManager && <GiofBulkAssignmentBar pool={GIOF_WORK_POOL.REXAN} items={inbox.renditions.filter((row) => row.giof_work?.requestId && selectedAssignmentIds.includes(row.giof_work.requestId) && row.giof_work.canAssign === true).map((row) => ({ requestId: row.giof_work!.requestId!, label: row.request_code ?? "Rendición", work: row.giof_work! }))} onClear={() => setSelectedAssignmentIds([])} onSuccess={() => inbox.refetch()} />}
          {inbox.isRefreshing && !inbox.error && <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">Actualizando rendiciones...</p>}
          {inbox.error ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">{getApiErrorMessage(inbox.error)}</p>
              <Button size="sm" variant="outline" onClick={() => void inbox.refetch()}>Reintentar</Button>
            </div>
          ) : (
            <RenditionsTable renditions={inbox.renditions} isLoading={inbox.isLoading} currentUserId={user?.id} isGiofManager={isGiofManager} selectedAssignmentIds={selectedAssignmentIds} onToggleAssignment={(requestId, checked) => setSelectedAssignmentIds((current) => checked ? [...new Set([...current, requestId])].slice(0, 50) : current.filter((id) => id !== requestId))} onToggleAllAssignments={(checked) => setSelectedAssignmentIds(checked ? inbox.renditions.filter((row) => row.giof_work?.canAssign === true).map((row) => row.giof_work?.requestId).filter((id): id is string => Boolean(id)).slice(0, 50) : [])} />
          )}
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Página {currentPage}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!hasPreviousPage} onClick={() => changeFilters({ page: Math.max(1, currentPage - 1) })}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={!hasNextPage} onClick={() => changeFilters({ page: currentPage + 1 })}>Siguiente</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
