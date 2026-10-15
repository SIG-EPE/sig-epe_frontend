"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

import { GiofBulkAssignmentBar } from "@/components/giof-work/giof-work-controls";
import { QueueFilterReset } from "@/components/queue-filters/queue-filter-reset";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRenditionsInbox } from "@/hooks/use-requests";
import { ApiRequestError } from "@/lib/api-client";
import { isRenditionExportReady } from "@/lib/business-queue-export-readiness";
import { ROLE_CODE } from "@/lib/constants";
import { downloadRenditionsExport, saveRenditionsExport } from "@/lib/renditions-export";
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
import {
  canManageGiofAssignments,
  isGiofManagerRole,
  isGiofOperationalRole,
} from "@/lib/role-capabilities";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import {
  GIOF_BULK_ASSIGNMENT_MODE,
  GIOF_WORK_POOL,
  GIOF_WORK_SCOPE,
  type GiofWorkScope,
} from "@/types/giof-work";
import {
  getGiofCurrentPageSelection,
  isGiofBulkSelectable,
  type GiofBulkSelectableWorkItem,
} from "@/lib/giof-bulk-selection";
import { RENDITION_DEADLINE_BUCKET } from "@/types/requests";
import { RenditionsFilters } from "./renditions-filters";
import { RenditionsTable } from "./renditions-table";

function buildRenditionsRoute(params: URLSearchParams): Route {
  const query = params.toString();
  return (query ? `/renditions?${query}` : "/renditions") as Route;
}

function getRenditionsExportErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError")
    return "La descarga del Excel fue cancelada.";
  if (error instanceof ApiRequestError) {
    if (error.status === 403) return "No tienes permisos para exportar la Bandeja de Rendiciones.";
    if (error.status === 400) return "Revisa los filtros activos antes de exportar el Excel.";
    if (error.status === 422) return "El Excel supera el límite permitido. Ajusta los filtros activos.";
    if (error.status === 401) return "Tu sesión no está disponible. Vuelve a iniciar sesión.";
  }
  return "No se pudo descargar el Excel. Inténtalo nuevamente.";
}

