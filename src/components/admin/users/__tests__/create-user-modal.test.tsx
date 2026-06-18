import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreateUserModal } from "@/components/admin/users/create-user-modal";
import { ROLE_CODE } from "@/lib/constants";

const createUserMock = vi.fn();
let actorRoleCode: string | null = ROLE_CODE.ADMIN_SISTEMA;

vi.mock("@/hooks/use-users", () => ({
  useCreateUser: () => ({ createUser: createUserMock, isLoading: false }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { role: { code: string | null } } }) => unknown) =>
    selector({ user: { role: { code: actorRoleCode } } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderModal() {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  const view = render(<CreateUserModal onClose={onClose} onSuccess={onSuccess} />);

  return { ...view, onClose, onSuccess };
}

describe("CreateUserModal role options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actorRoleCode = ROLE_CODE.ADMIN_SISTEMA;
  });

  it("permite a ADMIN_SISTEMA ver todos los roles activos", () => {
    renderModal();

    expect(screen.getByRole("option", { name: /solicitante epe/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /giof gestor/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /auditor dirección/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /admin sistema/i })).toBeInTheDocument();
  });

  it("limita a GIOF_GESTOR a roles de menor nivel", () => {
    actorRoleCode = ROLE_CODE.GIOF_GESTOR;
    renderModal();

    expect(screen.getByRole("option", { name: /solicitante epe/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /auditor dirección/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /giof gestor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /admin sistema/i })).not.toBeInTheDocument();
  });

  it("sanitiza DNI pegado y limita a 8 dígitos", async () => {
    const user = userEvent.setup();
    renderModal();

    const dniInput = screen.getByLabelText(/dni epe/i);
    await user.type(dniInput, "12ab3456789");

    expect(dniInput).toHaveValue("12345678");
  });

  it("muestra errores inline y no crea usuario con datos inválidos", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/dni epe/i), "123");
    await user.type(screen.getByLabelText(/email/i), "correo-invalido");
    await user.click(screen.getByRole("button", { name: /crear usuario/i }));

    expect(screen.getByText(/ingresa el nombre/i)).toBeInTheDocument();
    expect(screen.getByText(/ingresa el apellido/i)).toBeInTheDocument();
    expect(screen.getByText(/dni epe debe tener 8 dígitos/i)).toBeInTheDocument();
    expect(screen.getByText(/ingresa un correo válido/i)).toBeInTheDocument();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("normaliza datos válidos, crea usuario y cierra el modal", async () => {
    const user = userEvent.setup();
    createUserMock.mockResolvedValueOnce(undefined);
    const { onClose, onSuccess } = renderModal();

    await user.type(screen.getByLabelText(/nombre/i), " Ada ");
    await user.type(screen.getByLabelText(/apellido/i), " Lovelace ");
    await user.type(screen.getByLabelText(/dni epe/i), "12345678");
    await user.type(screen.getByLabelText(/email/i), " Ada@Example.COM ");
    await user.click(screen.getByRole("button", { name: /crear usuario/i }));

    expect(createUserMock).toHaveBeenCalledWith({
      firstName: "Ada",
      lastName: "Lovelace",
      epeDni: "12345678",
      email: "ada@example.com",
      roleCode: ROLE_CODE.SOLICITANTE_EPE,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reinicia estado de validación al cancelar", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: /crear usuario/i }));
    expect(screen.getByText(/ingresa el nombre/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/ingresa el nombre/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/dni epe/i)).toHaveValue("");
  });
});
