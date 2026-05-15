// src/components/auth/__tests__/onboarding-form.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// -------------------------------------------------------
// Mocks
// -------------------------------------------------------

vi.mock("@/lib/api-client", () => ({
  api: {
    post: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public body: { statusCode: number; message: string; error: string; timestamp: string; path: string }
    ) {
      super(body.message);
      this.name = "ApiRequestError";
    }
  },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: vi.fn((selector: (state: { setAuth: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ setAuth: vi.fn() })
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/onboarding",
}));

vi.mock("@/lib/constants", () => ({
  ROUTES: {
    LOGIN: "/login",
    ONBOARDING: "/onboarding",
    DASHBOARD: "/dashboard",
  },
}));

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

import { ApiRequestError, api } from "@/lib/api-client";
import { toast } from "sonner";
import { OnboardingForm } from "@/components/auth/onboarding-form";

function renderOnboardingForm(epeUserName = "Juan Pérez") {
  return render(<OnboardingForm epeUserName={epeUserName} authSource="LOCAL" />);
}

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe("OnboardingForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("✅ Renderiza campos email, newPassword y confirmPassword", () => {
    renderOnboardingForm();

    expect(screen.getByPlaceholderText(/usuario@correo.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ingresa tu contraseña/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Repite tu contraseña/i)).toBeInTheDocument();
  });

  it("✅ Valida que passwords coincidan", async () => {
    const user = userEvent.setup();
    renderOnboardingForm();

    await user.type(
      screen.getByPlaceholderText(/usuario@correo.com/i),
      "test@example.com"
    );
    await user.type(
      screen.getByPlaceholderText(/Ingresa tu contraseña/i),
      "Password123"
    );
    await user.type(
      screen.getByPlaceholderText(/Repite tu contraseña/i),
      "DifferentPass123"
    );

    await user.click(
      screen.getByRole("button", { name: /configurar acceso/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Las contraseñas no coinciden/i)
      ).toBeInTheDocument();
    });
  });

  it("✅ Valida formato de email", async () => {
    const user = userEvent.setup();
    renderOnboardingForm();

    await user.type(
      screen.getByPlaceholderText(/usuario@correo.com/i),
      "not-an-email"
    );
    await user.type(
      screen.getByPlaceholderText(/Ingresa tu contraseña/i),
      "Password123"
    );
    await user.type(
      screen.getByPlaceholderText(/Repite tu contraseña/i),
      "Password123"
    );

    // Use fireEvent.submit to bypass native HTML email constraint validation
    // (jsdom blocks submit event for invalid type="email" values before
    // react-hook-form's handleSubmit can run the zod resolver)
    const form = screen.getByRole("button", { name: /configurar acceso/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Ingresa un correo válido/i)).toBeInTheDocument();
    });
  });

  it("bloquea correos externos antes de enviar la activación de cuenta", async () => {
    const user = userEvent.setup();
    renderOnboardingForm();

    await user.type(screen.getByPlaceholderText(/usuario@correo.com/i), "persona@gmail.com");
    await user.type(screen.getByPlaceholderText(/Ingresa tu contraseña/i), "Password123");
    await user.type(screen.getByPlaceholderText(/Repite tu contraseña/i), "Password123");

    await user.click(screen.getByRole("button", { name: /configurar acceso/i }));

    await waitFor(() => {
      expect(screen.getByText(/solo se permiten correos @ensenaperu\.org/i)).toBeInTheDocument();
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("acepta el dominio permitido sin importar mayúsculas ni espacios", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      accessToken: "token",
      refreshToken: "refresh",
      onboardingRequired: false,
      user: {
        id: "user-1",
        firstName: "Juan",
        lastName: "Pérez",
        email: "persona@ensenaperu.org",
        documentNumber: "12345678",
        onboardingCompleted: true,
        authSource: "LOCAL",
        role: { code: "SOLICITANTE_EPE", name: "Solicitante EPE" },
      },
    });
    renderOnboardingForm();

    await user.type(screen.getByPlaceholderText(/usuario@correo.com/i), "  Persona@EnsenaPeru.Org  ");
    await user.type(screen.getByPlaceholderText(/Ingresa tu contraseña/i), "Password123");
    await user.type(screen.getByPlaceholderText(/Repite tu contraseña/i), "Password123");

    await user.click(screen.getByRole("button", { name: /configurar acceso/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/onboarding", {
        email: "Persona@EnsenaPeru.Org",
        newPassword: "Password123",
        confirmPassword: "Password123",
      });
    });
  });

  it("muestra el rechazo de dominio devuelto por backend", async () => {
    const user = userEvent.setup();
    const backendMessage = "Solo se permiten correos @ensenaperu.org para completar el onboarding.";
    const sanitizedMessage = "Solo se permiten correos @ensenaperu.org para completar la activación de cuenta.";
    vi.mocked(api.post).mockRejectedValue(
      new ApiRequestError(400, {
        statusCode: 400,
        message: backendMessage,
        error: "Bad Request",
        timestamp: "2026-05-14T00:00:00.000Z",
        path: "/auth/onboarding",
      }),
    );
    renderOnboardingForm();

    await user.type(screen.getByPlaceholderText(/usuario@correo.com/i), "persona@ensenaperu.org");
    await user.type(screen.getByPlaceholderText(/Ingresa tu contraseña/i), "Password123");
    await user.type(screen.getByPlaceholderText(/Repite tu contraseña/i), "Password123");

    await user.click(screen.getByRole("button", { name: /configurar acceso/i }));

    await waitFor(() => {
      expect(screen.getByText(sanitizedMessage)).toBeInTheDocument();
    });
    expect(toast.error).toHaveBeenCalledWith(sanitizedMessage);
  });
});
