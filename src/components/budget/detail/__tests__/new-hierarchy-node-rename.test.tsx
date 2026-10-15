import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningHierarchyEditor } from "../planning-hierarchy-editor";
import { ApiRequestError } from "@/lib/api-client";
import type { PlanningLine } from "@/types/budget";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  get: vi.fn(),
  refetch: vi.fn(),
  role: "GIOF_MANAGER",
  enabled: true,
  components: [{ id: "c", name: "Componente", programId: "p", isActive: true }],
  actions: [{ id: "a", name: "Acción", componentId: "c", isActive: true }],
}));
vi.mock("@/lib/api-client", async (original) => ({
  ...(await original<typeof import("@/lib/api-client")>()),
  api: { post: mocks.post, patch: mocks.patch, get: mocks.get },
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({ user: { role: { code: mocks.role } } }),
}));
vi.mock("@/hooks/use-catalogs", () => ({
  usePoaHierarchyCapability: () => ({ enabled: mocks.enabled }),
  useCatalogOrganizationalUnits: () => ({
    data: [{ id: "ou", name: "Unidad", is_active: true }],
  }),
  useCatalogBudgetPrograms: () => ({
    data: [
      { id: "p", name: "Programa", is_active: true, planningType: "PROGRAMA" },
    ],
  }),
  useStrategicComponents: (id: string) => ({
    data: mocks.components,
    loadedFor: id,
    refetch: mocks.refetch,
  }),
  useOperativeActions: (id: string) => ({
    data: mocks.actions,
    loadedFor: id,
    refetch: mocks.refetch,
  }),
}));

const line = {
  id: "line-1",
  status: "DRAFT",
  organizational_unit_id: "ou",
  planning_type: "PROGRAMA",
  program_id: "p",
  operative_action_id: "a",
  resource_description: "Recurso",
  poaHierarchy: {
    component: { id: "c", name: "Componente" },
    action: { id: "a", name: "Acción" },
  },
} as PlanningLine;

async function create(label: string, placeholder: string, name: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.change(screen.getByPlaceholderText(placeholder), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole("button", { name: `Agregar "${name}"` }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: label })).toHaveTextContent(name),
  );
}

