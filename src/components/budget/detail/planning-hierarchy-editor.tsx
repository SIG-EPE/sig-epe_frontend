"use client";

import { useRef, useState } from "react";
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

interface Props {
  line: PlanningLine;
  onSaved: () => void | Promise<void>;
  approvedSave?: (
    hierarchy: PlanningLineHierarchyInput,
    labels: HierarchyReviewLabels,
  ) => Promise<void>;
  disabled?: boolean;
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
}: Props) {
  const [value, setValue] = useState(() => seedPlanningHierarchy(line));
  const [errors, setErrors] = useState<
    Partial<Record<keyof PlanningLineHierarchyInput, string>>
  >({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
  }

  async function submit() {
    if (pending.current || disabled || !catalogsReady) return;
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
      setSaveError(hierarchyEditError(error));
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
      {capability?.enabled === true && !catalogsReady && (
        <p role="status">
          Cargando o verificando catálogos de la jerarquía POA. No se puede
          guardar hasta validar las selecciones.
        </p>
      )}
      <div className="space-y-1">
        <Label>Unidad orgánica *</Label>
        <SearchSelectModal
          ariaLabel="Unidad orgánica"
          value={value.organizational_unit_id || null}
          displayValue={
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
                resource_name: "",
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
                resource_name: "",
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
                  {item.name}
                </option>
              ))}
          </select>
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
                resource_name: "",
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
                resource_name: "",
              })
            }
            onCreateNew={
              canCreateNode ? (name) => createNode("action", name) : undefined
            }
            disabled={saving || disabled || !value.component_id}
            hasError={!!errors.operative_action_id}
          />
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
          disabled={saving || disabled || !value.operative_action_id}
          aria-invalid={!!errors.resource_name}
          onChange={(e) => change({ ...value, resource_name: e.target.value })}
        />
        {errors.resource_name && <p role="alert">{errors.resource_name}</p>}
        <p className="text-xs text-muted-foreground">
          Si cambia el nombre o la acción, se creará un recurso exclusivo dentro
          de la transacción de la línea. No se usa el recurso de otra línea.
        </p>
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}
      <Button
        type="button"
        disabled={saving || disabled || !catalogsReady}
        onClick={() => void submit()}
      >
        {saving ? "Guardando…" : "Guardar jerarquía"}
      </Button>
    </section>
  );
}
