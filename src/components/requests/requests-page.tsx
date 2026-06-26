"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CACHED_RESOURCE_CACHE_MODE } from "@/hooks/use-cached-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRequests } from "@/hooks/use-requests";
import { ApiRequestError } from "@/lib/api-client";
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
import { DRIVE_SYNC_STATUS, REQUEST_LIST_DATE_FIELD, REQUEST_STATUS, REQUEST_TYPE, type DriveSyncStatus, type RequestListDateField, type RequestStatus, type RequestType } from "@/types/requests";
import { RequestListTable } from "./request-list-table";

const ALL_STATUSES_FILTER = "ALL";
const REQUEST_SEARCH_DEBOUNCE_MS = 500;
const REQUEST_SEARCH_MIN_LENGTH = 2;
const REQUESTS_RATE_LIMIT_MESSAGE = "Hay muchas búsquedas seguidas. Espera unos segundos e inténtalo nuevamente.";
const REQUEST_HISTORY_DATE_MODE = {
  EXACT: "exact",
  RANGE: "range",
} as const;

const REQUEST_SCOPE = {
  MINE: "mine",
  REVIEW: "review",
  HISTORY: "history",
} as const;

type RequestHistoryDateMode = (typeof REQUEST_HISTORY_DATE_MODE)[keyof typeof REQUEST_HISTORY_DATE_MODE];
type RequestScope = (typeof REQUEST_SCOPE)[keyof typeof REQUEST_SCOPE];

function getServerSearchValue(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue.length >= REQUEST_SEARCH_MIN_LENGTH ? trimmedValue : undefined;
}

function getRequestsListErrorMessage(error: Error): string {
  if (error instanceof ApiRequestError && error.status === 429) return REQUESTS_RATE_LIMIT_MESSAGE;
  if (/throttlerexception|too many requests/i.test(error.message)) return REQUESTS_RATE_LIMIT_MESSAGE;
  return error.message;
}

