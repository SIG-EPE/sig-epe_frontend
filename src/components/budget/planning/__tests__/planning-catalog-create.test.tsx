import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewPlanningLineForm } from "../new-planning-line-form";
import { ApiRequestError } from "@/lib/api-client";

const state = vi.hoisted(() => ({
  role: "GIOF_MANAGER",
  catalogEnabled: true,
  programs: [
    {
      id: "p1",
      name: "Actual",
      code: "A",
      is_active: true,
      planningType: "PROGRAMA",
    },
  ],
  orgs: [{ id: "o1", name: "Actual org", code: "AO", is_active: true }],
  territory: [{ id: "t1", name: "Región", is_active: true }],
}));
const calls = vi.hoisted(() => ({
  createOrg: vi.fn(),
  createProgram: vi.fn(),
  refetchOrg: vi.fn(),
  refetchProgram: vi.fn(),
  line: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (s: { user: { role: { code: string } } }) => unknown,
  ) => selector({ user: { role: { code: state.role } } }),
}));
vi.mock("@/config/features", () => ({
  isPoaCatalogCodeModelEnabled: () => state.catalogEnabled,
}));
vi.mock("@/config/poa-territory-selection", () => ({
  getPoaTerritorySelectionFeatures: () => ({ writeEnabled: false }),
}));
vi.mock("@/hooks/use-budget", () => ({
  useActiveFiscalYear: () => ({ data: { id: "year", year: 2026 } }),
  useBudgetCategories: () => ({ data: [] }),
  useCreatePlanningLine: () => ({ create: calls.line, isLoading: false }),
}));
vi.mock("@/hooks/use-catalogs", () => ({
  usePoaHierarchyCapability: () => ({ enabled: true, reason: null }),
  useCatalogOrganizationalUnits: () => ({
    data: state.orgs,
    refetch: calls.refetchOrg,
  }),
  useCatalogBudgetPrograms: () => ({
    data: state.programs,
    refetch: calls.refetchProgram,
  }),
  useCatalogTerritories: () => ({ data: state.territory }),
  useCreateOrganizationalUnit: () => ({ create: calls.createOrg }),
  useCreateBudgetProgram: () => ({ create: calls.createProgram }),
  useStrategicComponents: () => ({ data: [], refetch: vi.fn() }),
  useOperativeActions: () => ({ data: [], refetch: vi.fn() }),
  usePoaResources: () => ({ data: [], refetch: vi.fn() }),
  createPoaResource: vi.fn(),
}));
vi.mock("@/components/ui/search-select-modal", () => ({
  SearchSelectModal: ({
    title,
    items,
    value,
    onChange,
    getItemId,
    getItemLabel,
  }: {
    title: string;
    items: { id: string; name: string }[];
    value: string | null;
    onChange: (v: string | null) => void;
    getItemId: (v: { id: string; name: string }) => string;
    getItemLabel: (v: { id: string; name: string }) => string;
  }) => (
    <div>
      <input
        aria-label={`Buscar ${title}`}
        onChange={(e) => {
          const match = items.find((item) =>
            getItemLabel(item).includes(e.target.value),
          );
          if (match) onChange(getItemId(match));
        }}
      />
      <span data-testid={title}>{value ?? ""}</span>
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => onChange(getItemId(item))}
        >
          {getItemLabel(item)}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/ui/combobox-create", () => ({
  ComboboxCreate: ({
    placeholder,
    disabled,
  }: {
    placeholder: string;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled}>
      {placeholder}
    </button>
  ),
}));
vi.mock("@/components/shared/territory-selector", () => ({
  TerritorySelector: () => null,
}));
vi.mock("@/components/shared/structured-territory-selector", () => ({
  StructuredTerritorySelector: () => null,
}));

