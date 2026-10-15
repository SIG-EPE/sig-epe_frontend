import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningHierarchyEditor } from "../planning-hierarchy-editor";
import { ApiRequestError } from "@/lib/api-client";
import type { PlanningLine } from "@/types/budget";

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  refetch: vi.fn(),
  role: "GIOF_MANAGER",
  enabled: true,
}));
vi.mock("@/lib/api-client", async (original) => ({
  ...(await original<typeof import("@/lib/api-client")>()),
  api: { patch: mocks.patch, get: mocks.get, post: mocks.post },
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({ user: { role: { code: mocks.role } } }),
}));
vi.mock("@/hooks/use-catalogs", () => ({
  usePoaHierarchyCapability: () => ({ enabled: mocks.enabled }),
  useCatalogOrganizationalUnits: () => ({ data: [{ id: "ou", name: "Unidad", is_active: true }], refetch: mocks.refetch }),
  useCatalogBudgetPrograms: () => ({ data: [{ id: "p", name: "Programa", is_active: true, planningType: "PROGRAMA" }], refetch: mocks.refetch }),
  useStrategicComponents: (id: string) => ({ data: [{ id: "c", name: "Componente", programId: "p", isActive: true }], loadedFor: id, refetch: mocks.refetch }),
  useOperativeActions: (id: string) => ({ data: [{ id: "a", name: "Acción", componentId: "c", isActive: true }], loadedFor: id, refetch: mocks.refetch }),
}));

const line = {
  id: "line-1", status: "APPROVED", organizational_unit_id: "ou", planning_type: "PROGRAMA",
  program_id: "p", operative_action_id: "a", resource_id: "r", resource_description: "Recurso",
  poaHierarchy: {
    component: { id: "c", name: "Componente" }, action: { id: "a", name: "Acción" },
    resource: { id: "r", name: "Recurso" },
  },
} as PlanningLine;

const cases = [
  ["Unidad orgánica", "/catalogs/organizational-units/ou"],
  ["Programa", "/catalogs/budget-programs/p"],
  ["Componente estratégico", "/catalogs/strategic-components/c"],
  ["Acción operativa", "/catalogs/operative-actions/a"],
  ["Recurso POA", "/catalogs/poa-resources/r"],
] as const;

