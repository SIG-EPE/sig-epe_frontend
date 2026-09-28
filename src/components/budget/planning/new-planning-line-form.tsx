"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import {
  useActiveFiscalYear,
  useBudgetCategories,
  useCreatePlanningLine,
  type CreatePlanningLineDto,
} from "@/hooks/use-budget";
import {
  useStrategicComponents,
  useOperativeActions,
  useCatalogOrganizationalUnits,
  useCatalogBudgetPrograms,
  usePoaHierarchyCapability,
} from "@/hooks/use-catalogs";
import { api, ApiRequestError } from "@/lib/api-client";
import { SearchSelectModal } from "@/components/ui/search-select-modal";
import { ComboboxCreate } from "@/components/ui/combobox-create";
import { TerritorySelector } from "@/components/shared/territory-selector";
import { StructuredTerritorySelector } from "@/components/shared/structured-territory-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_CODE, ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanningLineCeiling } from "@/hooks/use-planning-line-ceiling";
import { classifyPlanningLineCreateError } from "./planning-line-create-error";
import { PlanningCatalogCreateDialog } from "./planning-catalog-create-dialog";
import { normalizeDecimalInput, parseDecimalInput } from "@/lib/numeric-input";
import {
  POA_ORG_UNIT_INVALID_MESSAGE,
  getOrgUnitPoaPrefix,
  hasValidOrgUnitPoaPrefix,
} from "@/lib/poa-prefix";
import {
  PLANNING_TYPE,
  PLANNING_TYPE_LABELS,
  PLANNING_TYPES,
  type PlanningType,
} from "@/lib/planning-types";
import { getPoaTerritorySelectionFeatures } from "@/config/poa-territory-selection";
import {
  buildTerritorySelectionPayload,
  type TerritoryAxisDraft,
} from "@/lib/poa-territory-selection";
import {
  buildPlanningLineResourceFields,
  poaCatalogOptionLabel,
} from "./planning-line-resource-contract";

// -------------------------------------------------------
// Zod schema
// -------------------------------------------------------

const requiredNumber = (requiredMessage: string, minMessage: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? parseDecimalInput(value) : value),
    z
      .number({
        invalid_type_error: requiredMessage,
        required_error: requiredMessage,
      })
      .min(0, minMessage),
  );

const PlanningLineSchema = z.object({
  organizational_unit_id: z.string().min(1, "La unidad orgánica es requerida"),
  planning_type: z.enum(PLANNING_TYPES, {
    errorMap: () => ({ message: "Selecciona un tipo válido" }),
  }),
  program_id: z.string().min(1, "Selecciona un programa, proyecto o gestión"),
  component_id: z.preprocess(
    (value) => value ?? "",
    z.string().min(1, "Selecciona un componente estratégico"),
  ),
  territory_id: z.string().optional(),
  operative_action_id: z.preprocess(
    (value) => value ?? "",
    z.string().min(1, "Selecciona una acción operativa"),
  ),
  importance: z.string().optional(),
  frequency: z.string().optional(),
  budget_category_id: z.string().min(1, "El tipo de recurso es requerido"),
  resource_name: z
    .string()
    .trim()
    .min(1, "Ingresa un nombre de recurso")
    .max(500),
  unit_price: requiredNumber(
    "El precio unitario es requerido",
    "El precio unitario no puede ser negativo",
  ),
  quantity: requiredNumber(
    "La cantidad es requerida",
    "La cantidad no puede ser negativa",
  ),
});

type PlanningLineFormData = z.infer<typeof PlanningLineSchema>;
type PlanningLineFormState = Omit<
  PlanningLineFormData,
  "unit_price" | "quantity" | "component_id" | "operative_action_id"
> & {
  unit_price: string;
  quantity: string;
  component_id: string | null;
  operative_action_id: string | null;
};

// -------------------------------------------------------
// Tipos UI helpers
// -------------------------------------------------------

const IMPORTANCE_OPTIONS = [
  { value: "Actividad estratégica", label: "Actividad estratégica" },
  { value: "Actividad no estratégica", label: "Actividad no estratégica" },
];

const FREQUENCY_OPTIONS = [
  { value: "Actividad Rutinaria", label: "Actividad Rutinaria" },
  { value: "Actividad Periódica", label: "Actividad Periódica" },
  { value: "Actividad Ocasional", label: "Actividad Ocasional" },
  { value: "Actividad de largo alcance", label: "Actividad de largo alcance" },
];

