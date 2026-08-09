import { ROLE_CODE, type RoleCode } from "@/lib/constants";

export const GIOF_HELP_CONTEXT = {
  REQUEST: "request",
  PAYMENT: "payment",
  REXAN: "rexan",
} as const;

export type GiofHelpContext = (typeof GIOF_HELP_CONTEXT)[keyof typeof GIOF_HELP_CONTEXT];

export const GIOF_ASSIGNMENT_HELP = {
  title: "Guía de asignación GIOF",
  summary: "Responsables, filtros, bloqueos y etapas asignables en Revisión de solicitud, Cola de pagos y Rendición de anticipo.",
  href: "/help/giof-assignment",
  keywords: ["asignación", "GIOF", "rendición", "casilla", "solo lectura", "responsable", "En uso", "Falta constancia", "Falta referencia"],
} as const;

export interface GiofRoleGuide {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly points: readonly string[];
}

export const GIOF_ROLE_GUIDES: Readonly<Record<RoleCode, GiofRoleGuide>> = {
  [ROLE_CODE.GIOF_GESTOR]: {
    id: "role-gestor",
    title: "GIOF Gestor",
    description: "Trabaja únicamente sobre los elementos que tiene asignados.",
    points: [
      "Mi trabajo muestra tus asignaciones; Todo permite consultar el resto sin cambiar su responsable.",
      "Puedes editar un elemento asignado a ti cuando está disponible. Un elemento ajeno se abre en modo Solo lectura.",
      "En uso indica que otra persona está trabajando. Debes esperar a que termine o a que el bloqueo venza.",
      "Si observas un caso, conserva el mismo responsable. El solicitante corrige y, al reenviar, vuelve al mismo responsable.",
    ],
  },
  [ROLE_CODE.GIOF_MANAGER]: {
    id: "role-manager",
    title: "GIOF Manager",
    description: "Distribuye y redistribuye el trabajo operativo.",
    points: [
      "Usa Mi trabajo, Todo, Sin asignar o Por responsable para ubicar la carga de cada persona.",
      "Puede asignar o reasignar un elemento, o hasta 50 de la misma etapa. La operación masiva es todo-o-nada.",
      "La nota de asignación es opcional y la interfaz muestra los nombres de los responsables.",
      "Si otra persona está trabajando, En uso bloquea la asignación. Actualiza la cola y espera a que el trabajo quede disponible.",
      "Puede reasignar el seguimiento de un caso Observado cuando no está En uso.",
    ],
  },
  [ROLE_CODE.ADMIN_SISTEMA]: {
    id: "role-admin",
    title: "Administrador del Sistema",
    description: "Administra la plataforma, pero no distribuye trabajo GIOF.",
    points: [
      "El Administrador del Sistema no puede asignar ni reasignar trabajo GIOF.",
      "No debe aparecer la casilla de selección ni la acción Asignar / reasignar para este rol.",
    ],
  },
  [ROLE_CODE.SOLICITANTE_EPE]: {
    id: "role-requester",
    title: "Solicitante EPE",
    description: "Corrige y reenvía los casos observados.",
    points: ["La observación no cambia al responsable GIOF. Al reenviar la corrección, el caso regresa a la misma persona."],
  },
  [ROLE_CODE.AUDITOR_DIRECCION]: {
    id: "role-auditor",
    title: "Auditoría / Dirección",
    description: "Consulta el proceso sin administrar asignaciones.",
    points: ["La asignación se presenta como información de seguimiento; este rol no asigna ni reasigna trabajo GIOF."],
  },
};

export interface GiofStageGuide {
  readonly id: GiofHelpContext;
  readonly title: string;
  readonly target: string;
  readonly assignable: string;
  readonly notAssignable: string;
  readonly observation: string;
}

