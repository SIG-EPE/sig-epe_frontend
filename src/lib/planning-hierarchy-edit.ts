import { PLANNING_TYPES } from "@/lib/planning-types";
import { ApiRequestError } from "@/lib/api-client";
import type { PlanningLineHierarchyInput } from "@/types/budget";

export function buildPlanningHierarchy(value: PlanningLineHierarchyInput): {
  hierarchy: PlanningLineHierarchyInput | null;
  errors: Partial<Record<keyof PlanningLineHierarchyInput, string>>;
} {
  const errors: Partial<Record<keyof PlanningLineHierarchyInput, string>> = {};
  for (const key of ["organizational_unit_id", "program_id", "component_id", "operative_action_id"] as const) {
    if (!value[key]) errors[key] = "Selecciona un valor vigente.";
  }
  if (!PLANNING_TYPES.includes(value.planning_type)) errors.planning_type = "Selecciona un tipo válido.";
  const name = value.resource_name.trim();
  if (!name || name.length > 500 || /[\u0000-\u001f\u007f]/.test(name))
    errors.resource_name = "Ingresa un nombre válido de hasta 500 caracteres.";
  return { hierarchy: Object.keys(errors).length ? null : { ...value, resource_name: name }, errors };
}

export function seedPlanningHierarchy(line: import("@/types/budget").PlanningLine): PlanningLineHierarchyInput {
  return {
    organizational_unit_id: line.organizational_unit_id ?? "",
    planning_type: line.planning_type,
    program_id: line.program_id ?? line.programId ?? line.program?.id ?? "",
    component_id: line.poaHierarchy?.component?.id ?? line.operativeAction?.component?.id ?? "",
    operative_action_id: line.operative_action_id ?? line.poaHierarchy?.action?.id ?? "",
    resource_name: line.resource?.name ?? line.poaHierarchy?.resource?.name ?? line.resource_description ?? "",
  };
}

export function hierarchyEditError(error: unknown, context?: { actionMove: boolean }): string {
  if (error instanceof ApiRequestError && error.status === 403) return "No tienes permiso para editar esta línea. Tus entradas se conservaron.";
  if (error instanceof ApiRequestError && error.status === 409 && context?.actionMove)
    return "No se pudo mover el recurso a otra acción: puede estar compartido o publicado, o la jerarquía cambió. Conservamos tus entradas; cierra y recarga el detalle antes de reintentar.";
  if (error instanceof ApiRequestError && error.status === 409) return "La línea o la jerarquía cambió. Conservamos tus entradas; cierra y recarga el detalle antes de reintentar.";
  if (error instanceof ApiRequestError && error.status === 500)
    return "La actualización aún no está disponible. Verifica que el esquema de auditoría esté listo; tus entradas se conservaron.";
  if (error instanceof ApiRequestError && (error.status === 400 || error.status === 500)) {
    const message = typeof error.body?.message === "string" ? error.body.message : "";
    if (/audit|schema|relation.*does not exist|hierarchy.*unavailable|42P01/i.test(message) || /AUDIT|SCHEMA|UNAVAILABLE/.test(error.body?.code ?? ""))
      return "La actualización aún no está disponible: falta verificar el esquema de auditoría. Tus entradas se conservaron.";
    if (error.status === 400) return "El servidor rechazó la jerarquía. Revisa las selecciones y el nombre; tus entradas se conservaron.";
  }
  return "No se pudo guardar la jerarquía. No se confirmó ningún cambio; tus entradas se conservaron.";
}