describe("POA catálogo contextual", () => {
  beforeEach(() => {
    state.role = "GIOF_MANAGER";
    state.catalogEnabled = true;
    state.programs = [
      {
        id: "p1",
        name: "Actual",
        code: "A",
        is_active: true,
        planningType: "PROGRAMA",
      },
    ];
    state.orgs = [
      { id: "o1", name: "Actual org", code: "AO", is_active: true },
    ];
    vi.clearAllMocks();
    calls.refetchOrg.mockResolvedValue(undefined);
    calls.refetchProgram.mockResolvedValue(undefined);
  });

  it("expone búsqueda y Agregar en ambos niveles solo a roles creadores, incluso con flag legacy", () => {
    state.catalogEnabled = false;
    render(<NewPlanningLineForm />);
    expect(
      screen.getByLabelText("Buscar Seleccionar Unidad Orgánica"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Buscar Seleccionar Programa"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Agregar unidad orgánica" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Agregar programa" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: "Nombre del recurso POA *" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Buscar o agregar recurso POA..." }),
    ).not.toBeInTheDocument();
  });

  it("explica permisos de solo lectura y nunca invoca POST", () => {
    state.role = "GIOF_GESTOR";
    render(<NewPlanningLineForm />);
    expect(
      screen.getByRole("button", { name: "Agregar unidad orgánica" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Agregar programa" }),
    ).toBeDisabled();
    expect(
      screen.getAllByText(/Solo GIOF Manager o Admin Sistema/),
    ).toHaveLength(2);
    expect(calls.createOrg).not.toHaveBeenCalled();
  });

  it("valida prefijo y nombre y auto-selecciona UO tras invalidar/refetch, sin borrar el programa ni presupuesto", async () => {
    calls.createOrg.mockResolvedValue({
      id: "o2",
      name: "Nueva unidad",
      code: "NU",
      is_active: true,
    });
    render(<NewPlanningLineForm />);
    fireEvent.click(screen.getByText("Actual"));
    fireEvent.change(screen.getByLabelText("P.U. (Precio Unitario) *"), {
      target: { value: "12" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Agregar unidad orgánica" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Crear unidad orgánica" }),
    );
    expect(calls.createOrg).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Nueva unidad" },
    });
    fireEvent.change(screen.getByLabelText("Sigla o código POA *"), {
      target: { value: "NU-" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Crear unidad orgánica" }),
    );
    expect(calls.createOrg).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Sigla o código POA *"), {
      target: { value: "NU" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Crear unidad orgánica" }),
    );
    await waitFor(() =>
      expect(calls.createOrg).toHaveBeenCalledWith({
        name: "Nueva unidad",
        code: "NU",
      }),
    );
    await waitFor(() => expect(calls.refetchOrg).toHaveBeenCalled());
    expect(screen.getByTestId("Seleccionar Unidad Orgánica")).toHaveTextContent(
      "o2",
    );
    expect(screen.getByTestId("Seleccionar Programa")).toHaveTextContent("p1");
    expect(screen.getByLabelText("P.U. (Precio Unitario) *")).toHaveValue(12);
  });

  it("crea programa con tipo fijo y territorio activo requerido; doble clic no duplica POST", async () => {
    let resolve!: (value: unknown) => void;
    calls.createProgram.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<NewPlanningLineForm />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar programa" }));
    fireEvent.change(screen.getByLabelText("Código *"), {
      target: { value: "P2" },
    });
    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Nuevo programa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear programa" }));
    expect(calls.createProgram).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Territorio activo *"), {
      target: { value: "t1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear programa" }));
    fireEvent.click(screen.getByRole("button", { name: "Creando..." }));
    expect(calls.createProgram).toHaveBeenCalledTimes(1);
    expect(calls.createProgram).toHaveBeenCalledWith({
      code: "P2",
      name: "Nuevo programa",
      planningType: "PROGRAMA",
      territory_id: "t1",
    });
    resolve({
      id: "p2",
      name: "Nuevo programa",
      code: "P2",
      planningType: "PROGRAMA",
      is_active: true,
    });
    await waitFor(() => expect(calls.refetchProgram).toHaveBeenCalled());
    expect(screen.getByTestId("Seleccionar Programa")).toHaveTextContent("p2");
  });

  it("muestra conflicto sin elegir ni reintentar", async () => {
    calls.createProgram.mockRejectedValueOnce(
      new ApiRequestError(409, {
        statusCode: 409,
        message: "Duplicado",
        error: "Conflict",
        timestamp: "",
        path: "",
      }),
    );
    render(<NewPlanningLineForm />);
    fireEvent.click(screen.getByText("Actual"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar programa" }));
    fireEvent.change(screen.getByLabelText("Código *"), {
      target: { value: "P2" },
    });
    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Nuevo" },
    });
    fireEvent.change(screen.getByLabelText("Territorio activo *"), {
      target: { value: "t1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear programa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ya existe/i);
    expect(screen.getByTestId("Seleccionar Programa")).toHaveTextContent("p1");
    expect(calls.createProgram).toHaveBeenCalledTimes(1);
  });

  it("muestra 403 sin divulgar el cuerpo del servidor", async () => {
    calls.createOrg.mockRejectedValueOnce(
      new ApiRequestError(403, {
        statusCode: 403,
        message: "internal secret",
        error: "Forbidden",
        timestamp: "",
        path: "",
      }),
    );
    render(<NewPlanningLineForm />);
    fireEvent.click(
      screen.getByRole("button", { name: "Agregar unidad orgánica" }),
    );
    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Nuevo" },
    });
    fireEvent.change(screen.getByLabelText("Sigla o código POA *"), {
      target: { value: "ABC" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Crear unidad orgánica" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no tienes permiso/i,
    );
    expect(screen.queryByText("internal secret")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("Seleccionar Unidad Orgánica"),
    ).toBeEmptyDOMElement();
  });

  it("cambia tipo y limpia programa y descendientes, sin perder org ni precio", () => {
    render(<NewPlanningLineForm />);
    fireEvent.click(screen.getByText("Actual org"));
    fireEvent.click(screen.getByText("Actual"));
    fireEvent.change(screen.getByLabelText("P.U. (Precio Unitario) *"), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByLabelText("Tipo *"), {
      target: { value: "PROYECTO" },
    });
    expect(screen.getByTestId("Seleccionar Proyecto")).toBeEmptyDOMElement();
    expect(screen.getByTestId("Seleccionar Unidad Orgánica")).toHaveTextContent(
      "o1",
    );
    expect(screen.getByLabelText("P.U. (Precio Unitario) *")).toHaveValue(14);
  });
});
