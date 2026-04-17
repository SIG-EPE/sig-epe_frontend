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
  PATROCINADOR: "PATROCINADOR",
  GIOF_GESTOR: "GIOF_GESTOR",
  AUDITOR_DIRECCION: "AUDITOR_DIRECCION",
  ADMIN_SISTEMA: "ADMIN_SISTEMA",
} as const;

export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE];
export { ROLE_CODE };

/** Human-readable labels in Spanish */
export const ROLE_LABELS: Record<RoleCode, string> = {
  SOLICITANTE_EPE: "Solicitante EPE",
  PATROCINADOR: "Patrocinador",
  GIOF_GESTOR: "GIOF Gestor",
  AUDITOR_DIRECCION: "Auditor / Dirección",
  ADMIN_SISTEMA: "Administrador del Sistema",
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
  PATROCINADOR: [
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
    { label: "Rendiciones", href: "/rendiciones", icon: "Receipt" },
  ],
  GIOF_GESTOR: [
    { label: "Bandeja de Gestión", href: "/gestion", icon: "ClipboardList" },
    { label: "Solicitudes", href: "/solicitudes", icon: "FileText" },
    { label: "Cola de Pagos", href: "/pagos", icon: "CreditCard" },
    { label: "Presupuesto", href: "/presupuesto", icon: "DollarSign" },
    { label: "Catálogos", href: "/catalogos", icon: "BookOpen" },
  ],
  AUDITOR_DIRECCION: [
    { label: "Reportes", href: "/reportes", icon: "BarChart3" },
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
  ],
  ADMIN_SISTEMA: [
    { label: "Usuarios", href: ROUTES.ADMIN_USERS, icon: "Users" },
    { label: "Configuración", href: "/admin/config", icon: "Settings" },
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