export function RequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStatusParam = searchParams.get("status");
  const searchParamsSignature = searchParams.toString();
  const queryStatus = parseRequestStatusFilter(rawStatusParam);
  const queryQueue = parseRequestReviewQueue(searchParams.get("queue"));
  const isExplicitAllStatuses = rawStatusParam === ALL_STATUSES_FILTER;
  const querySearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(querySearch);
  const debouncedSearch = useDebouncedValue(search.trim(), REQUEST_SEARCH_DEBOUNCE_MS);
  const serverSearch = searchParams.has("search") ? getServerSearchValue(debouncedSearch) : undefined;
  const [status, setStatus] = useState<RequestStatus | undefined>(queryStatus);
  const [activeQueue, setActiveQueue] = useState<RequestReviewQueue | undefined>(queryQueue ?? getRequestReviewQueueForStatus(queryStatus));
  const [sort, setSort] = useState<RequestListSort>(parseRequestListSort(searchParams.get("sort")));
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") ?? "");
  const [dateMode, setDateMode] = useState<RequestHistoryDateMode>(() => {
    const initialDateFrom = searchParams.get("date_from") ?? "";
    const initialDateTo = searchParams.get("date_to") ?? "";
    return initialDateFrom && initialDateFrom === initialDateTo ? REQUEST_HISTORY_DATE_MODE.EXACT : REQUEST_HISTORY_DATE_MODE.RANGE;
  });
  const [dateField, setDateField] = useState<RequestListDateField>((searchParams.get("date_field") as RequestListDateField | null) ?? REQUEST_LIST_DATE_FIELD.UPDATED_AT);
  const [requestType, setRequestType] = useState<RequestType | undefined>((searchParams.get("request_type") as RequestType | null) ?? undefined);
  const [requesterId, setRequesterId] = useState(searchParams.get("requester_id") ?? "");
  const [orgUnitId, setOrgUnitId] = useState(searchParams.get("org_unit_id") ?? "");
  const [planningLineId, setPlanningLineId] = useState(searchParams.get("budget_planning_line_id") ?? "");
  const [hasDocuments, setHasDocuments] = useState<string>(searchParams.get("has_documents") ?? "ALL");
  const [driveSyncStatus, setDriveSyncStatus] = useState<DriveSyncStatus | undefined>((searchParams.get("drive_sync_status") as DriveSyncStatus | null) ?? undefined);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => Boolean(
    searchParams.get("requester_id")
      || searchParams.get("org_unit_id")
      || searchParams.get("budget_planning_line_id")
      || searchParams.get("has_documents")
      || searchParams.get("drive_sync_status"),
    ));

  useEffect(() => {
    const nextStatus = parseRequestStatusFilter(searchParams.get("status"));
    const nextQueue = parseRequestReviewQueue(searchParams.get("queue")) ?? getRequestReviewQueueForStatus(nextStatus);
    const nextDateFrom = searchParams.get("date_from") ?? "";
    const nextDateTo = searchParams.get("date_to") ?? "";

    setSearch(searchParams.get("search") ?? "");
    setStatus(nextStatus);
    setActiveQueue(nextQueue);
    setSort(parseRequestListSort(searchParams.get("sort")));
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
    setDateMode(nextDateFrom && nextDateFrom === nextDateTo ? REQUEST_HISTORY_DATE_MODE.EXACT : REQUEST_HISTORY_DATE_MODE.RANGE);
    setDateField((searchParams.get("date_field") as RequestListDateField | null) ?? REQUEST_LIST_DATE_FIELD.UPDATED_AT);
    setRequestType((searchParams.get("request_type") as RequestType | null) ?? undefined);
    setRequesterId(searchParams.get("requester_id") ?? "");
    setOrgUnitId(searchParams.get("org_unit_id") ?? "");
    setPlanningLineId(searchParams.get("budget_planning_line_id") ?? "");
    setHasDocuments(searchParams.get("has_documents") ?? "ALL");
    setDriveSyncStatus((searchParams.get("drive_sync_status") as DriveSyncStatus | null) ?? undefined);
    setShowAdvancedFilters(Boolean(
      searchParams.get("requester_id")
        || searchParams.get("org_unit_id")
        || searchParams.get("budget_planning_line_id")
        || searchParams.get("has_documents")
        || searchParams.get("drive_sync_status"),
    ));
  }, [searchParamsSignature]);
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const limit = Number(searchParams.get("limit") ?? "20") || 20;
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const isRolePending = roleCode === undefined;
  const canUseHistory = roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.ADMIN_SISTEMA || roleCode === ROLE_CODE.AUDITOR_DIRECCION;
  const rawScope = searchParams.get("scope");
  const requestScope: RequestScope = rawScope === REQUEST_SCOPE.HISTORY && (canUseHistory || isRolePending)
    ? REQUEST_SCOPE.HISTORY
    : rawScope === REQUEST_SCOPE.REVIEW && (isRequestReviewRole(roleCode) || isRolePending)
      ? REQUEST_SCOPE.REVIEW
      : REQUEST_SCOPE.MINE;
  const isReviewInbox = requestScope === "review";
  const isHistory = requestScope === "history";
  const isGiofReviewInbox = isReviewInbox && roleCode === ROLE_CODE.GIOF_GESTOR;
  const activeQueueFilter = activeQueue ? getRequestReviewQueueFilter(activeQueue) : undefined;
  const isUnsupportedQueue = Boolean(activeQueueFilter?.unsupportedReason);
  const defaultReviewStatuses = isReviewInbox && !status && !activeQueue && !isExplicitAllStatuses
    ? [...ACTIVE_REVIEW_STATUSES]
    : undefined;
  const { requests, total, isLoading, isRefreshing, error, refetch } = useRequests({
    page,
    limit,
    search: serverSearch,
    status: isUnsupportedQueue ? undefined : status,
    statuses: isUnsupportedQueue ? undefined : defaultReviewStatuses,
    scope: requestScope,
    date_from: isHistory ? dateFrom || undefined : undefined,
    date_to: isHistory ? dateTo || undefined : undefined,
    date_field: isHistory ? dateField : undefined,
    request_type: isHistory ? requestType : undefined,
    requester_id: isHistory ? requesterId.trim() || undefined : undefined,
    org_unit_id: isHistory ? orgUnitId.trim() || undefined : undefined,
    budget_planning_line_id: isHistory ? planningLineId.trim() || undefined : undefined,
    has_documents: isHistory && hasDocuments !== "ALL" ? hasDocuments === "true" : undefined,
    drive_sync_status: isHistory ? driveSyncStatus : undefined,
  }, {
    keepPreviousData: false,
    cacheMode: CACHED_RESOURCE_CACHE_MODE.NO_STORE,
  });
  const { requests: summaryRequests } = useRequests({
    page: 1,
    limit: 100,
    search: serverSearch,
    scope: requestScope,
  }, {
    keepPreviousData: false,
    cacheMode: CACHED_RESOURCE_CACHE_MODE.NO_STORE,
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

  function setScopeFilter(scope: RequestScope) {
    setActiveQueue(undefined);
    setStatus(undefined);
    replaceQuery({ scope, status: undefined, queue: undefined, page: 1 });
  }

  function setAdvancedFilter(key: string, value: string | undefined) {
    replaceQuery({ [key]: value, page: 1 });
  }

  function setHistoryExactDateFilter(value: string) {
    setDateFrom(value);
    setDateTo(value);
    replaceQuery({ date_from: value || undefined, date_to: value || undefined, page: 1 });
  }

  function setHistoryDateMode(nextMode: RequestHistoryDateMode) {
    setDateMode(nextMode);
    if (nextMode === REQUEST_HISTORY_DATE_MODE.EXACT) {
      const exactDate = dateFrom || dateTo;
      setDateFrom(exactDate);
      setDateTo(exactDate);
      replaceQuery({ date_from: exactDate || undefined, date_to: exactDate || undefined, page: 1 });
    }
  }

  function clearHistoryFilters() {
    setSearch("");
    setStatus(undefined);
    setActiveQueue(undefined);
    setDateFrom("");
    setDateTo("");
    setDateMode(REQUEST_HISTORY_DATE_MODE.RANGE);
    setDateField(REQUEST_LIST_DATE_FIELD.UPDATED_AT);
    setRequestType(undefined);
    setRequesterId("");
    setOrgUnitId("");
    setPlanningLineId("");
    setHasDocuments("ALL");
    setDriveSyncStatus(undefined);
    replaceQuery({
      search: undefined,
      status: undefined,
      queue: undefined,
      date_from: undefined,
      date_to: undefined,
      date_field: undefined,
      request_type: undefined,
      requester_id: undefined,
      org_unit_id: undefined,
      budget_planning_line_id: undefined,
      has_documents: undefined,
      drive_sync_status: undefined,
      page: 1,
    });
  }

  const activeHistoryFiltersCount = [
    serverSearch,
    status,
    dateFrom || dateTo,
    dateField !== REQUEST_LIST_DATE_FIELD.UPDATED_AT ? dateField : undefined,
    requestType,
    requesterId.trim(),
    orgUnitId.trim(),
    planningLineId.trim(),
    hasDocuments !== "ALL" ? hasDocuments : undefined,
    driveSyncStatus,
  ].filter(Boolean).length;

  function getStatusCount(cardStatus: RequestStatus) {
    return summaryRequests.filter((request) => request.status === cardStatus).length;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="requests-page-title">{isHistory ? "Historial de Solicitudes" : isReviewInbox ? "Bandeja de Revisión" : "Mis Solicitudes"}</h1>
          <p className="text-muted-foreground">
            {isHistory ? "Consulta solicitudes históricas con filtros avanzados." : isReviewInbox ? "Abre una solicitud enviada para observar, aprobar o rechazar." : "Consulta y crea solicitudes de pago."}
          </p>
        </div>
        <Button onClick={() => router.push(ROUTES.REQUESTS_NEW)} data-testid="new-request-button">
          <Plus className="h-4 w-4" />
          Nueva solicitud
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="requests-scope-tabs">
        <Button variant={requestScope === "mine" ? "default" : "outline"} onClick={() => setScopeFilter("mine")}>Mis solicitudes</Button>
        {isRequestReviewRole(roleCode) && <Button variant={requestScope === "review" ? "default" : "outline"} onClick={() => setScopeFilter("review")}>Bandeja</Button>}
        {canUseHistory && <Button variant={requestScope === "history" ? "default" : "outline"} onClick={() => setScopeFilter("history")}>Historial</Button>}
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
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Solicitudes registradas</CardTitle>
              <CardDescription>
                {isHistory ? "Filtra por fechas, responsable, documentos y Drive." : isReviewInbox ? "Abre una solicitud enviada para observar, aprobar o rechazar." : `Total: ${displayedTotal}`}
              </CardDescription>
              {isReviewInbox && <p className="text-sm text-muted-foreground">Total: {displayedTotal}</p>}
            </div>
            <div className="flex w-full flex-col gap-2 lg:max-w-3xl">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearchFilter(event.target.value)}
                  placeholder="Buscar por código, concepto, beneficiario o línea POA..."
                  className="h-11 pl-9"
                  data-testid="requests-search-input"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
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
                {isHistory && activeHistoryFiltersCount > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearHistoryFilters} data-testid="requests-clear-history-filters">
                    <X className="h-4 w-4" />
                    Limpiar ({activeHistoryFiltersCount})
                  </Button>
                )}
              </div>
            </div>
          </div>

          {isHistory && (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4" data-testid="requests-history-filters">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="space-y-2 lg:w-52">
                  <label className="text-sm font-medium" htmlFor="history-date-mode">Tipo de filtro de fecha</label>
                  <Select value={dateMode} onValueChange={(value) => setHistoryDateMode(value as RequestHistoryDateMode)}>
                    <SelectTrigger id="history-date-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REQUEST_HISTORY_DATE_MODE.EXACT}>Fecha exacta</SelectItem>
                      <SelectItem value={REQUEST_HISTORY_DATE_MODE.RANGE}>Rango de fechas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dateMode === REQUEST_HISTORY_DATE_MODE.EXACT ? (
                  <div className="space-y-2 lg:w-48">
                    <label className="text-sm font-medium" htmlFor="history-exact-date">Fecha</label>
                    <Input id="history-exact-date" type="date" value={dateFrom} onChange={(event) => setHistoryExactDateFilter(event.target.value)} aria-label="Fecha exacta" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 lg:w-48">
                      <label className="text-sm font-medium" htmlFor="history-date-from">Desde</label>
                      <Input id="history-date-from" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setAdvancedFilter("date_from", event.target.value || undefined); }} aria-label="Fecha desde" />
                    </div>
                    <div className="space-y-2 lg:w-48">
                      <label className="text-sm font-medium" htmlFor="history-date-to">Hasta</label>
                      <Input id="history-date-to" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setAdvancedFilter("date_to", event.target.value || undefined); }} aria-label="Fecha hasta" />
                    </div>
                  </>
                )}
                <div className="space-y-2 lg:w-60">
                  <label className="text-sm font-medium" htmlFor="history-date-field">Campo de fecha</label>
                  <Select value={dateField} onValueChange={(value) => { setDateField(value as RequestListDateField); setAdvancedFilter("date_field", value); }}>
                    <SelectTrigger id="history-date-field"><SelectValue placeholder="Campo fecha" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REQUEST_LIST_DATE_FIELD.UPDATED_AT}>Última actualización</SelectItem>
                      <SelectItem value={REQUEST_LIST_DATE_FIELD.CREATED_AT}>Creación</SelectItem>
                      <SelectItem value={REQUEST_LIST_DATE_FIELD.SUBMITTED_AT}>Envío</SelectItem>
                      <SelectItem value={REQUEST_LIST_DATE_FIELD.APPROVED_AT}>Aprobación</SelectItem>
                      <SelectItem value={REQUEST_LIST_DATE_FIELD.PAID_AT}>Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 lg:w-56">
                  <label className="text-sm font-medium" htmlFor="history-request-type">Tipo</label>
                  <Select value={requestType ?? "ALL"} onValueChange={(value) => { const next = value === "ALL" ? undefined : value as RequestType; setRequestType(next); setAdvancedFilter("request_type", next); }}>
                    <SelectTrigger id="history-request-type"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos los tipos</SelectItem>
                      <SelectItem value={REQUEST_TYPE.ADVANCE}>Anticipo</SelectItem>
                      <SelectItem value={REQUEST_TYPE.REIMBURSEMENT}>Reembolso</SelectItem>
                      <SelectItem value={REQUEST_TYPE.SUPPLIER_PAYMENT}>Pago a proveedor</SelectItem>
                      <SelectItem value={REQUEST_TYPE.ADVANCE_SETTLEMENT}>Rendición</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Fecha exacta envía el mismo día como inicio y fin; el backend usa fin inclusivo del día completo.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {activeHistoryFiltersCount > 0 && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{activeHistoryFiltersCount} filtros activos</span>}
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAdvancedFilters((value) => !value)}>
                  {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Filtros técnicos opcionales
                </Button>
              </div>
              {showAdvancedFilters && (
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="history-requester-id">Solicitante (UUID)</label>
                    <Input id="history-requester-id" value={requesterId} onChange={(event) => { setRequesterId(event.target.value); setAdvancedFilter("requester_id", event.target.value.trim() || undefined); }} placeholder="Pegar UUID" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="history-org-unit-id">Unidad organizacional (UUID)</label>
                    <Input id="history-org-unit-id" value={orgUnitId} onChange={(event) => { setOrgUnitId(event.target.value); setAdvancedFilter("org_unit_id", event.target.value.trim() || undefined); }} placeholder="Pegar UUID" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="history-planning-line-id">Línea POA (UUID)</label>
                    <Input id="history-planning-line-id" value={planningLineId} onChange={(event) => { setPlanningLineId(event.target.value); setAdvancedFilter("budget_planning_line_id", event.target.value.trim() || undefined); }} placeholder="Pegar UUID" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="history-has-documents">Documentos</label>
                    <Select value={hasDocuments} onValueChange={(value) => { setHasDocuments(value); setAdvancedFilter("has_documents", value === "ALL" ? undefined : value); }}>
                      <SelectTrigger id="history-has-documents"><SelectValue placeholder="Documentos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Con o sin documentos</SelectItem>
                        <SelectItem value="true">Con documentos</SelectItem>
                        <SelectItem value="false">Sin documentos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="history-drive-status">Estado Drive</label>
                    <Select value={driveSyncStatus ?? "ALL"} onValueChange={(value) => { const next = value === "ALL" ? undefined : value as DriveSyncStatus; setDriveSyncStatus(next); setAdvancedFilter("drive_sync_status", next); }}>
                      <SelectTrigger id="history-drive-status"><SelectValue placeholder="Estado Drive" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos Drive</SelectItem>
                        {Object.values(DRIVE_SYNC_STATUS).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isRefreshing && !error && (
            <p className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
              Actualizando solicitudes...
            </p>
          )}
          {error ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">{getRequestsListErrorMessage(error)}</p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>Reintentar</Button>
            </div>
          ) : (
            <RequestListTable requests={displayedRequests} isLoading={isUnsupportedQueue ? false : isLoading} roleCode={roleCode} currentUserId={user?.id} showResponsible={isReviewInbox || isHistory} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
