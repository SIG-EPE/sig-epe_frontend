import type { FundingSourceAllocation } from "@/types/budget";

export interface FundingAssociationSelection {
  association_id: string;
  funding_source_id: string;
}

export interface FundingDraft {
  existing: FundingAssociationSelection[];
  added: string[];
}

export interface FundingMembershipChanges {
  add?: { funding_source_id: string }[];
  edit?: FundingAssociationSelection[];
}

// Un detalle incompleto no puede autorizar una edición de membresía.
export function seedFundingDraft(rows: Pick<FundingSourceAllocation, "id" | "funding_source_id">[]): FundingDraft | null {
  if (!Array.isArray(rows) || rows.some((row) => !row.id || !row.funding_source_id)) return null;
  const existing = rows.map((row) => ({ association_id: row.id, funding_source_id: row.funding_source_id }));
  if (new Set(existing.map((row) => row.association_id)).size !== existing.length ||
      new Set(existing.map((row) => row.funding_source_id)).size !== existing.length) return null;
  return { existing, added: [] };
}

export function buildFundingChanges(baseline: FundingDraft, draft: FundingDraft, activeIds: string[]): { changes: FundingMembershipChanges | null; error: string | null } {
  const original = new Map(baseline.existing.map((row) => [row.association_id, row.funding_source_id]));
  if (draft.existing.length !== original.size || draft.existing.some((row) => !original.has(row.association_id)) ||
      new Set(draft.existing.map((row) => row.association_id)).size !== original.size)
    return { changes: null, error: "No se pueden quitar asociaciones existentes. Recarga el detalle." };
  const targets = [...draft.existing.map((row) => row.funding_source_id), ...draft.added];
  if (targets.some((id) => !id || !activeIds.includes(id)))
    return { changes: null, error: "Selecciona una fuente activa del catálogo." };
  if (new Set(targets).size !== targets.length)
    return { changes: null, error: "Una fuente ya está asignada a esta línea." };
  const edit = draft.existing.filter((row) => original.get(row.association_id) !== row.funding_source_id);
  if (edit.length + draft.added.length > 10)
    return { changes: null, error: "Solo se admiten hasta diez cambios de fuentes por guardado." };
  if (!edit.length && !draft.added.length) return { changes: null, error: null };
  return { changes: {
    ...(draft.added.length ? { add: draft.added.map((funding_source_id) => ({ funding_source_id })) } : {}),
    ...(edit.length ? { edit } : {}),
  }, error: null };
}
