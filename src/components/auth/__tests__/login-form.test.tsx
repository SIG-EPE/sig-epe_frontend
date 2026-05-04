// src/components/auth/__tests__/login-form.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// -------------------------------------------------------
// Mocks
// -------------------------------------------------------

// Mock api-client — NO es un flujo de auth real, es test de UI
vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
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

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock next/navigation (no usado en LoginForm, pero evita errores de módulo)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/login",
}));

// Mock ROUTES constant
vi.mock("@/lib/constants", () => ({
  TOKEN_KEY: "access_token",
  ROUTES: {
    LOGIN: "/login",
    ONBOARDING: "/onboarding",
    DASHBOARD: "/dashboard",
  },
}));

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

import { LoginForm } from "@/components/auth/login-form";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

function renderLoginForm() {
  return render(<LoginForm />);
}

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    document.cookie = "access_token=; path=/; max-age=0; SameSite=Strict";
  });

  it("✅ Renderiza los campos DNI/correo y contraseña", () => {
    renderLoginForm();

    expect(
      screen.getByPlaceholderText(/12345678 o usuario@correo.com/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Tu contraseña/i)
    ).toBeInTheDocument();
  });

  it("✅ Muestra error de validación si DNI está vacío al submit", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const submitButton = screen.getByRole("button", { name: /ingresar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Ingresa tu DNI o correo electrónico/i)
      ).toBeInTheDocument();
    });
  });

  it("✅ Muestra error de validación si password está vacía al submit", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const dniInput = screen.getByPlaceholderText(/12345678 o usuario@correo.com/i);
    await user.type(dniInput, "12345678");

    const submitButton = screen.getByRole("button", { name: /ingresar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Ingresa tu contraseña/i)
      ).toBeInTheDocument();
    });
  });

  it("✅ Botón submit se deshabilita durante envío (isSubmitting)", async () => {
    const { api } = await import("@/lib/api-client");
    const mockPost = vi.mocked(api.post);

    // La promesa nunca resuelve → simula "cargando"
    mockPost.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderLoginForm();

    const dniInput = screen.getByPlaceholderText(/12345678 o usuario@correo.com/i);
    const passwordInput = screen.getByPlaceholderText(/Tu contraseña/i);
    const submitButton = screen.getByRole("button", { name: /ingresar/i });

    await user.type(dniInput, "12345678");
    await user.type(passwordInput, "Password123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });
  });

  it("✅ Toggle show/hide password funciona", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const passwordInput = screen.getByPlaceholderText(/Tu contraseña/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    // Click en el botón de ojo
    const toggleButton = screen.getByRole("button", { name: /mostrar contraseña/i });
    await user.click(toggleButton);

    expect(passwordInput).toHaveAttribute("type", "text");

    // Click de nuevo para ocultar
    const hideButton = screen.getByRole("button", { name: /ocultar contraseña/i });
    await user.click(hideButton);

    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("limpia sesión previa local si falla el handoff SSO inválido", async () => {
    const { api, ApiRequestError } = await import("@/lib/api-client");
    const { toast } = await import("sonner");
    const mockPost = vi.mocked(api.post);
    const mockGet = vi.mocked(api.get);

    const previousUser: AuthUser = {
      id: "user-previo",
      firstName: "Usuario",
      lastName: "Previo",
      email: "previo@example.com",
      documentNumber: "12345678",
      onboardingCompleted: true,
      authSource: "LOCAL",
      role: { code: "ADMIN_SISTEMA", name: "Administrador del Sistema" },
    };

    useAuthStore.getState().setAuth(previousUser, "old-access-token");
    document.cookie = "access_token=old-access-token; path=/; SameSite=Strict";

    mockPost.mockResolvedValue(undefined);
    mockGet.mockRejectedValue(
      new ApiRequestError(401, {
        statusCode: 401,
        message: "Invalid handoff token",
        error: "Unauthorized",
        timestamp: new Date().toISOString(),
        path: "/auth/sso",
      }),
    );

    render(<LoginForm ssoToken="invalid" />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/auth/sso?token=invalid");
    });

    expect(mockPost).toHaveBeenCalledWith("/auth/logout");
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(document.cookie).not.toContain("old-access-token");
    expect(toast.error).toHaveBeenCalledWith(
      "El enlace de acceso es inválido o ya expiró. Iniciá sesión manualmente.",
    );
  });
});
