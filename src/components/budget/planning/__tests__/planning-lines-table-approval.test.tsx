import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningLinesTable } from "../planning-lines-table";
import type { PlanningLine } from "@/types/budget";

const mocks = vi.hoisted(() => ({ role: "GIOF_MANAGER", approve: vi.fn(), refetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: () => ({ user: { id: "manager", role: { code: mocks.role } } }) }));
vi.mock("@/hooks/use-budget", async (importActual) => ({
  ...await importActual<typeof import("@/hooks/use-budget")>(),
  approvePlanningLine: mocks.approve,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const line = { id: "line-1", created_by: "other", status: "SUBMITTED", resource_description: "Recurso", created_at: "2026-09-27T12:00:00Z", total_cost: 120 } as PlanningLine;

describe("table POA approval", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role = "GIOF_MANAGER"; });

  it("only offers approval to authorized role and relies on the single approval notification for refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PlanningLinesTable lines={[line]} isLoading={false} onRefetch={mocks.refetch} />);
    mocks.role = "SOLICITANTE_EPE";
    rerender(<PlanningLinesTable lines={[line]} isLoading={false} onRefetch={mocks.refetch} />);
    await user.click(screen.getByRole("button"));
    expect(screen.queryByRole("menuitem", { name: "Aprobar" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    mocks.role = "GIOF_MANAGER";
    rerender(<PlanningLinesTable lines={[line]} isLoading={false} onRefetch={mocks.refetch} />);
    await user.click(screen.getByRole("button"));
    mocks.approve.mockResolvedValue({ ...line, status: "APPROVED" });
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Aprobar" }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith("line-1"));
    expect(mocks.refetch).not.toHaveBeenCalled();
    rerender(<PlanningLinesTable lines={[{ ...line, status: "APPROVED" }]} isLoading={false} onRefetch={mocks.refetch} />);
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
  });

  it("does not change the badge or refetch after a rejected approval", async () => {
    mocks.approve.mockRejectedValue(new Error("No autorizado"));
    const user = userEvent.setup();
    render(<PlanningLinesTable lines={[line]} isLoading={false} onRefetch={mocks.refetch} />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("menuitem", { name: "Aprobar" }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalled());
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it.each(["ADMIN_SISTEMA", "GIOF_GESTOR", "SOLICITANTE_EPE"])(
    "hides approve, reject and rejection dialog from %s while keeping detail navigation",
    async (role) => {
      mocks.role = role;
      const user = userEvent.setup();
      render(<PlanningLinesTable lines={[line]} isLoading={false} onRefetch={mocks.refetch} />);
      await user.click(screen.getByRole("button"));
      expect(screen.getByRole("menuitem", { name: "Ver detalle" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Aprobar" })).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Rechazar" })).not.toBeInTheDocument();
      await user.keyboard("{r}{a}{Enter}");
      expect(screen.queryByRole("dialog", { name: /Rechazar linea/i })).not.toBeInTheDocument();
      expect(mocks.approve).not.toHaveBeenCalled();
    },
  );

  it("offers both review actions to the manager, including keyboard menu access", async () => {
    const user = userEvent.setup();
    render(<PlanningLinesTable lines={[line]} isLoading={false} onRefetch={mocks.refetch} />);
    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Aprobar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rechazar" })).toBeInTheDocument();
  });
});
