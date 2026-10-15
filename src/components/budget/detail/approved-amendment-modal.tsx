"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError, api } from "@/lib/api-client";
import {
  APPROVED_FREQUENCY,
  APPROVED_IMPORTANCE,
  approvedAmendmentDistribution,
  buildApprovedAmendment,
  seedApprovedAmendment,
  type ApprovedAmendmentErrors,
  type ApprovedAmendmentFields,
} from "@/lib/approved-amendment";
import {
  useApprovedAmendment,
  type ApprovedAmendmentRevision,
  type ApprovedAmendmentWarning,
} from "@/hooks/use-approved-amendment";
import type { PlanningLine } from "@/types/budget";
import type { PlanningLineHierarchyInput } from "@/types/budget";
import { buildPlanningHierarchy, seedPlanningHierarchy } from "@/lib/planning-hierarchy-edit";
import { PLANNING_TYPE_LABELS } from "@/lib/planning-types";
import { useCreateBudgetCategory } from "@/hooks/use-catalogs";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_CODE } from "@/lib/constants";
import type { BudgetCategory } from "@/types/catalogs";
import type { FundingSource } from "@/types/catalogs";
import { FundingSourceForm } from "@/components/catalogs/funding-sources/funding-source-form";
import { buildFundingChanges, seedFundingDraft, type FundingDraft } from "@/lib/approved-funding";
import {
  PlanningHierarchyEditor,
  type HierarchyReviewLabels,
} from "./planning-hierarchy-editor";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const EXACT_DECIMALS_ERROR =
  "El detalle no contiene los decimales exactos de precio, cantidad y los doce meses. No se completarán meses faltantes ni se redondearán valores. Solicita la proyección decimal exacta del servidor.";
const CONFLICT_ERROR =
  "La línea cambió durante la lectura. Cierra y recarga el detalle antes de editar.";
const FUNDING_AUTHORITY_CONFLICT_ERROR =
  "No se puede sustituir la fuente de financiamiento porque no se puede verificar la compatibilidad con su autoridad de origen. Se conserva la fuente actual.";
const FUNDING_AUTHORITY_GROUP_ERROR =
  "La sustitución de una fuente no pudo validarse por compatibilidad con su autoridad de origen. Revisa los cambios de fuente; no se confirmó ningún cambio de la línea.";
const CATEGORY_FUNDING_AVAILABILITY_HELP =
  "La edición de tipo de recurso/financiamiento no está habilitada en esta revisión. Actualiza la revisión para comprobar su disponibilidad.";

function currentHierarchyLabels(line: PlanningLine): HierarchyReviewLabels {
  return {
    unit: line.organizationalUnit?.name ?? line.organizational_unit?.name,
    type: PLANNING_TYPE_LABELS[line.planning_type],
    program: line.program?.name ?? line.budget_program?.name,
    component:
      line.poaHierarchy?.component?.name ??
      line.operativeAction?.component?.name,
    action: line.poaHierarchy?.action?.name ?? line.operativeAction?.name,
    resource:
      line.resource?.name ??
      line.poaHierarchy?.resource?.name ??
      line.resource_description,
  };
}

const HIERARCHY_KEYS = ["organizational_unit_id", "planning_type", "program_id", "component_id", "operative_action_id", "resource_name"] as const;
function hierarchyChanged(a: PlanningLineHierarchyInput, b: PlanningLineHierarchyInput) {
  return HIERARCHY_KEYS.some((key) => a[key] !== b[key]);
}
function financeChanged(a: ApprovedAmendmentFields, b: ApprovedAmendmentFields) {
  return a.unit_price !== b.unit_price || a.quantity !== b.quantity ||
    a.importance !== b.importance || a.frequency !== b.frequency ||
    a.resource_description !== b.resource_description ||
    a.monthly.length !== b.monthly.length ||
    a.monthly.some((row, index) => row.month !== b.monthly[index]?.month || row.planned_amount !== b.monthly[index]?.planned_amount);
}

function fundingName(id: string, catalog: FundingSource[], line: PlanningLine | null): string {
  const source = catalog.find((item) => item.id === id);
  const association = (line?.fundingSources ?? line?.partners ?? []).find((item) => item.funding_source_id === id);
  return source?.name ?? association?.fundingSource?.name ?? id;
}

function FundingReview({ title, names }: { title: string; names: string[] }) {
  return <div role="group" aria-label={title} className="min-w-0 break-words rounded-md border p-3 text-sm">
    <p className="font-medium">{title}</p>
    <ul className="mt-2 list-disc pl-5">{names.length ? names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>) : <li>Sin fuentes asignadas</li>}</ul>
  </div>;
}

function HierarchyReview({
  title,
  labels,
}: {
  title: string;
  labels: HierarchyReviewLabels;
}) {
  return (
    <div
      role="group"
      aria-label={title}
      className="min-w-0 rounded-md border p-3"
    >
      <p className="font-medium">{title}</p>
      <ol className="mt-2 space-y-1 text-sm">
        {([
          ["Unidad", labels.unit],
          ["Tipo", labels.type],
          ["Programa", labels.program],
          ["Componente", labels.component],
          ["Acción", labels.action],
          ["Recurso", labels.resource],
        ] as const).map(([label, value]) => (
          <li
            key={label}
            className="min-w-0 break-words [overflow-wrap:anywhere]"
          >
            <span className="font-medium">{label}: </span>
            {value?.trim() || "Sin dato"}
          </li>
        ))}
      </ol>
    </div>
  );
}

function validRevision(
  value: { line_id: string; revision: string },
  id: string,
) {
  return (
    value.line_id === id &&
    /^(0|[1-9]\d{0,18})$/.test(value.revision) &&
    BigInt(value.revision) <= BigInt("9223372036854775806")
  );
}

