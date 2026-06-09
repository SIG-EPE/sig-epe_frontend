export const PLANNING_TYPE = {
  PROGRAMA: "PROGRAMA",
  PROYECTO: "PROYECTO",
  GESTION: "GESTION",
} as const;

export type PlanningType = (typeof PLANNING_TYPE)[keyof typeof PLANNING_TYPE];

export const PLANNING_TYPES = [
  PLANNING_TYPE.PROGRAMA,
  PLANNING_TYPE.PROYECTO,
  PLANNING_TYPE.GESTION,
] as const;

export const PLANNING_TYPE_LABELS: Record<PlanningType, string> = {
  [PLANNING_TYPE.PROGRAMA]: "Programa",
  [PLANNING_TYPE.PROYECTO]: "Proyecto",
  [PLANNING_TYPE.GESTION]: "Gestión",
};
