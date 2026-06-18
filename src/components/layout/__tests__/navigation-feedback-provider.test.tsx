import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  NavigationFeedbackProvider,
  useNavigationFeedback,
} from "@/components/layout/navigation-feedback-provider";

let mockPathname = "/dashboard";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

function NavigationHarness() {
  const { pendingHref, startNavigation, clearNavigation } = useNavigationFeedback();

  return (
    <div>
      <span data-testid="pending-href">{pendingHref ?? "none"}</span>
      <button onClick={() => startNavigation("/requests?scope=review")}>Iniciar</button>
      <button onClick={clearNavigation}>Limpiar</button>
    </div>
  );
}

function LinkHarness() {
  return (
    <div>
      <a href="/payments">Cola de pagos</a>
      <a href="/requests" onClick={(event) => event.preventDefault()}>
        Navegación bloqueada
      </a>
    </div>
  );
}

describe("NavigationFeedbackProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPathname = "/dashboard";
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("muestra progreso y mensaje lento durante navegación pendiente", async () => {
    render(
      <NavigationFeedbackProvider>
        <NavigationHarness />
      </NavigationFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar/i }));

    expect(screen.getByRole("progressbar", { name: /cargando navegación/i })).toBeInTheDocument();
    expect(screen.getByTestId("pending-href")).toHaveTextContent("/requests?scope=review");

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText(/la navegación sigue cargando/i)).toBeInTheDocument();
  });

  it("limpia el feedback cuando la ruta se asienta", async () => {
    const { rerender } = render(
      <NavigationFeedbackProvider>
        <NavigationHarness />
      </NavigationFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar/i }));

    mockPathname = "/requests";
    mockSearchParams = new URLSearchParams("scope=review");
    rerender(
      <NavigationFeedbackProvider>
        <NavigationHarness />
      </NavigationFeedbackProvider>,
    );

    expect(screen.queryByRole("progressbar", { name: /cargando navegación/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-href")).toHaveTextContent("none");
  });

  it("limpia el feedback por duración máxima para evitar loaders atascados", async () => {
    render(
      <NavigationFeedbackProvider>
        <NavigationHarness />
      </NavigationFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar/i }));
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByRole("progressbar", { name: /cargando navegación/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-href")).toHaveTextContent("none");
  });

  it("muestra la barra superior para enlaces internos fuera del sidebar", async () => {
    render(
      <NavigationFeedbackProvider>
        <NavigationHarness />
        <LinkHarness />
      </NavigationFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: /cola de pagos/i }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("progressbar", { name: /cargando navegación/i })).toBeInTheDocument();
    expect(screen.getByTestId("pending-href")).toHaveTextContent("/payments");
  });

  it("no muestra la barra si otra protección cancela la navegación", async () => {
    render(
      <NavigationFeedbackProvider>
        <NavigationHarness />
        <LinkHarness />
      </NavigationFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: /navegación bloqueada/i }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("progressbar", { name: /cargando navegación/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-href")).toHaveTextContent("none");
  });
});
