// -------------------------------------------------------
// Constants — SIG-EPE
// -------------------------------------------------------

/** All application routes */
export const ROUTES = {
  LOGIN: "/login",
  ONBOARDING: "/onboarding",
  DASHBOARD: "/dashboard",
  ADMIN_USERS: "/admin/users",
  PROFILE: "/profile",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/** Role codes — must match backend RoleCode enum */
const ROLE_CODE = {
  SOLICITANTE_EPE: "SOLICITANTE_EPE",
  JEFE_AREA: "JEFE_AREA",
  ADMIN_PRESUPUESTAL: "ADMIN_PRESUPUESTAL",
  GIOF_VALIDADOR: "GIOF_VALIDADOR",
  GIOF_APROBADOR: "GIOF_APROBADOR",
  AUDITOR_DIRECCION: "AUDITOR_DIRECCION",
  ADMIN_SISTEMA: "ADMIN_SISTEMA",
  SOCIO_FINANCIADOR: "SOCIO_FINANCIADOR",
} as const;

export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE];
export { ROLE_CODE };

/** Human-readable labels in Spanish */
export const ROLE_LABELS: Record<RoleCode, string> = {
  SOLICITANTE_EPE: "Solicitante EPE",
  JEFE_AREA: "Jefe de Área",
  ADMIN_PRESUPUESTAL: "Administrador Presupuestal",
  GIOF_VALIDADOR: "GIOF Validador",
  GIOF_APROBADOR: "GIOF Aprobador",
  AUDITOR_DIRECCION: "Auditor / Dirección EPE",
  ADMIN_SISTEMA: "Administrador del Sistema",
  SOCIO_FINANCIADOR: "Socio / Financiador",
};

/** Sidebar menu item shape */
export interface MenuItem {
  label: string;
  href: string;
  icon: string; // lucide-react icon name
}

/** Menu items available per role */
export const ROLE_MENU_MAP: Record<RoleCode, MenuItem[]> = {
  SOLICITANTE_EPE: [
    { label: "Mis Solicitudes", href: "/solicitudes", icon: "FileText" },
    { label: "Nueva Solicitud", href: "/solicitudes/nueva", icon: "FilePlus" },
  ],
  JEFE_AREA: [
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
  ],
  ADMIN_PRESUPUESTAL: [
    { label: "Presupuesto", href: "/presupuesto", icon: "DollarSign" },
    { label: "Catálogos", href: "/catalogos", icon: "BookOpen" },
  ],
  GIOF_VALIDADOR: [
    { label: "Bandeja de Validación", href: "/validacion", icon: "ClipboardCheck" },
    { label: "Solicitudes", href: "/solicitudes", icon: "FileText" },
  ],
  GIOF_APROBADOR: [
    { label: "Bandeja de Aprobación", href: "/aprobacion", icon: "CheckCircle" },
    { label: "Cola de Pagos", href: "/pagos", icon: "DollarSign" },
  ],
  AUDITOR_DIRECCION: [
    { label: "Reportes", href: "/reportes", icon: "BarChart3" },
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
  ],
  ADMIN_SISTEMA: [
    { label: "Usuarios", href: ROUTES.ADMIN_USERS, icon: "Users" },
    { label: "Configuración", href: "/admin/config", icon: "Settings" },
  ],
  SOCIO_FINANCIADOR: [
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
  ],
};

/** Cookie/header key for access token */
export const TOKEN_KEY = "access_token" as const;

/** Public paths that bypass auth middleware */
export const PUBLIC_PATHS = [
  "/login",
  "/_next",
  "/favicon.ico",
  "/api/health",
] as const;