async function readMatchingSnapshot(
  id: string,
  readRevision: (
    signal?: AbortSignal,
  ) => Promise<ApprovedAmendmentRevision>,
  readDetail: (signal?: AbortSignal) => Promise<PlanningLine>,
  signal: AbortSignal,
) {
  // Dos intentos como máximo; ninguna lectura previa del detalle autoriza la edición.
  for (let attempt = 0; attempt < 2; attempt++) {
    const first = await readRevision(signal);
    if (signal.aborted) throw new Error("aborted");
    if (!validRevision(first, id)) throw new Error("invalid-revision");
    const detail = await readDetail(signal);
    if (signal.aborted) throw new Error("aborted");
    if (detail?.id !== id || detail.status !== "APPROVED")
      throw new Error("invalid-detail");
    const second = await readRevision(signal);
    if (signal.aborted) throw new Error("aborted");
    if (!validRevision(second, id)) throw new Error("invalid-revision");
    if (first.revision === second.revision) {
      if (!seedApprovedAmendment(detail)) throw new Error("invalid-decimals");
      const categoryFundingReady =
        first.category_funding_edit_ready === true &&
        second.category_funding_edit_ready === true;
      return {
        line: detail,
        revision: second.revision,
        categoryReady: categoryFundingReady,
        fundingReady: categoryFundingReady,
      };
    }
  }
  throw new Error("conflict");
}

