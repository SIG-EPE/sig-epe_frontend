"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRenditionsInbox } from "@/hooks/use-requests";
import { ROUTES } from "@/lib/constants";
import {
  RENDITION_DIRECTION_OPTIONS,
  RENDITION_SORT_OPTIONS,
  RENDITION_STATUS_FILTER_OPTIONS,
  RENDITION_SUMMARY_CARDS,
  getApiErrorMessage,
  getRenditionSummaryCount,
  parseRenditionSortDirection,
  parseRenditionSortField,
  parseRenditionStatusFilter,
} from "@/lib/requests";
import { cn } from "@/lib/utils";
import { RENDITION_BUCKET, type RenditionBucket, type RenditionSortDirection, type RenditionSortField, type RenditionStatus } from "@/types/requests";
import { RenditionsTable } from "./renditions-table";
import { GiofBulkAssignmentBar, GiofWorkScopeFilter } from "@/components/giof-work/giof-work-controls";
import { isGiofManagerRole, isGiofOperationalRole } from "@/lib/role-capabilities";
import { useAuthStore } from "@/stores/auth-store";
import { GIOF_WORK_POOL, GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";

const ALL_RENDITIONS_FILTER = "ALL";

function parseRenditionBucketFilter(value?: string | null): RenditionBucket | undefined {
  return value === RENDITION_BUCKET.DUE_SOON ? RENDITION_BUCKET.DUE_SOON : undefined;
}

export function RenditionsInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [status, setStatus] = useState<RenditionStatus | undefined>(parseRenditionStatusFilter(searchParams.get("status")));
  const [bucket, setBucket] = useState<RenditionBucket | undefined>(parseRenditionBucketFilter(searchParams.get("bucket")));
  const [sort, setSort] = useState<RenditionSortField>(parseRenditionSortField(searchParams.get("sort")));
  const [direction, setDirection] = useState<RenditionSortDirection>(parseRenditionSortDirection(searchParams.get("direction")));
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const user = useAuthStore((state) => state.user);
  const isGiofManager = isGiofManagerRole(user?.role?.code);
  const isGiofOperational = isGiofOperationalRole(user?.role?.code);
  const rawWorkScope = searchParams.get("work_scope");
  const workScope: GiofWorkScope = Object.values(GIOF_WORK_SCOPE).includes(rawWorkScope as GiofWorkScope) ? rawWorkScope as GiofWorkScope : GIOF_WORK_SCOPE.MINE;
  const workAssigneeId = workScope === GIOF_WORK_SCOPE.ASSIGNEE ? searchParams.get("assignee_id") ?? undefined : undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const limit = Number(searchParams.get("limit") ?? "20") || 20;
  const inbox = useRenditionsInbox({
    page,
    limit,
    status,
    bucket,
    search: debouncedSearch || undefined,
    sort,
    direction,
    work_scope: isGiofOperational ? workScope : undefined,
    assignee_id: isGiofManager ? workAssigneeId : undefined,
  });

  function replaceQuery(nextValues: Record<string, string | number | undefined>) {
    const nextParams = new URLSearchParams(searchParams.toString());
    Object.entries(nextValues).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        nextParams.delete(key);
        return;
      }
      nextParams.set(key, String(value));
    });
    const query = nextParams.toString();
    router.replace(query ? `${ROUTES.RENDITIONS}?${query}` : ROUTES.RENDITIONS);
  }

  function setStatusFilter(value: RenditionStatus | undefined) {
    setStatus(value);
    setBucket(undefined);
    replaceQuery({ status: value ?? ALL_RENDITIONS_FILTER, bucket: undefined, page: 1 });
  }

  function setBucketFilter(value: RenditionBucket | undefined) {
    setBucket(value);
    setStatus(undefined);
    replaceQuery({ bucket: value, status: ALL_RENDITIONS_FILTER, page: 1 });
  }

  function setSortOption(value: RenditionSortField) {
    setSort(value);
    replaceQuery({ sort: value, page: 1 });
  }

  function setDirectionOption(value: RenditionSortDirection) {
    setDirection(value);
    replaceQuery({ direction: value, page: 1 });
  }

  function setSearchFilter(value: string) {
    setSearch(value);
    replaceQuery({ search: value.trim() || undefined, page: 1 });
  }

  function setWorkScope(nextScope: GiofWorkScope, assigneeId?: string) {
    setSelectedAssignmentIds([]);
    replaceQuery({ work_scope: nextScope, assignee_id: nextScope === GIOF_WORK_SCOPE.ASSIGNEE ? assigneeId : undefined, page: 1 });
  }

  const currentPage = inbox.page;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage * inbox.limit < inbox.total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bandeja de Rendiciones</h1>
        <p className="text-muted-foreground">Da seguimiento a anticipos pagados, fechas límite y solicitudes REXAN vinculadas.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-testid="renditions-summary-cards">
        {RENDITION_SUMMARY_CARDS.map((card) => {
          const isActive = card.bucket ? bucket === card.bucket : card.status ? status === card.status && bucket === undefined : false;
          const count = getRenditionSummaryCount(card, inbox.counts, inbox.renditions);
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                if (card.bucket) {
                  setBucketFilter(isActive ? undefined : card.bucket);
                  return;
                }
                if (card.status) setStatusFilter(isActive ? undefined : card.status);
              }}
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
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Anticipos por rendir</CardTitle>
            <CardDescription>Total: {inbox.total}</CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {isGiofOperational && <GiofWorkScopeFilter value={workScope} assigneeId={workAssigneeId} isManager={isGiofManager} onChange={setWorkScope} helpContext={GIOF_HELP_CONTEXT.REXAN} />}
            <Select value={status ?? ALL_RENDITIONS_FILTER} onValueChange={(value) => setStatusFilter(value === ALL_RENDITIONS_FILTER ? undefined : (value as RenditionStatus))}>
              <SelectTrigger data-testid="renditions-status-filter"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_RENDITIONS_FILTER}>Ver todo</SelectItem>
                {RENDITION_STATUS_FILTER_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSortOption(value as RenditionSortField)}>
              <SelectTrigger data-testid="renditions-sort-field"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
              <SelectContent>
                {RENDITION_SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={direction} onValueChange={(value) => setDirectionOption(value as RenditionSortDirection)}>
              <SelectTrigger data-testid="renditions-sort-direction"><SelectValue placeholder="Dirección" /></SelectTrigger>
              <SelectContent>
                {RENDITION_DIRECTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={search} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Buscar por código, solicitante o área..." data-testid="renditions-search-input" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isGiofManager && <GiofBulkAssignmentBar pool={GIOF_WORK_POOL.REXAN} items={inbox.renditions.filter((row) => row.giof_work?.requestId && selectedAssignmentIds.includes(row.giof_work.requestId) && row.giof_work.canAssign === true).map((row) => ({ requestId: row.giof_work!.requestId!, label: row.request_code ?? "Rendición", work: row.giof_work! }))} onClear={() => setSelectedAssignmentIds([])} onSuccess={() => inbox.refetch()} />}
          {inbox.isRefreshing && !inbox.error && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
              Actualizando rendiciones...
            </p>
          )}
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
              <Button variant="outline" size="sm" disabled={!hasPreviousPage} onClick={() => replaceQuery({ page: Math.max(1, currentPage - 1) })}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={!hasNextPage} onClick={() => replaceQuery({ page: currentPage + 1 })}>Siguiente</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
