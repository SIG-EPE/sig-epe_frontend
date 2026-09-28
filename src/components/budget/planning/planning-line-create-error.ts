import { ApiRequestError } from "@/lib/api-client";

const CREATE_ERROR_KIND = {
  CEILING: "ceiling",
  RESOURCE: "resource",
  OTHER: "other",
} as const;

const RESOURCE_MESSAGES = [
  "new_resource.action_id must match the selected operative_action_id",
  "new_resource.name must be a nonblank safe name of at most 500 characters",
  "new_resource is required for new planning lines",
  "El nombre del recurso es inválido",
  "La acción operativa seleccionada es inválida",
];

export function classifyPlanningLineCreateError(error: unknown) {
  if (!(error instanceof ApiRequestError) || error.status !== 400)
    return CREATE_ERROR_KIND.OTHER;
  const messages = Array.isArray(error.body.message)
    ? error.body.message
    : [error.body.message];
  if (
    error.body.code === "ORG_UNIT_CEILING_EXCEEDED" ||
    messages.some((message) =>
      /^El total de líneas aprobadas excede el techo presupuestal de la UO \(techo: [\d.]+, aprobado: [\d.]+, nuevo: [\d.]+\)$/.test(
        message,
      ),
    )
  )
    return CREATE_ERROR_KIND.CEILING;
  if (messages.some((message) => RESOURCE_MESSAGES.includes(message)))
    return CREATE_ERROR_KIND.RESOURCE;
  return CREATE_ERROR_KIND.OTHER;
}
