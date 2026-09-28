interface PlanningLineResourceFieldsInput {
  actionId: string | null;
  name: string;
}

interface PoaCatalogOption {
  fullCode: string;
  name: string;
}

export function buildPlanningLineResourceFields(
  input: PlanningLineResourceFieldsInput,
): {
  new_resource: { name: string; action_id: string };
} {
  const name = input.name.trim();
  if (
    !input.actionId ||
    !name ||
    name.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw new Error(
      "Selecciona una acción operativa e ingresa un nombre válido (máximo 500 caracteres).",
    );
  }
  return { new_resource: { name, action_id: input.actionId } };
}

export function poaCatalogOptionLabel(option: PoaCatalogOption): string {
  return `${option.fullCode} — ${option.name}`;
}
