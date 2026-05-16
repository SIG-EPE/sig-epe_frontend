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
  RENDITIONS: "/renditions",
  MANAGEMENT: "/management",
  PAYMENTS: "/payments",
  BUDGET: "/budget",
  BUDGET_FISCAL_YEARS: "/budget/fiscal-years",
  BUDGET_ALLOCATIONS: "/budget/allocations",
  BUDGET_PLANNING: "/budget/planning",
  BUDGET_PLANNING_NEW: "/budget/planning/new",
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
  GIOF_GESTOR: "GIOF_GESTOR",
  AUDITOR_DIRECCION: "AUDITOR_DIRECCION",
  ADMIN_SISTEMA: "ADMIN_SISTEMA",
} as const;

export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE];
export { ROLE_CODE };

/** Human-readable labels in Spanish */
export const ROLE_LABELS: Record<RoleCode, string> = {
  SOLICITANTE_EPE: "Solicitante EPE",
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
  GIOF_GESTOR: [
    { label: "Bandeja de Revisión", href: ROUTES.REQUESTS, icon: "FileText" },
    { label: "Cola de Pagos", href: ROUTES.PAYMENTS, icon: "CreditCard" },
    { label: "Bandeja de Rendiciones", href: ROUTES.RENDITIONS, icon: "Receipt" },
    { label: "Resumen de Saldos", href: ROUTES.BUDGET, icon: "DollarSign" },
    { label: "Años Fiscales", href: ROUTES.BUDGET_FISCAL_YEARS, icon: "CalendarDays" },
    { label: "Plan Operativo (POA)", href: ROUTES.BUDGET_PLANNING, icon: "ListChecks" },
    { label: "Aportes de Socios", href: ROUTES.BUDGET_ALLOCATIONS, icon: "Handshake" },
    { label: "Catálogos", href: ROUTES.CATALOGS, icon: "BookOpen" },
    { label: "Usuarios", href: ROUTES.ADMIN_USERS, icon: "Users" },
  ],
  AUDITOR_DIRECCION: [
    { label: "Reportes", href: ROUTES.REPORTS, icon: "BarChart3" },
    { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
  ],
  ADMIN_SISTEMA: [
    { label: "Bandeja de Revisión", href: ROUTES.REQUESTS, icon: "FileText" },
    { label: "Bandeja de Rendiciones", href: ROUTES.RENDITIONS, icon: "Receipt" },
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
