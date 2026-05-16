"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import {
  useActiveFiscalYear,
  useOrganizationalUnits,
  useBudgetPrograms,
  useBudgetCategories,
  useCreatePlanningLine,
  type CreatePlanningLineDto,
} from "@/hooks/use-budget";
import {
  useStrategicComponents,
  useOperativeActions,
} from "@/hooks/use-catalogs";
import { api } from "@/lib/api-client";
import { SearchSelectModal } from "@/components/ui/search-select-modal";
import { ComboboxCreate } from "@/components/ui/combobox-create";
import { TerritorySelector } from "@/components/shared/territory-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants";

// -------------------------------------------------------
// Zod schema
// -------------------------------------------------------

const PlanningLineSchema = z.object({
  organizational_unit_id: z.string().min(1, "La unidad orgánica es requerida"),
  planning_type: z.enum(["PROGRAMA", "PROYECTO", "GESTIÓN"], {
    errorMap: () => ({ message: "Selecciona un tipo válido" }),
  }),
  program_id: z.string().optional(),
  component_id: z.string().nullable().optional(),
  territory_id: z.string().optional(),
  operative_action_id: z.string().nullable().optional(),
  importance: z.string().optional(),
  frequency: z.string().optional(),
  budget_category_id: z.string().min(1, "El tipo de recurso es requerido"),
  resource_description: z.string().min(1, "La descripción del recurso es requerida"),
  unit_price: z
    .number({ invalid_type_error: "El precio unitario es requerido" })
    .min(0, "El precio unitario no puede ser negativo"),
  quantity: z
    .number({ invalid_type_error: "La cantidad es requerida" })
    .min(0, "La cantidad no puede ser negativa"),
});

type PlanningLineFormData = z.infer<typeof PlanningLineSchema>;

// -------------------------------------------------------
// Tipos UI helpers
// -------------------------------------------------------

const PLANNING_TYPE_LABELS: Record<string, string> = {
  PROGRAMA: "Programa",
  PROYECTO: "Proyecto",
  GESTIÓN: "Gestión",
};

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

const TEXTAREA_CLASS =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

// -------------------------------------------------------
// NewPlanningLineForm component
// -------------------------------------------------------