export function ApprovedAmendmentWarnings({
  warnings,
}: {
  warnings: ApprovedAmendmentWarning[];
}) {
  if (!warnings.length) return null;
  return (
    <Alert role="status">
      <AlertDescription>
        <strong>Advertencias financieras (no impiden el guardado)</strong>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${warning.scope}-${warning.month ?? warning.fiscalYear ?? "total"}-${index}`}
            >
              {warning.code === "UNKNOWN_VALUATION" &&
              warning.scope === "UNIT_YEAR" ? (
                <>
                  <span>
                    No se pudo comprobar el techo anual de la unidad: falta el
                    techo o una valoración completa en PEN. Los importes
                    mensuales se revisan por separado.
                  </span>{" "}
                  (año {warning.fiscalYear}).
                </>
              ) : (
                <>
                  {warning.status === "BREACH"
                    ? "Incumplimiento"
                    : warning.status === "UNKNOWN"
                      ? "Valoración desconocida"
                      : "Aviso"}
                  :{" "}
                  {warning.code === "BELOW_EXPOSURE"
                    ? "planificación por debajo de la exposición"
                    : warning.code === "CEILING_EXCEEDED"
                      ? "techo de la unidad excedido"
                      : warning.code === "PENDING_PROJECTED"
                        ? "compromisos proyectados pendientes"
                        : warning.code === "PENDING_PRESENT"
                          ? "compromisos pendientes"
                          : warning.code === "HISTORICAL_OVERRUN"
                            ? "exceso histórico"
                            : "valoración no disponible"}{" "}
                  (
                  {warning.scope === "MONTH"
                    ? `mes ${warning.month}`
                    : warning.scope === "UNIT_YEAR"
                      ? `año ${warning.fiscalYear}`
                      : "total"}
                  ).
                </>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

interface Props {
  line: PlanningLine;
  onClose: () => void;
  onSuccess: (warnings: ApprovedAmendmentWarning[]) => void;
  onCatalogRenamed?: (line: PlanningLine) => void;
}

interface FundingAuthorityConflict {
  edits: FundingDraft["existing"];
  associationId: string | null;
}

export function ApprovedAmendmentModal({ line, onClose, onSuccess, onCatalogRenamed }: Props) {
  const role = useAuthStore((state) => state.user?.role?.code);
  const { create: createCategory } = useCreateBudgetCategory();
  const { readRevision, readDetail, save, isSaving } = useApprovedAmendment(
    line.id,
  );
  const [fields, setFields] = useState<ApprovedAmendmentFields | null>(null);
  const [snapshotLine, setSnapshotLine] = useState<PlanningLine | null>(null);
  const [baselineFields, setBaselineFields] = useState<ApprovedAmendmentFields | null>(null);
  const [baselineHierarchy, setBaselineHierarchy] = useState<PlanningLineHierarchyInput | null>(null);
  const [hierarchyDraft, setHierarchyDraft] = useState<PlanningLineHierarchyInput | null>(null);
  const [hierarchyValid, setHierarchyValid] = useState(false);
  const [hierarchyLabels, setHierarchyLabels] = useState<HierarchyReviewLabels | null>(null);
  const [categoryReady, setCategoryReady] = useState(false);
  const [fundingReady, setFundingReady] = useState(false);
  const [fundingCatalog, setFundingCatalog] = useState<FundingSource[]>([]);
  const [fundingCatalogLoaded, setFundingCatalogLoaded] = useState(false);
  const [fundingCatalogLoading, setFundingCatalogLoading] = useState(false);
  const [baselineFunding, setBaselineFunding] = useState<FundingDraft | null>(null);
  const [fundingDraft, setFundingDraft] = useState<FundingDraft | null>(null);
  const [fundingChoice, setFundingChoice] = useState("");
  const [fundingAddOpen, setFundingAddOpen] = useState(false);
  const [fundingEditItem, setFundingEditItem] = useState<FundingSource | null>(null);
  const [fundingCatalogError, setFundingCatalogError] = useState<string | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [fundingAuthorityConflict, setFundingAuthorityConflict] = useState<FundingAuthorityConflict | null>(null);
  const [pendingFunding, setPendingFunding] = useState<string[] | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [categoryCatalogLoading, setCategoryCatalogLoading] = useState(false);
  const [baselineCategoryId, setBaselineCategoryId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const adding = useRef(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const [revision, setRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ApprovedAmendmentErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    line: PlanningLine;
    revision: string;
  } | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [pendingHierarchy, setPendingHierarchy] =
    useState<HierarchyReviewLabels | null>(null);
  const [pendingCategory, setPendingCategory] = useState<{ id: string; name: string } | null>(null);

  async function resolveConflict(current: number) {
    setConflictLoading(true);
    setSaveError(
      "La línea cambió. Tus cambios siguen aquí; revisa la versión actual antes de volver a guardar.",
    );
    try {
      const latest = await readMatchingSnapshot(
        line.id,
        readRevision,
        readDetail,
        new AbortController().signal,
      );
      if (generation.current !== current) return;
      setConflict(latest);
      setCategoryReady(latest.categoryReady);
      setFundingReady(latest.fundingReady);
    } catch {
      if (generation.current !== current) return;
      setSaveError(
        "No se pudo cargar el detalle y la revisión actual. Conservamos tus cambios; cierra y recarga o vuelve a intentar.",
      );
    } finally {
      if (generation.current === current) setConflictLoading(false);
    }
  }

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setFields(null);
    setSnapshotLine(null);
    setBaselineFields(null);
    setBaselineHierarchy(null);
    setHierarchyDraft(null);
    setHierarchyValid(false);
    setCategoryReady(false);
    setFundingReady(false);
    setFundingCatalog([]);
    setFundingCatalogLoaded(false);
    setFundingCatalogLoading(false);
    setBaselineFunding(null);
    setFundingDraft(null);
    setFundingChoice("");
    setFundingAddOpen(false);
    setFundingEditItem(null);
    setFundingCatalogError(null);
    setFundingError(null);
    setFundingAuthorityConflict(null);
    setPendingFunding(null);
    setCategories([]);
    setCatalogLoaded(false);
    setCategoryCatalogLoading(false);
    setBaselineCategoryId(null);
    setSelectedCategoryId(null);
    setCategoryAddOpen(false);
    setPendingCategory(null);
    setRevision(null);
    setLoadError(null);
    setConflict(null);
    setPendingHierarchy(null);
    setConflictLoading(false);
    setSaveError(null);
    setLoading(true);
    readMatchingSnapshot(line.id, readRevision, readDetail, controller.signal)
      .then((result) => {
        if (generation.current !== current || controller.signal.aborted) return;
        setSnapshotLine(result.line);
        setCategoryReady(result.categoryReady);
        setFundingReady(result.fundingReady);
        const funding = result.line.fundingSources ?? result.line.partners;
        if (Array.isArray(funding)) {
          const seeded = seedFundingDraft(funding);
          setBaselineFunding(seeded);
          setFundingDraft(seeded);
        }
        setBaselineCategoryId(result.line.budget_category_id ?? null);
        setSelectedCategoryId(result.line.budget_category_id ?? null);
        const financial = seedApprovedAmendment(result.line);
        setFields(financial);
        setBaselineFields(financial);
        setBaselineHierarchy(seedPlanningHierarchy(result.line));
        setHierarchyDraft(seedPlanningHierarchy(result.line));
        setRevision(result.revision);
      })
      .catch((error: unknown) => {
        if (generation.current !== current || controller.signal.aborted) return;
        setLoadError(
          error instanceof Error && error.message === "invalid-decimals"
            ? EXACT_DECIMALS_ERROR
            : error instanceof Error && error.message === "conflict"
              ? CONFLICT_ERROR
              : "No se pudo cargar el detalle y la revisión aprobada. Cierra y recarga antes de editar.",
        );
      })
      .finally(() => {
        if (generation.current === current && !controller.signal.aborted)
          setLoading(false);
      });
    return () => {
      generation.current++;
      controller.abort();
    };
    // Solo cambio de identidad: jamás resembrar los campos durante una edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]);

  useEffect(() => {
    if (!categoryReady || role !== ROLE_CODE.GIOF_MANAGER) return;
    const current = generation.current;
    const controller = new AbortController();
    setCategoryCatalogLoading(true);
    api.get<BudgetCategory[]>("/catalogs/budget-categories", { signal: controller.signal })
      .then((items) => {
        if (generation.current !== current || controller.signal.aborted) return;
        setCategories(items.filter((item) => item.is_active));
        setCatalogLoaded(true);
      })
      .catch(() => { if (generation.current === current && !controller.signal.aborted) setCatalogLoaded(false); })
      .finally(() => { if (generation.current === current && !controller.signal.aborted) setCategoryCatalogLoading(false); });
    return () => controller.abort();
  }, [categoryReady, role, line.id]);

  useEffect(() => {
    if ((role !== ROLE_CODE.GIOF_MANAGER && role !== ROLE_CODE.ADMIN_SISTEMA) || !baselineFunding) return;
    const current = generation.current;
    const controller = new AbortController();
    setFundingCatalogLoading(true);
    api.get<FundingSource[]>("/catalogs/funding-sources", { signal: controller.signal })
      .then((items) => {
        if (generation.current !== current || controller.signal.aborted) return;
        setFundingCatalog(items.filter((item) => item.is_active));
        setFundingCatalogLoaded(true);
      })
      .catch(() => { if (generation.current === current && !controller.signal.aborted) setFundingCatalogLoaded(false); })
      .finally(() => { if (generation.current === current && !controller.signal.aborted) setFundingCatalogLoading(false); });
    return () => controller.abort();
  }, [role, line.id, baselineFunding]);

  const canEditCategory = categoryReady && catalogLoaded && role === ROLE_CODE.GIOF_MANAGER && Boolean(baselineCategoryId);
  const categoryIntent = Boolean(selectedCategoryId && baselineCategoryId && selectedCategoryId !== baselineCategoryId);
  const changedCategory = categoryIntent && canEditCategory;
  const canEditFunding = fundingReady && fundingCatalogLoaded && role === ROLE_CODE.GIOF_MANAGER && Boolean(baselineFunding && fundingDraft);
  const canEditFundingCatalog = fundingCatalogLoaded && (role === ROLE_CODE.GIOF_MANAGER || role === ROLE_CODE.ADMIN_SISTEMA);

  async function refreshFundingCatalog(saved: FundingSource) {
    const current = generation.current;
    // El catálogo se confirma por separado; nunca resembrar el borrador de la línea.
    setFundingCatalog((items) => [...items.filter((item) => item.id !== saved.id), saved]);
    setFundingCatalogError(null);
    try {
      const items = await api.get<FundingSource[]>("/catalogs/funding-sources");
      if (generation.current !== current) return;
      setFundingCatalog(items.filter((item) => item.is_active));
    } catch {
      if (generation.current === current) setFundingCatalogError("La fuente se actualizó, pero no se pudo recargar el catálogo. Recarga al cerrar.");
    }
  }
  const fundingResult = baselineFunding && fundingDraft
    ? buildFundingChanges(baselineFunding, fundingDraft, fundingCatalog.map((item) => item.id))
    : null;
  const fundingIntent = Boolean(fundingDraft && baselineFunding && (fundingDraft.added.length || fundingDraft.existing.some((row, index) => row.funding_source_id !== baselineFunding.existing[index]?.funding_source_id)));

  function changeFundingSelection(associationId: string, sourceId: string) {
    setFundingDraft((draft) => draft && ({
      ...draft,
      existing: draft.existing.map((row) => row.association_id === associationId
        ? { ...row, funding_source_id: sourceId } : row),
    }));
    setFundingError(null);
    // Solo revertir la sustitución original retira su aviso; no declara válidos otros cambios.
    if (baselineFunding?.existing.find((row) => row.association_id === associationId)?.funding_source_id === sourceId) {
      setFundingAuthorityConflict((previous) => {
        if (!previous || !previous.edits.some((row) => row.association_id === associationId)) return previous;
        const edits = previous.edits.filter((row) => row.association_id !== associationId);
        return edits.length ? { ...previous, edits } : null;
      });
    }
  }

  async function addCategory() {
    if (!canEditCategory || !categoryAddOpen || adding.current || isSaving || conflict) return;
    const name = categoryName.trim();
    if (!name || name.length > 255) { setCategoryError("Ingresa un nombre de hasta 255 caracteres."); return; }
    if (categories.some((item) => item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setCategoryError("Ya existe un tipo de recurso con ese nombre.");
      return;
    }
    adding.current = true;
    setAddingCategory(true);
    setCategoryError(null);
    const current = generation.current;
    try {
      const created = await createCategory({ name });
      if (generation.current !== current) return;
      if (!created.id || !created.is_active) { setCategoryError("No se pudo seleccionar el nuevo tipo de recurso."); return; }
      setCategories((previous) => [...previous.filter((item) => item.id !== created.id), created]);
      setSelectedCategoryId(created.id);
      setCategoryAddOpen(false);
      setCategoryName("");
      toast.success("Tipo de recurso creado; guarda los cambios de la línea por separado.");
    } catch (error) {
      if (generation.current !== current) return;
      setCategoryError(error instanceof ApiRequestError && error.status === 403
        ? "No tienes permiso para crear tipos de recurso."
        : error instanceof ApiRequestError && error.status === 409
          ? "Ya existe un tipo de recurso con ese nombre."
          : "No se pudo crear el tipo de recurso. Tus cambios siguen aquí.");
    } finally {
      adding.current = false;
      if (generation.current === current) setAddingCategory(false);
    }
  }

  const hasCatalogResource = snapshotLine?.resource_id != null;
  const changedHierarchy = Boolean(hasCatalogResource && baselineHierarchy && hierarchyDraft && hierarchyChanged(baselineHierarchy, hierarchyDraft));
  const changedFinance = Boolean(fields && baselineFields && financeChanged(baselineFields, fields));
  const hasChanges = changedHierarchy || changedFinance || categoryIntent || fundingIntent;
  const footerHelper = loading
    ? "Comprobando revisión…"
    : !loadError && fields && revision !== null && !isSaving && !saveError &&
      !conflict && !conflictLoading && !fundingAuthorityConflict && !addingCategory && !categoryAddOpen &&
      !fundingAddOpen && !fundingEditItem && !hasChanges
      ? categoryCatalogLoading || fundingCatalogLoading
        ? "Cargando catálogos…"
        : "No hay cambios pendientes"
      : null;
  const validation =
    fields && revision !== null
      ? buildApprovedAmendment(fields, revision, hasCatalogResource)
      : null;
  const distribution = fields
    ? approvedAmendmentDistribution(fields.monthly, validation?.total ?? null)
    : null;
  const remaining = distribution?.remaining;
  const balance =
    remaining === null || remaining === undefined
      ? "Balance: No calculable (revisa precio, cantidad y los doce meses)"
      : remaining.startsWith("-")
        ? `Exceso distribuido: S/ ${remaining.slice(1)}`
        : remaining === "0.00"
          ? "Cuadrado: S/ 0.00 restante por repartir"
          : `Restante por repartir: S/ ${remaining}`;
  const field = (
    key: "unit_price" | "quantity" | "resource_description",
    label: string,
  ) =>
    fields && (
      <div className="space-y-1">
        <Label htmlFor={`amend-${key}`}>{label}</Label>
        {key === "resource_description" ? (
          <Textarea
            id={`amend-${key}`}
            maxLength={2000}
            value={fields[key]}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `amend-${key}-error` : undefined}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          />
        ) : (
          <Input
            id={`amend-${key}`}
            type="text"
            inputMode="decimal"
            value={fields[key]}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `amend-${key}-error` : undefined}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          />
        )}
        {errors[key] && (
          <p
            id={`amend-${key}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {errors[key]}
          </p>
        )}
      </div>
    );

  async function submit() {
    if (
      !fields ||
      revision === null ||
      isSaving ||
      saving.current ||
      conflict ||
      !snapshotLine ||
      loadError ||
      !hasChanges ||
      (categoryIntent && !canEditCategory) ||
      (fundingIntent && (!canEditFunding || !fundingResult?.changes || !!fundingResult.error)) ||
      adding.current ||
      categoryAddOpen ||
      fundingAddOpen ||
      !!fundingEditItem ||
      (changedCategory && (!canEditCategory || !categories.some((item) => item.id === selectedCategoryId))) ||
      (changedHierarchy && !hierarchyValid)
    )
      return;
    const hierarchy = changedHierarchy && hierarchyDraft ? buildPlanningHierarchy(hierarchyDraft).hierarchy : null;
    if (changedHierarchy && !hierarchy) return;
    const result = buildApprovedAmendment(fields, revision, hasCatalogResource, hierarchy ?? undefined,
      changedCategory && baselineCategoryId && selectedCategoryId ? { baselineId: baselineCategoryId, selectedId: selectedCategoryId } : undefined,
      fundingIntent ? fundingResult?.changes : undefined);
    setErrors(result.errors);
    if (!result.request) return;
    setPendingHierarchy(changedHierarchy ? hierarchyLabels : null);
    setPendingCategory(changedCategory && selectedCategoryId ? { id: selectedCategoryId, name: categories.find((item) => item.id === selectedCategoryId)?.name ?? "Sin dato" } : null);
    setPendingFunding(fundingIntent && fundingDraft ? [...fundingDraft.existing.map((row) => `${fundingName(row.funding_source_id, fundingCatalog, snapshotLine)} (${row.funding_source_id})`), ...fundingDraft.added.map((id) => `${fundingName(id, fundingCatalog, snapshotLine)} (${id})`)] : null);
    setSaveError(null);
    setFundingAuthorityConflict(null);
    saving.current = true;
    const current = generation.current;
    try {
      const updated = await save(result.request);
      if (generation.current !== current) return;
      toast.success("Presupuesto aprobado actualizado");
      onSuccess(updated.warnings);
    } catch (error) {
      if (generation.current !== current) return;
      if (
        error instanceof ApiRequestError &&
        error.status === 409 &&
        error.body?.code === "APPROVED_AMENDMENT_FUNDING_AUTHORITY_CONFLICT"
      ) {
        const edits = result.request.funding_membership_changes?.edit ?? [];
        // El código no identifica la asociación: una única EDIT permite ubicarla sin adivinar.
        setFundingAuthorityConflict({
          edits: edits.map((row) => ({ ...row })),
          associationId: edits.length === 1 ? edits[0].association_id : null,
        });
      } else if (
        error instanceof ApiRequestError &&
        error.status === 409 &&
        (error.body?.code === "APPROVED_AMENDMENT_CONFLICT" ||
          error.body?.code === "CONFLICT" ||
          error.body?.code === undefined)
      ) {
        await resolveConflict(current);
      } else if (error instanceof ApiRequestError && error.status === 403)
        setSaveError(
          "No tienes permiso para editar este presupuesto aprobado.",
        );
      else if (
        error instanceof ApiRequestError &&
        error.status === 503 &&
        error.body?.code === "CATEGORY_FUNDING_EDIT_UNAVAILABLE"
      ) {
        setCategoryReady(false);
        setFundingReady(false);
        setSaveError(
          "La edición de tipo de recurso y fuentes de financiamiento no está disponible. Conservamos tus cambios; cierra y recarga antes de volver a intentar. Los elementos creados en el catálogo permanecen creados por separado.",
        );
      } else if (error instanceof ApiRequestError && error.status === 400) {
        setSaveError(
          "El servidor rechazó los datos. Revisa los campos y vuelve a intentar.",
        );
      } else
        setSaveError(
          "No se pudo guardar. No se confirma ningún cambio; vuelve a intentar.",
        );
    } finally {
      saving.current = false;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent closeDisabled={isSaving} className="min-w-0 max-h-[90dvh] max-w-3xl">
        <DialogHeader className="pr-12">
          <DialogTitle>Editar presupuesto aprobado</DialogTitle>
          <DialogDescription>
            Edita el presupuesto o la jerarquía de esta línea. La identidad,
             ejecución permanecen sin cambios. Las fuentes solo cambian si se
             agregan o editan explícitamente. Las advertencias
            financieras son informativas.
          </DialogDescription>
        </DialogHeader>
        <DialogBody data-testid="amendment-body" className="min-w-0 max-w-full space-y-4 overflow-x-hidden pr-1 [overflow-wrap:anywhere]">
        {loading && <p role="status">Cargando detalle y revisión aprobada…</p>}
        {loadError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {loadError}{" "}
              <Button type="button" variant="outline" onClick={() => onClose()}>
                Cerrar y recargar
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!loading && !loadError && fields && revision !== null && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Revisión {revision} · {snapshotLine?.line_code ?? "Código no disponible"} ·{" "}
              {snapshotLine?.fiscalYear?.year ?? "Año fiscal sin dato"} ·{" "}
              {snapshotLine?.organizationalUnit?.name ?? "Unidad sin dato"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("unit_price", "Precio unitario (S/)")}
              {field("quantity", "Cantidad")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["importance", "frequency"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`amend-${key}`}>
                    {key === "importance" ? "Importancia" : "Frecuencia"}
                  </Label>
                  <select
                    id={`amend-${key}`}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={fields[key]}
                    aria-invalid={Boolean(errors[key])}
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                  >
                    <option value="">Seleccione</option>
                    {(key === "importance"
                      ? APPROVED_IMPORTANCE
                      : APPROVED_FREQUENCY
                    ).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors[key] && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors[key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {!hasCatalogResource &&
              field("resource_description", "Descripción libre del recurso")}
            {hasCatalogResource && (
              <p className="text-sm text-muted-foreground">
                Recurso de catálogo: {snapshotLine?.resource_description}. El nombre del catálogo se edita por separado.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="amend-budget-category">Tipo de recurso</Label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <select id="amend-budget-category" className="flex h-9 w-full min-w-0 max-w-full flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={!canEditCategory || isSaving || !!conflict || addingCategory || categoryAddOpen}
                  value={selectedCategoryId ?? ""}
                  onChange={(event) => setSelectedCategoryId(event.target.value)}>
                  {baselineCategoryId && !categories.some((item) => item.id === baselineCategoryId) && (
                    <option value={baselineCategoryId}>{snapshotLine?.budgetCategory?.name ?? snapshotLine?.budget_category?.name ?? "Tipo actual (no disponible)"}</option>
                  )}
                  {!baselineCategoryId && <option value="">Sin tipo asignado</option>}
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <Button type="button" variant="outline" className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal" disabled={!canEditCategory || isSaving || !!conflict || addingCategory}
                  onClick={() => { setCategoryError(null); setCategoryAddOpen(true); }}>Agregar tipo de recurso</Button>
              </div>
              {!categoryReady && <p className="text-sm text-muted-foreground">{CATEGORY_FUNDING_AVAILABILITY_HELP}</p>}
              {categoryReady && !catalogLoaded && <p className="text-sm text-muted-foreground">{categoryCatalogLoading ? "Cargando catálogo de tipos de recurso…" : "No se pudo cargar el catálogo de tipos de recurso."}</p>}
              {categoryAddOpen && (
                <Dialog open onOpenChange={(open) => { if (!open && !addingCategory) setCategoryAddOpen(false); }}>
                  <DialogContent className="max-w-md" closeDisabled={addingCategory}>
                    <DialogHeader><DialogTitle>Agregar tipo de recurso</DialogTitle><DialogDescription>Se crea en el catálogo por separado. Luego guarda los cambios de esta línea.</DialogDescription></DialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="new-budget-category">Nombre del tipo de recurso</Label>
                      <Input id="new-budget-category" maxLength={255} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
                      {categoryError && <p role="alert" className="text-sm text-destructive">{categoryError}</p>}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" disabled={addingCategory} onClick={() => setCategoryAddOpen(false)}>Cancelar</Button>
                      <Button type="button" disabled={addingCategory} onClick={() => void addCategory()}>{addingCategory ? "Creando…" : "Crear tipo de recurso"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <section className="min-w-0 w-full max-w-full space-y-3 rounded-md border p-3" aria-label="Fuentes de financiamiento aprobadas" aria-describedby={fundingAuthorityConflict ? "funding-authority-error" : undefined}>
              <h3 className="font-medium">Fuentes de financiamiento</h3>
              <p className="text-sm text-muted-foreground">Agregar o cambiar una fuente no modifica importes, porcentajes ni procedencia. No se pueden eliminar asociaciones aquí.</p>
              {fundingAuthorityConflict && <p id="funding-authority-error" role="alert" className="min-w-0 text-sm text-destructive">
                {fundingAuthorityConflict.associationId ? FUNDING_AUTHORITY_CONFLICT_ERROR : FUNDING_AUTHORITY_GROUP_ERROR}
              </p>}
              <div role="group" aria-label="Fuentes actuales" className="space-y-3">
                {(snapshotLine?.fundingSources ?? snapshotLine?.partners ?? []).length === 0 && <p className="text-sm">Sin fuentes asignadas</p>}
                {(snapshotLine?.fundingSources ?? snapshotLine?.partners ?? []).map((association) => {
                  const selected = fundingDraft?.existing.find((row) => row.association_id === association.id)?.funding_source_id ?? association.funding_source_id;
                  const originalName = fundingName(association.funding_source_id, fundingCatalog, snapshotLine);
                  const selectedSource = fundingCatalog.find((item) => item.id === selected);
                  const authorityInvalid = fundingAuthorityConflict?.associationId === association.id;
                  return <div key={association.id} className="grid min-w-0 w-full max-w-full gap-2 sm:grid-cols-2 sm:items-center">
                    <span className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">{originalName}</span>
                    <div className="min-w-0 w-full max-w-full space-y-1">
                      <Label className="block [overflow-wrap:anywhere]" htmlFor={`funding-edit-${association.id}`}>Cambiar fuente {originalName}</Label>
                      <select id={`funding-edit-${association.id}`} className="flex h-9 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm"
                        aria-invalid={authorityInvalid}
                        aria-describedby={authorityInvalid ? "funding-authority-error" : undefined}
                        disabled={!canEditFunding || isSaving || !!conflict || fundingAddOpen || !!fundingEditItem}
                        value={selected}
                        onChange={(event) => changeFundingSelection(association.id, event.target.value)}>
                        {!fundingCatalog.some((item) => item.id === selected) && <option value={selected}>{fundingName(selected, fundingCatalog, snapshotLine)} (actual)</option>}
                        {fundingCatalog.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                      </select>
                      {selected !== association.funding_source_id && <Button type="button" variant="outline"
                        className="h-auto min-h-9 min-w-0 w-full max-w-full whitespace-normal sm:w-auto"
                        aria-label={`Deshacer cambio de fuente ${originalName}`}
                        disabled={!canEditFunding || isSaving || !!conflict || fundingAddOpen || !!fundingEditItem}
                        onClick={() => changeFundingSelection(association.id, association.funding_source_id)}>Deshacer cambio de fuente</Button>}
                      {canEditFundingCatalog && selectedSource && <Button type="button" variant="outline"
                        className="h-auto min-h-9 min-w-0 w-full max-w-full whitespace-normal sm:w-auto"
                        aria-label={`Editar fuente ${selectedSource.name}`} title={selectedSource.name}
                        disabled={isSaving || !!conflict || fundingAddOpen || !!fundingEditItem}
                        onClick={() => setFundingEditItem(selectedSource)}>Editar fuente</Button>}
                      {selectedSource && <p className="min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{selectedSource.code} · {selectedSource.name} · {selectedSource.fundingSourceType?.name ?? "Tipo no disponible"}</p>}
                    </div>
                  </div>;
                })}
              </div>
              {fundingDraft && fundingDraft.added.length > 0 && <div role="group" aria-label="Fuentes por agregar" className="min-w-0 w-full max-w-full space-y-2 text-sm">
                {fundingDraft.added.map((id) => <div key={id} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">Por agregar: {fundingName(id, fundingCatalog, snapshotLine)}</span>
                  <Button type="button" variant="outline" className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal"
                    aria-label={`Quitar de la lista ${fundingName(id, fundingCatalog, snapshotLine)}`}
                    disabled={!canEditFunding || isSaving || !!conflict || fundingAddOpen || !!fundingEditItem}
                    onClick={() => { setFundingDraft((draft) => draft && ({ ...draft, added: draft.added.filter((sourceId) => sourceId !== id) })); setFundingError(null); }}>Quitar de la lista</Button>
                </div>)}
              </div>}
              <div className="grid min-w-0 w-full max-w-full gap-2 sm:grid-cols-2 sm:items-end">
                <div className="min-w-0 w-full max-w-full space-y-1 sm:col-span-2">
                  <Label htmlFor="funding-add-choice">Añadir fuente</Label>
                  <select id="funding-add-choice" className="flex h-9 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm" value={fundingChoice}
                    disabled={!canEditFunding || isSaving || !!conflict || fundingAddOpen || !!fundingEditItem}
                    onChange={(event) => { setFundingChoice(event.target.value); setFundingError(null); }}>
                    <option value="">Selecciona una fuente activa</option>
                    {fundingCatalog.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                  </select>
                </div>
                  <Button type="button" variant="outline" className="h-auto min-h-9 min-w-0 w-full max-w-full whitespace-normal" disabled={!canEditFunding || !fundingChoice || isSaving || !!conflict || fundingAddOpen || !!fundingEditItem}
                  onClick={() => { if (!baselineFunding || !fundingDraft) return; const next = { ...fundingDraft, added: [...fundingDraft.added, fundingChoice] }; const check = buildFundingChanges(baselineFunding, next, fundingCatalog.map((item) => item.id)); if (check.error) { setFundingError(check.error); return; } setFundingDraft(next); setFundingChoice(""); setFundingError(null); }}>Añadir a la lista</Button>
                <Button type="button" variant="outline" className="h-auto min-h-9 min-w-0 w-full max-w-full whitespace-normal" disabled={!canEditFunding || isSaving || !!conflict || fundingAddOpen || !!fundingEditItem}
                  onClick={() => setFundingAddOpen(true)}>Agregar fuente</Button>
              </div>
              {!fundingReady && <p className="text-sm text-muted-foreground">{CATEGORY_FUNDING_AVAILABILITY_HELP}</p>}
              {fundingReady && !baselineFunding && <p className="text-sm text-muted-foreground">El detalle no incluye asociaciones verificables. Recarga antes de editar fuentes.</p>}
              {fundingReady && baselineFunding && !fundingCatalogLoaded && <p className="text-sm text-muted-foreground">{fundingCatalogLoading ? "Cargando catálogo de fuentes…" : "No se pudo cargar el catálogo de fuentes."}</p>}
              {(fundingError || fundingResult?.error) && <p role="alert" className="text-sm text-destructive">{fundingError ?? fundingResult?.error}</p>}
              {fundingCatalogError && <p role="alert" className="text-sm text-destructive">{fundingCatalogError}</p>}
              {fundingEditItem && canEditFundingCatalog && <Dialog open onOpenChange={(open) => { if (!open) setFundingEditItem(null); }}>
                <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
                  <DialogHeader><DialogTitle>Editar fuente de financiamiento</DialogTitle><DialogDescription>El catálogo se actualiza por separado. Los cambios pendientes de esta línea solo se envían con Guardar cambios fuera de este formulario.</DialogDescription></DialogHeader>
                  <FundingSourceForm key={fundingEditItem.id} item={fundingEditItem} onClose={() => setFundingEditItem(null)} onSuccess={(saved) => { void refreshFundingCatalog(saved); }} />
                </DialogContent>
              </Dialog>}
              {fundingAddOpen && <Dialog open onOpenChange={(open) => { if (!open) setFundingAddOpen(false); }}>
                <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
                  <DialogHeader><DialogTitle>Agregar fuente de financiamiento</DialogTitle><DialogDescription>Se crea en el catálogo por separado. La línea solo cambia al pulsar Guardar cambios fuera de este formulario.</DialogDescription></DialogHeader>
                  <FundingSourceForm onClose={() => setFundingAddOpen(false)} onSuccess={(created) => {
                    if (!created.id || !created.is_active || !baselineFunding || !fundingDraft) { setFundingError("La fuente creada no está activa; recarga el catálogo."); return; }
                    setFundingCatalog((items) => [...items.filter((item) => item.id !== created.id), created]);
                    const next = { ...fundingDraft, added: [...fundingDraft.added, created.id] };
                    const check = buildFundingChanges(baselineFunding, next, [...fundingCatalog.map((item) => item.id), created.id]);
                    if (check.error) setFundingError(check.error);
                    else { setFundingDraft(next); setFundingError(null); }
                  }} />
                </DialogContent>
              </Dialog>}
            </section>
            {snapshotLine && (
              <PlanningHierarchyEditor
                line={snapshotLine}
                draft={hierarchyDraft ?? undefined}
                onDraftChange={setHierarchyDraft}
                onValidationChange={(valid, labels) => { setHierarchyValid(valid); setHierarchyLabels(labels); }}
                onNameRenamed={(level, id, name) => {
                  if (level === "resource" && id === snapshotLine.resource_id) {
                    setBaselineHierarchy((previous) => previous && ({ ...previous, resource_name: name }));
                    setHierarchyDraft((previous) => previous && ({ ...previous, resource_name: name }));
                  }
                }}
                onCatalogRenamed={async () => {
                  try {
                    const fresh = await api.get<PlanningLine>(`/budget/planning-lines/${line.id}`);
                    if (fresh.id === line.id) setSnapshotLine((previous) => previous && ({
                      ...previous,
                      organizationalUnit: fresh.organizationalUnit,
                      program: fresh.program,
                      poaHierarchy: fresh.poaHierarchy,
                      resource: fresh.resource,
                      resource_description: fresh.resource_description,
                    }));
                    if (fresh.id === line.id) onCatalogRenamed?.(fresh);
                  } catch {
                    toast.error("El nombre cambió, pero no se pudo actualizar el detalle. Recarga al cerrar.");
                  }
                }}
                onSaved={() => {}}
                disabled={
                  isSaving ||
                  !!conflict ||
                  conflictLoading ||
                  Boolean(saveError?.includes("No se pudo cargar el detalle"))
                }
              />
            )}
            <fieldset className="space-y-3">
              <legend className="font-medium">
                Programación de los doce meses (S/)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.monthly.map((entry, index) => (
                  <div key={entry.month} className="space-y-1">
                    <Label htmlFor={`amend-month-${entry.month}`}>
                      {MONTHS[entry.month - 1]}
                    </Label>
                    <Input
                      id={`amend-month-${entry.month}`}
                      type="text"
                      inputMode="decimal"
                      value={entry.planned_amount}
                      aria-invalid={Boolean(errors.monthly)}
                      onChange={(e) =>
                        setFields({
                          ...fields,
                          monthly: fields.monthly.map((row, i) =>
                            i === index
                              ? { ...row, planned_amount: e.target.value }
                              : row,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              {errors.monthly && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.monthly}
                </p>
              )}
            </fieldset>
            {conflict && (
              <Alert role="alert">
                <AlertDescription>
                  La versión actual es {conflict.revision}; total actual S/{" "}
                  {conflict.line.total_cost}, precio {conflict.line.unit_price},
                  cantidad {conflict.line.quantity}. Tus entradas no se
                  reemplazaron. Revisa el detalle actualizado y confirma
                  expresamente si deseas enviar tus valores sobre esta revisión.
                  <p>
                    Importancia actual: {conflict.line.importance ?? "Sin dato"}
                    . Frecuencia actual: {conflict.line.frequency ?? "Sin dato"}
                    . Descripción actual: {conflict.line.resource_description}.
                  </p>
                  <p>
                    Meses actuales:{" "}
                    {(
                      conflict.line.monthlyDistribution ??
                      conflict.line.monthly_distribution ??
                      []
                    )
                      .map(
                        (row) =>
                          `${MONTHS[row.month - 1]}: ${row.monthly_programmed_decimal ?? "sin decimal exacto"}`,
                      )
                      .join(" · ") || "Sin programación disponible"}
                    .
                  </p>{" "}
                  <div className="my-3 grid min-w-0 gap-3 sm:grid-cols-2">
                    <div role="group" aria-label="Tipo de recurso actual" className="min-w-0 break-words rounded-md border p-3 text-sm">Tipo de recurso actual: {conflict.line.budgetCategory?.name ?? conflict.line.budget_category?.name ?? "Sin dato"} ({conflict.line.budget_category_id ?? "Sin ID"})</div>
                    {pendingCategory && <div role="group" aria-label="Tipo de recurso que intentaste guardar" className="min-w-0 break-words rounded-md border p-3 text-sm">Tipo de recurso que intentaste guardar: {pendingCategory.name} ({pendingCategory.id})</div>}
                    {pendingFunding && <>
                      <FundingReview title={`Fuentes actuales de la revisión ${conflict.revision}`} names={(conflict.line.fundingSources ?? conflict.line.partners ?? []).map((row) => `${fundingName(row.funding_source_id, fundingCatalog, conflict.line)} (${row.funding_source_id})`)} />
                      <FundingReview title="Fuentes que intentaste guardar" names={pendingFunding} />
                    </>}
                    <HierarchyReview
                      title={`Jerarquía actual de la revisión ${conflict.revision}`}
                      labels={currentHierarchyLabels(conflict.line)}
                    />
                    {pendingHierarchy && (
                      <HierarchyReview
                        title="Jerarquía que intentaste guardar"
                        labels={pendingHierarchy}
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRevision(conflict.revision);
                      setConflict(null);
                      setSaveError(null);
                    }}
                  >
                    Usar revisión actual y conservar mis entradas
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            )}
          </div>
        )}
        </DialogBody>
        <DialogFooter className="min-w-0 max-w-full flex-col flex-wrap gap-3 sm:items-center">
          {!loading && !loadError && fields && revision !== null && (
            <div
              className="min-w-0 w-full flex-1 space-y-1 text-left text-xs [overflow-wrap:anywhere] sm:w-auto"
              aria-label="Resumen de distribución financiera"
            >
              <p>
                Total derivado (precio × cantidad):{" "}
                {validation?.total !== null && validation?.total !== undefined
                  ? `S/ ${validation.total}`
                  : "No calculable"}
              </p>
              <p>
                Distribuido en 12 meses:{" "}
                {distribution?.distributed !== null && distribution?.distributed !== undefined
                  ? `S/ ${distribution.distributed}`
                  : "No calculable"}
              </p>
              <p aria-live="polite" aria-atomic="true" className="font-medium">
                {balance}
              </p>
            </div>
          )}
          {footerHelper && (
            <p
              id="amendment-footer-helper"
              role="status"
              className="min-w-0 text-left text-sm text-muted-foreground"
            >
              {footerHelper}
            </p>
          )}
          <div className="flex min-w-0 max-w-full flex-wrap justify-end gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal"
              disabled={isSaving}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              aria-describedby={footerHelper ? "amendment-footer-helper" : undefined}
              className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal"
              disabled={
                loading ||
                !!loadError ||
                !fields ||
                revision === null ||
                isSaving ||
                addingCategory ||
                categoryAddOpen ||
                fundingAddOpen ||
                !!fundingEditItem ||
                conflictLoading ||
                !!conflict ||
                !hasChanges ||
                (categoryIntent && !canEditCategory) ||
                (fundingIntent && (!canEditFunding || !fundingResult?.changes || !!fundingResult.error)) ||
                (changedHierarchy && !hierarchyValid) ||
                Boolean(saveError?.includes("No se pudo cargar el detalle")) ||
                Boolean(saveError?.includes("La línea ya no está aprobada")) ||
                Boolean(saveError?.includes("No tienes permiso"))
              }
              onClick={() => void submit()}
            >
              {isSaving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
