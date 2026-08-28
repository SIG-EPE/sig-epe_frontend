import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GiofAssignmentGuide } from "@/components/help/giof-assignment-guide";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

const searchParams = new URLSearchParams();
let intersectionCallback: IntersectionObserverCallback | null = null;

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

function setRole(code: string) {
  useAuthStore.setState({
    user: {
      id: "user-1",
      firstName: "Ana",
      lastName: "Gestora",
      email: null,
      documentNumber: "00000000",
      onboardingCompleted: true,
      authSource: "LOCAL",
      role: { code, name: code },
    },
    isLoading: false,
  });
}

describe("GiofAssignmentGuide", () => {
  beforeEach(() => {
    searchParams.delete("context");
    window.history.replaceState(null, "", "/help/giof-assignment");
    HTMLElement.prototype.scrollIntoView = vi.fn();
    intersectionCallback = null;
    vi.stubGlobal("IntersectionObserver", class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "0px";
      thresholds = [0];
    });
  });

  it("recomienda la sección del rol actual sin ocultar los demás roles", () => {
    setRole(ROLE_CODE.GIOF_MANAGER);
    render(<GiofAssignmentGuide />);

    expect(screen.getByText("Sección recomendada: GIOF Manager")).toBeInTheDocument();
    expect(document.getElementById("role-manager")).toHaveAttribute("data-recommended", "true");
    expect(screen.getByRole("heading", { name: "GIOF Gestor" })).toBeInTheDocument();
    expect(screen.getByText(/el administrador del sistema no puede asignar ni reasignar/i)).toBeInTheDocument();
  });

  it("prioriza el contexto de rendición y usa las etiquetas visibles exactas", () => {
    searchParams.set("context", "rexan");
    setRole(ROLE_CODE.GIOF_GESTOR);
    render(<GiofAssignmentGuide />);

    const rexan = document.getElementById("rexan");
    expect(rexan).toHaveFocus();
    expect(within(rexan!).getByText(/rendición de anticipo vinculada, no el anticipo de origen/i)).toBeInTheDocument();
    expect(within(rexan!).getByText(/en preparación, en revisión, en validación u observada/i)).toBeInTheDocument();
    expect(within(rexan!).getByText(/rendida no tiene seguimiento asignable/i)).toBeInTheDocument();
  });

  it("documenta los tres responsables independientes y la operación masiva todo-o-nada", () => {
    setRole(ROLE_CODE.GIOF_MANAGER);
    render(<GiofAssignmentGuide />);

    expect(screen.getByText(/revisión de solicitud, cola de pagos y rendición de anticipo mantienen responsables independientes/i)).toBeInTheDocument();
    expect(screen.getByText(/hasta 50 de la misma etapa.*todo-o-nada/i)).toBeInTheDocument();
  });

  it("explica estados derivados y reglas de asignación sin mostrar códigos internos", () => {
    setRole(ROLE_CODE.GIOF_GESTOR);
    const { container } = render(<GiofAssignmentGuide />);

    expect(screen.getByText(/por revisar es asignable/i)).toBeInTheDocument();
    expect(screen.getByText(/pago registrado con falta constancia o falta referencia/i)).toBeInTheDocument();
    expect(screen.getByText(/pago registrado sin datos pendientes no es asignable/i)).toBeInTheDocument();
    expect(screen.getByText(/observada.*faltan documentos.*seguimiento asignable/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b(?:SUBMITTED|ADVANCE_SETTLEMENT|REQUEST|PAYMENT|REXAN|DRAFT|IN_VALIDATION|OBSERVED|PAID)\b/);
  });

  it("presenta navegación desplazable con selección visible, aria-current y hash", () => {
    setRole(ROLE_CODE.GIOF_MANAGER);
    render(<GiofAssignmentGuide />);

    const nav = screen.getByRole("navigation", { name: "Contenido de la guía" });
    const scroller = within(nav).getByTestId("guide-section-scroller");
    const rolesLink = within(nav).getByRole("link", { name: "Roles" });
    const paymentLink = within(nav).getByRole("link", { name: "Cola de pagos" });

    expect(scroller).toHaveClass("overflow-x-auto");
    expect(rolesLink).toHaveAttribute("aria-current", "location");
    expect(rolesLink).toHaveClass("bg-primary", "border-primary", "text-primary-foreground");
    expect(rolesLink).toHaveClass("no-underline", "hover:no-underline", "focus:no-underline", "focus-visible:no-underline");
    expect(paymentLink).toHaveClass("no-underline", "hover:no-underline", "focus:no-underline", "focus-visible:no-underline");

    fireEvent.click(paymentLink);
    expect(paymentLink).toHaveAttribute("aria-current", "location");
    expect(window.location.hash).toBe("#payment");
  });

  it("actualiza la sección seleccionada al desplazarse", () => {
    setRole(ROLE_CODE.GIOF_GESTOR);
    render(<GiofAssignmentGuide />);

    const paymentSection = document.getElementById("payment");
    const paymentLink = screen.getByRole("link", { name: "Cola de pagos" });
    expect(intersectionCallback).not.toBeNull();

    act(() => {
      const bounds = paymentSection!.getBoundingClientRect();
      intersectionCallback?.([
        {
          target: paymentSection!,
          isIntersecting: true,
          intersectionRatio: 0.75,
          boundingClientRect: bounds,
          intersectionRect: bounds,
          rootBounds: null,
          time: 0,
        },
      ], {} as IntersectionObserver);
    });

    expect(paymentLink).toHaveAttribute("aria-current", "location");
  });
});
