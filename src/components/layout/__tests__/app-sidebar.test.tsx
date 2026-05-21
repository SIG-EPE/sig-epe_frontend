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
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
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

import { AppSidebar } from "@/components/layout/app-sidebar";
import type React from "react";

function renderSidebar() {
  return render(<AppSidebar />);
}

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe("AppSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSidebarState = "expanded";
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
    expect(screen.getByText("Bandeja de Rendiciones")).toBeInTheDocument();
    expect(screen.getByText("Log de auditoría")).toBeInTheDocument();
    expect(screen.queryByText("Configuración")).not.toBeInTheDocument();

    // No debe mostrar items de otros roles
    expect(screen.queryByText("Mis Solicitudes")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("✅ Muestra items correctos para SOLICITANTE_EPE", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: solicitanteUser })
    );

    renderSidebar();

    expect(screen.getByText("Mis Solicitudes")).toBeInTheDocument();
    expect(screen.getByText("Nueva Solicitud")).toBeInTheDocument();

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
    expect(screen.getByText("Cola de Pagos")).toBeInTheDocument();
    expect(screen.queryByText("Resumen de Saldos")).not.toBeInTheDocument();
    expect(screen.getByText("Años Fiscales")).toBeInTheDocument();
    expect(screen.getByText("Plan Operativo (POA)")).toBeInTheDocument();
    expect(screen.getByText("Aportes de Socios")).toBeInTheDocument();
    expect(screen.getByText("Catálogos")).toBeInTheDocument();
    expect(screen.getByText("Usuarios")).toBeInTheDocument();
    expect(screen.queryByText("Bandeja de Gestión")).not.toBeInTheDocument();
  });

  it("✅ Oculta navegación no MVP para AUDITOR_DIRECCION", () => {
    mockUseAuthStore.mockImplementation(
      (selector: (state: { user: AuthUser }) => unknown) =>
        selector({ user: auditorUser })
    );

    renderSidebar();

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Reportes")).not.toBeInTheDocument();
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
