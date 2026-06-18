// src/components/layout/__tests__/app-sidebar.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthUser } from "@/types/auth";

// -------------------------------------------------------
// Mocks
// -------------------------------------------------------

// Mock auth-store — controlado por cada test
const mockUseAuthStore = vi.fn();
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { user: AuthUser | null }) => unknown) =>
    mockUseAuthStore(selector),
}));

// Mock next/navigation
let mockPathname = "/dashboard";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock useSidebar hook from sidebar component
const mockToggleSidebar = vi.fn();
const mockSetOpenMobile = vi.fn();
let mockSidebarState: "expanded" | "collapsed" = "expanded";

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <nav data-testid="sidebar">{children}</nav>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuButton: ({
    children,
    isActive,
    tooltip,
    asChild,
    ...props
  }: {
    children: React.ReactNode;
    isActive?: boolean;
    tooltip?: string;
    asChild?: boolean;
    [key: string]: unknown;
  }) => <li data-active={isActive} title={tooltip} {...props}>{children}</li>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  useSidebar: () => ({
    state: mockSidebarState,
    toggleSidebar: mockToggleSidebar,
    setOpenMobile: mockSetOpenMobile,
  }),
}));

// Mock NavUser
vi.mock("@/components/layout/nav-user", () => ({
  NavUser: () => <div data-testid="nav-user">NavUser</div>,
}));

// Mock Skeleton
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// -------------------------------------------------------
// Fixtures
// -------------------------------------------------------

const adminUser: AuthUser = {
  id: "1",
  firstName: "Admin",
  lastName: "Sistema",
  email: "admin@example.com",
  documentNumber: "00000001",
  role: {
    code: "ADMIN_SISTEMA",
    name: "Administrador del Sistema",
  },
  onboardingCompleted: true,
  authSource: 'LOCAL',
};

const solicitanteUser: AuthUser = {
  id: "2",
  firstName: "Juan",
  lastName: "Pérez",
  email: "juan@example.com",
  documentNumber: "12345678",
  role: {
    code: "SOLICITANTE_EPE",
    name: "Solicitante EPE",
  },
  onboardingCompleted: true,
  authSource: 'LOCAL',
};

const giofUser: AuthUser = {
  id: "3",
  firstName: "Giof",
  lastName: "Gestor",
  email: "giof@example.com",
  documentNumber: "12345679",
  role: {
    code: "GIOF_GESTOR",
    name: "GIOF Gestor",
  },
  onboardingCompleted: true,
  authSource: "LOCAL",
};

const auditorUser: AuthUser = {
  id: "4",
  firstName: "Auditor",
  lastName: "Dirección",
  email: "auditor@example.com",
  documentNumber: "12345670",
  role: {
    code: "AUDITOR_DIRECCION",
    name: "Auditor / Dirección",
  },
  onboardingCompleted: true,
  authSource: "LOCAL",
};

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

import { AppSidebar, isSidebarHrefActive } from "@/components/layout/app-sidebar";
import { NavigationFeedbackProvider } from "@/components/layout/navigation-feedback-provider";
import type React from "react";

