import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRow } from "@/components/admin/users/user-row";
import type { UserDto } from "@/hooks/use-users";
import { ROLE_CODE } from "@/lib/constants";

const mocks = vi.hoisted(() => ({
  actorId: "actor-1",
  actorRole: "GIOF_MANAGER",
  assignRole: vi.fn(),
  membershipLoading: false,
  setGiofMembership: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/hooks/use-users", async (importActual) => {
  const actual = await importActual<typeof import("@/hooks/use-users")>();
  return {
    ...actual,
    useAssignRole: () => ({ assignRole: mocks.assignRole, isLoading: false }),
    useSetGiofMembership: () => ({
      setGiofMembership: mocks.setGiofMembership,
      isLoading: mocks.membershipLoading,
    }),
  };
});

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: {
        id: mocks.actorId,
        role: { code: mocks.actorRole, name: mocks.actorRole },
      },
    }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

function buildUser(roleCode: string, overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: "target-1",
    firstName: "Ana",
    lastName: "Perez",
    email: "ana@example.com",
    epeDni: "12345678",
    isActive: true,
    onboardingCompleted: true,
    authSource: "LOCAL",
    roles: [{ code: roleCode, name: roleCode }],
    createdAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function renderRow(user: UserDto) {
  const props = {
    onRefetch: vi.fn(),
    onEdit: vi.fn(),
    onDeactivate: vi.fn(),
    onReactivate: vi.fn(),
  };

  render(
    <table>
      <tbody>
        <UserRow user={user} {...props} />
      </tbody>
    </table>,
  );

  return props;
}

async function openActions() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Abrir menu" }));
  return user;
}

describe("UserRow GIOF membership", () => {
  beforeEach(() => {
    mocks.actorId = "actor-1";
    mocks.actorRole = ROLE_CODE.GIOF_MANAGER;
    mocks.membershipLoading = false;
    mocks.assignRole.mockReset();
    mocks.setGiofMembership.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("offers grant for another active requester and preserves existing GIOF actions", async () => {
    renderRow(buildUser(ROLE_CODE.SOLICITANTE_EPE));

    await openActions();

    expect(screen.getByRole("menuitem", { name: "Conceder rol GIOF" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Editar" })).toBeEnabled();
    expect(screen.getByText("Asignar rol")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Desactivar" })).toBeEnabled();
  });

  it("offers revoke for another GIOF", async () => {
    renderRow(buildUser(ROLE_CODE.GIOF_GESTOR));

    await openActions();

    expect(screen.getByRole("menuitem", { name: "Retirar rol GIOF" })).toBeEnabled();
    expect(screen.queryByRole("menuitem", { name: "Conceder rol GIOF" })).not.toBeInTheDocument();
  });

  it("does not offer grant to an inactive requester", async () => {
    renderRow(buildUser(ROLE_CODE.SOLICITANTE_EPE, { isActive: false }));
    await openActions();
    expect(screen.queryByText("Conceder rol GIOF")).not.toBeInTheDocument();
  });

  it("allows revoking an inactive GIOF", async () => {
    renderRow(buildUser(ROLE_CODE.GIOF_GESTOR, { isActive: false }));
    await openActions();
    expect(screen.getByRole("menuitem", { name: "Retirar rol GIOF" })).toBeEnabled();
  });

  it.each([
    ["self", ROLE_CODE.SOLICITANTE_EPE, { id: "actor-1" }],
    ["admin", ROLE_CODE.ADMIN_SISTEMA, {}],
    ["auditor", ROLE_CODE.AUDITOR_DIRECCION, {}],
    ["sponsor", "PATROCINADOR", {}],
  ])("does not offer membership action for %s target", async (_case, roleCode, overrides) => {
    renderRow(buildUser(roleCode, overrides));

    await openActions();

    expect(screen.queryByText(/(?:Conceder|Retirar) rol GIOF/)).not.toBeInTheDocument();
  });

  it("does not offer membership action to a non-GIOF actor and keeps admin generic UI", async () => {
    mocks.actorRole = ROLE_CODE.ADMIN_SISTEMA;
    renderRow(buildUser(ROLE_CODE.SOLICITANTE_EPE));

    await openActions();

    expect(screen.queryByText(/(?:Conceder|Retirar) rol GIOF/)).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Editar" })).toBeEnabled();
    expect(screen.getByText("Asignar rol")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Desactivar" })).toBeEnabled();
  });

  it("does not expose user administration actions to GIOF_GESTOR", async () => {
    mocks.actorRole = ROLE_CODE.GIOF_GESTOR;
    renderRow(buildUser(ROLE_CODE.SOLICITANTE_EPE));

    await openActions();

    expect(screen.queryByText(/(?:Conceder|Retirar) rol GIOF/)).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Editar" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: "Asignar rol" })).toHaveAttribute("data-disabled");
  });

  it("requires confirmation, calls the dedicated mutation and refreshes after success", async () => {
    mocks.setGiofMembership.mockResolvedValueOnce(undefined);
    const props = renderRow(buildUser(ROLE_CODE.SOLICITANTE_EPE));
    const user = await openActions();

    await user.click(screen.getByRole("menuitem", { name: "Conceder rol GIOF" }));

    const dialog = await screen.findByRole("dialog", { name: "Conceder rol GIOF" });
    expect(mocks.setGiofMembership).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Ana Perez/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Conceder rol GIOF" }));

    await waitFor(() => {
      expect(mocks.setGiofMembership).toHaveBeenCalledWith("target-1", true);
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Rol GIOF concedido");
    expect(props.onRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Conceder rol GIOF" })).not.toBeInTheDocument();
  });

  it("keeps the confirmation open and does not report success after backend rejection", async () => {
    mocks.setGiofMembership.mockRejectedValueOnce(new Error("Transicion no permitida"));
    const props = renderRow(buildUser(ROLE_CODE.GIOF_GESTOR));
    const user = await openActions();

    await user.click(screen.getByRole("menuitem", { name: "Retirar rol GIOF" }));
    const dialog = await screen.findByRole("dialog", { name: "Retirar rol GIOF" });
    await user.click(within(dialog).getByRole("button", { name: "Retirar rol GIOF" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Transicion no permitida");
    });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(props.onRefetch).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Retirar rol GIOF" })).toBeInTheDocument();
  });

  it("disables confirmation controls while the membership mutation is loading", async () => {
    mocks.membershipLoading = true;
    renderRow(buildUser(ROLE_CODE.SOLICITANTE_EPE));
    const user = await openActions();

    await user.click(screen.getByRole("menuitem", { name: "Conceder rol GIOF" }));
    const dialog = await screen.findByRole("dialog", { name: "Conceder rol GIOF" });

    expect(within(dialog).getByRole("button", { name: "Procesando..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cerrar" })).toBeDisabled();
  });
});
