import type { PoaHierarchyData } from "@/types/catalogs";

export const POA_STATUS_FILTER = {
  ALL: "all",
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type PoaStatusFilter = (typeof POA_STATUS_FILTER)[keyof typeof POA_STATUS_FILTER];

export interface PoaHierarchyFilters {
  search: string;
  status: PoaStatusFilter;
  programId: string;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");
}

function matchesSearch(name: string, code: string, search: string): boolean {
  const normalizedSearch = normalize(search);
  if (!normalizedSearch) return true;
  return code.toLocaleLowerCase("es") === normalizedSearch || normalize(name).includes(normalizedSearch);
}

function matchesStatus(isActive: boolean, status: PoaStatusFilter): boolean {
  if (status === POA_STATUS_FILTER.ALL) return true;
  return status === POA_STATUS_FILTER.ACTIVE ? isActive : !isActive;
}

export function filterPoaHierarchy(
  data: PoaHierarchyData,
  filters: PoaHierarchyFilters,
): PoaHierarchyData {
  const allowedProgramIds = new Set(
    data.programs
      .filter((program) => filters.programId === "all" || program.id === filters.programId)
      .map((program) => program.id),
  );
  const candidateComponents = data.components.filter((node) =>
    allowedProgramIds.has(node.programId) &&
    matchesStatus(node.isActive, filters.status) &&
    matchesSearch(node.name, node.fullCode, filters.search),
  );
  const allowedComponentIds = new Set(data.components
    .filter((node) => allowedProgramIds.has(node.programId))
    .map((node) => node.id));
  const candidateActions = data.actions.filter((node) =>
    allowedComponentIds.has(node.componentId) &&
    matchesStatus(node.isActive, filters.status) &&
    matchesSearch(node.name, node.fullCode, filters.search),
  );
  const allowedActionIds = new Set(data.actions
    .filter((node) => allowedComponentIds.has(node.componentId))
    .map((node) => node.id));
  const candidateResources = data.resources.filter((node) =>
    allowedActionIds.has(node.actionId) &&
    matchesStatus(node.isActive, filters.status) &&
    matchesSearch(node.name, node.fullCode, filters.search),
  );
  const candidatePrograms = data.programs.filter((program) =>
    allowedProgramIds.has(program.id) &&
    matchesStatus(program.is_active, filters.status) &&
    matchesSearch(program.name, program.code, filters.search),
  );

  const actionIds = new Set(candidateActions.map((node) => node.id));
  candidateResources.forEach((node) => actionIds.add(node.actionId));
  const actions = data.actions.filter((node) => actionIds.has(node.id));

  const componentIds = new Set(candidateComponents.map((node) => node.id));
  actions.forEach((node) => componentIds.add(node.componentId));
  const components = data.components.filter((node) => componentIds.has(node.id));

  const programIds = new Set(candidatePrograms.map((node) => node.id));
  components.forEach((node) => programIds.add(node.programId));

  return {
    programs: data.programs.filter((program) => programIds.has(program.id)),
    components,
    actions,
    resources: candidateResources,
  };
}
