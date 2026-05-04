// -------------------------------------------------------
// Constants — SIG-EPE
// -------------------------------------------------------

/** All application routes (English convention) */
export const ROUTES = {
  LOGIN: "/login",
  ONBOARDING: "/onboarding",
  DASHBOARD: "/dashboard",
  REQUESTS: "/requests",
  REQUESTS_NEW: "/requests/new",
  MANAGEMENT: "/management",
  PAYMENTS: "/payments",
  BUDGET: "/budget",
  CATALOGS: "/catalogs",
  ACCOUNTABILITY: "/accountability",
  REPORTS: "/reports",
  ADMIN_USERS: "/admin/users",
  ADMIN_CONFIG: "/admin/config",
  ADMIN_AUDIT_LOGS: "/admin/audit-logs",
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
    { label: "Mis Solicitudes", href: ROUTES.REQUESTS, icon: "FileText" },
    { label: "Nueva Solicitud", href: ROUTES.REQUESTS_NEW, icon: "FilePlus" },
  ],
  PATROCINADOR: [
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
    { label: "Rendiciones", href: ROUTES.ACCOUNTABILITY, icon: "Receipt" },
  ],
  GIOF_GESTOR: [
    { label: "Bandeja de Gestión", href: ROUTES.MANAGEMENT, icon: "ClipboardList" },
    { label: "Solicitudes", href: ROUTES.REQUESTS, icon: "FileText" },
    { label: "Cola de Pagos", href: ROUTES.PAYMENTS, icon: "CreditCard" },
    { label: "Presupuesto", href: ROUTES.BUDGET, icon: "DollarSign" },
    { label: "Catálogos", href: ROUTES.CATALOGS, icon: "BookOpen" },
    { label: "Usuarios", href: ROUTES.ADMIN_USERS, icon: "Users" },
  ],
  AUDITOR_DIRECCION: [
    { label: "Reportes", href: ROUTES.REPORTS, icon: "BarChart3" },
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
  ],
  ADMIN_SISTEMA: [
    { label: "Usuarios", href: ROUTES.ADMIN_USERS, icon: "Users" },
    { label: "Configuración", href: ROUTES.ADMIN_CONFIG, icon: "Settings" },
    { label: "Log de auditoría", href: ROUTES.ADMIN_AUDIT_LOGS, icon: "ClipboardList" },
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

/** Inactivity session management */
export const INACTIVITY_WARNING_MINUTES = 60;
export const INACTIVITY_TIMEOUT_MINUTES = 120;