export const GIOF_STAGE_GUIDES: readonly GiofStageGuide[] = [
  {
    id: GIOF_HELP_CONTEXT.REQUEST,
    title: "Revisión de solicitud",
    target: "La solicitud original. La Rendición de anticipo se asigna en su propia etapa.",
    assignable: "En revisión es asignable.",
    notAssignable: "Cualquier otro estado y toda Rendición de anticipo.",
    observation: "Observada conserva al responsable; el solicitante corrige y, al reenviar, vuelve a la misma persona.",
  },
  {
    id: GIOF_HELP_CONTEXT.PAYMENT,
    title: "Cola de pagos",
    target: "La etapa de pago de la solicitud original.",
    assignable: "En gestión de pago, o Pagado con Falta constancia o Falta referencia.",
    notAssignable: "Pagado sin Datos pendientes no es asignable.",
    observation: "Esta etapa es independiente de Revisión de solicitud y Rendición de anticipo; puede tener otro responsable.",
  },
  {
    id: GIOF_HELP_CONTEXT.REXAN,
    title: "Rendición de anticipo",
    target: "La Rendición de anticipo vinculada, no el anticipo de origen.",
    assignable: "Rendición en preparación, En revisión, En validación u Observada. Una Observada con Faltan documentos mantiene seguimiento asignable.",
    notAssignable: "Rendida no tiene seguimiento asignable. Un anticipo sin Rendición de anticipo vinculada tampoco se asigna en esta etapa.",
    observation: "El GIOF Manager puede reasignar el seguimiento de una Observada cuando no está En uso.",
  },
];

export const GIOF_FLOW_EXAMPLE = [
  "Una solicitud de Anticipo entra en Revisión de solicitud y se asigna a una persona responsable.",
  "Al aprobarse, pasa a la Cola de pagos, que puede tener una persona responsable diferente.",
  "Cuando el anticipo queda Pagado, SIG-EPE crea una Rendición de anticipo vinculada para su preparación y revisión.",
  "Revisión de solicitud, Cola de pagos y Rendición de anticipo mantienen responsables independientes; asignar una etapa no cambia las otras dos.",
] as const;

export interface GiofTroubleshootingItem {
  readonly question: string;
  readonly answer: string;
}

export const GIOF_TROUBLESHOOTING: readonly GiofTroubleshootingItem[] = [
  { question: "¿Por qué no aparece la casilla de selección?", answer: "Solo el GIOF Manager ve la selección para asignar o reasignar. No aparece cuando la etapa o el estado no admite asignación." },
  { question: "¿Por qué solo aparece Ver?", answer: "El trabajo no está asignado a ti o está bloqueado. Puedes consultarlo en Solo lectura, pero no editarlo." },
  { question: "¿Por qué falló la asignación?", answer: "Algún elemento cambió de responsable o estado, dejó de admitir asignación o está En uso. En una operación masiva no se cambia ninguno: actualiza la cola y vuelve a seleccionar." },
  { question: "¿Qué significa En uso?", answer: "Otra persona está trabajando. Espera a que termine o a que el bloqueo venza antes de volver a intentar." },
  { question: "¿Por qué cambió el nombre del responsable?", answer: "Un GIOF Manager reasignó el trabajo. La cola muestra el nombre vigente y el historial conserva el cambio." },
  { question: "¿Quién puede reasignar?", answer: "Solo el GIOF Manager. El GIOF Gestor, el Administrador del Sistema, solicitantes y auditoría pueden leer la guía, pero no reasignan." },
  { question: "¿Qué pasa después de una observación?", answer: "El responsable se conserva mientras el solicitante corrige. Al reenviar, el caso vuelve a esa misma persona; un GIOF Manager puede reasignar el seguimiento cuando no está En uso." },
];

export function getGiofRoleGuide(roleCode?: string | null): GiofRoleGuide | null {
  return roleCode && roleCode in GIOF_ROLE_GUIDES
    ? GIOF_ROLE_GUIDES[roleCode as RoleCode]
    : null;
}

export function isGiofHelpContext(value?: string | null): value is GiofHelpContext {
  return Object.values(GIOF_HELP_CONTEXT).includes(value as GiofHelpContext);
}
