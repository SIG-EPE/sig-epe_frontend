"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequests } from "@/hooks/use-requests";
import { ROLE_CODE, ROUTES } from "@/lib/constants";
import {
  REQUEST_LIST_SORT,
  REQUEST_LIST_SORT_OPTIONS,
  REQUEST_STATUS_FILTER_OPTIONS,
  REQUEST_STATUS_SUMMARY_CARDS,
  isRequestReviewRole,
  sortRequestsForList,
  type RequestListSort,
} from "@/lib/requests";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_STATUS, type RequestStatus } from "@/types/requests";
import { RequestListTable } from "./request-list-table";

const ALL_STATUSES_FILTER = "ALL";

export function RequestsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<RequestStatus | undefined>(undefined);
  const [statusTouched, setStatusTouched] = useState(false);
  const [sort, setSort] = useState<RequestListSort>(REQUEST_LIST_SORT.NEWEST_FIRST);
  const [sortTouched, setSortTouched] = useState(false);
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const isReviewInbox = isRequestReviewRole(roleCode);
  const isGiofReviewInbox = roleCode === ROLE_CODE.GIOF_GESTOR;
  const { requests, total, isLoading, error, refetch } = useRequests({
    page: 1,
    limit: 20,
    search: debouncedSearch || undefined,
    status,
  });
  const { requests: summaryRequests } = useRequests({
    page: 1,
    limit: 100,
    search: debouncedSearch || undefined,
  });
  const sortedRequests = sortRequestsForList(requests, sort);

  function setStatusFilter(value: RequestStatus | undefined) {
    setStatusTouched(true);
    setStatus(value);
  }

  function setSortOption(value: RequestListSort) {
    setSortTouched(true);
    setSort(value);
  }

  function getStatusCount(cardStatus: RequestStatus) {
    return summaryRequests.filter((request) => request.status === cardStatus).length;
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (!statusTouched && isGiofReviewInbox) {
      setStatus(REQUEST_STATUS.SUBMITTED);
    }
  }, [isGiofReviewInbox, statusTouched]);

  useEffect(() => {
    if (!sortTouched) {
      setSort(isGiofReviewInbox ? REQUEST_LIST_SORT.REVIEW_PRIORITY : REQUEST_LIST_SORT.NEWEST_FIRST);
    }
  }, [isGiofReviewInbox, sortTouched]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="requests-page-title">{isReviewInbox ? "Bandeja de revisión" : "Mis Solicitudes"}</h1>
          <p className="text-muted-foreground">
            {isReviewInbox ? "Abre una solicitud enviada para observar, aprobar o rechazar." : "Consulta y crea solicitudes de pago."}
          </p>
        </div>
        {!isReviewInbox && (
          <Button onClick={() => router.push(ROUTES.REQUESTS_NEW)} data-testid="new-request-button">
            <Plus className="h-4 w-4" />
            Nueva solicitud
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="requests-status-summary">
        {REQUEST_STATUS_SUMMARY_CARDS.map((card) => {
          const isActive = status === card.value;

          return (
            <button
              key={card.value}
              type="button"
              onClick={() => setStatusFilter(isActive ? undefined : card.value)}
              className={cn(
                "rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md",
                isActive ? "border-primary ring-2 ring-primary" : "border-border",
                card.value === REQUEST_STATUS.SUBMITTED && isGiofReviewInbox && "bg-primary/5",
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

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Solicitudes registradas</CardTitle>
            <CardDescription>
              {isReviewInbox ? "Abre una solicitud enviada para observar, aprobar o rechazar." : `Total: ${total}`}
            </CardDescription>
            {isReviewInbox && <p className="text-sm text-muted-foreground">Total: {total}</p>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={status ?? ALL_STATUSES_FILTER}
              onValueChange={(value) => setStatusFilter(value === ALL_STATUSES_FILTER ? undefined : (value as RequestStatus))}
            >
              <SelectTrigger className="sm:w-44" data-testid="requests-status-filter">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES_FILTER}>Todos los estados</SelectItem>
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
              onChange={(event) => setSearch(event.target.value)}
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
            <RequestListTable requests={sortedRequests} isLoading={isLoading} roleCode={roleCode} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