function renderSidebar() {
  return render(
    <NavigationFeedbackProvider>
      <AppSidebar />
    </NavigationFeedbackProvider>,
  );
}

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe("AppSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSidebarState = "expanded";
    mockPathname = "/dashboard";
    mockSearchParams = new URLSearchParams();
  });

  it("✅ Muestra skeleton cuando user es null", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: null }) => unknown) =>
        selector({ user: null })
    );

    renderSidebar();

    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("✅ Muestra items correctos para ADMIN_SISTEMA", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    renderSidebar();

    expect(screen.getByText("Usuarios")).toBeInTheDocument();
    expect(screen.getByText("Bandeja de Revisión")).toBeInTheDocument();
    expect(screen.getByText("Mis Solicitudes")).toBeInTheDocument();
    expect(screen.getByText("Bandeja de Rendiciones")).toBeInTheDocument();
    expect(screen.getByText("Log de auditoría")).toBeInTheDocument();
    expect(screen.queryByText("Configuración")).not.toBeInTheDocument();

    expect(screen.getByText("Dashboard GIOF")).toBeInTheDocument();
    expect(screen.getByText("Presupuesto")).toBeInTheDocument();
  });

  it("usa scopes distintos para Mis Solicitudes y Bandeja de Revisión", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    renderSidebar();

    expect(screen.getByRole("link", { name: /mis solicitudes/i })).toHaveAttribute("href", "/requests?scope=mine");
    expect(screen.getByRole("link", { name: /bandeja de revisión/i })).toHaveAttribute("href", "/requests?scope=review");
  });

  it("activa Bandeja de Revisión, no Mis Solicitudes, cuando scope=review", () => {
    mockPathname = "/requests";
    mockSearchParams = new URLSearchParams("scope=review");
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    renderSidebar();

    expect(screen.getByRole("link", { name: /bandeja de revisión/i }).closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /mis solicitudes/i }).closest("li")).toHaveAttribute("data-active", "false");
  });

  it("activa Mis Solicitudes, no Bandeja de Revisión, cuando scope=mine", () => {
    mockPathname = "/requests";
    mockSearchParams = new URLSearchParams("scope=mine");
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    renderSidebar();

    expect(screen.getByRole("link", { name: /mis solicitudes/i }).closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /bandeja de revisión/i }).closest("li")).toHaveAttribute("data-active", "false");
  });

  it("mantiene Mis Solicitudes activa como scope por defecto sin query", () => {
    mockPathname = "/requests";
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    renderSidebar();

    expect(screen.getByRole("link", { name: /mis solicitudes/i }).closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /bandeja de revisión/i }).closest("li")).toHaveAttribute("data-active", "false");
  });

  it("✅ Muestra items correctos para SOLICITANTE_EPE", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: solicitanteUser })
    );

    renderSidebar();

    expect(screen.getByText("Mis Solicitudes")).toBeInTheDocument();
    expect(screen.queryByText("Nueva Solicitud")).not.toBeInTheDocument();

    // No debe mostrar items de admin
    expect(screen.queryByText("Usuarios")).not.toBeInTheDocument();
  });

  it("✅ Muestra Bandeja de Revisión para GIOF sin Bandeja de Gestión", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: giofUser })
    );

    renderSidebar();

    expect(screen.getByText("Bandeja de Revisión")).toBeInTheDocument();
    expect(screen.getByText("Mis Solicitudes")).toBeInTheDocument();
    expect(screen.getByText("Cola de Pagos")).toBeInTheDocument();
    expect(screen.queryByText("Resumen de Saldos")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard GIOF")).toBeInTheDocument();
    expect(screen.getByText("Presupuesto")).toBeInTheDocument();
    expect(screen.getByText("Años Fiscales")).toBeInTheDocument();
    expect(screen.getByText("Plan Operativo (POA)")).toBeInTheDocument();
    expect(screen.getByText("Aportes de Socios")).toBeInTheDocument();
    expect(screen.getByText("Reportes")).toBeInTheDocument();
    expect(screen.getByText("Catálogos")).toBeInTheDocument();
    expect(screen.getByText("Usuarios")).toBeInTheDocument();
    expect(screen.queryByText("Bandeja de Gestión")).not.toBeInTheDocument();
  });

  it("✅ Muestra dashboards y Reportes para AUDITOR_DIRECCION", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: auditorUser })
    );

    renderSidebar();

    expect(screen.getByText("Dashboard GIOF")).toBeInTheDocument();
    expect(screen.getByText("Presupuesto")).toBeInTheDocument();
    expect(screen.getByText("Reportes")).toBeInTheDocument();
    expect(screen.getByText("Mis Solicitudes")).toBeInTheDocument();
  });

  it("✅ Botón chevron llama toggleSidebar al hacer click", async () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    const user = userEvent.setup();
    renderSidebar();

    const collapseBtn = screen.getByRole("button", {
      name: /colapsar sidebar/i,
    });
    await user.click(collapseBtn);

    expect(mockToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("marca el enlace clicado como pendiente y muestra progreso global", async () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    const user = userEvent.setup();
    renderSidebar();

    const usersLink = screen.getByRole("link", { name: /usuarios/i });
    await user.click(usersLink);

    expect(usersLink).toHaveAttribute("data-pending", "true");
    expect(usersLink).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("progressbar", { name: /cargando navegación/i })).toBeInTheDocument();
  });

  it("no deja estado pendiente al hacer click en la ruta actual", async () => {
    mockPathname = "/dashboard/giof";
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    const user = userEvent.setup();
    renderSidebar();

    const dashboardLink = screen.getByRole("link", { name: /dashboard giof/i });
    await user.click(dashboardLink);

    expect(dashboardLink).toHaveAttribute("aria-current", "page");
    expect(dashboardLink).not.toHaveAttribute("data-pending");
    expect(screen.queryByRole("progressbar", { name: /cargando navegación/i })).not.toBeInTheDocument();
  });

  it("activa solo Programado vs Ejecutado en su ruta y no el padre Presupuesto", () => {
    mockPathname = "/budget/org-unit-execution";
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    renderSidebar();

    expect(screen.getByRole("link", { name: /programado vs ejecutado/i }).closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /^presupuesto$/i }).closest("li")).toHaveAttribute("data-active", "false");
  });

  it("usa matching exacto para Dashboard y Presupuesto, pero mantiene prefijo para rutas hijas específicas", () => {
    const emptySearch = new URLSearchParams();

    expect(isSidebarHrefActive("/dashboard", "/dashboard/giof", emptySearch)).toBe(false);
    expect(isSidebarHrefActive("/dashboard/giof", "/dashboard/giof", emptySearch)).toBe(true);
    expect(isSidebarHrefActive("/budget", "/budget/org-unit-execution", emptySearch)).toBe(false);
    expect(isSidebarHrefActive("/budget/planning", "/budget/planning/new", emptySearch)).toBe(true);
  });

  it("limpia un pendiente previo al hacer click en la ruta actual", async () => {
    mockPathname = "/dashboard/giof";
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    const user = userEvent.setup();
    renderSidebar();

    const usersLink = screen.getByRole("link", { name: /usuarios/i });
    const dashboardLink = screen.getByRole("link", { name: /dashboard giof/i });

    await user.click(usersLink);
    expect(usersLink).toHaveAttribute("data-pending", "true");

    await user.click(dashboardLink);

    expect(usersLink).not.toHaveAttribute("data-pending");
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("progressbar", { name: /cargando navegación/i })).not.toBeInTheDocument();
  });

  it("✅ Muestra botón 'Expandir sidebar' cuando está colapsado", () => {
    mockSidebarState = "collapsed";
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: adminUser })
    );

    renderSidebar();

    expect(
      screen.getByRole("button", { name: /expandir sidebar/i })
    ).toBeInTheDocument();
  });
});
