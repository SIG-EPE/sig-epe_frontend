import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewPlanningLineForm } from "../new-planning-line-form";

const state = vi.hoisted(() => ({
  catalogEnabled: true,
  ready: true,
  legacyAllowed: false,
  role: "GIOF_GESTOR",
  fiscalYear: "year",
}));
const ceilingGet = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const success = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() =>
  vi.fn(async (path: string, dto: Record<string, string>) => ({
    id: `${path}-${dto.name}`,
    name: dto.name,
  })),
);

vi.mock("@/lib/api-client", () => ({
  api: { post, get: ceilingGet },
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public body: { message: string | string[]; code?: string } = {
        message: "untrusted server detail",
      },
    ) {
      super("untrusted server detail");
    }
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success, error: errorToast } }));
vi.mock("@/config/features", () => ({
  isPoaCatalogCodeModelEnabled: () => state.catalogEnabled,
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: {
      user: { role: { code: string } };
      accessToken: string;
    }) => unknown,
  ) => selector({ user: { role: { code: state.role } }, accessToken: "token" }),
}));
vi.mock("@/config/poa-territory-selection", () => ({
  getPoaTerritorySelectionFeatures: () => ({ writeEnabled: false }),
}));
vi.mock("@/hooks/use-budget", () => ({
  useActiveFiscalYear: () => ({
    data: {
      id: state.fiscalYear,
      year: state.fiscalYear === "year" ? 2026 : 2027,
    },
  }),
  useBudgetCategories: () => ({
    data: [{ id: "category", name: "Tipo", code: "T" }],
  }),
  useCreatePlanningLine: () => ({ create, isLoading: false }),
}));
vi.mock("@/hooks/use-catalogs", () => ({
  usePoaHierarchyCapability: () => ({
    enabled: state.ready,
    legacyAllowed: state.legacyAllowed,
    reason: state.ready ? null : "Esquema no disponible",
  }),
  useCatalogOrganizationalUnits: () => ({
    data: [{ id: "org", name: "Organización", code: "ORG", is_active: true }],
    refetch: vi.fn(),
  }),
  useCatalogBudgetPrograms: () => ({
    data: [{ id: "program", name: "Programa", is_active: true }],
    refetch: vi.fn(),
  }),
  useCatalogTerritories: () => ({ data: [] }),
  useCreateOrganizationalUnit: () => ({ create: vi.fn() }),
  useCreateBudgetProgram: () => ({ create: vi.fn() }),
  useStrategicComponents: () => ({ data: [], refetch: vi.fn() }),
  useOperativeActions: () => ({ data: [], refetch: vi.fn() }),
  usePoaResources: () => ({ data: [], refetch: vi.fn() }),
  createPoaResource: vi.fn(),
}));
vi.mock("@/components/ui/search-select-modal", () => ({
  SearchSelectModal: ({
    title,
    onChange,
    disabled,
  }: {
    title: string;
    onChange: (id: string | null) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(title.includes("Unidad") ? "org" : "program")}
    >
      {title}
    </button>
  ),
}));
vi.mock("@/components/ui/combobox-create", () => ({
  ComboboxCreate: ({
    placeholder,
    disabled,
    onCreateNew,
    onChange,
  }: {
    placeholder: string;
    disabled?: boolean;
    onCreateNew?: (name: string) => Promise<{ id: string }>;
    onChange: (id: string) => void;
  }) => (
    <div>
      <button type="button" disabled={disabled}>
        {placeholder}
      </button>
      {onCreateNew && (
        <button
          type="button"
          data-testid={`create-${placeholder}`}
          disabled={disabled}
          onClick={() => {
            void onCreateNew("Nuevo").then((item) => onChange(item.id));
          }}
        >
          Agregar nuevo
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/components/shared/territory-selector", () => ({
  TerritorySelector: () => null,
}));
vi.mock("@/components/shared/structured-territory-selector", () => ({
  StructuredTerritorySelector: () => null,
}));

describe("current POA hierarchy selector behavior (no writes)", () => {
  beforeEach(() => {
    state.catalogEnabled = true;
    state.ready = true;
    state.legacyAllowed = false;
    state.role = "GIOF_GESTOR";
    state.fiscalYear = "year";
    ceilingGet.mockReset();
    ceilingGet.mockResolvedValue({
      ceiling: 1000,
      used: 200,
      available: 800,
      warning: false,
    });
    create.mockReset();
    push.mockReset();
    success.mockReset();
    errorToast.mockReset();
    post.mockClear();
  });

  it("shows the selected UO/year snapshot and recalculates cost as price and quantity change", async () => {
    state.role = "GIOF_MANAGER";
    const { rerender } = render(<NewPlanningLineForm />);
    expect(ceilingGet).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    await waitFor(() =>
      expect(screen.getAllByText(/800[.,]00/)).toHaveLength(2),
    );
    fireEvent.change(screen.getByLabelText("P.U. (Precio Unitario) *"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("Q (Cantidad) *"), {
      target: { value: "3" },
    });
    expect(screen.getByText(/725[.,]00/)).toBeInTheDocument();
    state.fiscalYear = "next-year";
    rerender(<NewPlanningLineForm />);
    expect(screen.queryByText(/725[.,]00/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(ceilingGet).toHaveBeenCalledWith(
        expect.stringContaining("fiscal_year_id=next-year"),
        expect.anything(),
      ),
    );
  });

  it("does not invent zero ceiling when backend has no configured ceiling", async () => {
    state.role = "GIOF_MANAGER";
    ceilingGet.mockResolvedValue({
      ceiling: null,
      used: 200,
      available: null,
      warning: false,
    });
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    expect(
      await screen.findByText("Sin techo configurado"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("No aplica (sin techo)")).toHaveLength(2);
  });

  it("maps a ceiling create 400 to a UO/year budget error, not a resource error", async () => {
    state.role = "GIOF_MANAGER";
    const { ApiRequestError } = await import("@/lib/api-client");
    create.mockRejectedValueOnce(
      new ApiRequestError(400, {
        statusCode: 400,
        message:
          "El total de líneas aprobadas excede el techo presupuestal de la UO (techo: 1000, aprobado: 900, nuevo: 200)",
        error: "Bad Request",
        timestamp: "",
        path: "",
      }),
    );
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar componente..."),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("create-Buscar o agregar acción operativa..."),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar acción operativa..."),
    );
    const field = await screen.findByRole("textbox", {
      name: "Nombre del recurso POA *",
    });
    await waitFor(() => expect(field).toBeEnabled());
    fireEvent.change(field, { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText("Tipo de Recurso *"), {
      target: { value: "category" },
    });
    fireEvent.submit(field.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Organización en 2026",
    );
    expect(
      screen.queryByText(
        "Revisa el nombre del recurso y la acción operativa seleccionada.",
      ),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not request or display ceiling data to a role without permission", () => {
    state.role = "SOLICITANTE_EPE";
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    expect(ceilingGet).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("Vista previa del techo UO"),
    ).not.toBeInTheDocument();
  });

  it("searches organization and program; descendants are gated by their selected parent", () => {
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    expect(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Buscar o agregar componente..." }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Buscar o agregar acción operativa...",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    expect(
      screen.getByRole("button", { name: "Buscar o agregar componente..." }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Buscar o agregar acción operativa...",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Agregar unidad orgánica" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Agregar programa" }),
    ).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });

  it("ignores the obsolete public flag when backend readiness is confirmed", () => {
    state.catalogEnabled = false;
    render(<NewPlanningLineForm />);
    expect(
      screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Descripción del Recurso *"),
    ).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "explains unready hierarchy and hides free-text creation even when legacyAllowed=%s",
    (legacyAllowed) => {
      state.role = "GIOF_MANAGER";
      state.ready = false;
      state.legacyAllowed = legacyAllowed;
      render(<NewPlanningLineForm />);
      expect(screen.getByText(/Esquema no disponible/)).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Descripción del Recurso *"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Nombre del recurso POA *"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Buscar o agregar componente/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Guardar línea POA" }),
      ).toBeDisabled();
      fireEvent.submit(
        screen
          .getByRole("button", { name: "Guardar línea POA" })
          .closest("form")!,
      );
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("keeps descendant search but never exposes Add to a read-only role", () => {
    state.role = "SOLICITANTE_EPE";
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    expect(
      screen.getByRole("button", { name: "Buscar o agregar componente..." }),
    ).toBeEnabled();
    expect(
      screen.queryByTestId("create-Buscar o agregar componente..."),
    ).not.toBeInTheDocument();
  });

  it("posts each descendant with its selected parent and cascades the returned ids", async () => {
    state.role = "GIOF_MANAGER";
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar componente..."),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/catalogs/strategic-components", {
        name: "Nuevo",
        program_id: "program",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("create-Buscar o agregar acción operativa..."),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar acción operativa..."),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/catalogs/operative-actions", {
        name: "Nuevo",
        component_id: "/catalogs/strategic-components-Nuevo",
      }),
    );
    const input = screen.getByRole("textbox", {
      name: "Nombre del recurso POA *",
    });
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "Nuevo" } });
    expect(post).not.toHaveBeenCalledWith(
      "/catalogs/poa-resources",
      expect.anything(),
    );
  });

  it("submits a new typed resource with its action in a single atomic request", async () => {
    state.role = "GIOF_MANAGER";
    create.mockResolvedValue({ id: "line" });
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar componente..."),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("create-Buscar o agregar acción operativa..."),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar acción operativa..."),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
      ).toBeEnabled(),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
      { target: { value: "  Útiles escolares  " } },
    );
    fireEvent.change(screen.getByLabelText("Tipo de Recurso *"), {
      target: { value: "category" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Guardar línea POA" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          operative_action_id: "/catalogs/operative-actions-Nuevo",
          new_resource: {
            name: "Útiles escolares",
            action_id: "/catalogs/operative-actions-Nuevo",
          },
          planning_type: "PROGRAMA",
          program_id: "program",
          component_id: "/catalogs/strategic-components-Nuevo",
          unit_price: 0,
          quantity: 0,
        }),
      ),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty("resource_id");
    expect(create.mock.calls[0][0]).not.toHaveProperty("resource_description");
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/budget/planning/line"),
    );
    expect(push).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith("Línea POA creada exitosamente");
  });

  it("requires program and component before any line POST", async () => {
    state.role = "GIOF_MANAGER";
    render(<NewPlanningLineForm />);
    const form = screen
      .getByRole("button", { name: "Guardar línea POA" })
      .closest("form")!;
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    fireEvent.change(screen.getByLabelText("Tipo de Recurso *"), {
      target: { value: "category" },
    });
    fireEvent.submit(form);
    expect(
      await screen.findByText("Selecciona un programa, proyecto o gestión"),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    fireEvent.submit(form);
    expect(
      await screen.findByText("Selecciona un componente estratégico"),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([409, 400])(
    "keeps the editable name after a failed %i submission without creating a catalog resource",
    async (status) => {
      state.role = "GIOF_MANAGER";
      const { ApiRequestError } = await import("@/lib/api-client");
      create.mockRejectedValueOnce(
        new ApiRequestError(status, {
          statusCode: status,
          message:
            status === 400
              ? "new_resource.name must be a nonblank safe name of at most 500 characters"
              : "untrusted server detail",
          error: "error",
          timestamp: "",
          path: "",
        }),
      );
      render(<NewPlanningLineForm />);
      fireEvent.click(
        screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Seleccionar Programa" }),
      );
      fireEvent.click(
        screen.getByTestId("create-Buscar o agregar componente..."),
      );
      await waitFor(() =>
        expect(
          screen.getByTestId("create-Buscar o agregar acción operativa..."),
        ).toBeEnabled(),
      );
      fireEvent.click(
        screen.getByTestId("create-Buscar o agregar acción operativa..."),
      );
      const field = await screen.findByRole("textbox", {
        name: "Nombre del recurso POA *",
      });
      await waitFor(() => expect(field).toBeEnabled());
      fireEvent.change(field, { target: { value: "Original" } });
      fireEvent.change(screen.getByLabelText("Tipo de Recurso *"), {
        target: { value: "category" },
      });
      fireEvent.submit(field.closest("form")!);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          status === 409 ? "Ya existe" : "Revisa el nombre",
        ),
      );
      expect(
        screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
      ).toHaveValue("Original");
      expect(post).not.toHaveBeenCalledWith(
        "/catalogs/poa-resources",
        expect.anything(),
      );
      expect(push).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
    },
  );

  it("never posts a line when the catalog is unready", async () => {
    state.role = "GIOF_MANAGER";
    state.ready = false;
    state.legacyAllowed = true;
    create.mockRejectedValueOnce(new Error("Servidor no disponible"));
    render(<NewPlanningLineForm />);
    const form = screen
      .getByRole("button", { name: "Guardar línea POA" })
      .closest("form")!;
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    fireEvent.change(screen.getByLabelText("Tipo de Recurso *"), {
      target: { value: "category" },
    });
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps unready mode blocked across rerenders and repeated submissions", async () => {
    state.role = "GIOF_MANAGER";
    state.ready = false;
    state.legacyAllowed = true;
    const { rerender } = render(<NewPlanningLineForm />);
    const form = screen
      .getByRole("button", { name: "Guardar línea POA" })
      .closest("form")!;
    fireEvent.submit(form);
    rerender(<NewPlanningLineForm />);
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("retains selected parents and the typed name when readiness temporarily drops", async () => {
    state.role = "GIOF_MANAGER";
    const { rerender } = render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Unidad Orgánica" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar componente..."),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("create-Buscar o agregar acción operativa..."),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar acción operativa..."),
    );
    const name = await screen.findByRole("textbox", {
      name: "Nombre del recurso POA *",
    });
    await waitFor(() => expect(name).toBeEnabled());
    fireEvent.change(name, { target: { value: "Draft retained" } });

    state.ready = false;
    rerender(<NewPlanningLineForm />);
    expect(
      screen.queryByLabelText("Nombre del recurso POA *"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Descripción del Recurso *"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar línea POA" }),
    ).toBeDisabled();

    state.ready = true;
    rerender(<NewPlanningLineForm />);
    expect(
      screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
    ).toHaveValue("Draft retained");
    expect(
      screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
    ).toBeEnabled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not invent a detail URL when the catalog is unready", async () => {
    state.role = "GIOF_MANAGER";
    state.ready = false;
    state.legacyAllowed = true;
    create.mockResolvedValueOnce({});
    render(<NewPlanningLineForm />);
    const form = screen
      .getByRole("button", { name: "Guardar línea POA" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("clears a typed resource when its parent changes and never writes on unknown readiness", async () => {
    state.role = "GIOF_MANAGER";
    const { rerender } = render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar componente..."),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("create-Buscar o agregar acción operativa..."),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByTestId("create-Buscar o agregar acción operativa..."),
    );
    const field = await screen.findByRole("textbox", {
      name: "Nombre del recurso POA *",
    });
    await waitFor(() => expect(field).toBeEnabled());
    fireEvent.change(field, { target: { value: "Draft" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    expect(field).toHaveValue("");
    expect(field).toBeDisabled();
    state.ready = false;
    state.legacyAllowed = false;
    rerender(<NewPlanningLineForm />);
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Guardar línea POA" })
        .closest("form")!,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts keyboard entry in the single responsive resource field with no extra Add step", async () => {
    state.role = "GIOF_MANAGER";
    const user = userEvent.setup();
    render(<NewPlanningLineForm />);
    await user.click(
      screen.getByRole("button", { name: "Seleccionar Programa" }),
    );
    await user.click(
      screen.getByTestId("create-Buscar o agregar componente..."),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("create-Buscar o agregar acción operativa..."),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByTestId("create-Buscar o agregar acción operativa..."),
    );
    const input = screen.getByRole("textbox", {
      name: "Nombre del recurso POA *",
    });
    await waitFor(() => expect(input).toBeEnabled());
    await user.click(input);
    await user.type(input, "Material de campo");
    expect(input).toHaveValue("Material de campo");
    expect(input).toHaveAttribute("maxlength", "500");
    expect(
      screen.queryByTestId("create-Buscar o agregar recurso POA..."),
    ).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith(
      "/catalogs/poa-resources",
      expect.anything(),
    );
  });
});
