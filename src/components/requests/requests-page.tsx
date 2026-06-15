"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequests } from "@/hooks/use-requests";
import { ROLE_CODE, ROUTES } from "@/lib/constants";
import {
  ACTIVE_REVIEW_STATUSES,
  REQUEST_LIST_SORT,
  REQUEST_LIST_SORT_OPTIONS,
  REQUEST_REVIEW_QUEUE_CARDS,
  REQUEST_STATUS_FILTER_OPTIONS,
  REQUEST_STATUS_SUMMARY_CARDS,
  getRequestReviewQueueCount,
  getRequestReviewQueueFilter,
  getRequestReviewQueueForStatus,
  isRequestReviewRole,
  parseRequestListSort,
  parseRequestReviewQueue,
  parseRequestStatusFilter,
  sortRequestsForList,
  type RequestListSort,
  type RequestReviewQueue,
} from "@/lib/requests";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_STATUS, type RequestStatus } from "@/types/requests";
import { RequestListTable } from "./request-list-table";

const ALL_STATUSES_FILTER = "ALL";

export function RequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStatusParam = searchParams.get("status");
  const queryStatus = parseRequestStatusFilter(rawStatusParam);
  const queryQueue = parseRequestReviewQueue(searchParams.get("queue"));
  const isExplicitAllStatuses = rawStatusParam === ALL_STATUSES_FILTER;
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("search")?.trim() ?? "");
  const [status, setStatus] = useState<RequestStatus | undefined>(queryStatus);
  const [activeQueue, setActiveQueue] = useState<RequestReviewQueue | undefined>(queryQueue ?? getRequestReviewQueueForStatus(queryStatus));
  const [sort, setSort] = useState<RequestListSort>(parseRequestListSort(searchParams.get("sort")));
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const limit = Number(searchParams.get("limit") ?? "20") || 20;
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const requestScope = searchParams.get("scope") === "review" && isRequestReviewRole(roleCode) ? "review" : "mine";
  const isReviewInbox = requestScope === "review";
  const isGiofReviewInbox = isReviewInbox && roleCode === ROLE_CODE.GIOF_GESTOR;
  const activeQueueFilter = activeQueue ? getRequestReviewQueueFilter(activeQueue) : undefined;
  const isUnsupportedQueue = Boolean(activeQueueFilter?.unsupportedReason);
  const defaultReviewStatuses = isReviewInbox && !status && !activeQueue && !isExplicitAllStatuses
    ? [...ACTIVE_REVIEW_STATUSES]
    : undefined;
  const { requests, total, isLoading, error, refetch } = useRequests({
    page,
    limit,
    search: debouncedSearch || undefined,
    status: isUnsupportedQueue ? undefined : status,
    statuses: isUnsupportedQueue ? undefined : defaultReviewStatuses,
    scope: requestScope,
  });
  const { requests: summaryRequests } = useRequests({
    page: 1,
    limit: 100,
    search: debouncedSearch || undefined,
    scope: requestScope,
  });
  const sortedRequests = sortRequestsForList(requests, sort);
  const displayedRequests = isUnsupportedQueue ? [] : sortedRequests;
  const displayedTotal = isUnsupportedQueue ? 0 : total;

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
    router.replace(query ? `${ROUTES.REQUESTS}?${query}` : ROUTES.REQUESTS);
  }

  function setStatusFilter(value: RequestStatus | undefined) {
    const nextQueue = isGiofReviewInbox ? getRequestReviewQueueForStatus(value) : undefined;
    setActiveQueue(nextQueue);
    setStatus(value);
    replaceQuery({ status: value ?? ALL_STATUSES_FILTER, queue: nextQueue, page: 1 });
  }

  function setSortOption(value: RequestListSort) {
    setSort(value);
    replaceQuery({ sort: value, page: 1 });
  }

  function setReviewQueueFilter(queue: RequestReviewQueue) {
    const filter = getRequestReviewQueueFilter(queue);
    setActiveQueue(queue);
    setStatus(filter.status);
    setSort(filter.sort);
    replaceQuery({ queue, status: filter.status, sort: filter.sort, page: 1 });
  }

  function setSearchFilter(value: string) {
    setSearch(value);
    replaceQuery({ search: value.trim() || undefined, page: 1 });
  }

  function getStatusCount(cardStatus: RequestStatus) {
    return summaryRequests.filter((request) => request.status === cardStatus).length;
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="requests-page-title">{isReviewInbox ? "Bandeja de Revisión" : "Mis Solicitudes"}</h1>
          <p className="text-muted-foreground">
            {isReviewInbox ? "Abre una solicitud enviada para observar, aprobar o rechazar." : "Consulta y crea solicitudes de pago."}
          </p>
        </div>
        <Button onClick={() => router.push(ROUTES.REQUESTS_NEW)} data-testid="new-request-button">
          <Plus className="h-4 w-4" />
          Nueva solicitud
        </Button>
      </div>

      <div className={cn("grid gap-3 sm:grid-cols-2", isGiofReviewInbox ? "lg:grid-cols-3" : "lg:grid-cols-5")} data-testid="requests-status-summary">
        {isGiofReviewInbox ? REQUEST_REVIEW_QUEUE_CARDS.map((card) => {
          const isActive = activeQueue === card.value;

          return (
            <button
              key={card.value}
              type="button"
              onClick={() => setReviewQueueFilter(card.value)}
              className={cn(
                "rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md",
                isActive ? "border-primary ring-2 ring-primary" : "border-border",
              )}
              data-testid={`requests-review-queue-card-${card.value}`}
              aria-pressed={isActive}
            >
              <p className="text-2xl font-bold text-foreground">{getRequestReviewQueueCount(summaryRequests, card.value)}</p>
              <p className="text-sm font-medium text-foreground">{card.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
            </button>
          );
        }) : REQUEST_STATUS_SUMMARY_CARDS.map((card) => {
          const isActive = status === card.value;

          return (
            <button
              key={card.value}
              type="button"
              onClick={() => setStatusFilter(isActive ? undefined : card.value)}
              className={cn(
                "rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md",
                isActive ? "border-primary ring-2 ring-primary" : "border-border",
              )}
              data-testid={`requests-status-card-${card.value.toLowerCase()}`}
              aria-pressed={isActive}
            >
              <p className="text-2xl font-bold text-foreground">{getStatusCount(card.value)}</p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </button>
          );
        })}
      </div>

      {activeQueueFilter?.unsupportedReason && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground" data-testid="requests-review-queue-note">
          {activeQueueFilter.unsupportedReason}
        </p>
      )}

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Solicitudes registradas</CardTitle>
            <CardDescription>
              {isReviewInbox ? "Abre una solicitud enviada para observar, aprobar o rechazar." : `Total: ${displayedTotal}`}
            </CardDescription>
            {isReviewInbox && <p className="text-sm text-muted-foreground">Total: {displayedTotal}</p>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={isExplicitAllStatuses ? ALL_STATUSES_FILTER : (status ?? ALL_STATUSES_FILTER)}
              onValueChange={(value) => setStatusFilter(value === ALL_STATUSES_FILTER ? undefined : (value as RequestStatus))}
            >
              <SelectTrigger className="sm:w-44" data-testid="requests-status-filter">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES_FILTER}>Ver todo</SelectItem>
                {REQUEST_STATUS_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(value) => setSortOption(value as RequestListSort)}
            >
              <SelectTrigger className="sm:w-52" data-testid="requests-sort-control">
                <SelectValue placeholder="Orden" />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_LIST_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Buscar por código o concepto..."
              className="sm:max-w-xs"
              data-testid="requests-search-input"
            />
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">{error.message}</p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>Reintentar</Button>
            </div>
          ) : (
            <RequestListTable requests={displayedRequests} isLoading={isUnsupportedQueue ? false : isLoading} roleCode={roleCode} currentUserId={user?.id} showResponsible={isReviewInbox} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
