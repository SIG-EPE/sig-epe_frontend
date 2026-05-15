"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { RenditionSortDirection, RenditionSortField, RenditionStatus } from "@/types/requests";
import { RenditionsTable } from "./renditions-table";

const ALL_RENDITIONS_FILTER = "ALL";

export function RenditionsInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("search")?.trim() ?? "");
  const [status, setStatus] = useState<RenditionStatus | undefined>(parseRenditionStatusFilter(searchParams.get("status")));
  const [sort, setSort] = useState<RenditionSortField>(parseRenditionSortField(searchParams.get("sort")));
  const [direction, setDirection] = useState<RenditionSortDirection>(parseRenditionSortDirection(searchParams.get("direction")));
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const limit = Number(searchParams.get("limit") ?? "20") || 20;
  const inbox = useRenditionsInbox({
    page,
    limit,
    status,
    search: debouncedSearch || undefined,
    sort,
    direction,
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
    replaceQuery({ status: value ?? ALL_RENDITIONS_FILTER, page: 1 });
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

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
          const isActive = card.status ? status === card.status : false;
          const count = getRenditionSummaryCount(card, inbox.counts, inbox.renditions);
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => card.status && setStatusFilter(isActive ? undefined : card.status)}
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
          {inbox.error ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">{getApiErrorMessage(inbox.error)}</p>
              <Button size="sm" variant="outline" onClick={() => void inbox.refetch()}>Reintentar</Button>
            </div>
          ) : (
            <RenditionsTable renditions={inbox.renditions} isLoading={inbox.isLoading} />
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