// -------------------------------------------------------
// Clase compartida para selects nativos
// -------------------------------------------------------

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

// -------------------------------------------------------
// NewPlanningLineForm component
// -------------------------------------------------------

export function NewPlanningLineForm() {
  const router = useRouter();
  const hierarchyCapability = usePoaHierarchyCapability();
  const hierarchyReady = hierarchyCapability?.enabled === true;
  const territorySelectionEnabled =
    getPoaTerritorySelectionFeatures().writeEnabled;
  const roleCode = useAuthStore((state) => state.user?.role?.code);
  const canCreateCatalog =
    roleCode === ROLE_CODE.GIOF_MANAGER || roleCode === ROLE_CODE.ADMIN_SISTEMA;
  const creatingNode = useRef(false);
  const submittingLine = useRef(false);
  const [createCatalog, setCreateCatalog] = useState<"org" | "program" | null>(
    null,
  );
  const [createdOrg, setCreatedOrg] = useState<{
    id: string;
    name: string;
    code: string;
  } | null>(null);
  const [createdProgram, setCreatedProgram] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [createdNode, setCreatedNode] = useState<{
    level: "component" | "action";
    id: string;
    name: string;
    parentId: string;
  } | null>(null);

  // Datos del backend
  const { data: activeFiscalYear, isLoading: fyLoading } =
    useActiveFiscalYear();
  const {
    data: orgUnits,
    isLoading: orgUnitsLoading,
    error: orgUnitsError,
    refetch: refetchOrgUnits,
  } = useCatalogOrganizationalUnits();

  const { data: categories, isLoading: categoriesLoading } =
    useBudgetCategories();
  const { create, isLoading: creating } = useCreatePlanningLine();

  // Auth — no longer needed directly; api client reads from store internally

  // Estado del formulario
  const [form, setForm] = useState<PlanningLineFormState>({
    organizational_unit_id: "",
    planning_type: PLANNING_TYPE.PROGRAMA,
    program_id: "",
    component_id: null,
    territory_id: "",
    operative_action_id: null,
    importance: "",
    frequency: "",
    budget_category_id: "",
    resource_name: "",
    unit_price: "0",
    quantity: "0",
  });

  const [errors, setErrors] = useState<
    Partial<Record<keyof PlanningLineFormState, string>>
  >({});
  const [territoryAxes, setTerritoryAxes] = useState<TerritoryAxisDraft>({});
  const [territorySelectionError, setTerritorySelectionError] =
    useState<string>();
  const [budgetError, setBudgetError] = useState<{
    key: string;
    message: string;
  }>();
  const ceilingSnapshot = usePlanningLineCeiling(
    form.organizational_unit_id,
    activeFiscalYear?.id,
  );
  const budgetContextKey = `${form.organizational_unit_id}:${activeFiscalYear?.id ?? ""}`;

  // Programas filtrados por planning_type
  const {
    data: programs,
    isLoading: programsLoading,
    error: programsError,
    refetch: refetchPrograms,
  } = useCatalogBudgetPrograms(form.planning_type);

  // Jerarquía: componentes y acciones operativas en cascada
  const { data: components, refetch: refetchComponents } =
    useStrategicComponents(form.program_id || null);
  const { data: operativeActions, refetch: refetchActions } =
    useOperativeActions(form.component_id ?? null);
  const createNode = async (
    level: "component" | "action",
    name: string,
    parentId: string | null,
    path: string,
    parentField: string,
    refetch: () => Promise<unknown>,
  ) => {
    if (
      !hierarchyReady ||
      !canCreateCatalog ||
      !parentId ||
      creatingNode.current
    ) {
      throw new Error(
        "Selecciona un padre y verifica que el catálogo POA esté disponible.",
      );
    }
    creatingNode.current = true;
    try {
      const created = await api.post<{ id: string; name: string }>(path, {
        name,
        [parentField]: parentId,
      });
      setCreatedNode({ level, id: created.id, name: created.name, parentId });
      // Un POST exitoso nunca se reintenta por un fallo de lectura posterior.
      try {
        await refetch();
      } catch {
        toast.error(
          "Se creó el registro; actualiza la página si no aparece en la lista.",
        );
      }
      return created;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.error(
          "Ya existe un nombre en este padre. Busca el registro existente.",
        );
      } else if (error instanceof ApiRequestError && error.status === 403) {
        toast.error("No tienes permiso para agregar este catálogo.");
      } else {
        toast.error(
          "No se pudo agregar el catálogo POA. Comprueba su disponibilidad.",
        );
      }
      throw error;
    } finally {
      creatingNode.current = false;
    }
  };

  // Limpiar program_id (y jerarquía) al cambiar planning_type
  const handlePlanningTypeChange = (newType: string) => {
    setCreatedProgram(null);
    setForm((f) => ({
      ...f,
      planning_type: newType as PlanningType,
      program_id: "",
      component_id: null,
      operative_action_id: null,
      resource_name: "",
    }));
  };

  // Costo total calculado
  const totalCost =
    (parseDecimalInput(form.unit_price) ?? 0) *
    (parseDecimalInput(form.quantity) ?? 0);
  const formatPen = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(value);
  const preview =
    ceilingSnapshot.status === "ready" ? ceilingSnapshot.data : null;
  const selectedOrgUnit =
    orgUnits?.find((u) => u.id === form.organizational_unit_id) ??
    (createdOrg?.id === form.organizational_unit_id ? createdOrg : null);
  const orgOptions =
    createdOrg && !orgUnits?.some((unit) => unit.id === createdOrg.id)
      ? [...(orgUnits ?? []), { ...createdOrg, is_active: true }]
      : (orgUnits ?? []);
  const programOptions = (
    createdProgram &&
    !programs?.some((program) => program.id === createdProgram.id)
      ? [
          ...(programs ?? []),
          {
            ...createdProgram,
            code: "",
            is_active: true,
            planningType: form.planning_type,
          },
        ]
      : (programs ?? [])
  ).filter(
    (program) =>
      !program.planningType || program.planningType === form.planning_type,
  );
  const onCatalogCreated = async (
    kind: "org" | "program",
    id: string,
    name: string,
    code: string,
  ) => {
    if (kind === "org") {
      setCreatedOrg({ id, name, code });
      setForm((current) => ({ ...current, organizational_unit_id: id }));
      await refetchOrgUnits();
    } else {
      setCreatedProgram({ id, name });
      setForm((current) => ({
        ...current,
        program_id: id,
        component_id: null,
        operative_action_id: null,
        resource_name: "",
      }));
      await refetchPrograms();
    }
  };
  const selectedOrgUnitHasInvalidPoaPrefix = Boolean(
    selectedOrgUnit && !hasValidOrgUnitPoaPrefix(selectedOrgUnit),
  );

  // Crear componente estratégico inline
  const createStrategicComponent = (name: string) =>
    createNode(
      "component",
      name,
      form.program_id ?? null,
      "/catalogs/strategic-components",
      "program_id",
      refetchComponents,
    );

  // Crear acción operativa inline
  const createOperativeAction = (name: string) =>
    createNode(
      "action",
      name,
      form.component_id ?? null,
      "/catalogs/operative-actions",
      "component_id",
      refetchActions,
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingLine.current) return;

    if (!canCreateCatalog) {
      toast.error("No tienes permiso para agregar líneas POA.");
      return;
    }
    if (!hierarchyCapability || !hierarchyReady) {
      toast.error(
        "No se pudo verificar el contrato del catálogo POA. No se guardó la línea.",
      );
      return;
    }

    if (!activeFiscalYear) {
      toast.error("No hay un año fiscal activo. Contacta al administrador.");
      return;
    }

    if (selectedOrgUnitHasInvalidPoaPrefix) {
      setErrors((prev) => ({
        ...prev,
        organizational_unit_id: POA_ORG_UNIT_INVALID_MESSAGE,
      }));
      toast.error(POA_ORG_UNIT_INVALID_MESSAGE);
      return;
    }

    // Convertir vacíos a undefined para validación
    const toValidate = {
      ...form,
      program_id: form.program_id,
      component_id: form.component_id || undefined,
      territory_id: form.territory_id || undefined,
      operative_action_id: form.operative_action_id || undefined,
      importance: form.importance || undefined,
      frequency: form.frequency || undefined,
    };

    const parsed = PlanningLineSchema.safeParse(toValidate);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof PlanningLineFormState, string>> =
        {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof PlanningLineFormState;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      // Scroll al primer campo con error
      setTimeout(() => {
        document
          .querySelector('[data-error="true"]')
          ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    if (
      hierarchyReady &&
      (!parsed.data.resource_name?.trim() ||
        parsed.data.resource_name.trim().length > 500 ||
        /[\u0000-\u001f\u007f]/.test(parsed.data.resource_name.trim()))
    ) {
      setErrors({
        resource_name: "Ingresa un nombre válido de hasta 500 caracteres",
      });
      return;
    }

    setErrors({});
    setBudgetError(undefined);

    const territorySelection = territorySelectionEnabled
      ? buildTerritorySelectionPayload(territoryAxes)
      : null;
    if (territorySelectionEnabled && !territorySelection) {
      setTerritorySelectionError(
        "Selecciona un territorio oficial o agregado en cada uno de los tres ejes.",
      );
      return;
    }
    setTerritorySelectionError(undefined);

    submittingLine.current = true;
    let createdLine: { id: string };
    try {
      const dto: CreatePlanningLineDto = {
        fiscal_year_id: activeFiscalYear.id,
        organizational_unit_id: parsed.data.organizational_unit_id,
        budget_category_id: parsed.data.budget_category_id,
        planning_type: parsed.data.planning_type,
        ...buildPlanningLineResourceFields({
          actionId: parsed.data.operative_action_id ?? null,
          name: parsed.data.resource_name ?? "",
        }),
        unit_price: parsed.data.unit_price,
        quantity: parsed.data.quantity,
        ...(territorySelectionEnabled
          ? { territory_selection: territorySelection! }
          : { territory_id: parsed.data.territory_id || undefined }),
        operative_action_id: parsed.data.operative_action_id || null,
        importance: parsed.data.importance,
        frequency: parsed.data.frequency,
        program_id: parsed.data.program_id || undefined,
        component_id: parsed.data.component_id,
      };

      createdLine = await create(dto);
    } catch (err) {
      submittingLine.current = false;
      if (err instanceof ApiRequestError && err.status === 409) {
        setErrors({
          resource_name:
            "Ya existe un recurso con ese nombre en esta acción operativa. Ingresa otro nombre.",
        });
        toast.error(
          "Ya existe un recurso con ese nombre en esta acción operativa.",
        );
      } else if (err instanceof ApiRequestError && err.status === 400) {
        const kind = classifyPlanningLineCreateError(err);
        const fieldByCode: Record<string, keyof PlanningLineFormState> = {
          ORGANIZATIONAL_UNIT_ID: "organizational_unit_id",
          PLANNING_TYPE: "planning_type",
          PROGRAM_ID: "program_id",
          COMPONENT_ID: "component_id",
          OPERATIVE_ACTION_ID: "operative_action_id",
          BUDGET_CATEGORY_ID: "budget_category_id",
        };
        const match =
          /^POA_PLANNING_HIERARCHY_(ORGANIZATIONAL_UNIT_ID|PLANNING_TYPE|PROGRAM_ID|COMPONENT_ID|OPERATIVE_ACTION_ID|BUDGET_CATEGORY_ID)_(REQUIRED|INACTIVE|MISMATCH)$/.exec(
            err.body?.code ?? "",
          );
        if (kind === "ceiling") {
          setBudgetError({
            key: budgetContextKey,
            message: `El servidor rechazó el costo por exceder el techo presupuestal de ${selectedOrgUnit?.name ?? "la UO seleccionada"} en ${activeFiscalYear.year}. Revisa el presupuesto antes de reintentar.`,
          });
          toast.error("El costo excede el techo presupuestal de la UO.");
        } else if (match) {
          setErrors({
            [fieldByCode[match[1]]]:
              "Revisa la selección y su jerarquía vigente.",
          });
          toast.error("Datos inválidos. Revisa la jerarquía seleccionada.");
        } else if (kind === "resource") {
          setErrors({
            resource_name:
              "Revisa el nombre del recurso y la acción operativa seleccionada.",
          });
          toast.error(
            "Datos inválidos. Revisa el nombre del recurso y la acción operativa.",
          );
        } else {
          setBudgetError({
            key: budgetContextKey,
            message:
              "El servidor rechazó los datos de la línea. Revisa los campos antes de reintentar.",
          });
          toast.error(
            "No se pudo guardar la línea POA. Revisa los datos ingresados.",
          );
        }
      } else {
        toast.error(
          "No se pudo guardar la línea POA. Conservamos los datos para que puedas reintentar.",
        );
      }
      return;
    }
    toast.success("Línea POA creada exitosamente");
    if (typeof createdLine?.id !== "string" || !createdLine.id.trim()) {
      toast.error(
        "La línea se creó, pero no se recibió su identificador. Búscala en Planificación POA.",
      );
      return;
    }
    router.push(
      `${ROUTES.BUDGET_PLANNING}/${encodeURIComponent(createdLine.id)}`,
    );
  };

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {canCreateCatalog && budgetError?.key === budgetContextKey && (
        <div
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {budgetError.message}
        </div>
      )}
      {/* Año fiscal activo — informativo */}
      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <span className="font-medium text-foreground">Año fiscal:</span>{" "}
          {fyLoading ? (
            <Skeleton className="inline-block h-4 w-16" />
          ) : activeFiscalYear ? (
            <span className="font-semibold">
              {activeFiscalYear.year} (Activo)
            </span>
          ) : (
            <span className="text-destructive">Sin año fiscal activo</span>
          )}
        </span>
      </div>

      {/* ─── Sección 1: Identificación ─────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">
          1. Identificación
        </h2>

        {/* Unidad Orgánica */}
        <div
          className="space-y-1"
          data-error={!!errors.organizational_unit_id || undefined}
        >
          <Label>Unidad Orgánica *</Label>
          {orgUnitsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <SearchSelectModal
              value={form.organizational_unit_id || null}
              placeholder="Seleccionar unidad orgánica..."
              displayValue={selectedOrgUnit?.name}
              title="Seleccionar Unidad Orgánica"
              items={orgOptions.filter((u) => u.is_active)}
              getItemId={(u) => u.id}
              getItemLabel={(u) => u.name}
              getItemSubLabel={(u) => {
                const prefix = getOrgUnitPoaPrefix(u);
                return hasValidOrgUnitPoaPrefix(u)
                  ? `Prefijo POA: ${prefix}`
                  : "No disponible para POA: sigla/código inválido";
              }}
              searchPlaceholder="Buscar unidad orgánica..."
              onChange={(id) => {
                setForm((f) => ({ ...f, organizational_unit_id: id ?? "" }));
                setBudgetError(undefined);
                setErrors((prev) => ({
                  ...prev,
                  organizational_unit_id: undefined,
                }));
              }}
              disabled={creating}
              hasError={!!errors.organizational_unit_id}
              error={orgUnitsError}
            />
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!canCreateCatalog || creating}
            onClick={() => setCreateCatalog("org")}
          >
            Agregar unidad orgánica
          </Button>
          {!canCreateCatalog && (
            <p className="text-xs text-muted-foreground">
              Solo GIOF Manager o Admin Sistema pueden agregar catálogos. Puedes
              buscar y seleccionar los existentes.
            </p>
          )}
          {errors.organizational_unit_id && (
            <p className="text-xs text-destructive">
              {errors.organizational_unit_id}
            </p>
          )}
          {selectedOrgUnitHasInvalidPoaPrefix &&
            !errors.organizational_unit_id && (
              <p className="text-xs text-destructive">
                {POA_ORG_UNIT_INVALID_MESSAGE}
              </p>
            )}
        </div>

        {/* PROGRAMA / PROYECTO / GESTION */}
        <div
          className="space-y-1"
          data-error={!!errors.planning_type || undefined}
        >
          <Label htmlFor="planning_type">Tipo *</Label>
          <select
            id="planning_type"
            value={form.planning_type}
            onChange={(e) => {
              handlePlanningTypeChange(e.target.value);
              setErrors((prev) => ({ ...prev, planning_type: undefined }));
            }}
            className={`${SELECT_CLASS} ${errors.planning_type ? "border-destructive" : ""}`}
            disabled={creating}
          >
            {PLANNING_TYPES.map((value) => (
              <option key={value} value={value}>
                {PLANNING_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          {errors.planning_type && (
            <p className="text-xs text-destructive">{errors.planning_type}</p>
          )}
        </div>

        {/* Nombre del Programa / Proyecto / Gestión */}
        <div className="space-y-1">
          <Label>Nombre del {PLANNING_TYPE_LABELS[form.planning_type]} *</Label>
          {programsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <SearchSelectModal
              value={form.program_id || null}
              placeholder="Seleccionar..."
              displayValue={
                programOptions.find((p) => p.id === form.program_id)?.name
              }
              title={`Seleccionar ${PLANNING_TYPE_LABELS[form.planning_type]}`}
              items={programOptions.filter((p) => p.is_active)}
              getItemId={(p) => p.id}
              getItemLabel={(p) => p.name}
              getItemSubLabel={(p) => p.planningType ?? ""}
              searchPlaceholder="Buscar programa/proyecto..."
              onChange={(id) => {
                setForm((f) => ({
                  ...f,
                  program_id: id ?? "",
                  component_id: null,
                  operative_action_id: null,
                  resource_name: "",
                }));
                setErrors((current) => ({
                  ...current,
                  program_id: undefined,
                  component_id: undefined,
                  operative_action_id: undefined,
                }));
              }}
              disabled={creating}
              onClear
              error={programsError}
            />
          )}
          {errors.program_id && (
            <p role="alert" className="text-xs text-destructive">
              {errors.program_id}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!canCreateCatalog || creating}
            onClick={() => setCreateCatalog("program")}
          >
            Agregar programa
          </Button>
          {!canCreateCatalog && (
            <p className="text-xs text-muted-foreground">
              Solo GIOF Manager o Admin Sistema pueden agregar catálogos. Puedes
              buscar y seleccionar los existentes.
            </p>
          )}
        </div>
      </section>

      {/* ─── Sección 2: Jerarquía ──────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">2. Jerarquía</h2>

        {!hierarchyReady && (
          <p role="status" className="text-sm text-muted-foreground">
            {hierarchyCapability?.reason ??
              "Verificando la disponibilidad del catálogo POA..."}{" "}
            No se pueden crear líneas mientras el catálogo no esté disponible.
          </p>
        )}

        {hierarchyReady && (
          <>
            {/* Componente Estratégico — siempre visible, deshabilitado sin programa */}
            <div
              className="space-y-1"
              data-error={!!errors.component_id || undefined}
            >
              <Label>Componente Estratégico *</Label>
              <ComboboxCreate
                items={
                  createdNode?.level === "component" &&
                  createdNode.parentId === form.program_id &&
                  !components?.some((item) => item.id === createdNode.id)
                    ? [
                        ...(components ?? []).filter(
                          (item) =>
                            item.programId === form.program_id && item.isActive,
                        ),
                        {
                          id: createdNode.id,
                          name: createdNode.name,
                          fullCode: "",
                          programId: form.program_id,
                          sequenceNumber: "",
                          isActive: true,
                        },
                      ]
                    : (components ?? []).filter(
                        (item) =>
                          item.programId === form.program_id && item.isActive,
                      )
                }
                value={form.component_id ?? null}
                displayValue={
                  components?.find(
                    (component) => component.id === form.component_id,
                  )
                    ? poaCatalogOptionLabel(
                        components.find(
                          (component) => component.id === form.component_id,
                        )!,
                      )
                    : undefined
                }
                placeholder="Buscar o agregar componente..."
                getItemId={(c) => c.id}
                getItemLabel={(c) => poaCatalogOptionLabel(c)}
                onChange={(id) => {
                  setForm((f) => ({
                    ...f,
                    component_id: id,
                    operative_action_id: null,
                    resource_name: "",
                  }));
                  setErrors((current) => ({
                    ...current,
                    component_id: undefined,
                    operative_action_id: undefined,
                  }));
                }}
                onCreateNew={
                  canCreateCatalog ? createStrategicComponent : undefined
                }
                disabled={creating || !form.program_id}
              />
              {errors.component_id && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.component_id}
                </p>
              )}
              {!form.program_id && (
                <p className="text-xs text-muted-foreground">
                  Selecciona primero un programa en la seccion anterior.
                </p>
              )}
            </div>

            {/* Acción Operativa — siempre visible, deshabilitada sin componente */}
            <div className="space-y-1">
              <Label>Acción Operativa *</Label>
              <ComboboxCreate
                items={
                  createdNode?.level === "action" &&
                  createdNode.parentId === form.component_id &&
                  !operativeActions?.some((item) => item.id === createdNode.id)
                    ? [
                        ...(operativeActions ?? []).filter(
                          (item) =>
                            item.componentId === form.component_id &&
                            item.isActive,
                        ),
                        {
                          id: createdNode.id,
                          name: createdNode.name,
                          fullCode: "",
                          componentId: form.component_id!,
                          sequenceNumber: "",
                          isActive: true,
                        },
                      ]
                    : (operativeActions ?? []).filter(
                        (item) =>
                          item.componentId === form.component_id &&
                          item.isActive,
                      )
                }
                value={form.operative_action_id ?? null}
                displayValue={
                  operativeActions?.find(
                    (action) => action.id === form.operative_action_id,
                  )
                    ? poaCatalogOptionLabel(
                        operativeActions.find(
                          (action) => action.id === form.operative_action_id,
                        )!,
                      )
                    : undefined
                }
                placeholder="Buscar o agregar acción operativa..."
                getItemId={(a) => a.id}
                getItemLabel={(a) => poaCatalogOptionLabel(a)}
                onChange={(id) =>
                  setForm((f) => ({
                    ...f,
                    operative_action_id: id,
                    resource_name: "",
                  }))
                }
                onCreateNew={
                  canCreateCatalog ? createOperativeAction : undefined
                }
                disabled={creating || !form.component_id}
              />
              {errors.operative_action_id && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.operative_action_id}
                </p>
              )}
              {!form.component_id && (
                <p className="text-xs text-muted-foreground">
                  Selecciona o crea primero un componente estrategico.
                </p>
              )}
            </div>
          </>
        )}

        {hierarchyReady && (
          <div
            className="space-y-1"
            data-error={!!errors.resource_name || undefined}
          >
            <Label htmlFor="resource_name">Nombre del recurso POA *</Label>
            <Input
              id="resource_name"
              value={form.resource_name ?? ""}
              maxLength={500}
              autoComplete="off"
              placeholder="Escribe el nombre del nuevo recurso"
              aria-invalid={!!errors.resource_name}
              aria-describedby={
                errors.resource_name
                  ? "resource_name_error"
                  : "resource_name_hint"
              }
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  resource_name: event.target.value,
                }));
                setErrors((current) => ({
                  ...current,
                  resource_name: undefined,
                }));
              }}
              disabled={
                creating || !form.operative_action_id || !canCreateCatalog
              }
            />
            <p
              id="resource_name_hint"
              className="text-xs text-muted-foreground"
            >
              Se creará un recurso nuevo al guardar la línea; no hace falta
              agregarlo por separado.
            </p>
            {errors.resource_name && (
              <p
                id="resource_name_error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.resource_name}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ─── Sección 3: Territorio ─────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">
          3. Región / Territorio
        </h2>

        {territorySelectionEnabled ? (
          <StructuredTerritorySelector
            value={territoryAxes}
            onChange={(value) => {
              setTerritoryAxes(value);
              setTerritorySelectionError(undefined);
            }}
            disabled={creating}
            error={territorySelectionError}
          />
        ) : (
          <TerritorySelector
            value={form.territory_id || undefined}
            onChange={(val) =>
              setForm((f) => ({ ...f, territory_id: val ?? "" }))
            }
            mode="persisted"
            disabled={creating}
            showLabel={false}
          />
        )}
      </section>

      {/* ─── Sección 4: Clasificación ──────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">
          4. Clasificación
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Importancia */}
          <div className="space-y-1">
            <Label htmlFor="importance">Por su Importancia</Label>
            <select
              id="importance"
              value={form.importance ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, importance: e.target.value }))
              }
              className={SELECT_CLASS}
              disabled={creating}
            >
              <option value="">Seleccionar...</option>
              {IMPORTANCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Frecuencia */}
          <div className="space-y-1">
            <Label htmlFor="frequency">Por su Frecuencia</Label>
            <select
              id="frequency"
              value={form.frequency ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, frequency: e.target.value }))
              }
              className={SELECT_CLASS}
              disabled={creating}
            >
              <option value="">Seleccionar...</option>
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tipo de Recurso */}
        <div
          className="space-y-1"
          data-error={!!errors.budget_category_id || undefined}
        >
          <Label htmlFor="category">Tipo de Recurso *</Label>
          {categoriesLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <select
              id="category"
              value={form.budget_category_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, budget_category_id: e.target.value }));
                setErrors((prev) => ({
                  ...prev,
                  budget_category_id: undefined,
                }));
              }}
              className={`${SELECT_CLASS} ${errors.budget_category_id ? "border-destructive" : ""}`}
              disabled={creating}
            >
              <option value="">Seleccionar tipo de recurso...</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.code ? `${cat.code} — ${cat.name}` : cat.name}
                </option>
              ))}
            </select>
          )}
          {errors.budget_category_id && (
            <p className="text-xs text-destructive">
              {errors.budget_category_id}
            </p>
          )}
        </div>
      </section>

      {/* ─── Sección 5: Presupuesto ────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">
          5. Presupuesto
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Precio Unitario */}
          <div
            className="space-y-1"
            data-error={!!errors.unit_price || undefined}
          >
            <Label htmlFor="unit_price">P.U. (Precio Unitario) *</Label>
            <Input
              id="unit_price"
              type="number"
              min={0}
              step="0.01"
              value={form.unit_price}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  unit_price: normalizeDecimalInput(e.target.value),
                }));
                setBudgetError(undefined);
                setErrors((prev) => ({ ...prev, unit_price: undefined }));
              }}
              className={errors.unit_price ? "border-destructive" : ""}
              disabled={creating}
            />
            {errors.unit_price && (
              <p className="text-xs text-destructive">{errors.unit_price}</p>
            )}
          </div>

          {/* Cantidad */}
          <div
            className="space-y-1"
            data-error={!!errors.quantity || undefined}
          >
            <Label htmlFor="quantity">Q (Cantidad) *</Label>
            <Input
              id="quantity"
              type="number"
              min={0}
              step="0.01"
              value={form.quantity}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  quantity: normalizeDecimalInput(e.target.value),
                }));
                setBudgetError(undefined);
                setErrors((prev) => ({ ...prev, quantity: undefined }));
              }}
              className={errors.quantity ? "border-destructive" : ""}
              disabled={creating}
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">{errors.quantity}</p>
            )}
          </div>

          {/* Costo Total — solo lectura */}
          <div className="space-y-1">
            <Label htmlFor="total_cost">Costo Total (calculado)</Label>
            <Input
              id="total_cost"
              type="text"
              value={new Intl.NumberFormat("es-PE", {
                style: "currency",
                currency: "PEN",
                minimumFractionDigits: 2,
              }).format(totalCost)}
              readOnly
              className="bg-muted text-muted-foreground font-mono"
            />
          </div>
        </div>
        {canCreateCatalog && (
          <div
            className="space-y-2 rounded-md border p-4"
            role="status"
            aria-label="Vista previa del techo UO"
          >
            <p className="font-medium">
              Vista previa del techo UO
              {selectedOrgUnit ? ` — ${selectedOrgUnit.name}` : ""}
              {activeFiscalYear ? ` / ${activeFiscalYear.year}` : ""}
            </p>
            {!form.organizational_unit_id || !activeFiscalYear ? (
              <p>
                Selecciona una UO y un año fiscal activo para consultar el
                techo.
              </p>
            ) : ceilingSnapshot.status === "loading" ? (
              <p>Consultando techo UO...</p>
            ) : ceilingSnapshot.status === "error" ? (
              <p>
                No se pudo consultar el techo UO. La validación del servidor se
                mantiene al guardar.
              </p>
            ) : preview ? (
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt>Techo UO</dt>
                  <dd>
                    {preview.ceiling === null
                      ? "Sin techo configurado"
                      : formatPen(preview.ceiling)}
                  </dd>
                </div>
                <div>
                  <dt>Aprobado</dt>
                  <dd>{formatPen(preview.used)}</dd>
                </div>
                <div>
                  <dt>Disponible</dt>
                  <dd>
                    {preview.available === null
                      ? "No aplica (sin techo)"
                      : formatPen(preview.available)}
                  </dd>
                </div>
                <div>
                  <dt>Nuevo costo</dt>
                  <dd>{formatPen(totalCost)}</dd>
                </div>
                <div>
                  <dt>Saldo proyectado</dt>
                  <dd>
                    {preview.available === null
                      ? "No aplica (sin techo)"
                      : formatPen(preview.available - totalCost)}
                  </dd>
                </div>
              </dl>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Vista previa orientativa basada en el último corte de líneas
              aprobadas y cálculos aproximados del navegador. El servidor valida
              el techo vigente al guardar; esta vista no garantiza la aceptación
              del costo.
            </p>
          </div>
        )}
      </section>

      {/* ─── Acciones ──────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(ROUTES.BUDGET_PLANNING)}
          disabled={creating}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={
            creating ||
            !activeFiscalYear ||
            !hierarchyReady ||
            !canCreateCatalog
          }
        >
          {creating ? "Guardando..." : "Guardar línea POA"}
        </Button>
      </div>
      {createCatalog && canCreateCatalog && (
        <PlanningCatalogCreateDialog
          kind={createCatalog}
          planningType={form.planning_type}
          onClose={() => setCreateCatalog(null)}
          onCreated={(id, name, code) =>
            onCatalogCreated(createCatalog, id, name, code)
          }
        />
      )}
    </form>
  );
}
