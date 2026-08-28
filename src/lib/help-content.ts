import { GIOF_ASSIGNMENT_HELP } from "@/lib/giof-assignment-help";
import type { AppRoute } from "@/lib/constants";

export const FAQ_CATEGORIES = {
  ACCESS: "Acceso",
  REQUESTS: "Solicitudes",
  DOCUMENTS: "Documentos",
  PAYMENTS_AND_RENDITIONS: "Pagos y rendiciones",
  NOTIFICATIONS: "Notificaciones",
  GIOF_WORK: "Asignación GIOF",
} as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[keyof typeof FAQ_CATEGORIES];

export interface FaqItem {
  readonly id: string;
  readonly category: FaqCategory;
  readonly question: string;
  readonly answer: string;
  readonly keywords: readonly string[];
  readonly href?: AppRoute;
  readonly linkLabel?: string;
}

export const FAQ_ITEMS = [
  {
    id: "sso-institucional",
    category: FAQ_CATEGORIES.ACCESS,
    question: "¿Cómo ingreso desde la plataforma de Enseña Perú?",
    answer: "En Enseña Perú, selecciona el enlace de ingreso a SIG-EPE. El acceso automático desde Enseña Perú te llevará a la página de inicio.",
    keywords: ["SSO institucional", "inicio de sesión", "acceso automático", "portal institucional"],
  },
  {
    id: "sso-no-disponible",
    category: FAQ_CATEGORIES.ACCESS,
    question: "¿Qué hago si no puedo ingresar automáticamente?",
    answer: "Regresa a Enseña Perú y vuelve a seleccionar el enlace de ingreso. Si no funciona, ingresa con tu correo y contraseña. Si tu cuenta no está activa, pide ayuda al administrador.",
    keywords: ["SSO", "enlace expirado", "login manual", "usuario inactivo"],
  },
  {
    id: "tipos-solicitud",
    category: FAQ_CATEGORIES.REQUESTS,
    question: "¿Qué solicitudes puedo realizar?",
    answer: "Puedes realizar un Anticipo, un Pago a Proveedor o un Reembolso. Después de pagar un Anticipo, el sistema crea una Rendición de anticipo; esta no se crea desde Nueva solicitud.",
    keywords: ["anticipo", "proveedor", "reembolso", "rendición"],
  },
  {
    id: "crear-enviar-solicitud",
    category: FAQ_CATEGORIES.REQUESTS,
    question: "¿Cómo creo y envío una solicitud?",
    answer: "En Mis Solicitudes, selecciona Nueva solicitud. Elige el tipo, completa los datos y las líneas del Plan Operativo Anual (POA), guarda el borrador, adjunta los documentos solicitados y envía la solicitud a revisión.",
    keywords: ["nueva solicitud", "borrador", "enviar", "línea POA"],
  },
  {
    id: "estados-solicitud",
    category: FAQ_CATEGORIES.REQUESTS,
    question: "¿Qué significa el estado de mi solicitud?",
    answer: "Borrador significa que aún la estás preparando. Enviada a revisión o En validación significa que la están evaluando. Observada indica que debes corregirla. Aprobada · pendiente de pago significa que fue aprobada para pagar. Pagada confirma el pago. Rechazada, Cerrada o Anulada indican que el proceso terminó.",
    keywords: ["borrador", "aprobada", "pagada", "rechazada", "anulada"],
  },
  {
    id: "editar-cancelar-solicitud",
    category: FAQ_CATEGORIES.REQUESTS,
    question: "¿Cuándo puedo cambiar o cancelar una solicitud?",
    answer: "Puedes cambiar una solicitud cuando está en Borrador u Observada. En el formulario, el botón Cancelar solo regresa al listado; no anula una solicitud que ya enviaste.",
    keywords: ["editar", "cancelar formulario", "anular", "observada"],
  },
  {
    id: "adjuntar-pxq",
    category: FAQ_CATEGORIES.DOCUMENTS,
    question: "¿Cuándo debo adjuntar un archivo PxQ (presupuesto por cantidad)?",
    answer: "PXQ significa presupuesto por cantidad y es el único documento obligatorio para avanzar una solicitud. Un único PXQ activo asociado a la solicitud es suficiente, ya sea general o vinculado a cualquiera de sus líneas POA.",
    keywords: ["excel", "anticipo", "línea POA", "presupuesto por cantidad"],
  },
  {
    id: "documentos-por-tipo",
    category: FAQ_CATEGORIES.DOCUMENTS,
    question: "¿Qué documentos necesito según mi solicitud?",
    answer: "Para enviar, aprobar y pagar una solicitud, el único documento obligatorio es un PXQ activo asociado a la solicitud. Un solo PXQ es suficiente aunque pertenezca a cualquiera de sus líneas POA; los comprobantes, contratos, informes y otros sustentos son opcionales en esta etapa.",
    keywords: ["factura", "recibo por honorarios", "informe de rendición", "sustento"],
  },
  {
    id: "formatos-archivos",
    category: FAQ_CATEGORIES.DOCUMENTS,
    question: "¿Qué archivos puedo adjuntar?",
    answer: "Puedes adjuntar documentos PDF o imágenes JPG y PNG. Usa Excel solo cuando se solicite un PxQ o un informe de rendición. Cada archivo puede pesar hasta 10 MB (megabytes) y puedes seleccionar hasta 20 archivos a la vez.",
    keywords: ["pdf", "jpg", "png", "xls", "xlsx", "10 mb", "20 archivos"],
  },
  {
    id: "ver-observaciones",
    category: FAQ_CATEGORIES.REQUESTS,
    question: "¿Dónde reviso las observaciones de mi solicitud?",
    answer: "En Mis Solicitudes, abre la solicitud. En el detalle verás el estado Observada, el comentario con lo que debes corregir y el historial de estados.",
    keywords: ["comentarios", "detalle", "historial", "revisión"],
  },
  {
    id: "corregir-reenviar",
    category: FAQ_CATEGORIES.REQUESTS,
    question: "¿Cómo corrijo y vuelvo a enviar una solicitud observada?",
    answer: "Abre la solicitud observada y selecciona Editar. Corrige la información o los documentos indicados, guarda los cambios y selecciona Enviar corrección para que la revisen nuevamente.",
    keywords: ["editar observada", "enviar corrección", "documentos", "revisión"],
  },
  {
    id: "aprobada-para-pago",
    category: FAQ_CATEGORIES.PAYMENTS_AND_RENDITIONS,
    question: "¿Cómo sé si mi solicitud está lista para el pago?",
    answer: "Cuando una solicitud está aprobada para pagar, su estado cambia a Aprobada · pendiente de pago. Puedes revisarlo en Mis Solicitudes y en el historial del detalle.",
    keywords: ["aprobación", "en gestión de pago", "historial", "estado"],
  },
  {
    id: "estado-pago",
    category: FAQ_CATEGORIES.PAYMENTS_AND_RENDITIONS,
    question: "¿Dónde reviso el estado de mi pago?",
    answer: "En Mis Solicitudes, abre el detalle de la solicitud. Cuando el pago esté registrado, verás el estado Pagada, la referencia y la constancia en Pago y constancia.",
    keywords: ["pagada", "referencia", "constancia de pago", "pago y constancia"],
  },
  {
    id: "bloqueo-nuevo-anticipo",
    category: FAQ_CATEGORIES.PAYMENTS_AND_RENDITIONS,
    question: "¿Por qué no puedo solicitar otro anticipo?",
    answer: "No puedes solicitar otro Anticipo si tienes dos o más anticipos pagados pendientes de rendición. Completa las rendiciones pendientes para volver a solicitar uno.",
    keywords: ["bloqueo", "dos anticipos", "pendiente de rendición", "nuevo anticipo"],
  },
  {
    id: "rexan-generacion",
    category: FAQ_CATEGORIES.PAYMENTS_AND_RENDITIONS,
    question: "¿Qué es una rendición de anticipo y cuándo aparece?",
    answer: "SIG-EPE crea la Rendición de anticipo cuando un Anticipo queda Pagado. Puede tardar unos momentos en aparecer y podrás verla en el detalle del anticipo.",
    keywords: ["rendición de anticipo", "anticipo pagado", "activación"],
  },
  {
    id: "documentos-rendicion",
    category: FAQ_CATEGORIES.PAYMENTS_AND_RENDITIONS,
    question: "¿Qué documentos necesito para rendir un anticipo?",
    answer: "Adjunta cada comprobante en la línea POA correspondiente y completa el informe de rendición que genera SIG-EPE. No vuelvas a adjuntar los archivos PxQ del anticipo. Si debes devolver dinero, agrega la constancia de devolución.",
    keywords: ["comprobantes", "informe de rendición", "constancia de devolución", "línea POA"],
  },
  {
    id: "plazos-recordatorios-rendicion",
    category: FAQ_CATEGORIES.PAYMENTS_AND_RENDITIONS,
    question: "¿Cuál es el plazo para rendir y cuándo recibiré recordatorios?",
    answer: "La fecha límite aparece en tu rendición. Si los recordatorios están habilitados, SIG-EPE puede enviarte avisos 15, 7, 3 y 1 día antes, el día del vencimiento y un día después.",
    keywords: ["fecha límite", "vencimiento", "d-15", "d-7", "d-3", "d-1"],
  },
  {
    id: "correos-sig-epe",
    category: FAQ_CATEGORIES.NOTIFICATIONS,
    question: "¿Qué correos envía SIG-EPE y qué hago si no los recibo?",
    answer: "SIG-EPE puede enviarte correos sobre solicitudes, pagos y recordatorios de rendición. Si no los recibes, revisa la bandeja de entrada y la carpeta de correo no deseado (spam), confirma el correo de tu perfil y pide ayuda al administrador si el problema continúa.",
    keywords: ["email", "notificaciones", "spam", "bandeja de entrada", "correo de perfil"],
  },
  {
    id: "asignacion-giof",
    category: FAQ_CATEGORIES.GIOF_WORK,
    question: "¿Cómo funciona la asignación de trabajo GIOF?",
    answer: GIOF_ASSIGNMENT_HELP.summary,
    keywords: GIOF_ASSIGNMENT_HELP.keywords,
    href: GIOF_ASSIGNMENT_HELP.href,
    linkLabel: "Abrir guía de asignación GIOF",
  },
] as const satisfies readonly FaqItem[];