export function NewPlanningLineForm() {
  const router = useRouter();

  // Datos del backend
  const { data: activeFiscalYear, isLoading: fyLoading } = useActiveFiscalYear();
  const { data: orgUnits, isLoading: orgUnitsLoading } = useOrganizationalUnits();

  const { data: categories, isLoading: categoriesLoading } = useBudgetCategories();
  const { create, isLoading: creating } = useCreatePlanningLine();

  // Auth — no longer needed directly; api client reads from store internally

  // Estado del formulario
  const [form, setForm] = useState<PlanningLineFormData>({
    organizational_unit_id: "",
    planning_type: "PROGRAMA",
    program_id: "",
    component_id: null,
    territory_id: "",
    operative_action_id: null,
    importance: "",
    frequency: "",
    budget_category_id: "",
    resource_description: "",
    unit_price: 0,
    quantity: 0,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PlanningLineFormData, string>>>({});

  // Programas filtrados por planning_type
  const {
    data: programs,
    isLoading: programsLoading,
  } = useBudgetPrograms(form.planning_type);

  // Jerarquía: componentes y acciones operativas en cascada
  const { data: components, refetch: refetchComponents } = useStrategicComponents(form.program_id || null);
  const { data: operativeActions, refetch: refetchActions } = useOperativeActions(form.component_id ?? null);

  // Limpiar program_id (y jerarquía) al cambiar planning_type
  const handlePlanningTypeChange = (newType: string) => {
    setForm((f) => ({
      ...f,
      planning_type: newType as PlanningLineFormData["planning_type"],
      program_id: "",
      component_id: null,
      operative_action_id: null,
    }));
  };

  // Costo total calculado
  const totalCost = (form.unit_price || 0) * (form.quantity || 0);

  // Crear componente estratégico inline
  const createStrategicComponent = async (name: string) => {
    if (!form.program_id) {
      toast.error("Selecciona primero un programa antes de crear un componente.");
      throw new Error("No hay programa seleccionado");
    }
    const created = await api.post<{ id: string; name: string }>(
      "/catalogs/strategic-components",
      { name, program_id: form.program_id }
    );
    await refetchComponents();
    return created;
  };

  // Crear acción operativa inline
  const createOperativeAction = async (name: string) => {
    if (!form.component_id) {
      toast.error("Selecciona primero un componente estratégico.");
      throw new Error("No hay componente seleccionado");
    }
    const created = await api.post<{ id: string; name: string }>(
      "/catalogs/operative-actions",
      { name, component_id: form.component_id }
    );
    await refetchActions();
    return created;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeFiscalYear) {
      toast.error("No hay un año fiscal activo. Contacta al administrador.");
      return;
    }

    // Convertir vacíos a undefined para validación
    const toValidate = {
      ...form,
      program_id: form.program_id || undefined,
      component_id: form.component_id || undefined,
      territory_id: form.territory_id || undefined,
      operative_action_id: form.operative_action_id || undefined,
      importance: form.importance || undefined,
      frequency: form.frequency || undefined,
    };

    const parsed = PlanningLineSchema.safeParse(toValidate);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof PlanningLineFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof PlanningLineFormData;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      // Scroll al primer campo con error
      setTimeout(() => {
        document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setErrors({});

    try {
      const dto: CreatePlanningLineDto = {
        fiscal_year_id: activeFiscalYear.id,
        organizational_unit_id: parsed.data.organizational_unit_id,
        budget_category_id: parsed.data.budget_category_id,
        planning_type: parsed.data.planning_type,
        resource_description: parsed.data.resource_description,
        unit_price: parsed.data.unit_price,
        quantity: parsed.data.quantity,
        territory_id: parsed.data.territory_id || undefined,
        operative_action_id: parsed.data.operative_action_id || null,
        importance: parsed.data.importance,
        frequency: parsed.data.frequency,
        program_id: parsed.data.program_id || undefined,
      };

      await create(dto);
      toast.success("Línea POA creada exitosamente");
      router.push(ROUTES.BUDGET_PLANNING);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al crear línea POA"
      );
    }
  };

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Año fiscal activo — informativo */}
      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <span className="font-medium text-foreground">Año fiscal:</span>{" "}
          {fyLoading ? (
            <Skeleton className="inline-block h-4 w-16" />
          ) : activeFiscalYear ? (
            <span className="font-semibold">{activeFiscalYear.year} (Activo)</span>
          ) : (
            <span className="text-destructive">Sin año fiscal activo</span>
          )}
        </span>
      </div>

      {/* ─── Sección 1: Identificación ─────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">1. Identificación</h2>

        {/* Unidad Orgánica */}
        <div className="space-y-1" data-error={!!errors.organizational_unit_id || undefined}>
          <Label>Unidad Orgánica *</Label>
          {orgUnitsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <SearchSelectModal
              value={form.organizational_unit_id || null}
              placeholder="Seleccionar unidad orgánica..."
              displayValue={
                orgUnits?.find((u) => u.id === form.organizational_unit_id)?.name
              }
              title="Seleccionar Unidad Orgánica"
              items={(orgUnits ?? []).filter((u) => u.is_active)}
              getItemId={(u) => u.id}
              getItemLabel={(u) => u.name}
              getItemSubLabel={(u) => u.code ?? ""}
              searchPlaceholder="Buscar unidad orgánica..."
              onChange={(id) => {
                setForm((f) => ({ ...f, organizational_unit_id: id ?? "" }));
                setErrors((prev) => ({ ...prev, organizational_unit_id: undefined }));
              }}
              disabled={creating}
              hasError={!!errors.organizational_unit_id}
            />
          )}
          {errors.organizational_unit_id && (
            <p className="text-xs text-destructive">{errors.organizational_unit_id}</p>
          )}
        </div>

        {/* PROGRAMA / PROYECTO / GESTIÓN */}
        <div className="space-y-1" data-error={!!errors.planning_type || undefined}>
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
            {Object.entries(PLANNING_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.planning_type && (
            <p className="text-xs text-destructive">{errors.planning_type}</p>
          )}
        </div>

        {/* Nombre del Programa / Proyecto / Gestión */}
        <div className="space-y-1">
          <Label>
            Nombre del {PLANNING_TYPE_LABELS[form.planning_type]}
          </Label>
          {programsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <SearchSelectModal
              value={form.program_id || null}
              placeholder="Seleccionar (opcional)..."
              displayValue={
                programs?.find((p) => p.id === form.program_id)?.name
              }
              title={`Seleccionar ${PLANNING_TYPE_LABELS[form.planning_type]}`}
              items={programs?.filter((p) => p.is_active) ?? []}
              getItemId={(p) => p.id}
              getItemLabel={(p) => p.name}
              getItemSubLabel={(p) => p.planningType ?? ""}
              searchPlaceholder="Buscar programa/proyecto..."
              onChange={(id) => setForm((f) => ({
                ...f,
                program_id: id ?? "",
                component_id: null,
                operative_action_id: null,
              }))}
              disabled={creating}
              onClear
            />
          )}
        </div>
      </section>

      {/* ─── Sección 2: Jerarquía ──────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">2. Jerarquía</h2>

        {/* Componente Estratégico — siempre visible, deshabilitado sin programa */}
        <div className="space-y-1">
          <Label>Componente Estratégico</Label>
          <ComboboxCreate
            items={components ?? []}
            value={form.component_id ?? null}
            displayValue={components?.find((c) => c.id === form.component_id)?.name}
            placeholder="Buscar o agregar componente..."
            getItemId={(c) => c.id}
            getItemLabel={(c) => c.name}
            onChange={(id) => setForm((f) => ({ ...f, component_id: id, operative_action_id: null }))}
            onCreateNew={createStrategicComponent}
            disabled={creating || !form.program_id}
          />
          {!form.program_id && (
            <p className="text-xs text-muted-foreground">
              Selecciona primero un programa en la seccion anterior.
            </p>
          )}
        </div>

        {/* Acción Operativa — siempre visible, deshabilitada sin componente */}
        <div className="space-y-1">
          <Label>Acción Operativa</Label>
          <ComboboxCreate
            items={operativeActions ?? []}
            value={form.operative_action_id ?? null}
            displayValue={operativeActions?.find((a) => a.id === form.operative_action_id)?.name}
            placeholder="Buscar o agregar acción operativa..."
            getItemId={(a) => a.id}
            getItemLabel={(a) => a.name}
            onChange={(id) => setForm((f) => ({ ...f, operative_action_id: id }))}
            onCreateNew={createOperativeAction}
            disabled={creating || !form.component_id}
          />
          {!form.component_id && (
            <p className="text-xs text-muted-foreground">
              Selecciona o crea primero un componente estrategico.
            </p>
          )}
        </div>

        {/* Descripción del Recurso */}
        <div className="space-y-1" data-error={!!errors.resource_description || undefined}>
          <Label htmlFor="resource_description">Descripción del Recurso *</Label>
          <textarea
            id="resource_description"
            value={form.resource_description}
            onChange={(e) => {
              setForm((f) => ({ ...f, resource_description: e.target.value }));
              setErrors((prev) => ({ ...prev, resource_description: undefined }));
            }}
            rows={3}
            disabled={creating}
            className={`${TEXTAREA_CLASS} ${errors.resource_description ? "border-destructive" : ""}`}
            placeholder="Describe detalladamente el recurso a utilizar..."
          />
          {errors.resource_description && (
            <p className="text-xs text-destructive">{errors.resource_description}</p>
          )}
        </div>
      </section>

      {/* ─── Sección 3: Territorio ─────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">3. Región / Territorio</h2>

        <TerritorySelector
          value={form.territory_id || undefined}
          onChange={(val) => setForm((f) => ({ ...f, territory_id: val ?? "" }))}
          disabled={creating}
          showLabel={false}
        />
      </section>

      {/* ─── Sección 4: Clasificación ──────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">4. Clasificación</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Importancia */}
          <div className="space-y-1">
            <Label htmlFor="importance">Por su Importancia</Label>
            <select
              id="importance"
              value={form.importance ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, importance: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
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
        <div className="space-y-1" data-error={!!errors.budget_category_id || undefined}>
          <Label htmlFor="category">Tipo de Recurso *</Label>
          {categoriesLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <select
              id="category"
              value={form.budget_category_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, budget_category_id: e.target.value }));
                setErrors((prev) => ({ ...prev, budget_category_id: undefined }));
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
            <p className="text-xs text-destructive">{errors.budget_category_id}</p>
          )}
        </div>

      </section>

      {/* ─── Sección 5: Presupuesto ────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">5. Presupuesto</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Precio Unitario */}
          <div className="space-y-1" data-error={!!errors.unit_price || undefined}>
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
                  unit_price: parseFloat(e.target.value) || 0,
                }));
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
          <div className="space-y-1" data-error={!!errors.quantity || undefined}>
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
                  quantity: parseFloat(e.target.value) || 0,
                }));
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
        <Button type="submit" disabled={creating || !activeFiscalYear}>
          {creating ? "Guardando..." : "Guardar línea POA"}
        </Button>
      </div>
    </form>
  );
}