export function RenditionsInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const isGiofManager = isGiofManagerRole(roleCode);
  const canManageAssignments = canManageGiofAssignments(roleCode);
  const isGiofOperational = isGiofOperationalRole(roleCode);
  const canExport = roleCode === ROLE_CODE.GIOF_GESTOR ||
    roleCode === ROLE_CODE.GIOF_MANAGER ||
    roleCode === ROLE_CODE.AUDITOR_DIRECCION ||
    roleCode === ROLE_CODE.ADMIN_SISTEMA;
  const [isExporting, setIsExporting] = useState(false);
  const exportControllerRef = useRef<AbortController | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>(
    [],
  );
  const currentParams = new URLSearchParams(searchParams.toString());
  const parsedUrl = parseRenditionsQueueUrl(currentParams);
  const urlFilters = parsedUrl.filters;
  const roleFilterInvalid = canManageAssignments
    ? false
    : isGiofOperational
      ? Boolean(
          urlFilters.assignee_id ||
          (urlFilters.work_scope &&
            urlFilters.work_scope !== GIOF_WORK_SCOPE.ALL &&
            urlFilters.work_scope !== GIOF_WORK_SCOPE.MINE),
        )
      : Boolean(urlFilters.work_scope || urlFilters.assignee_id);
  const hasInvalidUrl =
    parsedUrl.invalidKeys.length > 0 ||
    parsedUrl.unknownKeys.length > 0 ||
    roleFilterInvalid;
  const workScope: GiofWorkScope | undefined = isGiofOperational
    ? (urlFilters.work_scope ?? GIOF_WORK_SCOPE.ALL)
    : undefined;
  const workAssigneeId =
    canManageAssignments && workScope === GIOF_WORK_SCOPE.ASSIGNEE
      ? urlFilters.assignee_id
      : undefined;
  const effectiveFilters: RenditionsQueueUrlFilters = {
    ...urlFilters,
    work_scope: workScope,
    assignee_id: workAssigneeId,
  };
  const inbox = useRenditionsInbox(effectiveFilters, {
    enabled: !hasInvalidUrl,
  });
  const canonicalParams = serializeRenditionsQueueUrl(effectiveFilters);
  const canonicalQuery = canonicalParams.toString();
  const rawQuery = currentParams.toString();
  const viewIdentity = serializeRenditionsQueueUrl(effectiveFilters).toString();
  const bulkAssignmentMode = isGiofOperational
    ? GIOF_BULK_ASSIGNMENT_MODE.MANAGER_TARGET
    : undefined;
  const assignmentItems: GiofBulkSelectableWorkItem[] = inbox.renditions
    .filter(
      (row): row is typeof row & { giof_work: NonNullable<typeof row.giof_work> } =>
        Boolean(row.giof_work?.requestId),
    )
    .map((row) => ({
      requestId: row.giof_work.requestId!,
      label: row.request_code ?? "Rendición",
      work: row.giof_work,
    }));
  const selectedAssignmentItems = bulkAssignmentMode
    ? getGiofCurrentPageSelection(
        assignmentItems,
        selectedAssignmentIds,
        bulkAssignmentMode,
      )
    : [];
  const assignmentResultIdentity = assignmentItems
    .map((item) => `${item.requestId}:${item.work.assignmentVersion}`)
    .join("|");

  useEffect(() => {
    if (!hasInvalidUrl && rawQuery !== canonicalQuery) {
      router.replace(buildRenditionsRoute(canonicalParams));
    }
  }, [canonicalQuery, hasInvalidUrl, rawQuery, router]);

  useEffect(() => {
    setSelectedAssignmentIds([]);
  }, [assignmentResultIdentity, bulkAssignmentMode, viewIdentity]);

  useEffect(() => () => exportControllerRef.current?.abort(), []);

  async function exportExcel(): Promise<void> {
    if (!canExport || hasInvalidUrl || exportControllerRef.current) return;
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setIsExporting(true);
    try {
      const download = await downloadRenditionsExport(effectiveFilters, controller.signal);
      controller.signal.throwIfAborted();
      saveRenditionsExport(download);
      toast.success("Excel de Bandeja de Rendiciones descargado correctamente.");
    } catch (error) {
      toast.error(getRenditionsExportErrorMessage(error));
    } finally {
      if (exportControllerRef.current === controller) {
        exportControllerRef.current = null;
        setIsExporting(false);
      }
    }
  }

  function replaceRenditionsUrl(params: URLSearchParams): void {
    router.replace(buildRenditionsRoute(params));
  }

  function changeFilters(patch: Partial<RenditionsQueueUrlFilters>): void {
    replaceRenditionsUrl(
      updateRenditionsQueueUrl(
        serializeRenditionsQueueUrl(effectiveFilters),
        patch,
      ),
    );
  }

  function clearFilters(): void {
    replaceRenditionsUrl(
      serializeRenditionsQueueUrl({
        work_scope: isGiofOperational ? GIOF_WORK_SCOPE.ALL : undefined,
      }),
    );
  }

  function setStatusFilter(status: RenditionsQueueUrlFilters["status"]): void {
    changeFilters({ status });
  }

  function setDeadlineBucketFilter(
    deadlineBucket: RenditionsQueueUrlFilters["deadline_bucket"],
  ): void {
    changeFilters({ deadline_bucket: deadlineBucket });
  }

  function toggleAssignment(requestId: string, checked: boolean): void {
    const item = assignmentItems.find(
      (candidate) => candidate.requestId === requestId,
    );
    if (
      !bulkAssignmentMode ||
      !item ||
      !isGiofBulkSelectable(item.work, bulkAssignmentMode)
    )
      return;
    setSelectedAssignmentIds((current) =>
      checked
        ? [...new Set([...current, requestId])].slice(0, 50)
        : current.filter((id) => id !== requestId),
    );
  }

  const currentPage = inbox.page;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage * inbox.limit < inbox.total;
  const exactCount = inbox.summary?.count ?? inbox.total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bandeja de Rendiciones</h1>
          <p className="text-muted-foreground">
            Da seguimiento a anticipos pagados, fechas límite y solicitudes REXAN vinculadas.
          </p>
        </div>
      </div>

      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        data-testid="renditions-summary-cards"
      >
        <Card data-testid="renditions-summary-card-results">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-2xl">{exactCount}</CardTitle>
            <CardDescription>Resultados filtrados</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <p className="text-xs text-muted-foreground">
              Aplica todos los filtros activos.
            </p>
          </CardContent>
        </Card>
        {RENDITION_SUMMARY_CARDS.map((card) => {
          const isDeadlineFacet = card.bucket === "due_soon";
          const activeDeadlineBucket = isDeadlineFacet
            ? RENDITION_DEADLINE_BUCKET.DUE_SOON
            : undefined;
          const isActive = activeDeadlineBucket
            ? effectiveFilters.deadline_bucket === activeDeadlineBucket
            : card.status !== undefined &&
              effectiveFilters.status === card.status;
          const count = activeDeadlineBucket
            ? (inbox.facets?.deadline_bucket.counts[activeDeadlineBucket] ??
              getRenditionSummaryCount(card, inbox.counts, inbox.renditions))
            : card.status
              ? (inbox.facets?.status.counts[card.status] ??
                getRenditionSummaryCount(card, inbox.counts, inbox.renditions))
              : 0;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() =>
                activeDeadlineBucket
                  ? setDeadlineBucketFilter(
                      isActive ? undefined : activeDeadlineBucket,
                    )
                  : card.status &&
                    setStatusFilter(isActive ? undefined : card.status)
              }
              className={cn(
                "rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md",
                isActive
                  ? "border-primary ring-2 ring-primary"
                  : "border-border",
              )}
              data-testid={`renditions-summary-card-${card.key}`}
              aria-pressed={isActive}
            >
              <p className="text-2xl font-bold text-foreground">{count}</p>
              <p className="text-sm font-medium text-foreground">
                {card.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {card.description}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isDeadlineFacet
                  ? "Facet: ignora solo el filtro de plazo."
                  : "Facet: ignora solo el filtro de estado."}
              </p>
            </button>
          );
        })}
      </div>

      {hasInvalidUrl ? (
        <QueueFilterReset
          message="No se pudieron aplicar los filtros de la URL. Restablécelos para continuar sin exponer parámetros inválidos."
          onReset={clearFilters}
        />
      ) : (
        <RenditionsFilters
          filters={effectiveFilters}
          isManager={canManageAssignments}
          isOperational={isGiofOperational}
          count={exactCount}
          isLoading={inbox.isLoading}
          isRefreshing={inbox.isRefreshing}
          onChange={changeFilters}
          onClear={clearFilters}
        />
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4 sm:flex-row">
          <div className="min-w-0">
            <CardTitle>Anticipos por rendir</CardTitle>
            <CardDescription>
              Total exacto con todos los filtros: {inbox.total}
            </CardDescription>
          </div>
          {isRenditionExportReady() && canExport && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void exportExcel()}
                disabled={hasInvalidUrl || isExporting} aria-busy={isExporting}
                aria-describedby="renditions-export-state">
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                {isExporting ? "Exportando Excel..." : "Exportar Excel"}
              </Button>
              {isExporting && <Button type="button" variant="ghost" onClick={() => exportControllerRef.current?.abort()}>Cancelar descarga</Button>}
              <span id="renditions-export-state" role={isExporting ? "status" : undefined}
                aria-live="polite" className={isExporting ? "text-sm text-muted-foreground" : "sr-only"}>
                {isExporting ? "Preparando el Excel. La cancelación es best-effort." : hasInvalidUrl ? "Restablece los filtros inválidos antes de exportar." : "Exporta los anticipos pendientes y la última REXAN vinculada que coinciden con los filtros activos."}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {bulkAssignmentMode === GIOF_BULK_ASSIGNMENT_MODE.MANAGER_TARGET &&
          selectedAssignmentItems.length > 0 ? (
            <GiofBulkAssignmentBar
              pool={GIOF_WORK_POOL.REXAN}
              items={selectedAssignmentItems}
              onClear={() => setSelectedAssignmentIds([])}
              onSuccess={() => inbox.refetch()}
            />
          ) : null}
          {inbox.isRefreshing && !inbox.error && (
            <p
              className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              role="status"
            >
              Actualizando rendiciones...
            </p>
          )}
          {inbox.error ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">
                {getApiErrorMessage(inbox.error)}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void inbox.refetch()}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <RenditionsTable
              renditions={inbox.renditions}
              isLoading={inbox.isLoading}
              currentUserId={user?.id}
              roleCode={roleCode}
              refetchPoolQueue={(options) => inbox.refetch(options)}
              isGiofManager={isGiofManager}
              bulkAssignmentMode={bulkAssignmentMode}
              selectedAssignmentIds={selectedAssignmentIds}
              onToggleAssignment={toggleAssignment}
              onToggleAllAssignments={(checked) =>
                setSelectedAssignmentIds(
                  checked
                    ? inbox.renditions
                        .filter(
                          (row) =>
                            row.giof_work &&
                            bulkAssignmentMode &&
                            isGiofBulkSelectable(
                              row.giof_work,
                              bulkAssignmentMode,
                            ),
                        )
                        .map((row) => row.giof_work?.requestId)
                        .filter((id): id is string => Boolean(id))
                        .slice(0, 50)
                    : [],
                )
              }
            />
          )}
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Página {currentPage}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPreviousPage}
                onClick={() =>
                  changeFilters({ page: Math.max(1, currentPage - 1) })
                }
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNextPage}
                onClick={() => changeFilters({ page: currentPage + 1 })}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
