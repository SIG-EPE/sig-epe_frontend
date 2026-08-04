interface PlanningLineResourceFieldsInput {
  enabled: boolean;
  resourceId: string | null;
  legacyDescription: string;
}

interface PoaCatalogOption {
  fullCode: string;
  name: string;
}

export function buildPlanningLineResourceFields(
  input: PlanningLineResourceFieldsInput,
): { resource_id: string } | { resource_description: string } {
  if (input.enabled) {
    if (!input.resourceId) {
      throw new Error('Selecciona o crea un recurso POA.');
    }
    return { resource_id: input.resourceId };
  }
  return { resource_description: input.legacyDescription };
}

export function poaCatalogOptionLabel(option: PoaCatalogOption): string {
  return `${option.fullCode} — ${option.name}`;
}
