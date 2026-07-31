// src/components/auth/__tests__/login-form.test.tsx
import { StrictMode } from "react";
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
      public body: { statusCode: number; code?: string; message: string; error: string; timestamp: string; path: string },
      public headers = new Headers(),
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
import { resetSsoExchangeStateForTests } from "@/lib/auth/sso-exchange";

function renderLoginForm() {
  return render(<LoginForm />);
}

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSsoExchangeStateForTests();
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

  it("preserva la sesión previa y sanea la URL si falla un handoff SSO", async () => {
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
      expect(mockGet).toHaveBeenCalledWith(
        "/auth/sso?token=invalid",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
            "X-Request-Id": expect.any(String),
          }),
        }),
      );
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toEqual(previousUser);
    expect(useAuthStore.getState().accessToken).toBe("old-access-token");
    expect(document.cookie).toContain("old-access-token");
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("");
    expect(toast.error).toHaveBeenCalledWith(
      "El enlace de acceso es inválido, expiró o ya fue utilizado. Inicia sesión manualmente.",
    );
  });

  it("permite enviar el login manual sin refresh después de un fallo SSO", async () => {
    const { api, ApiRequestError } = await import("@/lib/api-client");
    const mockGet = vi.mocked(api.get);
    const mockPost = vi.mocked(api.post);
    mockGet.mockRejectedValue(
      new ApiRequestError(401, {
        statusCode: 401,
        message: "Invalid handoff token",
        error: "Unauthorized",
        timestamp: new Date().toISOString(),
        path: "/auth/sso",
      }),
    );
    mockPost.mockResolvedValue(new Promise(() => undefined));

    const user = userEvent.setup();
    render(<LoginForm ssoToken="invalid" />);

    const identifier = await screen.findByPlaceholderText(
      /12345678 o usuario@correo.com/i,
    );
    const password = screen.getByPlaceholderText(/Tu contraseña/i);
    await user.type(identifier, "12345678");
    await user.type(password, "Password123");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/auth/login", {
        identifier: "12345678",
        password: "Password123",
      });
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("");
  });

  it("mantiene un único exchange bajo Strict Mode y converge a la sesión B", async () => {
    const { api } = await import("@/lib/api-client");
    const mockGet = vi.mocked(api.get);
    let resolveExchange!: (value: never) => void;
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolveExchange = resolve;
      }),
    );

    const previousUser: AuthUser = {
      id: "session-a",
      firstName: "Session",
      lastName: "A",
      email: "a@example.com",
      documentNumber: "11111111",
      onboardingCompleted: true,
      authSource: "LOCAL",
      role: { code: "ADMIN_SISTEMA", name: "Admin" },
    };
    useAuthStore.getState().setAuth(previousUser, "access-a");
    document.cookie = "access_token=access-a; path=/; SameSite=Strict";

    render(
      <StrictMode>
        <LoginForm ssoToken="handoff-b" />
      </StrictMode>,
    );

    expect(mockGet).toHaveBeenCalledTimes(1);
    resolveExchange({
      accessToken: "access-b",
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      sessionExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      onboardingRequired: false,
      user: {
        id: "session-b",
        firstName: "Session",
        lastName: "B",
        email: "b@example.com",
        epeDni: "22222222",
        onboardingCompleted: true,
        authSource: "EPE",
        roles: [{ code: "EMPLEADO_EPE", name: "Empleado EPE" }],
      },
    } as never);

    await waitFor(() => {
      expect(useAuthStore.getState().user?.id).toBe("session-b");
      expect(useAuthStore.getState().accessToken).toBe("access-b");
    });
    expect(document.cookie).toContain("access_token=access-b");
    expect(window.location.search).toBe("");
    expect(api.post).not.toHaveBeenCalledWith("/auth/logout", expect.anything());
  });

  it("unmount cancela efectos de UI sin cancelar ni destruir la sesión A", async () => {
    const { api } = await import("@/lib/api-client");
    const { toast } = await import("sonner");
    const mockGet = vi.mocked(api.get);
    let rejectExchange!: (reason: unknown) => void;
    mockGet.mockReturnValue(
      new Promise((_, reject) => {
        rejectExchange = reject;
      }),
    );
    const previousUser: AuthUser = {
      id: "session-a",
      firstName: "Session",
      lastName: "A",
      email: "a@example.com",
      documentNumber: "11111111",
      onboardingCompleted: true,
      authSource: "LOCAL",
      role: { code: "ADMIN_SISTEMA", name: "Admin" },
    };
    useAuthStore.getState().setAuth(previousUser, "access-a");
    document.cookie = "access_token=access-a; path=/; SameSite=Strict";

    const view = render(<LoginForm ssoToken="handoff-b" />);
    view.unmount();
    rejectExchange(new Error("offline"));
    await Promise.resolve();

    expect(useAuthStore.getState().user).toEqual(previousUser);
    expect(useAuthStore.getState().accessToken).toBe("access-a");
    expect(document.cookie).toContain("access_token=access-a");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sin token deja el login manual operativo y no inicia SSO", async () => {
    const { api } = await import("@/lib/api-client");
    const mockGet = vi.mocked(api.get);
    const mockPost = vi.mocked(api.post).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();

    renderLoginForm();
    await user.type(screen.getByPlaceholderText(/12345678 o usuario@correo.com/i), "12345678");
    await user.type(screen.getByPlaceholderText(/Tu contraseña/i), "Password123");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith("/auth/login", {
      identifier: "12345678",
      password: "Password123",
    });
  });

  it.each([
    ["SSO_INACTIVE", "Tu usuario está inactivo o suspendido."],
    ["SSO_BUSY", "El acceso ya se está procesando. Intenta nuevamente en unos segundos."],
    ["SSO_EXPIRED", "El enlace de acceso es inválido, expiró o ya fue utilizado. Inicia sesión manualmente."],
    ["SSO_REPLAY", "El enlace de acceso es inválido, expiró o ya fue utilizado. Inicia sesión manualmente."],
    ["SSO_PROVISIONING_FAILED", "No se pudo preparar tu acceso. Tu sesión anterior se conserva; inicia sesión manualmente."],
    ["SSO_SESSION_PERSISTENCE_FAILED", "No se pudo guardar la nueva sesión. Tu sesión anterior se conserva; inicia sesión manualmente."],
    ["SSO_FINALIZE_FAILED", "No se pudo finalizar el acceso automático. Tu sesión anterior se conserva; intenta nuevamente o inicia sesión manualmente."],
    ["SSO_UPSTREAM_UNAVAILABLE", "Error al procesar el acceso automático. Tu sesión anterior se conserva; inicia sesión manualmente."],
  ])("muestra el mensaje recuperable correcto para %s", async (code, message) => {
    const { api, ApiRequestError } = await import("@/lib/api-client");
    const { toast } = await import("sonner");
    vi.mocked(api.get).mockRejectedValue(
      new ApiRequestError(409, {
        statusCode: 409,
        code,
        message: code,
        error: "Conflict",
        timestamp: new Date().toISOString(),
        path: "/auth/sso",
      }),
    );

    render(<LoginForm ssoToken={`token-${code}`} />);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(screen.getByRole("button", { name: /ingresar/i })).toBeEnabled();
  });
});
