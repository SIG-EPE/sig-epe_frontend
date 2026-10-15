import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningHierarchyEditor } from "../planning-hierarchy-editor";
import { buildPlanningHierarchy } from "@/lib/planning-hierarchy-edit";
import type { PlanningLine } from "@/types/budget";
import { ApiRequestError } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
  catalogState: { mode: "ready", role: "GIOF_MANAGER", enabled: true },
}));
vi.mock("@/lib/api-client", async (original) => ({
  ...(await original<typeof import("@/lib/api-client")>()),
  api: { get: mocks.get, patch: mocks.patch, post: mocks.post },
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({
      accessToken: "token",
      isLoading: false,
      user: { role: { code: mocks.catalogState.role } },
    }),
}));
vi.mock("@/hooks/use-catalogs", () => ({
  usePoaHierarchyCapability: () => ({ enabled: mocks.catalogState.enabled }),
  useCatalogOrganizationalUnits: () => ({
    data:
      mocks.catalogState.mode === "ready"
        ? [
            { id: "ou", name: "Origen", is_active: true },
            { id: "ou2", name: "Destino", is_active: true },
          ]
        : mocks.catalogState.mode === "empty"
          ? []
          : null,
  }),
  useCatalogBudgetPrograms: () => ({
    data:
      mocks.catalogState.mode === "ready"
        ? [
            {
              id: "p",
              name: "Programa",
              is_active: true,
              planningType: "PROGRAMA",
            },
            {
              id: "p2",
              name: "Otro programa",
              is_active: true,
              planningType: "PROGRAMA",
            },
          ]
        : mocks.catalogState.mode === "empty"
          ? []
          : null,
  }),
  useStrategicComponents: (programId: string) => ({
    refetch: vi.fn(),
    loadedFor: mocks.catalogState.mode === "loading" ? null : programId,
    data:
      mocks.catalogState.mode === "ready"
        ? [
            { id: "c", name: "Componente", isActive: true, programId: "p" },
            {
              id: "c2",
              name: "Otro componente",
              isActive: true,
              programId: "p2",
            },
          ]
        : [],
  }),
  useOperativeActions: (componentId: string) => ({
    refetch: vi.fn(),
    loadedFor: mocks.catalogState.mode === "loading" ? null : componentId,
    data:
      mocks.catalogState.mode === "ready"
        ? [
            { id: "a", name: "Acción", isActive: true, componentId: "c" },
            {
              id: "a2",
              name: "Otra acción",
              isActive: true,
              componentId: "c2",
            },
          ]
        : [],
  }),
}));

const line = {
  id: "line-1",
  line_code: "POA-1",
  status: "DRAFT",
  organizational_unit_id: "ou",
  planning_type: "PROGRAMA",
  program_id: "p",
  operative_action_id: "a",
  resource_description: "Anterior",
  resource_id: "private-resource",
  poaHierarchy: {
    component: { id: "c", name: "Componente", fullCode: "C" },
    action: { id: "a", name: "Acción", fullCode: "A" },
    resource: { id: "private-resource", name: "Anterior", fullCode: "R" },
  },
} as PlanningLine;