describe("rename newly persisted hierarchy nodes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.role = "GIOF_MANAGER";
    mocks.enabled = true;
    mocks.components = [
      { id: "c", name: "Componente", programId: "p", isActive: true },
    ];
    mocks.actions = [
      { id: "a", name: "Acción", componentId: "c", isActive: true },
    ];
    mocks.post
      .mockResolvedValueOnce({ id: "new-c", name: "Componente creado" })
      .mockResolvedValueOnce({ id: "new-a", name: "Acción creada" });
    mocks.patch.mockResolvedValue({ name: "Renombrado" });
    mocks.refetch.mockResolvedValue(undefined);
  });

  it.each(["GIOF_MANAGER", "ADMIN_SISTEMA"])(
    "allows %s to rename the created component without a catalog reload",
    async (role) => {
      mocks.role = role;
      const renamed = vi.fn();
      render(
        <PlanningHierarchyEditor
          line={line}
          onSaved={vi.fn()}
          onCatalogRenamed={renamed}
        />,
      );
      await create(
        "Componente estratégico *",
        "Buscar o agregar componente",
        "Componente creado",
      );
      expect(mocks.post).toHaveBeenCalledWith(
        "/catalogs/strategic-components",
        { name: "Componente creado", program_id: "p" },
      );
      fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
        target: { value: "Presupuesto sin guardar" },
      });
      fireEvent.click(
        screen.getByRole("button", {
          name: "Editar nombre de Componente estratégico",
        }),
      );
      expect(
        screen.getByRole("textbox", {
          name: "Nuevo nombre de Componente estratégico",
        }),
      ).toHaveValue("Componente creado");
      fireEvent.change(
        screen.getByRole("textbox", {
          name: "Nuevo nombre de Componente estratégico",
        }),
        { target: { value: "Renombrado" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
      await waitFor(() =>
        expect(mocks.patch).toHaveBeenCalledWith(
          "/catalogs/strategic-components/new-c",
          { name: "Renombrado" },
        ),
      );
      await waitFor(() => expect(renamed).toHaveBeenCalledTimes(1));
      expect(mocks.patch).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "Componente estratégico *" }),
      ).toHaveTextContent("Renombrado");
      expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
        "Presupuesto sin guardar",
      );
      expect(mocks.get).not.toHaveBeenCalled();
    },
  );

  it("keeps the parent chain and selected IDs when renaming an action created after the component", async () => {
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    await create(
      "Componente estratégico *",
      "Buscar o agregar componente",
      "Componente creado",
    );
    await create(
      "Acción operativa *",
      "Buscar o agregar acción operativa",
      "Acción creada",
    );
    expect(mocks.post).toHaveBeenLastCalledWith("/catalogs/operative-actions", {
      name: "Acción creada",
      component_id: "new-c",
    });
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Recurso pendiente" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar nombre de Acción operativa" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Nuevo nombre de Acción operativa" }),
    ).toHaveValue("Acción creada");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nuevo nombre de Acción operativa" }),
      { target: { value: "Acción editada" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        "/catalogs/operative-actions/new-a",
        { name: "Acción editada" },
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Editar nombre de Acción/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Acción operativa *" }),
    ).toHaveTextContent("Acción editada");
    expect(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    ).toHaveTextContent("Componente creado");
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
      "Recurso pendiente",
    );
    expect(
      screen.getByRole("button", { name: "Editar nombre de Acción operativa" }),
    ).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("keeps the created-name fallback while catalog refetch is stale and does not expose it on another selection", async () => {
    const { rerender } = render(
      <PlanningHierarchyEditor line={line} onSaved={vi.fn()} />,
    );
    await create(
      "Componente estratégico *",
      "Buscar o agregar componente",
      "Componente creado",
    );
    expect(
      screen.getByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    ).toBeInTheDocument();
    rerender(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    );
    expect(
      screen.getByRole("textbox", {
        name: "Nuevo nombre de Componente estratégico",
      }),
    ).toHaveValue("Componente creado");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Componente" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    );
    expect(
      screen.getByRole("textbox", {
        name: "Nuevo nombre de Componente estratégico",
      }),
    ).toHaveValue("Componente");
  });

  it("hides edits for unauthorized roles, missing IDs and disabled capability", async () => {
    const { rerender } = render(
      <PlanningHierarchyEditor line={line} onSaved={vi.fn()} />,
    );
    await create(
      "Componente estratégico *",
      "Buscar o agregar componente",
      "Componente creado",
    );
    mocks.role = "SOLICITANTE_EPE";
    rerender(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    expect(
      screen.queryByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    ).not.toBeInTheDocument();
    mocks.role = "GIOF_MANAGER";
    mocks.enabled = false;
    rerender(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    expect(
      screen.queryByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    ).not.toBeInTheDocument();
    mocks.enabled = true;
    rerender(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "— Sin selección —" }));
    expect(
      screen.queryByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    ).not.toBeInTheDocument();
  });

  it("retains selection and the dialog on a 403 rename response", async () => {
    mocks.patch.mockRejectedValue(
      new ApiRequestError(403, {
        statusCode: 403,
        error: "Forbidden",
        message: "private",
        path: "",
        timestamp: "now",
      }),
    );
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    await create(
      "Componente estratégico *",
      "Buscar o agregar componente",
      "Componente creado",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tienes permiso",
    );
    expect(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    ).toHaveTextContent("Componente creado");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("does not offer a rename while creation is pending, before a persisted ID exists", async () => {
    let finish!: (node: { id: string; name: string }) => void;
    mocks.post.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    );
    fireEvent.change(
      screen.getByPlaceholderText("Buscar o agregar componente"),
      { target: { value: "Componente creado" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: 'Agregar "Componente creado"' }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Editar nombre de Componente estratégico",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Editar nombre de Acción operativa",
      }),
    ).not.toBeInTheDocument();
    finish({ id: "new-c", name: "Componente creado" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Editar nombre de Componente estratégico",
        }),
      ).toBeInTheDocument(),
    );
  });
});
