// src/components/auth/__tests__/onboarding-form.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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

function fillLocalOnboardingForm({
  email,
  newPassword = "Password123",
  confirmPassword = "Password123",
}: {
  email: string;
  newPassword?: string;
  confirmPassword?: string;
}) {
  fireEvent.change(screen.getByPlaceholderText(/usuario@correo.com/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText(/Ingresa tu contraseña/i), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByPlaceholderText(/Repite tu contraseña/i), {
    target: { value: confirmPassword },
  });
}

function submitOnboardingForm() {
  const form = screen.getByRole("button", { name: /configurar acceso/i }).closest("form")!;
  fireEvent.submit(form);
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
    renderOnboardingForm();

    fillLocalOnboardingForm({ email: "test@example.com", confirmPassword: "DifferentPass123" });
    submitOnboardingForm();

    await waitFor(() => {
      expect(
        screen.getByText(/Las contraseñas no coinciden/i)
      ).toBeInTheDocument();
    });
  });

  it("✅ Valida formato de email", async () => {
    renderOnboardingForm();

    fillLocalOnboardingForm({ email: "not-an-email" });
    submitOnboardingForm();

    await waitFor(() => {
      expect(screen.getByText(/Ingresa un correo válido/i)).toBeInTheDocument();
    });
  });

  it("bloquea correos externos antes de enviar la activación de cuenta", async () => {
    renderOnboardingForm();

    fillLocalOnboardingForm({ email: "persona@gmail.com" });
    submitOnboardingForm();

    await waitFor(() => {
      expect(screen.getByText(/solo se permiten correos @ensenaperu\.org/i)).toBeInTheDocument();
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("acepta el dominio permitido sin importar mayúsculas ni espacios", async () => {
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

    fillLocalOnboardingForm({ email: "  Persona@EnsenaPeru.Org  " });
    submitOnboardingForm();

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/onboarding", {
        email: "Persona@EnsenaPeru.Org",
        newPassword: "Password123",
        confirmPassword: "Password123",
      });
    });
  });

  it("muestra el rechazo de dominio devuelto por backend", async () => {
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

    fillLocalOnboardingForm({ email: "persona@ensenaperu.org" });
    submitOnboardingForm();

    await waitFor(() => {
      expect(screen.getByText(sanitizedMessage)).toBeInTheDocument();
    });
    expect(toast.error).toHaveBeenCalledWith(sanitizedMessage);
  });
});
