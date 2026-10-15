"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { invalidateQueryTag } from "@/lib/query-cache";
import {
  useCatalogOrganizationalUnits,
  useCatalogBudgetPrograms,
  useStrategicComponents,
  useOperativeActions,
  usePoaHierarchyCapability,
} from "@/hooks/use-catalogs";
import { PLANNING_TYPES, PLANNING_TYPE_LABELS } from "@/lib/planning-types";
import {
  buildPlanningHierarchy,
  hierarchyEditError,
  seedPlanningHierarchy,
} from "@/lib/planning-hierarchy-edit";
import { SearchSelectModal } from "@/components/ui/search-select-modal";
import { ComboboxCreate } from "@/components/ui/combobox-create";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PlanningLine, PlanningLineHierarchyInput } from "@/types/budget";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_CODE } from "@/lib/constants";
import {
  CatalogNameDialog,
  type CatalogNameTarget,
} from "./catalog-name-dialog";

interface Props {
  line: PlanningLine;
  onSaved: () => void | Promise<void>;
  approvedSave?: (
    hierarchy: PlanningLineHierarchyInput,
    labels: HierarchyReviewLabels,
  ) => Promise<void>;
  disabled?: boolean;
  onCatalogRenamed?: () => void | Promise<void>;
  draft?: PlanningLineHierarchyInput;
  onDraftChange?: (value: PlanningLineHierarchyInput) => void;
  onValidationChange?: (valid: boolean, labels: HierarchyReviewLabels) => void;
  onNameRenamed?: (level: string, id: string, name: string) => void;
}

export interface HierarchyReviewLabels {
  unit: string | undefined;
  type: string | undefined;
  program: string | undefined;
  component: string | undefined;
  action: string | undefined;
  resource: string | undefined;
}