describe("edición de jerarquía POA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalogState.mode = "ready";
    mocks.catalogState.role = "GIOF_MANAGER";
    mocks.catalogState.enabled = true;
    mocks.patch.mockResolvedValue(line);
  });
  it("hides node creation for a non-manager role", () => {
    mocks.catalogState.role = "SOLICITANTE_EPE";
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    );
    fireEvent.change(
      screen.getByPlaceholderText("Buscar o agregar componente"),
      { target: { value: "No autorizado" } },
    );
    expect(
      screen.queryByRole("button", { name: /Agregar "No autorizado"/ }),
    ).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("fails closed when hierarchy schema capability is unavailable", () => {
    mocks.catalogState.enabled = false;
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Guardar jerarquía" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/actualización aún no está disponible/),
    ).toBeInTheDocument();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it("draft changes only this line's organizational unit without changing its chain", async () => {
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Unidad orgánica" }));
    fireEvent.click(screen.getByRole("button", { name: "Destino" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        "/budget/planning-lines/line-1",
        {
          hierarchy: expect.objectContaining({
            organizational_unit_id: "ou2",
            program_id: "p",
            component_id: "c",
            operative_action_id: "a",
          }),
        },
      ),
    );
    expect(mocks.patch.mock.calls[0][1]).not.toHaveProperty("request_id");
  });
  it.each(["DRAFT", "APPROVED"] as const)(
    "%s renames an existing resource on hierarchy Save without a catalog POST or a visible ID",
    async (status) => {
      const approvedSave = vi.fn().mockResolvedValue(undefined);
      const onSaved = vi.fn();
      render(
        <PlanningHierarchyEditor
          line={{ ...line, status }}
          onSaved={onSaved}
          approvedSave={status === "APPROVED" ? approvedSave : undefined}
        />,
      );
      expect(
        screen.getByText(
          "Renombrar este recurso también cambia su nombre en otras líneas que lo comparten. Cambiarlo de acción está sujeto a las restricciones existentes.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Editar jerarquía POA" }),
      ).not.toHaveTextContent("private-resource");
      fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
        target: { value: "Renombrado" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
      const hierarchy = expect.objectContaining({
        operative_action_id: "a",
        resource_name: "Renombrado",
      });
      if (status === "DRAFT")
        await waitFor(() =>
          expect(mocks.patch).toHaveBeenCalledWith(
            "/budget/planning-lines/line-1",
            { hierarchy },
          ),
        );
      else
        await waitFor(() =>
          expect(approvedSave).toHaveBeenCalledWith(
            hierarchy,
            expect.objectContaining({ resource: "Renombrado" }),
          ),
        );
      expect(mocks.post).not.toHaveBeenCalled();
      expect(
        mocks.patch.mock.calls.some(([path]) =>
          path.startsWith("/catalogs/poa-resources"),
        ),
      ).toBe(false);
    },
  );
  it("blocks historical lines without resource identity instead of creating a resource", () => {
    render(
      <PlanningHierarchyEditor
        line={{ ...line, resource_id: null, poaHierarchy: null } as PlanningLine}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Nombre del recurso POA *")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Guardar jerarquía" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      /sin recurso POA asociado/,
    );
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("explains an action-move 409 without losing the entered resource name", async () => {
    mocks.patch.mockRejectedValue(
      new ApiRequestError(409, {
        statusCode: 409,
        error: "Conflict",
        message: "private",
        timestamp: "now",
        path: "",
      }),
    );
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Programa / proyecto / gestión *"), {
      target: { value: "p2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Otro componente" }));
    fireEvent.click(screen.getByRole("button", { name: "Acción operativa *" }));
    fireEvent.click(screen.getByRole("button", { name: "Otra acción" }));
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Intento" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /compartido o publicado/,
    );
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
      "Intento",
    );
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(["loading", "empty"])(
    "blocks %s catalog validation without losing the draft",
    async (mode) => {
      mocks.catalogState.mode = mode;
      render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
        target: { value: "Borrador intacto" },
      });
      if (mode === "loading")
        expect(
          screen.getByRole("button", { name: "Guardar jerarquía" }),
        ).toBeDisabled();
      else {
        fireEvent.click(
          screen.getByRole("button", { name: "Guardar jerarquía" }),
        );
        expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
      }
      expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
        "Borrador intacto",
      );
      expect(mocks.patch).not.toHaveBeenCalled();
    },
  );
  it("keeps newly created component selected and labeled after creating its action", async () => {
    mocks.post
      .mockResolvedValueOnce({ id: "new-c", name: "Componente creado" })
      .mockResolvedValueOnce({ id: "new-a", name: "Acción creada" });
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
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Componente estratégico *" }),
      ).toHaveTextContent("Componente creado"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Acción operativa *" }));
    fireEvent.change(
      screen.getByPlaceholderText("Buscar o agregar acción operativa"),
      { target: { value: "Acción creada" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: 'Agregar "Acción creada"' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Acción operativa *" }),
      ).toHaveTextContent("Acción creada"),
    );
    expect(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    ).toHaveTextContent("Componente creado");
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Recurso nuevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        "/budget/planning-lines/line-1",
        {
          hierarchy: expect.objectContaining({
            component_id: "new-c",
            operative_action_id: "new-a",
          }),
        },
      ),
    );
  });
  it("requires six fields and rejects unsafe resource names", () => {
    expect(
      buildPlanningHierarchy({
        organizational_unit_id: "ou",
        planning_type: "PROGRAMA",
        program_id: "p",
        component_id: "",
        operative_action_id: "a",
        resource_name: "nuevo",
      }).hierarchy,
    ).toBeNull();
    expect(
      buildPlanningHierarchy({
        organizational_unit_id: "ou",
        planning_type: "PROGRAMA",
        program_id: "p",
        component_id: "c",
        operative_action_id: "a",
        resource_name: "bad\nname",
      }).hierarchy,
    ).toBeNull();
  });
  it("clears descendants when program changes and sends only hierarchy to draft PATCH", async () => {
    render(<PlanningHierarchyEditor line={line} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Programa / proyecto / gestión *"), {
      target: { value: "p2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Componente estratégico *" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Otro componente" }));
    fireEvent.click(screen.getByRole("button", { name: "Acción operativa *" }));
    fireEvent.click(screen.getByRole("button", { name: "Otra acción" }));
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "  Nuevo  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar jerarquía" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        "/budget/planning-lines/line-1",
        {
          hierarchy: {
            organizational_unit_id: "ou",
            planning_type: "PROGRAMA",
            program_id: "p2",
            component_id: "c2",
            operative_action_id: "a2",
            resource_name: "Nuevo",
          },
        },
      ),
    );
    expect(mocks.patch.mock.calls[0][1]).not.toHaveProperty("resource_id");
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each([400, 403, 409, 500])(
    "retains resource name and avoids a false success on HTTP %s",
    async (status) => {
      mocks.patch.mockRejectedValue(
        new ApiRequestError(status, {
          statusCode: status,
          error: "Error",
          message:
            status === 500 ? "audit table missing" : "diagnóstico privado",
          timestamp: "now",
          path: "",
        }),
      );
      const saved = vi.fn();
      render(<PlanningHierarchyEditor line={line} onSaved={saved} />);
      fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
        target: { value: "Nombre privado" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Guardar jerarquía" }),
      );
      const alert = await screen.findByRole("alert");
      expect(alert).not.toHaveTextContent("diagnóstico privado");
      if (status === 500)
        expect(alert).toHaveTextContent(/actualización aún no está disponible/);
      expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
        "Nombre privado",
      );
      expect(saved).not.toHaveBeenCalled();
    },
  );
});
