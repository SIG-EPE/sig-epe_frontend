import { useEffect, useState } from "react";
import type { Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { SearchSelectModal } from "@/components/ui/search-select-modal";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLANNING_TYPES } from "@/lib/planning-types";
import { getPlanningLineDisplay } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { useRequestPlanningLineFacets, useRequestPlanningLineSearch } from "@/hooks/use-requests";
import { REQUEST_PLANNING_LINE_SCOPE, type RequestPlanningLineLookupItem } from "@/types/requests";
import type { RequestFormValues } from "./request-form";

const POA_SELECTOR_MODE = {
  DIRECT: "direct",
  HIERARCHY: "hierarchy",
} as const;

const ALL_OPTION_VALUE = "__all__";

type PoaSelectorMode = (typeof POA_SELECTOR_MODE)[keyof typeof POA_SELECTOR_MODE];

interface SelectOption {
  value: string;
  label: string;
}

interface HierarchySelection {
  orgUnitId: string | null;
  planningType: string | null;
  programId: string | null;
  componentId: string | null;
  actionId: string | null;
  categoryId: string | null;
  territoryId: string | null;
}

interface SummaryItem {
  label: string;
  value: string | null | undefined;
}

interface PlanningLineSelectorProps {
  control: Control<RequestFormValues>;
  name?: "budget_planning_line_id" | `allocations.${number}.budget_planning_line_id`;
  selectedLine?: RequestPlanningLineLookupItem | null;
  lines?: RequestPlanningLineLookupItem[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: Error | null;
  onSelectedLineChange: (line: RequestPlanningLineLookupItem | null) => void;
}

function formatCodeName(code: string | null | undefined, name: string | null | undefined): string | null {
  const cleanCode = code?.trim();
  const cleanName = name?.trim();
  if (cleanCode && cleanName) return `${cleanCode} · ${cleanName}`;
  return cleanName ?? cleanCode ?? null;
}

function getLineSummaryItems(line: RequestPlanningLineLookupItem): SummaryItem[] {
  return [
    { label: "Unidad", value: formatCodeName(line.org_unit?.code, line.org_unit?.name) },
    { label: "Componente", value: line.action?.component?.name },
    { label: "Acción", value: line.action?.name },
    { label: "Categoría/Recurso", value: formatCodeName(line.category?.code, line.category?.name) },
  ];
}

function getLineSubLabel(line: RequestPlanningLineLookupItem): string {
  return getLineSummaryItems(line)
    .filter((item) => Boolean(item.value))
    .map((item) => `${item.label}: ${item.value}`)
    .join(" · ");
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function uniqueOptions(items: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function selectValue(value: string | null): string {
  return value ?? ALL_OPTION_VALUE;
}

function fromSelectValue(value: string): string | null {
  return value === ALL_OPTION_VALUE ? null : value;
}

export function PlanningLineSelector({ control, name = "budget_planning_line_id", selectedLine, lines: seedLines = [], isLoading: legacyLoading = false, isRefreshing: legacyRefreshing = false, error: legacyError = null, onSelectedLineChange }: PlanningLineSelectorProps) {
  const [mode, setMode] = useState<PoaSelectorMode>(POA_SELECTOR_MODE.DIRECT);
  const [directOpen, setDirectOpen] = useState(false);
  const [directOrgUnitOpen, setDirectOrgUnitOpen] = useState(false);
  const [directOrgUnitId, setDirectOrgUnitId] = useState<string | null>(null);
  const [directSearch, setDirectSearch] = useState("");
  const [hierarchy, setHierarchy] = useState<HierarchySelection>({
    orgUnitId: null,
    planningType: null,
    programId: null,
    componentId: null,
    actionId: null,
    categoryId: null,
    territoryId: null,
  });

  useEffect(() => {
    if (!selectedLine) return;
    setHierarchy({
      orgUnitId: selectedLine.org_unit?.id ?? null,
      planningType: selectedLine.planning_type ?? null,
      programId: selectedLine.program?.id ?? null,
      componentId: selectedLine.action?.component?.id ?? null,
      actionId: selectedLine.action?.id ?? null,
      categoryId: selectedLine.category?.id ?? null,
      territoryId: selectedLine.territory?.id ?? null,
    });
  }, [selectedLine]);

  const trimmedDirectSearch = directSearch.trim();
  const directHasIntent = directOpen && (trimmedDirectSearch.length === 0 || trimmedDirectSearch.length >= 2);
  const canShowLineResults = Boolean(hierarchy.categoryId);
  const hierarchyFilters = {
    scope: REQUEST_PLANNING_LINE_SCOPE.HIERARCHY,
    org_unit_id: hierarchy.orgUnitId ?? undefined,
    planning_type: hierarchy.planningType ?? undefined,
    program_id: hierarchy.programId ?? undefined,
    component_id: hierarchy.componentId ?? undefined,
    operative_action_id: hierarchy.actionId ?? undefined,
    category_id: hierarchy.categoryId ?? undefined,
    territory_id: hierarchy.territoryId ?? undefined,
  };
  const searchResults = useRequestPlanningLineSearch(
    mode === POA_SELECTOR_MODE.DIRECT
      ? {
          scope: REQUEST_PLANNING_LINE_SCOPE.DIRECT,
          org_unit_id: directOrgUnitId ?? undefined,
          search: trimmedDirectSearch || undefined,
          limit: 25,
        }
      : { ...hierarchyFilters, limit: 25 },
    mode === POA_SELECTOR_MODE.DIRECT ? directHasIntent : canShowLineResults,
  );
  const facets = useRequestPlanningLineFacets(
    mode === POA_SELECTOR_MODE.HIERARCHY
      ? hierarchyFilters
      : { scope: REQUEST_PLANNING_LINE_SCOPE.DIRECT },
    mode === POA_SELECTOR_MODE.HIERARCHY || directOrgUnitOpen,
  );
  const lines = (() => {
    const byId = new Map(seedLines.map((line) => [line.id, line]));
    searchResults.items.forEach((line) => byId.set(line.id, line));
    if (selectedLine) byId.set(selectedLine.id, selectedLine);
    return [...byId.values()];
  })();

  const canSelectPlanningType = Boolean(hierarchy.orgUnitId);
  const canSelectProgram = canSelectPlanningType && Boolean(hierarchy.planningType);
  const canSelectComponent = canSelectProgram && Boolean(hierarchy.programId);
  const canSelectAction = canSelectComponent && Boolean(hierarchy.componentId);
  const canSelectCategory = canSelectAction && Boolean(hierarchy.actionId);
  const canSelectTerritory = canSelectCategory && Boolean(hierarchy.categoryId);
  const hierarchyLines = canShowLineResults ? searchResults.items : [];
  const orgUnitOptions = uniqueOptions((facets.data?.org_units ?? []).map((option) => ({ value: option.id, label: option.code ? `${option.code} · ${option.name}` : option.name })));
  const planningTypeOptions = uniqueOptions((facets.data?.planning_types ?? PLANNING_TYPES).map((value) => ({ value, label: value })));
  const programOptions = uniqueOptions((facets.data?.programs ?? []).map((option) => ({ value: option.id, label: option.code ? `${option.code} · ${option.name}` : option.name })));
  const componentOptions = uniqueOptions((facets.data?.components ?? []).map((option) => ({ value: option.id, label: option.name })));
  const actionOptions = uniqueOptions((facets.data?.operative_actions ?? []).map((option) => ({ value: option.id, label: option.name })));
  const categoryOptions = uniqueOptions((facets.data?.categories ?? []).map((option) => ({ value: option.id, label: option.name })));
  const territoryOptions = uniqueOptions((facets.data?.territories ?? []).map((option) => ({ value: option.id, label: option.name })));
  const isLoading = legacyLoading || searchResults.isLoading;
  const isRefreshing = legacyRefreshing || searchResults.isRefreshing;
  const error = legacyError ?? searchResults.error;

  function clearSelectedLine(onChange: (value: string) => void): void {
    onChange("");
    onSelectedLineChange(null);
  }

  function handleHierarchyChange(next: Partial<HierarchySelection>, onChange: (value: string) => void): void {
    setHierarchy((current) => ({ ...current, ...next }));
    clearSelectedLine(onChange);
  }

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="rounded-lg border bg-card p-4 shadow-xs">
          <FormControl>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <FormLabel>Línea POA *</FormLabel>
                  <p className="text-xs text-muted-foreground">Elige una línea aprobada por búsqueda directa o por jerarquía POA.</p>
                </div>
                <div className="inline-flex w-fit rounded-lg border bg-background p-1 shadow-xs" role="tablist" aria-label="Modo de búsqueda de línea POA">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground",
                      mode === POA_SELECTOR_MODE.DIRECT && "bg-muted text-foreground shadow-xs",
                    )}
                    role="tab"
                    aria-selected={mode === POA_SELECTOR_MODE.DIRECT}
                    onClick={() => setMode(POA_SELECTOR_MODE.DIRECT)}
                  >
                    Búsqueda directa
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground",
                      mode === POA_SELECTOR_MODE.HIERARCHY && "bg-muted text-foreground shadow-xs",
                    )}
                    role="tab"
                    aria-selected={mode === POA_SELECTOR_MODE.HIERARCHY}
                    onClick={() => setMode(POA_SELECTOR_MODE.HIERARCHY)}
                  >
                    Jerarquía
                  </Button>
                </div>
              </div>

              {mode === POA_SELECTOR_MODE.DIRECT ? (
                <div className="space-y-3">
                  <SearchSelectModal
                    value={directOrgUnitId}
                    placeholder="Todas las unidades organizacionales"
                    displayValue={orgUnitOptions.find((option) => option.value === directOrgUnitId)?.label}
                    title="Filtrar por unidad organizacional"
                    items={orgUnitOptions}
                    getItemId={(option) => option.value}
                    getItemLabel={(option) => option.label}
                    testId="request-planning-line-org-unit-trigger"
                    onChange={setDirectOrgUnitId}
                    onClear
                    isLoading={facets.isLoading}
                    error={facets.error}
                    onOpenChange={setDirectOrgUnitOpen}
                  />
                  <SearchSelectModal
                    value={field.value || null}
                    placeholder={isLoading ? "Cargando líneas..." : "Seleccionar línea POA"}
                    displayValue={selectedLine ? getPlanningLineDisplay(selectedLine) : undefined}
                    title="Seleccionar línea POA aprobada"
                    items={lines}
                    getItemId={(line) => line.id}
                    getItemLabel={(line) => getPlanningLineDisplay(line)}
                    getItemSubLabel={getLineSubLabel}
                    searchPlaceholder="Buscar por código, descripción, jerarquía o unidad..."
                    testId="request-planning-line-trigger"
                    onChange={(id) => {
                      field.onChange(id ?? "");
                      onSelectedLineChange(lines.find((line) => line.id === id) ?? null);
                    }}
                    disabled={isLoading}
                    hasError={Boolean(error)}
                    remoteSearch
                    isLoading={isLoading}
                    isRefreshing={isRefreshing}
                    error={error}
                    hasMore={searchResults.hasMore}
                    emptyMessage={trimmedDirectSearch.length === 1 ? "Escribe al menos 2 caracteres para buscar." : undefined}
                    onOpenChange={setDirectOpen}
                    onQueryChange={setDirectSearch}
                    onRetry={searchResults.retry}
                    onLoadMore={searchResults.loadMore}
                  />
                  {isRefreshing && <p className="text-xs text-muted-foreground">Actualizando líneas POA en segundo plano...</p>}
                </div>
              ) : (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <HierarchySelect label="Unidad organizacional" value={hierarchy.orgUnitId} options={orgUnitOptions} placeholder="Selecciona la unidad" onValueChange={(value) => handleHierarchyChange({ orgUnitId: value, planningType: null, programId: null, componentId: null, actionId: null, categoryId: null, territoryId: null }, field.onChange)} />
                    <HierarchySelect label="Tipo de planificación" value={hierarchy.planningType} options={planningTypeOptions} placeholder="Selecciona el tipo" disabled={!canSelectPlanningType} onValueChange={(value) => handleHierarchyChange({ planningType: value, programId: null, componentId: null, actionId: null, categoryId: null, territoryId: null }, field.onChange)} />
                    <HierarchySelect label="Programa / proyecto / gestión" value={hierarchy.programId} options={programOptions} placeholder="Selecciona programa/proyecto/gestión" disabled={!canSelectProgram} onValueChange={(value) => handleHierarchyChange({ programId: value, componentId: null, actionId: null, categoryId: null, territoryId: null }, field.onChange)} />
                    <HierarchySelect label="Componente" value={hierarchy.componentId} options={componentOptions} placeholder="Selecciona componente" disabled={!canSelectComponent} onValueChange={(value) => handleHierarchyChange({ componentId: value, actionId: null, categoryId: null, territoryId: null }, field.onChange)} />
                    <HierarchySelect label="Acción operativa" value={hierarchy.actionId} options={actionOptions} placeholder="Selecciona acción operativa" disabled={!canSelectAction} onValueChange={(value) => handleHierarchyChange({ actionId: value, categoryId: null, territoryId: null }, field.onChange)} />
                    <HierarchySelect label="Categoría / recurso" value={hierarchy.categoryId} options={categoryOptions} placeholder="Selecciona categoría/recurso" disabled={!canSelectCategory} onValueChange={(value) => handleHierarchyChange({ categoryId: value, territoryId: null }, field.onChange)} />
                    <HierarchySelect label="Región / territorio (opcional)" value={hierarchy.territoryId} options={territoryOptions} placeholder="Todos los territorios" disabled={!canSelectTerritory || territoryOptions.length === 0} onValueChange={(value) => handleHierarchyChange({ territoryId: value }, field.onChange)} />
                  </div>

                  {facets.isLoading && <p className="text-xs text-muted-foreground" role="status">Cargando filtros de jerarquía...</p>}
                  {facets.error && <p className="text-xs text-destructive" role="alert">{facets.error.message}</p>}

                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    {!canShowLineResults ? (
                      <p className="px-3 py-4 text-center text-sm text-muted-foreground">Completa la jerarquía hasta categoría/recurso para ver las líneas POA disponibles.</p>
                    ) : hierarchyLines.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-muted-foreground">{searchResults.isLoading ? "Cargando líneas POA..." : "No hay líneas aprobadas para la jerarquía seleccionada."}</p>
                    ) : (
                      hierarchyLines.map((line) => {
                        const isSelected = field.value === line.id;
                        return (
                          <button
                            key={line.id}
                            type="button"
                            className={cn(
                              "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                              isSelected && "bg-muted font-medium",
                            )}
                            aria-pressed={isSelected}
                            onClick={() => {
                              field.onChange(line.id);
                              onSelectedLineChange(line);
                            }}
                          >
                            <span className="block truncate">{getPlanningLineDisplay(line)}</span>
                            <span className="block truncate text-xs text-muted-foreground">{getLineSubLabel(line)}</span>
                          </button>
                        );
                      })
                    )}
                    {searchResults.hasMore && (
                      <Button type="button" variant="ghost" className="w-full border-t" onClick={searchResults.loadMore} disabled={searchResults.isLoading}>
                        Cargar más
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </FormControl>
          {selectedLine && (
            <FormDescription className="space-y-3 rounded-md border bg-muted/40 p-3">
              <span className="block font-medium text-foreground">{getPlanningLineDisplay(selectedLine)}</span>
              <span className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                {getLineSummaryItems(selectedLine)
                  .filter((item) => Boolean(item.value))
                  .map((item) => (
                    <span key={item.label} className="rounded-md bg-background/70 px-2 py-1">
                      <span className="block font-medium text-foreground">{item.label}</span>
                      <span>{item.value}</span>
                    </span>
                  ))}
              </span>
            </FormDescription>
          )}
          {error && <p className="text-xs text-destructive">{error.message}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface HierarchySelectProps {
  label: string;
  value: string | null;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  onValueChange: (value: string | null) => void;
}

function HierarchySelect({ label, value, options, placeholder, disabled = false, onValueChange }: HierarchySelectProps) {
  const query = normalizeText(value ?? "");
  const selected = options.find((option) => normalizeText(option.value) === query);

  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Select value={selectValue(selected?.value ?? value)} onValueChange={(next) => onValueChange(fromSelectValue(next))} disabled={disabled}>
        <SelectTrigger disabled={disabled}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION_VALUE}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