describe("renombrar catálogo desde la jerarquía", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "GIOF_MANAGER";
    mocks.enabled = true;
    mocks.patch.mockResolvedValue({ name: "Nuevo" });
  });

  it.each(cases)("PATCH de %s usa solo name y conserva ID", async (label, path) => {
    const refresh = vi.fn();
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} onCatalogRenamed={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: `Editar nombre de ${label}` }));
    fireEvent.change(screen.getByRole("textbox", { name: `Nuevo nombre de ${label}` }), { target: { value: "  Nuevo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith(path, { name: "Nuevo" }));
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(label === "Recurso POA" ? "Nuevo" : "Recurso");
    expect(screen.getByLabelText("Programa / proyecto / gestión *")).toHaveValue("p");
  });

  it.each(["GIOF_GESTOR", "SOLICITANTE_EPE"])("oculta edición a %s", (role) => {
    mocks.role = role;
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Editar nombre de/ })).not.toBeInTheDocument();
  });

  it("permite ADMIN y mantiene la edición inmediata aunque haya un nombre pendiente", () => {
    mocks.role = "ADMIN_SISTEMA";
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Editar nombre de Recurso POA" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), { target: { value: "Privado nuevo" } });
    expect(screen.getByRole("button", { name: "Editar nombre de Recurso POA" })).toBeInTheDocument();
  });

  it("no duplica PATCH del catálogo tras Editar nombre y mantiene otras entradas pendientes", async () => {
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Borrador" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar nombre de Recurso POA" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nuevo nombre de Recurso POA" }),
      { target: { value: "Actualizado" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
      "Actualizado",
    );
    expect(screen.getByLabelText("Programa / proyecto / gestión *")).toHaveValue(
      "p",
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(2));
    expect(
      mocks.patch.mock.calls.filter(
        ([path]) => path === "/catalogs/poa-resources/r",
      ),
    ).toHaveLength(1);
    expect(mocks.patch.mock.calls[1]).toEqual([
      "/budget/planning-lines/line-1",
      { hierarchy: expect.objectContaining({ resource_name: "Actualizado" }) },
    ]);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("no permite editar un nodo sin ID ni con capacidad deshabilitada", () => {
    const { rerender } = render(<PlanningHierarchyEditor line={{ ...line, organizational_unit_id: "", resource_id: null, poaHierarchy: null } as PlanningLine} onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Editar nombre de Unidad orgánica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar nombre de Recurso POA" })).not.toBeInTheDocument();
    mocks.enabled = false;
    rerender(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Editar nombre de/ })).not.toBeInTheDocument();
  });

  it.each([400, 403, 409])("mantiene entradas y muestra error HTTP %s sin cerrar", async (status) => {
    mocks.patch.mockRejectedValue(new ApiRequestError(status, { statusCode: status, message: "diagnóstico privado", error: "Error", path: "", timestamp: "now" }));
    const refresh = vi.fn();
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} onCatalogRenamed={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar nombre de Recurso POA" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo nombre de Recurso POA" }), { target: { value: "  Otro  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("diagnóstico privado");
    expect(screen.getByRole("textbox", { name: "Nuevo nombre de Recurso POA" })).toHaveValue("  Otro  ");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("valida máximo y bloquea doble envío mientras espera", async () => {
    let finish!: (value: { name: string }) => void;
    mocks.patch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar nombre de Unidad orgánica" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo nombre de Unidad orgánica" }), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo nombre de Unidad orgánica" }), { target: { value: "x".repeat(201) } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo nombre de Unidad orgánica" }), { target: { value: "Válido" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    finish({ name: "Válido" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Editar nombre de/ })).not.toBeInTheDocument());
  });

  it.each(["APPROVED", "DRAFT"] as const)("renombra RESOURCE y después guarda jerarquía %s con el ID seleccionado, sin POST", async (status) => {
    const approvedSave = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    mocks.patch.mockResolvedValue({ name: "Nuevo" });
    render(<PlanningHierarchyEditor line={{ ...line, status }} onSaved={onSaved} approvedSave={status === "APPROVED" ? approvedSave : undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar nombre de Recurso POA" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo nombre de Recurso POA" }), { target: { value: "Nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/catalogs/poa-resources/r", { name: "Nuevo" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Editar nombre de Recurso/ })).not.toBeInTheDocument());
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue("Nuevo");
    expect(line.resource_id).toBe("r");
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
    const hierarchy = expect.objectContaining({
      organizational_unit_id: "ou", planning_type: "PROGRAMA", program_id: "p",
      component_id: "c", operative_action_id: "a", resource_name: "Nuevo",
    });
    if (status === "APPROVED") {
      await waitFor(() => expect(approvedSave).toHaveBeenCalledWith(hierarchy, expect.anything()));
      expect(mocks.patch).toHaveBeenCalledTimes(1);
    } else {
      await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/budget/planning-lines/line-1", { hierarchy }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(approvedSave).not.toHaveBeenCalled();
    }
    expect(mocks.post).not.toHaveBeenCalled();
    expect(line.resource_id).toBe("r");
  });

  it("Escape cierra solo el diálogo de nombre y devuelve foco al botón sin perder el editor", async () => {
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Editar nombre de Recurso POA" });
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByRole("dialog", { name: "Editar nombre de Recurso POA" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar nombre de Recurso POA" })).not.toBeInTheDocument());
    expect(button).toHaveFocus();
    expect(screen.getByRole("region", { name: "Editar jerarquía POA" })).toBeInTheDocument();
  });
});
