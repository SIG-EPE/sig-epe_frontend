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

// Mock auth-store
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: vi.fn((selector: (state: { setAuth: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ setAuth: vi.fn() })
  ),
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

function renderLoginForm() {
  return render(<LoginForm />);
}

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