export function PlanningHierarchyEditor({
  line,
  onSaved,
  approvedSave,
  disabled = false,
  onCatalogRenamed,
  draft,
  onDraftChange,
  onValidationChange,
  onNameRenamed,
}: Props) {
  const [localValue, setLocalValue] = useState(() => seedPlanningHierarchy(line));
  const value = draft ?? localValue;
  const setValue = (next: PlanningLineHierarchyInput | ((previous: PlanningLineHierarchyInput) => PlanningLineHierarchyInput)) => {
    const updated = typeof next === "function" ? next(value) : next;
    if (draft) onDraftChange?.(updated);
    else setLocalValue(updated);
  };
  const [errors, setErrors] = useState<
    Partial<Record<keyof PlanningLineHierarchyInput, string>>
  >({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CatalogNameTarget | null>(
    null,
  );
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const role = useAuthStore((state) => state.user?.role?.code);
  const canCreateNode =
    role === ROLE_CODE.GIOF_MANAGER || role === ROLE_CODE.ADMIN_SISTEMA;
  const [createdComponent, setCreatedComponent] = useState<{
    id: string;
    name: string;
    parentId: string;
  } | null>(null);
  const [createdAction, setCreatedAction] = useState<{
    id: string;
    name: string;
    parentId: string;
  } | null>(null);
  const pending = useRef(false);
  const capability = usePoaHierarchyCapability();
  const orgs = useCatalogOrganizationalUnits();
  const programs = useCatalogBudgetPrograms(value.planning_type);
  const components = useStrategicComponents(value.program_id || null);
  const actions = useOperativeActions(value.component_id || null);
  const catalogsReady =
    capability?.enabled === true &&
    Array.isArray(orgs.data) &&
    !orgs.isLoading &&
    !orgs.error &&
    Array.isArray(programs.data) &&
    !programs.isLoading &&
    !programs.error &&
    components.loadedFor === value.program_id &&
    !components.isLoading &&
    !components.error &&
    actions.loadedFor === value.component_id &&
    !actions.isLoading &&
    !actions.error;
  const componentOptions = components.data.filter(
    (item) => item.isActive && item.programId === value.program_id,
  );
  const actionOptions = actions.data.filter(
    (item) => item.isActive && item.componentId === value.component_id,
  );
  const labels: HierarchyReviewLabels = {
    unit: renamed[`unit:${value.organizational_unit_id}`] ?? orgs.data?.find((item) => item.id === value.organizational_unit_id)?.name,
    type: PLANNING_TYPE_LABELS[value.planning_type],
    program: renamed[`program:${value.program_id}`] ?? programs.data?.find((item) => item.id === value.program_id)?.name,
    component: renamed[`component:${value.component_id}`] ?? componentOptions.find((item) => item.id === value.component_id)?.name ?? (createdComponent?.id === value.component_id ? createdComponent.name : line.poaHierarchy?.component?.name),
    action: renamed[`action:${value.operative_action_id}`] ?? actionOptions.find((item) => item.id === value.operative_action_id)?.name ?? (createdAction?.id === value.operative_action_id ? createdAction.name : line.poaHierarchy?.action?.name),
    resource: value.resource_name,
  };
  const hierarchyValid = Boolean(buildPlanningHierarchy(value).hierarchy && catalogsReady && line.resource_id &&
    orgs.data?.some((item) => item.id === value.organizational_unit_id && item.is_active) &&
    programs.data?.some((item) => item.id === value.program_id && item.is_active && (!item.planningType || item.planningType === value.planning_type)) &&
    (componentOptions.some((item) => item.id === value.component_id) || (createdComponent?.id === value.component_id && createdComponent.parentId === value.program_id)) &&
    (actionOptions.some((item) => item.id === value.operative_action_id) || (createdAction?.id === value.operative_action_id && createdAction.parentId === value.component_id)));
  const validationSignature = JSON.stringify([hierarchyValid, labels]);
  useEffect(() => {
    onValidationChange?.(hierarchyValid, labels);
    // The catalog hooks may return new array identities on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationSignature]);
  // El ID de la línea es la única identidad autoritativa para editar el recurso.
  const selectedResourceId = line.resource_id;
  const missingResource = !selectedResourceId;
  const originalResourceName =
    line.resource?.name ??
    line.poaHierarchy?.resource?.name ??
    line.resource_description;
  const resourceName =
    renamed[`resource:${selectedResourceId}`] ?? originalResourceName;
  const canRenameResource = Boolean(
    selectedResourceId &&
    value.operative_action_id ===
      (line.operative_action_id ?? line.poaHierarchy?.action?.id),
  );
  const renameButton = (
    level: string,
    label: string,
    path: string,
    id: string,
    name: string,
    maxLength: number | null,
  ) =>
    canCreateNode &&
    capability?.enabled === true &&
    !disabled &&
    !saving &&
    !creating &&
    id &&
    name ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 w-full sm:w-auto"
        aria-label={`Editar nombre de ${label}`}
        onClick={() =>
          setRenameTarget({ level, label, path, id, name, maxLength })
        }
      >
        Editar nombre
      </Button>
    ) : null;
  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
  const change = (next: PlanningLineHierarchyInput) => {
    setValue(next);
    setErrors({});
    setSaveError(null);
  };
  async function createNode(level: "component" | "action", name: string) {
    const parentId =
      level === "component" ? value.program_id : value.component_id;
    if (!parentId) throw new Error("Selecciona el nivel anterior.");
    setCreating(true);
    try {
      const node = await api.post<{ id: string; name: string }>(
        level === "component"
          ? "/catalogs/strategic-components"
          : "/catalogs/operative-actions",
        level === "component"
          ? { name, program_id: parentId }
          : { name, component_id: parentId },
      );
      if (level === "component")
        setCreatedComponent({ id: node.id, name: node.name, parentId });
      else setCreatedAction({ id: node.id, name: node.name, parentId });
      if (level === "component") void components.refetch();
      else void actions.refetch();
      return node;
    } finally {
      setCreating(false);
    }
  }

  async function submit() {
    if (pending.current || disabled || !catalogsReady || missingResource) return;
    const result = buildPlanningHierarchy(value);
    if (result.hierarchy) {
      if (
        !orgs.data?.some(
          (item) => item.id === value.organizational_unit_id && item.is_active,
        )
      )
        result.errors.organizational_unit_id =
          "Selecciona una unidad orgánica activa.";
      if (
        !programs.data?.some(
          (item) =>
            item.id === value.program_id &&
            item.is_active &&
            (!item.planningType || item.planningType === value.planning_type),
        )
      )
        result.errors.program_id =
          "El programa no pertenece al tipo seleccionado.";
      if (
        !componentOptions.some((item) => item.id === value.component_id) &&
        !(
          createdComponent?.id === value.component_id &&
          createdComponent.parentId === value.program_id
        )
      )
        result.errors.component_id =
          "El componente no pertenece al programa seleccionado.";
      if (
        !actionOptions.some((item) => item.id === value.operative_action_id) &&
        !(
          createdAction?.id === value.operative_action_id &&
          createdAction.parentId === value.component_id
        )
      )
        result.errors.operative_action_id =
          "La acción no pertenece al componente seleccionado.";
    }
    setErrors(result.errors);
    if (!result.hierarchy || Object.keys(result.errors).length) return;
    pending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (approvedSave)
        await approvedSave(result.hierarchy, {
          unit: orgs.data?.find(
            (item) => item.id === value.organizational_unit_id,
          )?.name,
          type: PLANNING_TYPE_LABELS[value.planning_type],
          program: programs.data?.find((item) => item.id === value.program_id)
            ?.name,
          component:
            componentOptions.find((item) => item.id === value.component_id)
              ?.name ??
            (createdComponent?.id === value.component_id
              ? createdComponent.name
              : line.poaHierarchy?.component?.id === value.component_id
                ? line.poaHierarchy.component.name
                : undefined),
          action:
            actionOptions.find((item) => item.id === value.operative_action_id)
              ?.name ??
            (createdAction?.id === value.operative_action_id
              ? createdAction.name
              : line.poaHierarchy?.action?.id === value.operative_action_id
                ? line.poaHierarchy.action.name
                : undefined),
          resource: result.hierarchy.resource_name,
        });
      else {
        await api.patch<PlanningLine>(`/budget/planning-lines/${line.id}`, {
          hierarchy: result.hierarchy,
        });
        for (const tag of ["budget", "poa", "dashboard"])
          invalidateQueryTag(tag);
        await onSaved();
      }
    } catch (error) {
      setSaveError(
        hierarchyEditError(error, {
          actionMove:
            value.operative_action_id !==
            (line.operative_action_id ?? line.poaHierarchy?.action?.id),
        }),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-md border p-3 sm:p-4"
      aria-label="Editar jerarquía POA"
    >
      <h3 className="font-medium">Jerarquía POA de esta línea</h3>
      <p className="text-sm text-muted-foreground">
        El código y el identificador de la línea no cambian. Las solicitudes
        históricas conservan sus datos, pero los listados históricos mostrarán
        la clasificación actualizada. Esta advertencia no impide guardar.
      </p>
      {capability?.enabled !== true && (
        <p role="status">
          La actualización aún no está disponible. Verifica la disponibilidad de
          la jerarquía POA.
        </p>
      )}
      {capability?.enabled === true && !catalogsReady && !missingResource && (
        <p role="status">
          Cargando o verificando catálogos de la jerarquía POA. No se puede
          guardar hasta validar las selecciones.
        </p>
      )}
      {missingResource && (
        <p role="status" className="text-sm text-destructive">
          Esta línea histórica está sin recurso POA asociado. No se puede editar
          el nombre ni guardar la jerarquía hasta regularizar su asociación.
        </p>
      )}
      <div className="space-y-1">
        <Label>Unidad orgánica *</Label>
        <SearchSelectModal
          ariaLabel="Unidad orgánica"
          value={value.organizational_unit_id || null}
          displayValue={
            renamed[`unit:${value.organizational_unit_id}`] ??
            orgs.data?.find((item) => item.id === value.organizational_unit_id)
              ?.name ??
            (value.organizational_unit_id === line.organizational_unit_id
              ? line.organizationalUnit?.name
              : undefined)
          }
          title="Seleccionar Unidad Orgánica"
          placeholder="Seleccionar unidad orgánica"
          items={(orgs.data ?? []).filter((item) => item.is_active)}
          getItemId={(item) => item.id}
          getItemLabel={(item) => item.name}
          onChange={(id) =>
            change({ ...value, organizational_unit_id: id ?? "" })
          }
          disabled={saving || disabled}
        />
        {renameButton(
          "unit",
          "Unidad orgánica",
          "/catalogs/organizational-units",
          value.organizational_unit_id,
          renamed[`unit:${value.organizational_unit_id}`] ??
            orgs.data?.find(
              (item) =>
                item.id === value.organizational_unit_id && item.is_active,
            )?.name ??
            "",
          200,
        )}
        {errors.organizational_unit_id && (
          <p role="alert">{errors.organizational_unit_id}</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="hierarchy-type">Tipo *</Label>
          <select
            id="hierarchy-type"
            className={selectClass}
            value={value.planning_type}
            disabled={saving || disabled}
            onChange={(e) =>
              change({
                ...value,
                planning_type: e.target
                  .value as PlanningLineHierarchyInput["planning_type"],
                program_id: "",
                component_id: "",
                operative_action_id: "",
                resource_name: line.resource_id ? value.resource_name : "",
              })
            }
          >
            {PLANNING_TYPES.map((type) => (
              <option key={type} value={type}>
                {PLANNING_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="hierarchy-program">
            Programa / proyecto / gestión *
          </Label>
          <select
            id="hierarchy-program"
            className={selectClass}
            value={value.program_id}
            disabled={saving || disabled}
            onChange={(e) =>
              change({
                ...value,
                program_id: e.target.value,
                component_id: "",
                operative_action_id: "",
                resource_name: line.resource_id ? value.resource_name : "",
              })
            }
          >
            <option value="">Seleccionar programa</option>
            {(programs.data ?? [])
              .filter(
                (item) =>
                  item.is_active &&
                  (!item.planningType ||
                    item.planningType === value.planning_type),
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {renamed[`program:${item.id}`] ?? item.name}
                </option>
              ))}
          </select>
          {renameButton(
            "program",
            "Programa",
            "/catalogs/budget-programs",
            value.program_id,
            renamed[`program:${value.program_id}`] ??
              programs.data?.find((item) => item.id === value.program_id)
                ?.name ??
              "",
            255,
          )}
          {errors.program_id && <p role="alert">{errors.program_id}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="hierarchy-component">Componente estratégico *</Label>
          <ComboboxCreate
            id="hierarchy-component"
            value={value.component_id || null}
            placeholder="Buscar o agregar componente"
            items={[
              ...componentOptions,
              ...(createdComponent?.parentId === value.program_id &&
              !componentOptions.some((item) => item.id === createdComponent.id)
                ? [
                    {
                      id: createdComponent.id,
                      name: createdComponent.name,
                      programId: value.program_id,
                      isActive: true,
                      fullCode: "",
                      sequenceNumber: "",
                    },
                  ]
                : []),
            ]}
            displayValue={
              renamed[`component:${value.component_id}`] ??
              componentOptions.find((item) => item.id === value.component_id)
                ?.name ??
              (createdComponent?.id === value.component_id &&
              createdComponent.parentId === value.program_id
                ? createdComponent.name
                : line.poaHierarchy?.component?.id === value.component_id
                  ? line.poaHierarchy.component.name
                  : undefined)
            }
            getItemId={(item) => item.id}
            getItemLabel={(item) => item.name}
            onChange={(id) =>
              change({
                ...value,
                component_id: id ?? "",
                operative_action_id: "",
                resource_name: line.resource_id ? value.resource_name : "",
              })
            }
            onCreateNew={
              canCreateNode
                ? (name) => createNode("component", name)
                : undefined
            }
            disabled={saving || disabled || !value.program_id}
            hasError={!!errors.component_id}
          />
          {renameButton(
            "component",
            "Componente estratégico",
            "/catalogs/strategic-components",
            value.component_id,
            renamed[`component:${value.component_id}`] ??
              componentOptions.find((item) => item.id === value.component_id)
                ?.name ??
              (createdComponent?.id === value.component_id &&
              createdComponent.parentId === value.program_id
                ? createdComponent.name
                : ""),
            255,
          )}
          {errors.component_id && <p role="alert">{errors.component_id}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="hierarchy-action">Acción operativa *</Label>
          <ComboboxCreate
            id="hierarchy-action"
            value={value.operative_action_id || null}
            placeholder="Buscar o agregar acción operativa"
            items={[
              ...actionOptions,
              ...(createdAction?.parentId === value.component_id &&
              !actionOptions.some((item) => item.id === createdAction.id)
                ? [
                    {
                      id: createdAction.id,
                      name: createdAction.name,
                      componentId: value.component_id,
                      isActive: true,
                      fullCode: "",
                      sequenceNumber: "",
                    },
                  ]
                : []),
            ]}
            displayValue={
              renamed[`action:${value.operative_action_id}`] ??
              actionOptions.find(
                (item) => item.id === value.operative_action_id,
              )?.name ??
              (createdAction?.id === value.operative_action_id &&
              createdAction.parentId === value.component_id
                ? createdAction.name
                : line.poaHierarchy?.action?.id === value.operative_action_id
                  ? line.poaHierarchy.action.name
                  : undefined)
            }
            getItemId={(item) => item.id}
            getItemLabel={(item) => item.name}
            onChange={(id) =>
              change({
                ...value,
                operative_action_id: id ?? "",
                resource_name: line.resource_id ? value.resource_name : "",
              })
            }
            onCreateNew={
              canCreateNode ? (name) => createNode("action", name) : undefined
            }
            disabled={saving || disabled || !value.component_id}
            hasError={!!errors.operative_action_id}
          />
          {renameButton(
            "action",
            "Acción operativa",
            "/catalogs/operative-actions",
            value.operative_action_id,
            renamed[`action:${value.operative_action_id}`] ??
              actionOptions.find(
                (item) => item.id === value.operative_action_id,
              )?.name ??
              (createdAction?.id === value.operative_action_id &&
              createdAction.parentId === value.component_id
                ? createdAction.name
                : ""),
            null,
          )}
          {errors.operative_action_id && (
            <p role="alert">{errors.operative_action_id}</p>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="hierarchy-resource">Nombre del recurso POA *</Label>
        <Input
          id="hierarchy-resource"
          maxLength={500}
          autoComplete="off"
          value={value.resource_name}
          disabled={
            saving || disabled || missingResource || !value.operative_action_id
          }
          aria-invalid={!!errors.resource_name}
          aria-describedby="hierarchy-resource-help"
          onChange={(e) => change({ ...value, resource_name: e.target.value })}
        />
        {canRenameResource &&
          renameButton(
            "resource",
            "Recurso POA",
            "/catalogs/poa-resources",
            selectedResourceId!,
            resourceName,
            500,
          )}
        {errors.resource_name && <p role="alert">{errors.resource_name}</p>}
        <p id="hierarchy-resource-help" className="text-xs text-muted-foreground">
          Renombrar este recurso también cambia su nombre en otras líneas que lo comparten.
          Cambiarlo de acción está sujeto a las restricciones existentes.
        </p>
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}
      {!draft && <Button
        type="button"
        disabled={saving || disabled || !catalogsReady || missingResource}
        onClick={() => void submit()}
      >
        {saving ? "Guardando…" : "Guardar jerarquía"}
      </Button>}
      {renameTarget && (
        <CatalogNameDialog
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={async (name) => {
            setRenamed((previous) => ({
              ...previous,
              [`${renameTarget.level}:${renameTarget.id}`]: name,
            }));
            if (renameTarget.level === "resource")
              setValue((previous) => ({ ...previous, resource_name: name }));
            onNameRenamed?.(renameTarget.level, renameTarget.id, name);
            if (renameTarget.level === "unit") await orgs.refetch?.();
            if (renameTarget.level === "program") await programs.refetch?.();
            if (renameTarget.level === "component") await components.refetch();
            if (renameTarget.level === "action") await actions.refetch();
            await onCatalogRenamed?.();
          }}
        />
      )}
    </section>
  );
}
