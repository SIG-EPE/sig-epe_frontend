import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApprovedAmendmentModal,
  ApprovedAmendmentWarnings,
} from "../approved-amendment-modal";
import type { PlanningLine, PlanningLineHierarchyInput } from "@/types/budget";
import { PlanningHierarchyEditor } from "../planning-hierarchy-editor";
import { seedPlanningHierarchy } from "@/lib/planning-hierarchy-edit";
import { ApiRequestError } from "@/lib/api-client";
import {
  buildApprovedAmendment,
  seedApprovedAmendment,
} from "@/lib/approved-amendment";

const mocks = vi.hoisted(() => ({
  readRevision: vi.fn(),
  save: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  role: "GIOF_MANAGER",
  createCategory: vi.fn(),
  createFunding: vi.fn(),
  updateFunding: vi.fn(),
  programsLoading: false,
}));
vi.mock("@/hooks/use-approved-amendment", () => ({
  useApprovedAmendment: (id: string) => ({
    readRevision: mocks.readRevision,
    readDetail: (signal: AbortSignal) =>
      mocks.get(`/budget/planning-lines/${id}`, { cache: "no-store", signal }),
    save: mocks.save,
    isSaving: false,
  }),
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: { get: mocks.get, patch: mocks.patch, post: mocks.post, delete: mocks.delete },
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: Object.assign(
    (selector: (state: object) => unknown) => selector({ user: { role: { code: mocks.role } } }),
    { getState: () => ({ accessToken: null, user: { id: "test-user", role: { code: mocks.role } } }) },
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-catalogs", () => ({
  usePoaHierarchyCapability: () => ({ enabled: true }),
  useCreateBudgetCategory: () => ({ create: mocks.createCategory, isLoading: false }),
  useCreateFundingSource: () => ({ create: mocks.createFunding, isLoading: false }),
  useUpdateFundingSource: () => ({ update: mocks.updateFunding, isLoading: false }),
  useFundingSourceTypes: () => ({ data: [{ id: "type-1", name: "Cooperación" }], isLoading: false }),
  useCatalogOrganizationalUnits: () => ({
    data: [
      { id: "ou", name: "Unidad anterior", is_active: true },
      { id: "ou2", name: "Nueva unidad", is_active: true },
    ],
  }),
  useCatalogBudgetPrograms: () => ({
    data: mocks.programsLoading ? null : [
      { id: "fd403745-fd23-4e08-a3dd-99c6f0c6a250", name: "TTGEST30JUN TEST GESTION", is_active: true, planningType: "GESTION" },
      { id: "gest-next", name: "Otra gestión", is_active: true, planningType: "GESTION" },
      {
        id: "p2",
        name: "Nuevo programa",
        is_active: true,
         planningType: "PROGRAMA",
       },
       { id: "p3", name: "Programa destino", is_active: true, planningType: "PROGRAMA" },
    ],
  }),
  useStrategicComponents: (programId: string) => ({
    loadedFor: programId,
    data: [
       { id: "7abcddbf-c969-4a11-8de9-170967a696be", name: "test-21", isActive: true, programId: "fd403745-fd23-4e08-a3dd-99c6f0c6a250" },
       { id: "c2", name: "Nuevo componente", isActive: true, programId: "p2" },
       { id: "c3", name: "Componente alternativo", isActive: true, programId: "p2" },
       { id: "c4", name: "Componente destino", isActive: true, programId: "p3" },
    ],
  }),
  useOperativeActions: (componentId: string) => ({
    loadedFor: componentId,
    data: [
       { id: "58719c73-c0f6-4c8b-9c9f-90a114d77242", name: "asd", isActive: true, componentId: "7abcddbf-c969-4a11-8de9-170967a696be" },
       { id: "a2", name: "Nueva acción", isActive: true, componentId: "c2" },
       { id: "a3", name: "Acción alternativa", isActive: true, componentId: "c2" },
       { id: "a4", name: "Acción destino", isActive: true, componentId: "c4" },
    ],
  }),
}));

const line = {
  id: "line-1",
  status: "APPROVED",
  resource_id: null,
  resource_description: "Recurso libre",
  unit_price: 100,
  quantity: 1,
  unit_price_decimal: "100.00",
  quantity_decimal: "1.00",
  importance: "Actividad estratégica",
  frequency: "Actividad Rutinaria",
  total_cost: 100,
  monthlyDistribution: Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    planning_line_id: "line-1",
    month: i + 1,
    planned_amount: i ? 0 : 100,
    executed_amount: 0,
    monthly_programmed_decimal: i ? "0.00" : "100.00",
  })),
} as PlanningLine;
const revision = { line_id: "line-1", revision: "4" };
const currentProgramId = "fd403745-fd23-4e08-a3dd-99c6f0c6a250";
const currentLine = {
  ...line,
  id: "061fc014-6f4a-4693-9acd-f231fb3a9a86",
  line_code: "AMA-POA2026-005",
  organizational_unit_id: "ou",
  planning_type: "GESTION" as const,
  program_id: null,
  programId: currentProgramId,
  program: { id: currentProgramId, name: "TTGEST30JUN TEST GESTION" },
  resource_id: "d964562b-8121-4f13-9e07-a7339b5ab5f4",
  resource_description: "S1_ALIMENTACIÓN GESTION",
  unit_price: 750,
  quantity: 2,
  total_cost: 1500,
  unit_price_decimal: "750.00",
  quantity_decimal: "2.00",
  operative_action_id: "58719c73-c0f6-4c8b-9c9f-90a114d77242",
  poaHierarchy: {
    component: { id: "7abcddbf-c969-4a11-8de9-170967a696be", name: "test-21", fullCode: "DISPLAY-C" },
    action: { id: "58719c73-c0f6-4c8b-9c9f-90a114d77242", name: "asd", fullCode: "DISPLAY-A" },
    resource: { id: "d964562b-8121-4f13-9e07-a7339b5ab5f4", name: "S1_ALIMENTACIÓN GESTION", fullCode: "DISPLAY-R" },
  },
  monthlyDistribution: line.monthlyDistribution?.map((row) => ({
    ...row,
    planned_amount: row.month === 2 || row.month === 6 ? 750 : 0,
    monthly_programmed_decimal: row.month === 2 || row.month === 6 ? "750.00" : "0.00",
  })),
};
const linkedResourceLine = {
  ...line,
  line_code: "AMA-POA2026-005",
  resource_id: "existing-resource",
  organizational_unit_id: "ou",
  planning_type: "PROGRAMA",
  program_id: "p2",
  operative_action_id: "a2",
  poaHierarchy: {
    component: { id: "c2", name: "Nuevo componente" },
    action: { id: "a2", name: "Nueva acción" },
    resource: { id: "existing-resource", name: "Recurso libre", fullCode: "DISPLAY-ONLY" },
  },
} as PlanningLine;

interface DraftProbeProps {
  source: PlanningLine;
  onChange: (draft: PlanningLineHierarchyInput) => void;
  onValidation: (valid: boolean) => void;
}

function DraftProbe({ source, onChange, onValidation }: DraftProbeProps) {
  const [draft, setDraft] = useState(() => seedPlanningHierarchy(source));
  return <PlanningHierarchyEditor line={source} draft={draft} onSaved={() => {}}
    onDraftChange={(next) => { setDraft(next); onChange(next); }}
    onValidationChange={onValidation} />;
}
const response = {
  line: {
    id: "line-1",
    status: "APPROVED",
    unit_price: "100.00",
    quantity: "1.00",
    total_cost: "100.00",
    importance: line.importance,
    frequency: line.frequency,
    resource_description: line.resource_description,
    monthly: [],
  },
  revision: "5",
  valuationComplete: false,
  warnings: [
    {
      code: "CEILING_EXCEEDED",
      scope: "UNIT_YEAR",
      status: "BREACH",
      fiscalYear: 2026,
    },
    { code: "UNKNOWN_VALUATION", scope: "MONTH", status: "UNKNOWN", month: 1 },
  ],
};

describe("approved amendment dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "GIOF_MANAGER";
    mocks.programsLoading = false;
    mocks.readRevision.mockReset().mockResolvedValue(revision);
    mocks.get.mockReset().mockResolvedValue(line);
    mocks.createCategory.mockReset().mockResolvedValue({ id: "cat-new", name: "Nuevo tipo", is_active: true });
    mocks.save.mockReset().mockResolvedValue(response);
    mocks.patch.mockReset().mockResolvedValue({ name: "Unidad nueva" });
  });

  it.each([
    { label: "snake wins", program_id: "snake", programId: "camel", program: { id: "relation", name: "Relation" }, expected: "snake" },
    { label: "actual camel", program_id: undefined, programId: currentProgramId, program: null, expected: currentProgramId },
    { label: "null snake uses camel", program_id: null, programId: currentProgramId, program: currentLine.program, expected: currentProgramId },
    { label: "relation fallback", program_id: null, programId: null, program: currentLine.program, expected: currentProgramId },
    { label: "camel wins relation", program_id: null, programId: "camel", program: currentLine.program, expected: "camel" },
    { label: "missing stays empty", program_id: undefined, programId: undefined, program: null, expected: "" },
    { label: "empty explicit stays empty", program_id: "", programId: currentProgramId, program: currentLine.program, expected: "" },
  ])("seeds program compatibility: $label", ({ expected, ...fields }) => {
    const source = { ...currentLine, ...fields };
    const before = structuredClone(source);
    expect(seedPlanningHierarchy(source)).toEqual({
      organizational_unit_id: source.organizational_unit_id,
      planning_type: "GESTION",
      program_id: expected,
      component_id: currentLine.poaHierarchy.component.id,
      operative_action_id: currentLine.operative_action_id,
      resource_name: currentLine.resource_description,
    });
    expect(source).toEqual(before);
  });

  it("opens backend programId detail and selects the current GESTION after catalog loading without reseeding edits", async () => {
    const { program_id: _legacy, ...actual } = currentLine;
    const before = structuredClone(actual);
    mocks.get.mockResolvedValue(actual);
    mocks.readRevision.mockResolvedValue({ line_id: actual.id, revision: "1" });
    mocks.programsLoading = true;
    const props = { line: actual, onClose: vi.fn(), onSuccess: vi.fn() };
    const { rerender } = render(<ApprovedAmendmentModal {...props} />);
    await screen.findByText(/Revisión 1/);
    mocks.programsLoading = false;
    rerender(<ApprovedAmendmentModal {...props} />);
    const program = screen.getByLabelText("Programa / proyecto / gestión *");
    expect(program).toHaveValue(currentProgramId);
    expect(within(program).getByRole("option", { name: "TTGEST30JUN TEST GESTION" })).toHaveProperty("selected", true);
    expect(screen.getByLabelText("Tipo *")).toHaveValue("GESTION");
    expect(screen.getByRole("button", { name: "Componente estratégico *" })).toHaveTextContent("test-21");
    expect(screen.getByRole("button", { name: "Acción operativa *" })).toHaveTextContent("asd");
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(actual.resource_description);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("750.00");
    expect(screen.getByLabelText("Cantidad")).toHaveValue("2.00");
    expect(screen.getByLabelText("Febrero")).toHaveValue("750.00");
    expect(screen.getByLabelText("Junio")).toHaveValue("750.00");
    expect(screen.getByText("No hay cambios pendientes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), { target: { value: "Nombre pendiente" } });
    fireEvent.change(program, { target: { value: "gest-next" } });
    rerender(<ApprovedAmendmentModal {...props} line={{ ...props.line }} />);
    expect(program).toHaveValue("gest-next");
    expect(screen.getByRole("button", { name: "Componente estratégico *" })).not.toHaveTextContent("test-21");
    expect(screen.getByRole("button", { name: "Acción operativa *" })).not.toHaveTextContent("asd");
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue("Nombre pendiente");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(actual).toEqual(before);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.createCategory).not.toHaveBeenCalled();
    expect(mocks.createFunding).not.toHaveBeenCalled();
  });

  it("keeps divergent explicit program and fails existing parent-chain validation instead of repairing it", async () => {
    const divergent = { ...currentLine, program_id: "gest-next" };
    mocks.get.mockResolvedValue(divergent);
    mocks.readRevision.mockResolvedValue({ line_id: divergent.id, revision: "4" });
    render(<ApprovedAmendmentModal line={divergent} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Programa / proyecto / gestión *")).toHaveValue("gest-next");
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), { target: { value: "Nombre pendiente" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(divergent.poaHierarchy.component.id).toBe(currentLine.poaHierarchy.component.id);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("has one Save, no-op stays local, and only the body scrolls with accessible close", async () => {
    const linked = { ...line, resource_id: "r", organizational_unit_id: "ou", planning_type: "PROGRAMA", program_id: "p2", operative_action_id: "a2", poaHierarchy: { component: { id: "c2", name: "Nuevo componente" }, action: { id: "a2", name: "Nueva acción" }, resource: { id: "r", name: "Recurso libre" } } } as PlanningLine;
    mocks.get.mockResolvedValue(linked);
    const onClose = vi.fn();
    render(<ApprovedAmendmentModal line={linked} onClose={onClose} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.queryByRole("button", { name: "Guardar jerarquía" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    const helper = screen.getByText("No hay cambios pendientes");
    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect(helper.tagName).toBe("P");
    expect(helper).toHaveAttribute("role", "status");
    expect(helper).toHaveClass("text-left", "text-sm", "text-muted-foreground");
    expect(helper.parentElement).toHaveClass("flex-col", "gap-3", "sm:items-center");
    expect(save.parentElement).toHaveClass("justify-end", "gap-2", "sm:ml-auto");
    expect(helper.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save).toHaveAccessibleDescription("No hay cambios pendientes");
    expect(screen.queryByRole("button", { name: "No hay cambios pendientes" })).not.toBeInTheDocument();
    expect(screen.getByTestId("amendment-body")).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prioritizes revision loading and omits no-change helper after a read failure", async () => {
    let rejectRead!: (reason: Error) => void;
    mocks.readRevision.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRead = reject; }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText("Comprobando revisión…")).toHaveAttribute("role", "status");
    expect(screen.queryByText("No hay cambios pendientes")).not.toBeInTheDocument();
    rejectRead(new Error("offline"));
    await screen.findByText(/No se pudo cargar el detalle y la revisión aprobada/);
    expect(screen.queryByText("No hay cambios pendientes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("removes the helper for valid dirty finance and restores it when reverted", async () => {
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText("No hay cambios pendientes");
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.queryByText("No hay cambios pendientes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).not.toHaveAttribute("aria-describedby");
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: line.importance } });
    expect(screen.getByText("No hay cambios pendientes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it.each([
    { level: "type", label: "Tipo *", next: "PROYECTO", cleared: { program_id: "", component_id: "", operative_action_id: "" } },
    { level: "program", label: "Programa / proyecto / gestión *", next: "p3", cleared: { component_id: "", operative_action_id: "" } },
    { level: "component", label: "Componente estratégico *", next: "Componente alternativo", cleared: { operative_action_id: "" } },
    { level: "action", label: "Acción operativa *", next: "Acción alternativa", cleared: {} },
  ])("preserves latest approved resource draft on $level change without mutating identity", ({ level, label, next, cleared }) => {
    const onChange = vi.fn();
    const onValidation = vi.fn();
    const before = structuredClone(linkedResourceLine);
    render(<DraftProbe source={linkedResourceLine} onChange={onChange} onValidation={onValidation} />);
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), { target: { value: "Nombre pendiente del usuario" } });
    if (level === "type" || level === "program") {
      fireEvent.change(screen.getByLabelText(label), { target: { value: next } });
    } else {
      fireEvent.click(screen.getByRole("button", { name: label }));
      fireEvent.click(screen.getByRole("button", { name: next }));
    }
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue("Nombre pendiente del usuario");
    const updated = onChange.mock.lastCall![0];
    expect(updated).toMatchObject({ ...cleared, resource_name: "Nombre pendiente del usuario" });
    expect(updated).not.toHaveProperty("resource_id");
    expect(updated).not.toHaveProperty("line_code");
    expect(linkedResourceLine).toEqual(before);
    expect(onValidation.mock.lastCall![0]).toBe(level === "action");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("keeps the missing-resource reset and guard without choosing or creating a new resource", () => {
    const onChange = vi.fn();
    render(<DraftProbe source={{ ...linkedResourceLine, resource_id: null }} onChange={onChange} onValidation={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Programa / proyecto / gestión *"), { target: { value: "p3" } });
    expect(onChange.mock.lastCall![0]).toMatchObject({ resource_name: "", component_id: "", operative_action_id: "" });
    expect(screen.getByLabelText("Nombre del recurso POA *")).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("saves the retained name only after the new approved parent chain is valid", async () => {
    const before = structuredClone(linkedResourceLine);
    mocks.get.mockResolvedValue(linkedResourceLine);
    render(<ApprovedAmendmentModal line={linkedResourceLine} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), { target: { value: "Nombre pendiente del usuario" } });
    fireEvent.change(screen.getByLabelText("Programa / proyecto / gestión *"), { target: { value: "p3" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue("Nombre pendiente del usuario");
    fireEvent.click(screen.getByRole("button", { name: "Componente estratégico *" }));
    fireEvent.click(screen.getByRole("button", { name: "Componente destino" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Acción operativa *" }));
    fireEvent.click(screen.getByRole("button", { name: "Acción destino" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.queryByText("No hay cambios pendientes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ expected_revision: "4", hierarchy: {
      program_id: "p3", component_id: "c4", operative_action_id: "a4", resource_name: "Nombre pendiente del usuario",
    } });
    expect(mocks.save.mock.calls[0][0].hierarchy).not.toHaveProperty("resource_id");
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("line_code");
    expect(linkedResourceLine).toEqual(before);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("sends one combined PATCH for financial and hierarchy edits", async () => {
    const linked = { ...line, resource_id: "r", organizational_unit_id: "ou", planning_type: "PROGRAMA", program_id: "p2", operative_action_id: "a2", poaHierarchy: { component: { id: "c2", name: "Nuevo componente" }, action: { id: "a2", name: "Nueva acción" }, resource: { id: "r", name: "Recurso libre" } } } as PlanningLine;
    mocks.get.mockResolvedValue(linked);
    render(<ApprovedAmendmentModal line={linked} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Unidad orgánica" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva unidad" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expected_revision: "4", importance: "Actividad no estratégica", hierarchy: expect.objectContaining({ organizational_unit_id: "ou2" }), monthly: expect.any(Array) }));
    expect(mocks.save.mock.calls[0][0].monthly).toHaveLength(12);
  });

  it("financial-only sends no hierarchy, and simultaneous clicks stay single-flight", async () => {
    const linked = { ...line, resource_id: "r", organizational_unit_id: "ou", planning_type: "PROGRAMA", program_id: "p2", operative_action_id: "a2", poaHierarchy: { component: { id: "c2", name: "Nuevo componente" }, action: { id: "a2", name: "Nueva acción" }, resource: { id: "r", name: "Recurso libre" } } } as PlanningLine;
    mocks.get.mockResolvedValue(linked);
    mocks.save.mockReturnValue(new Promise(() => {}));
    render(<ApprovedAmendmentModal line={linked} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Frecuencia"), { target: { value: "Actividad Periódica" } });
    const save = screen.getByRole("button", { name: "Guardar cambios" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("hierarchy");
    expect(mocks.save.mock.calls[0][0].monthly).toHaveLength(12);
  });

  it("renombra catálogo sin resembrar meses ni revisión de la edición aprobada", async () => {
    const approvedLine = { ...line, organizational_unit_id: "ou", planning_type: "PROGRAMA", program_id: "p2", operative_action_id: "a2", poaHierarchy: { component: { id: "c2", name: "Nuevo componente" }, action: { id: "a2", name: "Nueva acción" } } } as PlanningLine;
    mocks.get.mockResolvedValue(approvedLine);
    render(<ApprovedAmendmentModal line={approvedLine} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Febrero"), { target: { value: "7.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar nombre de Unidad orgánica" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo nombre de Unidad orgánica" }), { target: { value: "Unidad nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/catalogs/organizational-units/ou", { name: "Unidad nueva" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar nombre de Unidad orgánica" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Febrero")).toHaveValue("7.25");
    expect(screen.getByText(/Revisión 4/)).toBeInTheDocument();
    expect(mocks.readRevision).toHaveBeenCalledTimes(2);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("renombra RESOURCE y luego guarda jerarquía aprobada con revisión actual sin crear otro recurso", async () => {
    const linked = {
      ...line,
      resource_id: "r",
      resource_description: "Recurso libre",
      organizational_unit_id: "ou",
      planning_type: "PROGRAMA" as const,
      program_id: "p2",
      operative_action_id: "a2",
      poaHierarchy: {
        component: { id: "c2", name: "Nuevo componente" },
        action: { id: "a2", name: "Nueva acción" },
        resource: { id: "r", name: "Recurso libre" },
      },
    } as PlanningLine;
    mocks.get.mockResolvedValue(linked);
    mocks.patch.mockResolvedValue({ id: "r", name: "Nombre renombrado" });
    render(<ApprovedAmendmentModal line={linked} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    fireEvent.click(screen.getByRole("button", { name: "Editar nombre de Recurso POA" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo nombre de Recurso POA" }), {
      target: { value: "Nombre renombrado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/catalogs/poa-resources/r", { name: "Nombre renombrado" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar nombre de Recurso POA" })).not.toBeInTheDocument());
    expect(linked.resource_id).toBe("r");
    expect(linked.resource_description).toBe("Recurso libre");
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue("Nombre renombrado");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Programa / proyecto / gestión *"), {
      target: { value: "p3" },
    });
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue("Nombre renombrado");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Componente estratégico *" }));
    fireEvent.click(screen.getByRole("button", { name: "Componente destino" }));
    fireEvent.click(screen.getByRole("button", { name: "Acción operativa *" }));
    fireEvent.click(screen.getByRole("button", { name: "Acción destino" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].hierarchy).toMatchObject({
      resource_name: "Nombre renombrado", program_id: "p3", component_id: "c4", operative_action_id: "a4",
    });
    expect(mocks.save.mock.calls[0][0].hierarchy).not.toHaveProperty("resource_id");
    expect(linked.resource_id).toBe("r");
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  });

  it("Escape del diálogo de nombre no cierra la edición aprobada", async () => {
    const onClose = vi.fn();
    mocks.get.mockResolvedValue({ ...line, organizational_unit_id: "ou" });
    render(<ApprovedAmendmentModal line={line} onClose={onClose} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    fireEvent.click(screen.getByRole("button", { name: "Editar nombre de Unidad orgánica" }));
    await screen.findByRole("dialog", { name: "Editar nombre de Unidad orgánica" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar nombre de Unidad orgánica" })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Editar presupuesto aprobado" })).toBeInTheDocument();
  });

  it("updates derived total and remaining when price or quantity changes without reallocating months", async () => {
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Precio unitario (S/)"), {
      target: { value: "120.25" },
    });
    expect(screen.getByText(/Total derivado.*S\/ 120.25/)).toBeInTheDocument();
    expect(
      screen.getByText(/Distribuido en 12 meses.*S\/ 100.00/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Restante por repartir.*S\/ 20.25/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "2.00" },
    });
    expect(
      screen.getByText(/Restante por repartir.*S\/ 140.50/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enero")).toHaveValue("100.00");
  });

  it("funding UX keeps the exact live financial summary outside the scrolling body beside Save", async () => {
    mocks.get.mockResolvedValue({ ...line, unit_price_decimal: "750.00", monthlyDistribution: line.monthlyDistribution?.map((row, index) => ({ ...row, monthly_programmed_decimal: index ? "0.00" : "1500.00" })) });
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    const summary = screen.getByLabelText("Resumen de distribución financiera");
    const body = screen.getByTestId("amendment-body");
    expect(body).not.toContainElement(summary);
    expect(summary.parentElement).toContainElement(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(summary).toHaveTextContent("Total derivado (precio × cantidad): S/ 750.00");
    expect(summary).toHaveTextContent("Distribuido en 12 meses: S/ 1500.00");
    expect(summary).toHaveTextContent("Exceso distribuido: S/ 750.00");
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "2" } });
    expect(summary).toHaveTextContent("Total derivado (precio × cantidad): S/ 1500.00");
    expect(summary).toHaveTextContent("Cuadrado: S/ 0.00");
    fireEvent.change(screen.getByLabelText("Febrero"), { target: { value: "0.01" } });
    expect(summary).toHaveTextContent("Exceso distribuido: S/ 0.01");
    fireEvent.change(screen.getByLabelText("Enero"), { target: { value: "abc" } });
    expect(summary).toHaveTextContent("No calculable");
    expect(summary).not.toHaveTextContent("Cuadrado");
    expect(summary.querySelector('[aria-live="polite"]')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("updates distribution on month changes, labels excess, and reports exact balance at zero", async () => {
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Febrero"), {
      target: { value: "0.01" },
    });
    expect(
      screen.getByText(/Distribuido en 12 meses.*S\/ 100.01/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Exceso distribuido.*S\/ 0.01/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Restante por repartir/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Febrero"), {
      target: { value: "0.00" },
    });
    expect(screen.getByText(/Cuadrado.*S\/ 0.00/)).toBeInTheDocument();
  });

  it("does not represent invalid inputs as zero or claim a balance", async () => {
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "abc" },
    });
    expect(
      screen.getByText(/Distribuido en 12 meses.*No calculable/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Balance.*No calculable/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Precio unitario (S/)"), {
      target: { value: "abc" },
    });
    expect(
      screen.getByText(/Total derivado.*No calculable/),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "100.00" },
    });
    expect(
      screen.getByText(/Distribuido en 12 meses.*S\/ 100.00/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Balance.*No calculable/)).toBeInTheDocument();
  });

  it("keeps large cents exact beyond Number safe integers", async () => {
    const large = {
      ...line,
      unit_price_decimal: "4999999999.99",
      quantity_decimal: "1.00",
      monthlyDistribution: line.monthlyDistribution?.map((row, index) => ({
        ...row,
        monthly_programmed_decimal: index === 0 ? "4999999999.99" : "0.00",
      })),
    };
    mocks.get.mockResolvedValue(large);
    render(
      <ApprovedAmendmentModal
        line={large}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "2.00" },
    });
    expect(
      screen.getByText(/Total derivado.*S\/ 9999999999.98/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Restante por repartir.*S\/ 4999999999.99/),
    ).toBeInTheDocument();
  });

  it("refuses to submit when revision GET fails", async () => {
    mocks.readRevision.mockRejectedValue(new Error("offline"));
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(
        /No se pudo cargar el detalle y la revisión aprobada/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
  });

  it("fails closed with actionable message if price, quantity or a month exact sidecar is missing", async () => {
    for (const broken of [
      { ...line, unit_price_decimal: undefined },
      { ...line, quantity_decimal: undefined },
      { ...line, monthlyDistribution: line.monthlyDistribution?.slice(1) },
      { ...line, monthlyDistribution: undefined },
    ]) {
      mocks.get.mockResolvedValueOnce(broken);
      const { unmount } = render(
        <ApprovedAmendmentModal
          line={broken}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );
      await screen.findByText(/proyección decimal exacta del servidor/);
      expect(mocks.get).toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Guardar cambios" }),
      ).toBeDisabled();
      unmount();
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("preserves exact inputs across repeated prop refreshes and submits original strings", async () => {
    const large = {
      ...line,
      unit_price: "9999999999.99",
      quantity: "1.00",
      unit_price_decimal: "9999999999.99",
      quantity_decimal: "1.00",
      monthlyDistribution: line.monthlyDistribution?.map((month, index) => ({
        ...month,
        monthly_programmed_decimal: index ? "0.00" : "9999999999.99",
      })),
    };
    mocks.get.mockResolvedValueOnce(large);
    const { rerender } = render(
      <ApprovedAmendmentModal
        line={large}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue(
      "9999999999.99",
    );
    expect(screen.getByLabelText("Enero")).toHaveValue("9999999999.99");
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "1.00" },
    });
    rerender(
      <ApprovedAmendmentModal
        line={{ ...large, unit_price_decimal: "0.00" }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    rerender(
      <ApprovedAmendmentModal
        line={large}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue(
      "9999999999.99",
    );
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "1" } });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_price: "9999999999.99",
        quantity: "1",
        monthly: expect.arrayContaining([
          { month: 1, planned_amount: "9999999999.99" },
        ]),
      }),
    );
    expect(mocks.readRevision).toHaveBeenCalledTimes(2);
  });

  it("enforces monthly exact sum inline and saves advisory warnings with revision", async () => {
    const user = userEvent.setup();
    const success = vi.fn();
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "99.99" },
    });
    await user.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );
    expect(screen.getByText(/La suma de los doce meses/)).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    await user.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(response.warnings),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_revision: "4",
        monthly: expect.arrayContaining([
          { month: 1, planned_amount: "100.00" },
        ]),
      }),
    );
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("total_cost");
  });

  it("keeps edits on 409, refetches both reads, and requires deliberate revision acceptance", async () => {
    const user = userEvent.setup();
    mocks.save.mockRejectedValueOnce(
      new ApiRequestError(409, {
        statusCode: 409,
        code: "APPROVED_AMENDMENT_CONFLICT",
        message: "conflict",
        error: "Conflict",
        timestamp: "now",
        path: "",
      }),
    );
    mocks.get
      .mockResolvedValueOnce(line)
      .mockResolvedValue({ ...line, total_cost: 120 });
    mocks.readRevision
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce(revision)
      .mockResolvedValue({ line_id: "line-1", revision: "5" });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Enero"), {
      target: { value: "99.99" },
    });
    fireEvent.change(screen.getByLabelText("Febrero"), {
      target: { value: "0.01" },
    });
    await user.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );
    await screen.findByText(/La versión actual es 5/);
    expect(screen.getByLabelText("Enero")).toHaveValue("99.99");
    expect(screen.getByLabelText("Febrero")).toHaveValue("0.01");
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
    expect(mocks.get).toHaveBeenCalledWith(
      "/budget/planning-lines/line-1",
      expect.objectContaining({ cache: "no-store" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Usar revisión actual/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );
    expect(mocks.save.mock.calls[1][0].expected_revision).toBe("5");
    expect(mocks.save.mock.calls[1][0].monthly).toContainEqual({
      month: 2,
      planned_amount: "0.01",
    });
  });

  it("reads revision, fresh detail, revision in order and never seeds the stale parent", async () => {
    const events: string[] = [];
    mocks.readRevision.mockImplementation(() => {
      events.push("revision");
      return Promise.resolve(revision);
    });
    mocks.get.mockImplementation(() => {
      events.push("detail");
      return Promise.resolve({
        ...line,
        unit_price_decimal: "200.00",
        monthlyDistribution: line.monthlyDistribution?.map((row, i) => ({
          ...row,
          monthly_programmed_decimal: i ? "0.00" : "200.00",
        })),
      });
    });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    expect(events).toEqual(["revision", "detail", "revision"]);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("200.00");
  });

  it("retries an intervening amendment and seeds only the matching second snapshot", async () => {
    mocks.readRevision
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce({ line_id: "line-1", revision: "5" })
      .mockResolvedValue({ line_id: "line-1", revision: "5" });
    mocks.get.mockResolvedValueOnce(line).mockResolvedValue({
      ...line,
      unit_price_decimal: "200.00",
      monthlyDistribution: line.monthlyDistribution?.map((row, i) => ({
        ...row,
        monthly_programmed_decimal: i ? "0.00" : "200.00",
      })),
    });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 5/);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("200.00");
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("ignores late first-open reads after a request identity change", async () => {
    let finish!: (value: typeof revision) => void;
    mocks.readRevision.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mocks.readRevision.mockResolvedValue({ line_id: "line-2", revision: "7" });
    mocks.get.mockResolvedValue({
      ...line,
      id: "line-2",
      unit_price_decimal: "300.00",
      monthlyDistribution: line.monthlyDistribution?.map((row, i) => ({
        ...row,
        monthly_programmed_decimal: i ? "0.00" : "300.00",
      })),
    });
    const { rerender } = render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    rerender(
      <ApprovedAmendmentModal
        line={{ ...line, id: "line-2" }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 7/);
    finish(revision);
    await waitFor(() =>
      expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue(
        "300.00",
      ),
    );
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("fails closed after repeated mismatch, invalid fresh sidecar or detail network failure", async () => {
    for (const mode of ["mismatch", "missing", "network"]) {
      mocks.readRevision.mockReset();
      mocks.get.mockReset();
      mocks.readRevision.mockImplementationOnce(() =>
        Promise.resolve(revision),
      );
      if (mode === "mismatch") {
        let next = 4;
        mocks.readRevision.mockImplementation(() =>
          Promise.resolve({ line_id: "line-1", revision: String(++next) }),
        );
        mocks.get.mockResolvedValue(line);
      } else {
        mocks.readRevision.mockResolvedValue(revision);
        if (mode === "missing")
          mocks.get.mockResolvedValue({ ...line, quantity_decimal: null });
        else mocks.get.mockRejectedValue(new Error("offline"));
      }
      const { unmount } = render(
        <ApprovedAmendmentModal
          line={line}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Guardar cambios" }),
        ).toBeDisabled(),
      );
      await screen.findByText(
        mode === "missing"
          ? /proyección decimal exacta del servidor/
          : /Cierra y recarga/i,
      );
      expect(mocks.save).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("handles 403 and 500 safely, with no false success", async () => {
    const user = userEvent.setup();
    const success = vi.fn();
    mocks.save.mockRejectedValueOnce(
      new ApiRequestError(403, {
        statusCode: 403,
        code: "FORBIDDEN",
        message: "secret",
        error: "Forbidden",
        timestamp: "now",
        path: "",
      }),
    );
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    await user.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );
    expect(await screen.findByText(/No tienes permiso/)).toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });

  it("does not claim success or reveal server internals on 500", async () => {
    const success = vi.fn();
    mocks.save.mockRejectedValue(
      new ApiRequestError(500, {
        statusCode: 500,
        message: "SQL internal secret",
        error: "Internal",
        timestamp: "now",
        path: "",
      }),
    );
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeInTheDocument();
    expect(screen.queryByText(/SQL internal secret/)).not.toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });

  it("keeps breach and unknown warnings visible after a successful save", () => {
    render(<ApprovedAmendmentWarnings warnings={response.warnings as never} />);
    expect(screen.getByText(/techo de la unidad excedido/)).toBeInTheDocument();
    expect(screen.getByText(/valoración no disponible/)).toBeInTheDocument();
    expect(screen.getByText(/no impiden el guardado/)).toBeInTheDocument();
  });

  it("reports a successful save with only unit-year valuation unknown, without claiming monthly valuation failed", async () => {
    const success = vi.fn();
    const warnings = [
      {
        code: "UNKNOWN_VALUATION" as const,
        scope: "UNIT_YEAR" as const,
        status: "UNKNOWN" as const,
        fiscalYear: 2026,
      },
    ];
    mocks.save.mockResolvedValueOnce({ ...response, warnings });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith(warnings));
    render(<ApprovedAmendmentWarnings warnings={warnings} />);
    expect(
      screen.getByText(
        /No se pudo comprobar el techo anual de la unidad: falta el techo o una valoración completa en PEN\. Los importes mensuales se revisan por separado\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/no impiden el guardado/)).toBeInTheDocument();
    expect(
      screen.queryByText(/valoración no disponible/),
    ).not.toBeInTheDocument();
  });

  it("keeps month and total unknown wording separate from the unit-year explanation", () => {
    render(
      <ApprovedAmendmentWarnings
        warnings={[
          {
            code: "UNKNOWN_VALUATION",
            scope: "MONTH",
            status: "UNKNOWN",
            month: 1,
          },
          { code: "UNKNOWN_VALUATION", scope: "TOTAL", status: "UNKNOWN" },
          {
            code: "UNKNOWN_VALUATION",
            scope: "UNIT_YEAR",
            status: "UNKNOWN",
            fiscalYear: 2026,
          },
        ]}
      />,
    );
    expect(screen.getAllByText(/valoración no disponible/)).toHaveLength(2);
    expect(
      screen.getByText(/No se pudo comprobar el techo anual/),
    ).toBeInTheDocument();
    expect(screen.getByText(/año 2026/)).toBeInTheDocument();
  });
});

describe("approved category amendment", () => {
  const selected = { ...line, budget_category_id: "cat-old", budgetCategory: { id: "cat-old", name: "Anterior" } } as PlanningLine;
  const ready = { ...revision, category_funding_edit_ready: true };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "GIOF_MANAGER";
    mocks.readRevision.mockReset().mockResolvedValue(ready);
    mocks.get.mockReset().mockImplementation((url: string) => Promise.resolve(url === "/catalogs/budget-categories" ? [
      { id: "cat-old", name: "Anterior", is_active: true },
      { id: "cat-next", name: "Siguiente", is_active: true },
      { id: "cat-inactive", name: "Inactivo", is_active: false },
    ] : selected));
    mocks.save.mockReset().mockResolvedValue(response);
    mocks.createCategory.mockReset().mockResolvedValue({ id: "cat-new", name: "Nuevo tipo", is_active: true });
  });

  it("fails closed without explicit schema/route readiness and keeps ordinary finance Save", async () => {
    mocks.readRevision.mockResolvedValue(revision);
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar tipo de recurso" })).toBeDisabled();
    expect(screen.getAllByText("La edición de tipo de recurso/financiamiento no está habilitada en esta revisión. Actualiza la revisión para comprobar su disponibilidad.")).toHaveLength(2);
    expect(screen.queryByText(/columnas de auditoría|faltan la ruta|migraciones/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("budget_category_id");
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it("selects an active category and saves budget and category with one PATCH", async () => {
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    expect(screen.queryByRole("option", { name: "Inactivo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByText("No hay cambios pendientes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo de recurso"), { target: { value: "cat-next" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.queryByText("No hay cambios pendientes")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ budget_category_id: "cat-next", importance: "Actividad no estratégica", expected_revision: "4" });
    expect(mocks.save.mock.calls[0][0].monthly).toHaveLength(12);
  });

  it("Add posts once, selects returned ID and retains drafts; later Save failure does not undo catalog Add", async () => {
    mocks.save.mockRejectedValue(new Error("offline"));
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    fireEvent.change(screen.getByLabelText("Febrero"), { target: { value: "7.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar tipo de recurso" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del tipo de recurso" }), { target: { value: " Nuevo tipo " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de recurso" }));
    await waitFor(() => expect(mocks.createCategory).toHaveBeenCalledWith({ name: "Nuevo tipo" }));
    expect(screen.getByLabelText("Febrero")).toHaveValue("7.25");
    expect(screen.getByLabelText("Tipo de recurso")).toHaveValue("cat-new");
    fireEvent.change(screen.getByLabelText("Febrero"), { target: { value: "0.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de recurso")).toHaveValue("cat-new");
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ budget_category_id: "cat-new", expected_revision: "4" });
    expect(mocks.save.mock.calls[0][0].monthly).toHaveLength(12);
    expect(mocks.createCategory).toHaveBeenCalledTimes(1);
  });

  it("keeps category, month and hierarchy drafts after an Add failure and after category PATCH 400", async () => {
    const linked = { ...selected, resource_id: "r", organizational_unit_id: "ou", planning_type: "PROGRAMA", program_id: "p2", operative_action_id: "a2", poaHierarchy: { component: { id: "c2", name: "Nuevo componente" }, action: { id: "a2", name: "Nueva acción" }, resource: { id: "r", name: "Recurso libre" } } } as PlanningLine;
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/budget-categories" ? [{ id: "cat-old", name: "Anterior", is_active: true }, { id: "cat-next", name: "Siguiente", is_active: true }] : linked));
    mocks.createCategory.mockRejectedValueOnce(new ApiRequestError(409, { statusCode: 409, message: "duplicate", error: "Conflict", timestamp: "now", path: "" }));
    mocks.save.mockRejectedValueOnce(new ApiRequestError(400, { statusCode: 400, message: "schema/internal", error: "Bad Request", timestamp: "now", path: "" }));
    render(<ApprovedAmendmentModal line={linked} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Unidad orgánica" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva unidad" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar tipo de recurso" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del tipo de recurso" }), { target: { value: "Otro" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de recurso" }));
    expect(await screen.findByText(/Ya existe un tipo de recurso/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Agregar tipo de recurso" })).getByRole("button", { name: "Cancelar" }));
    fireEvent.change(screen.getByLabelText("Tipo de recurso"), { target: { value: "cat-next" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/El servidor rechazó los datos/);
    expect(screen.getByLabelText("Tipo de recurso")).toHaveValue("cat-next");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.getByLabelText("Importancia")).toHaveValue("Actividad no estratégica");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ budget_category_id: "cat-next", hierarchy: { organizational_unit_id: "ou2" } });
    expect(screen.queryByText("schema/internal")).not.toBeInTheDocument();
  });

  it("rejects duplicate and forbidden Add without losing the finance draft", async () => {
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "2.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar tipo de recurso" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del tipo de recurso" }), { target: { value: "anterior" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de recurso" }));
    expect(await screen.findByText(/Ya existe un tipo de recurso/)).toBeInTheDocument();
    expect(mocks.createCategory).not.toHaveBeenCalled();
    mocks.createCategory.mockRejectedValue(new ApiRequestError(403, { statusCode: 403, message: "secret", error: "Forbidden", timestamp: "now", path: "" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del tipo de recurso" }), { target: { value: "Distinto" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de recurso" }));
    expect(await screen.findByText(/No tienes permiso para crear/)).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad")).toHaveValue("2.00");
  });

  it("shows current vs attempted category on 409 and needs explicit revision acceptance", async () => {
    mocks.save.mockRejectedValueOnce(new ApiRequestError(409, { statusCode: 409, message: "conflict", error: "Conflict", timestamp: "now", path: "" }));
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/budget-categories" ? [{ id: "cat-old", name: "Anterior", is_active: true }, { id: "cat-next", name: "Siguiente", is_active: true }] : mocks.save.mock.calls.length ? { ...selected, budget_category_id: "cat-current", budgetCategory: { id: "cat-current", name: "Concurrente" } } : selected));
    mocks.readRevision.mockResolvedValueOnce(ready).mockResolvedValueOnce(ready).mockResolvedValue({ ...ready, revision: "5" });
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    fireEvent.change(screen.getByLabelText("Tipo de recurso"), { target: { value: "cat-next" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("group", { name: "Tipo de recurso actual" })).toHaveTextContent("Concurrente");
    expect(screen.getByRole("group", { name: "Tipo de recurso que intentaste guardar" })).toHaveTextContent("Siguiente");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Usar revisión actual/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0]).toMatchObject({ expected_revision: "5", budget_category_id: "cat-next" });
  });

  it.each(["GIOF_GESTOR", "ADMIN_SISTEMA", "SOLICITANTE_EPE"])("does not offer approved category mutation to %s", async (role) => {
    mocks.role = role;
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar tipo de recurso" })).toBeDisabled();
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });
});

describe("approved funding membership", () => {
  const assigned = [
    { id: "assoc-a", planning_line_id: "line-1", funding_source_id: "source-a", fundingSource: { id: "source-a", name: "Fuente A", code: "A" }, allocated_amount: 20 },
    { id: "assoc-b", planning_line_id: "line-1", funding_source_id: "source-b", fundingSource: { id: "source-b", name: "Fuente B", code: "B" } },
  ];
  const catalog = ["A", "B", "C", "D"].map((code) => ({ id: `source-${code.toLowerCase()}`, code, name: `Fuente ${code}`, is_active: true }));
  const ready = { ...revision, category_funding_edit_ready: true };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "GIOF_MANAGER";
    mocks.readRevision.mockReset().mockResolvedValue(ready);
    mocks.get.mockReset().mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog : { ...line, fundingSources: assigned }));
    mocks.save.mockReset().mockResolvedValue(response);
    mocks.createFunding.mockReset().mockResolvedValue({ id: "source-new", code: "NEW", name: "Nueva", is_active: true });
    mocks.updateFunding.mockReset().mockResolvedValue({ id: "source-a", code: "A2", name: "Renombrada", description: "Detalle", fundingSourceType: { id: "type-1", name: "Cooperación" }, is_active: true });
  });

  it("funding UX removes only a pending ADD locally and never exposes persisted removal", async () => {
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Añadir fuente")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Añadir fuente"), { target: { value: "source-c" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir a la lista" }));
    const pending = screen.getByRole("group", { name: "Fuentes por agregar" });
    expect(pending).toHaveTextContent("Por agregar: Fuente C");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    fireEvent.click(within(pending).getByRole("button", { name: "Quitar de la lista Fuente C" }));
    expect(screen.queryByRole("group", { name: "Fuentes por agregar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(within(screen.getByRole("group", { name: "Fuentes actuales" })).queryByRole("button", { name: /Quitar|Eliminar/ })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.createFunding).not.toHaveBeenCalled();
    expect(mocks.updateFunding).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("funding_membership_changes");
  });

  it("funding UX undoes one replacement while preserving ADD, finance, category and hierarchy drafts", async () => {
    const linked = { ...linkedResourceLine, fundingSources: assigned, budget_category_id: "cat-old" } as PlanningLine;
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog : url === "/catalogs/budget-categories" ? [
      { id: "cat-old", name: "Anterior", is_active: true }, { id: "cat-next", name: "Siguiente", is_active: true },
    ] : linked));
    render(<ApprovedAmendmentModal line={linked} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled());
    await screen.findByRole("option", { name: "Siguiente" });
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente A"), { target: { value: "source-c" } });
    fireEvent.change(screen.getByLabelText("Añadir fuente"), { target: { value: "source-d" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir a la lista" }));
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.change(screen.getByLabelText("Tipo de recurso"), { target: { value: "cat-next" } });
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), { target: { value: "Mi borrador" } });
    expect(screen.getByText(/Renombrar este recurso también cambia su nombre en otras líneas que lo comparten/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer cambio de fuente Fuente A" }));
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toHaveValue("source-a");
    expect(screen.getByRole("group", { name: "Fuentes por agregar" })).toHaveTextContent("Fuente D");
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue("Mi borrador");
    expect(screen.getByLabelText("Tipo de recurso")).toHaveValue("cat-next");
    expect(screen.getByLabelText("Importancia")).toHaveValue("Actividad no estratégica");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ budget_category_id: "cat-next", hierarchy: { resource_name: "Mi borrador" }, importance: "Actividad no estratégica", funding_membership_changes: { add: [{ funding_source_id: "source-d" }] } });
    expect(mocks.save.mock.calls[0][0].funding_membership_changes).not.toHaveProperty("edit");
    expect(mocks.save.mock.calls[0][0].funding_membership_changes).not.toHaveProperty("remove");
  });

  it("funding UX removes one pending entry without dropping other additions or persisted associations", async () => {
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Añadir fuente")).toBeEnabled());
    for (const sourceId of ["source-c", "source-d"]) {
      fireEvent.change(screen.getByLabelText("Añadir fuente"), { target: { value: sourceId } });
      fireEvent.click(screen.getByRole("button", { name: "Añadir a la lista" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Quitar de la lista Fuente C" }));
    const pending = screen.getByRole("group", { name: "Fuentes por agregar" });
    expect(pending).not.toHaveTextContent("Fuente C");
    expect(pending).toHaveTextContent("Fuente D");
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toHaveValue("source-a");
    expect(screen.getByLabelText("Cambiar fuente Fuente B")).toHaveValue("source-b");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].funding_membership_changes).toEqual({ add: [{ funding_source_id: "source-d" }] });
  });

  it("funding UX constrains long names and source actions without hiding full accessible labels", async () => {
    const longName = "TESTFUENTE".repeat(40);
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog.map((source) => source.id === "source-a" ? { ...source, name: longName } : source) : { ...line, fundingSources: assigned }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const edit = await screen.findByRole("button", { name: `Editar fuente ${longName}` });
    expect(edit).toHaveTextContent(/^Editar fuente$/);
    expect(edit).toHaveAttribute("title", longName);
    expect(edit).toHaveClass("min-w-0", "max-w-full", "whitespace-normal");
    const select = screen.getByLabelText(`Cambiar fuente ${longName}`);
    expect(select).toHaveClass("min-w-0", "max-w-full", "w-full");
    expect(select.parentElement).toHaveClass("min-w-0", "max-w-full");
    expect(screen.getByTestId("amendment-body")).toHaveClass("min-w-0", "overflow-x-hidden");
    expect(screen.getByLabelText("Añadir fuente").parentElement?.parentElement).toHaveClass("grid", "min-w-0");
    expect(screen.getByRole("button", { name: "Añadir a la lista" })).toHaveClass("whitespace-normal", "max-w-full");
  });

  it.each([1, 2])("funding UX locates authority conflict safely for %i submitted edits and undo clears only reverted conflict", async (editCount) => {
    const onSuccess = vi.fn();
    mocks.save.mockRejectedValueOnce(new ApiRequestError(409, { statusCode: 409, code: "APPROVED_AMENDMENT_FUNDING_AUTHORITY_CONFLICT", message: "SQL secret assoc-a", error: "Conflict", timestamp: "now", path: "" }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente A"), { target: { value: "source-c" } });
    if (editCount === 2) fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente B"), { target: { value: "source-d" } });
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const section = screen.getByRole("region", { name: "Fuentes de financiamiento aprobadas" });
    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent(editCount === 1 ? /No se puede sustituir la fuente/ : /La sustitución de una fuente no pudo validarse/);
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toHaveAttribute("aria-invalid", String(editCount === 1));
    if (editCount === 1) expect(screen.getByLabelText("Cambiar fuente Fuente A")).toHaveAccessibleDescription(alert.textContent!);
    expect(screen.getByLabelText("Cambiar fuente Fuente B")).toHaveAttribute("aria-invalid", "false");
    expect(mocks.readRevision).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.calls.filter(([url]) => url === "/budget/planning-lines/line-1")).toHaveLength(1);
    expect(screen.getByLabelText("Añadir fuente")).toBeEnabled();
    expect(screen.queryByText(/SQL secret/)).not.toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer cambio de fuente Fuente A" }));
    if (editCount === 2) {
      expect(within(section).getByRole("alert")).toHaveTextContent(/La sustitución de una fuente no pudo validarse/);
      expect(screen.getByLabelText("Cambiar fuente Fuente B")).toHaveAttribute("aria-invalid", "false");
      fireEvent.click(screen.getByRole("button", { name: "Deshacer cambio de fuente Fuente B" }));
    }
    expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Importancia")).toHaveValue("Actividad no estratégica");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", revision],
    ["false", { ...revision, category_funding_edit_ready: false }],
  ])("keeps both membership controls closed on %s readiness while finance Save works", async (_label, gate) => {
    mocks.readRevision.mockResolvedValue(gate);
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog : url === "/catalogs/budget-categories" ? [{ id: "cat-old", name: "Anterior", is_active: true }] : { ...line, budget_category_id: "cat-old", fundingSources: assigned }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar tipo de recurso" })).toBeDisabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeDisabled();
    expect(screen.getByLabelText("Añadir fuente")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar fuente" })).toBeDisabled();
    expect(screen.getAllByText("La edición de tipo de recurso/financiamiento no está habilitada en esta revisión. Actualiza la revisión para comprobar su disponibilidad.")).toHaveLength(2);
    expect(screen.queryByText(/columnas de auditoría|faltan la ruta|migraciones/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("budget_category_id");
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("funding_membership_changes");
  });

  it("enables both controls only for a manager with matching R1/detail/R2 true and sends one combined Save", async () => {
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog : url === "/catalogs/budget-categories" ? [
      { id: "cat-old", name: "Anterior", is_active: true },
      { id: "cat-next", name: "Siguiente", is_active: true },
    ] : { ...line, budget_category_id: "cat-old", fundingSources: assigned }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    expect(mocks.readRevision).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Tipo de recurso")).toBeEnabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled();
    expect(screen.getByLabelText("Añadir fuente")).toBeEnabled();
    expect(screen.queryByText(/no está habilitada en esta revisión/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo de recurso"), { target: { value: "cat-next" } });
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente A"), { target: { value: "source-c" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ budget_category_id: "cat-next", funding_membership_changes: { edit: [{ association_id: "assoc-a", funding_source_id: "source-c" }] } });
  });

  it("closes both controls when R2 loses readiness despite R1 true", async () => {
    mocks.readRevision.mockResolvedValueOnce(ready).mockResolvedValueOnce({ ...ready, category_funding_edit_ready: false });
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog : { ...line, budget_category_id: "cat-old", fundingSources: assigned }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeDisabled();
    expect(screen.getByLabelText("Añadir fuente")).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("edits the selected catalog source with all four fields, refreshes labels, keeps drafts and sends only one later amendment Save", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const sources = catalog.map((item) => ({ ...item, fundingSourceType: { id: "type-1", name: "Cooperación" }, description: "Original" }));
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? (mocks.updateFunding.mock.calls.length ? sources.map((item) => item.id === "source-a" ? { ...item, code: "A2", name: "Renombrada", description: "Detalle" } : item) : sources) : { ...line, fundingSources: assigned }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(within(screen.getByLabelText("Añadir fuente")).getByRole("option", { name: /Fuente C/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Precio unitario (S/)"), { target: { value: "120.00" } });
    fireEvent.change(screen.getByLabelText("Febrero"), { target: { value: "20.00" } });
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente B"), { target: { value: "source-c" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar fuente Fuente A" }));
    const edit = screen.getByRole("dialog", { name: "Editar fuente de financiamiento" });
    expect(within(edit).getByRole("combobox", { name: /Tipo de Fuente/ })).toHaveTextContent("Cooperación");
    expect(within(edit).getByRole("textbox", { name: "Código *" })).toHaveValue("A");
    fireEvent.change(within(edit).getByRole("textbox", { name: "Código *" }), { target: { value: "A2" } });
    fireEvent.change(within(edit).getByRole("textbox", { name: "Nombre *" }), { target: { value: "Renombrada" } });
    fireEvent.change(within(edit).getByRole("textbox", { name: "Descripción (opcional)" }), { target: { value: "Detalle" } });
    fireEvent.click(within(edit).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.updateFunding).toHaveBeenCalledWith({ code: "A2", name: "Renombrada", description: "Detalle", fundingSourceTypeId: "type-1" }));
    await waitFor(() => expect(mocks.get.mock.calls.filter(([url]) => url === "/catalogs/funding-sources")).toHaveLength(2));
    await waitFor(() => expect(screen.getByLabelText("Cambiar fuente Renombrada")).toHaveValue("source-a"));
    expect(screen.getByLabelText("Añadir fuente")).toHaveTextContent("A2 · Renombrada");
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("120.00");
    expect(screen.getByLabelText("Febrero")).toHaveValue("20.00");
    expect(screen.getByLabelText("Cambiar fuente Fuente B")).toHaveValue("source-c");
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ unit_price: "120.00", funding_membership_changes: { edit: [{ association_id: "assoc-b", funding_source_id: "source-c" }] } });
  });

  it.each([409, 403])("retains edit form and line draft on catalog %i without amendment PATCH", async (status) => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog.map((item) => ({ ...item, fundingSourceType: { id: "type-1", name: "Cooperación" } })) : { ...line, fundingSources: assigned }));
    mocks.updateFunding.mockRejectedValue(new ApiRequestError(status, { statusCode: status, message: "private server detail", error: "Failed", timestamp: "now", path: "" }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(within(screen.getByLabelText("Añadir fuente")).getByRole("option", { name: /Fuente C/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "2.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar fuente Fuente A" }));
    const edit = screen.getByRole("dialog", { name: "Editar fuente de financiamiento" });
    fireEvent.change(within(edit).getByRole("textbox", { name: "Nombre *" }), { target: { value: "Intento" } });
    fireEvent.click(within(edit).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(edit).findByRole("alert")).toHaveTextContent(status === 409 ? /ya existe o cambió/ : /No tienes permiso/);
    expect(within(edit).getByRole("textbox", { name: "Nombre *" })).toHaveValue("Intento");
    expect(screen.getByLabelText("Cantidad")).toHaveValue("2.00");
    expect(screen.getAllByRole("button", { name: "Guardar cambios" }).find((button) => button.getAttribute("type") === "button")).toBeDisabled();
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(["GIOF_GESTOR", "AUDITOR_DIRECCION", "SOLICITANTE_EPE"])('does not expose catalog Edit to %s', async (role) => {
    mocks.role = role;
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.queryByRole("button", { name: /Editar fuente/ })).not.toBeInTheDocument();
    expect(mocks.updateFunding).not.toHaveBeenCalled();
  });

  it.each(["GIOF_MANAGER", "ADMIN_SISTEMA"])('permits catalog Edit for %s even while membership readiness is false', async (role) => {
    mocks.role = role;
    mocks.readRevision.mockResolvedValue(revision);
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog.map((item) => ({ ...item, fundingSourceType: { id: "type-1", name: "Cooperación" } })) : { ...line, fundingSources: assigned }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Editar fuente Fuente A" })).toBeEnabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("shows two associations and sends only ADD/EDIT in the same outer Save", async () => {
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(within(screen.getByLabelText("Añadir fuente")).getByRole("option", { name: /Fuente C/ })).toBeInTheDocument());
    expect(screen.getByRole("group", { name: "Fuentes actuales" })).toHaveTextContent("Fuente A");
    expect(screen.getByRole("group", { name: "Fuentes actuales" })).toHaveTextContent("Fuente B");
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente A"), { target: { value: "source-c" } });
    fireEvent.change(screen.getByLabelText("Añadir fuente"), { target: { value: "source-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir a la lista" }));
    fireEvent.change(screen.getByLabelText("Añadir fuente"), { target: { value: "source-d" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir a la lista" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ expected_revision: "4", funding_membership_changes: { add: [{ funding_source_id: "source-a" }, { funding_source_id: "source-d" }], edit: [{ association_id: "assoc-a", funding_source_id: "source-c" }] } });
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("remove");
    expect(within(screen.getByRole("group", { name: "Fuentes actuales" })).queryByRole("button", { name: /Eliminar|Quitar/ })).not.toBeInTheDocument();
  });

  it("keeps financial Save available when schema is unready, but funding remains disabled", async () => {
    mocks.readRevision.mockResolvedValue(revision);
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.getAllByText("La edición de tipo de recurso/financiamiento no está habilitada en esta revisión. Actualiza la revisión para comprobar su disponibilidad.")).toHaveLength(2);
    expect(screen.getByLabelText("Añadir fuente")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("funding_membership_changes");
  });

  it("retains drafts when catalog Add persists separately and amendment Save fails", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mocks.save.mockRejectedValue(new ApiRequestError(400, { statusCode: 400, message: "private", error: "Bad Request", timestamp: "now", path: "" }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(within(screen.getByLabelText("Añadir fuente")).getByRole("option", { name: /Fuente C/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar fuente" }));
    fireEvent.click(screen.getByRole("combobox", { name: /Tipo de Fuente/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Cooperación" }));
    fireEvent.change(screen.getByLabelText("Código *"), { target: { value: "NEW" } });
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(mocks.createFunding).toHaveBeenCalledWith(expect.objectContaining({ code: "NEW", name: "Nueva", fundingSourceTypeId: "type-1" })));
    expect(screen.getByLabelText("Importancia")).toHaveValue("Actividad no estratégica");
    expect(screen.getByRole("group", { name: "Fuentes por agregar" })).toHaveTextContent("Nueva");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/El servidor rechazó los datos/)).toBeInTheDocument();
    expect(mocks.save.mock.calls[0][0].funding_membership_changes.add).toEqual([{ funding_source_id: "source-new" }]);
    expect(screen.getByLabelText("Importancia")).toHaveValue("Actividad no estratégica");
    expect(mocks.createFunding).toHaveBeenCalledTimes(1);
  });

  it("on 409 compares current and attempted source memberships and requires explicit acceptance", async () => {
    mocks.save.mockRejectedValueOnce(new ApiRequestError(409, { statusCode: 409, message: "private", error: "Conflict", timestamp: "now", path: "" }));
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog : mocks.save.mock.calls.length ? { ...line, fundingSources: [{ ...assigned[0], funding_source_id: "source-d", fundingSource: { id: "source-d", name: "Fuente D", code: "D" } }, assigned[1]] } : { ...line, fundingSources: assigned }));
    mocks.readRevision.mockResolvedValueOnce(ready).mockResolvedValueOnce(ready).mockResolvedValue({ ...ready, revision: "5" });
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(within(screen.getByLabelText("Añadir fuente")).getByRole("option", { name: /Fuente C/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente A"), { target: { value: "source-c" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("group", { name: "Fuentes actuales de la revisión 5" })).toHaveTextContent("Fuente D");
    expect(screen.getByRole("group", { name: "Fuentes que intentaste guardar" })).toHaveTextContent("Fuente C");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toHaveValue("source-c");
  });

  it("refreshes the combined gate after 409 and never retries category or funding PATCH when readiness is revoked", async () => {
    mocks.get.mockImplementation((url: string) => Promise.resolve(url === "/catalogs/funding-sources" ? catalog : url === "/catalogs/budget-categories" ? [
      { id: "cat-old", name: "Anterior", is_active: true },
      { id: "cat-next", name: "Siguiente", is_active: true },
    ] : { ...line, budget_category_id: "cat-old", budgetCategory: { id: "cat-old", name: "Anterior" }, fundingSources: assigned }));
    mocks.readRevision.mockResolvedValueOnce(ready).mockResolvedValueOnce(ready)
      .mockResolvedValue({ ...ready, revision: "5", category_funding_edit_ready: false });
    mocks.save.mockRejectedValueOnce(new ApiRequestError(409, { statusCode: 409, message: "conflict", error: "Conflict", timestamp: "now", path: "" }));
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    await waitFor(() => expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Tipo de recurso"), { target: { value: "cat-next" } });
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente A"), { target: { value: "source-c" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("group", { name: "Fuentes actuales de la revisión 5" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tipo de recurso que intentaste guardar" })).toHaveTextContent("Siguiente");
    expect(mocks.readRevision).toHaveBeenCalledTimes(4);
    expect(mocks.get.mock.calls.filter(([url]) => url === "/budget/planning-lines/line-1")).toHaveLength(2);
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeDisabled();
    expect(screen.getByLabelText("Añadir fuente")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Usar revisión actual/ }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
});

describe("MICRO4b approved error classification with real API client", () => {
  const selected = { ...line, budget_category_id: "cat-old", fundingSources: [
    { id: "assoc-a", planning_line_id: "line-1", funding_source_id: "source-a", fundingSource: { id: "source-a", name: "Fuente A", code: "A" } },
  ] } as PlanningLine;
  const ready = { ...revision, category_funding_edit_ready: true };
  const categories = [
    { id: "cat-old", name: "Anterior", is_active: true },
    { id: "cat-next", name: "Siguiente", is_active: true },
  ];
  const sources = ["A", "C"].map((code) => ({ id: `source-${code.toLowerCase()}`, code, name: `Fuente ${code}`, is_active: true }));
  const requests: { path: string; method: string; body?: string }[] = [];
  let status: number;
  let errorBody: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.role = "GIOF_MANAGER";
    requests.length = 0;
    const { api } = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
    mocks.get.mockReset().mockImplementation(api.get);
    mocks.readRevision.mockReset().mockImplementation((signal?: AbortSignal) => api.get(
      "/budget/planning-lines/line-1/approved-amendment/revision", { cache: "no-store", signal },
    ));
    mocks.save.mockReset().mockImplementation((body) => api.patch("/budget/planning-lines/line-1/approved-amendment", body));
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const method = options.method ?? "GET";
      requests.push({ path, method, body: typeof options.body === "string" ? options.body : undefined });
      if (method === "PATCH") return new Response(JSON.stringify(errorBody), { status });
      const afterSave = requests.some((request) => request.method === "PATCH");
      const data = path.endsWith("/revision") ? { ...ready, revision: afterSave ? "5" : "4" }
        : path === "/catalogs/budget-categories" ? categories
          : path === "/catalogs/funding-sources" ? sources : selected;
      return new Response(JSON.stringify({ data }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function changeAndSave() {
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole("option", { name: "Siguiente" });
    await waitFor(() => expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Tipo de recurso"), { target: { value: "cat-next" } });
    fireEvent.change(screen.getByLabelText("Cambiar fuente Fuente A"), { target: { value: "source-c" } });
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  }

  function expectDraft() {
    expect(screen.getByLabelText("Tipo de recurso")).toHaveValue("cat-next");
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toHaveValue("source-c");
    expect(screen.getByLabelText("Importancia")).toHaveValue("Actividad no estratégica");
    expect(screen.getByLabelText("Enero")).toHaveValue("100.00");
    expect(screen.getByRole("dialog", { name: "Editar presupuesto aprobado" })).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
    expect(JSON.parse(requests.find((request) => request.method === "PATCH")!.body!)).toMatchObject({
      expected_revision: "4", budget_category_id: "cat-next",
      funding_membership_changes: { edit: [{ association_id: "assoc-a", funding_source_id: "source-c" }] },
    });
    expect(screen.queryByText(/SQL secret|<script>/)).not.toBeInTheDocument();
  }

  function expectInitialReadsOnly() {
    expect(requests.filter((request) => request.path.endsWith("/revision"))).toHaveLength(2);
    expect(requests.filter((request) => request.path === "/budget/planning-lines/line-1")).toHaveLength(1);
    expect(screen.getByText(/Revisión 4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Usar revisión actual/ })).not.toBeInTheDocument();
  }

  it("authority409 preserves selections and eligibility without revision refetch or stale baseline", async () => {
    status = 409;
    errorBody = { statusCode: status, code: "APPROVED_AMENDMENT_FUNDING_AUTHORITY_CONFLICT", message: "SQL secret <script>" };
    await changeAndSave();
    expect(await screen.findByText("No se puede sustituir la fuente de financiamiento porque no se puede verificar la compatibilidad con su autoridad de origen. Se conserva la fuente actual.")).toBeInTheDocument();
    expectDraft();
    expectInitialReadsOnly();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled();
    expect(screen.getByLabelText("Tipo de recurso")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.queryByText(/La línea cambió/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar tipo de recurso" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Agregar tipo de recurso" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Agregar fuente" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("INVALID_APPROVED_AMENDMENT400 preserves shared capability and confirmation fields", async () => {
    status = 400;
    errorBody = { statusCode: status, code: "INVALID_APPROVED_AMENDMENT", message: "SQL secret" };
    await changeAndSave();
    await screen.findByText(/El servidor rechazó los datos/);
    expectDraft();
    expectInitialReadsOnly();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled();
    expect(screen.getByLabelText("Tipo de recurso")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("APPROVED_AMENDMENT_CONFLICT409 adds exactly R1 detail R2 and retains explicit acceptance", async () => {
    status = 409;
    errorBody = { statusCode: status, code: "APPROVED_AMENDMENT_CONFLICT", message: "SQL secret" };
    await changeAndSave();
    await screen.findByText(/La versión actual es 5/);
    expectDraft();
    expect(requests.filter((request) => request.path.endsWith("/revision"))).toHaveLength(4);
    expect(requests.filter((request) => request.path === "/budget/planning-lines/line-1")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Usar revisión actual/ }));
    expect(screen.getByText(/Revisión 5/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("CATEGORY_FUNDING_EDIT_UNAVAILABLE503 revokes both shared controls but keeps draft", async () => {
    status = 503;
    errorBody = { statusCode: status, code: "CATEGORY_FUNDING_EDIT_UNAVAILABLE", message: "SQL secret" };
    await changeAndSave();
    await screen.findByText(/La edición de tipo de recurso y fuentes de financiamiento no está disponible/);
    expectDraft();
    expectInitialReadsOnly();
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeDisabled();
    expect(screen.getByLabelText("Añadir fuente")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it.each([
    [400, { message: "SQL secret", code: "UNKNOWN" }],
    [409, { message: "SQL secret", code: "UNKNOWN" }],
    [422, { message: "SQL secret", code: { unsafe: "SQL secret" } }],
    [503, { message: "SQL secret", code: "SERVICE_UNAVAILABLE" }],
    [400, null],
  ])("safe fallback for status %s with unknown or malformed body keeps capability", async (httpStatus, body) => {
    status = httpStatus;
    errorBody = body;
    await changeAndSave();
    await screen.findByText(httpStatus === 400 && body !== null ? /El servidor rechazó los datos/ : /No se pudo guardar/);
    expectDraft();
    expectInitialReadsOnly();
    expect(screen.getByLabelText("Tipo de recurso")).toBeEnabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it.each([
    [false, true],
    [true, false],
    [true, undefined],
  ])("keeps shared capability closed when R1=%s R2=%s", async (first, second) => {
    mocks.readRevision.mockResolvedValueOnce({ ...ready, category_funding_edit_ready: first })
      .mockResolvedValueOnce({ ...ready, category_funding_edit_ready: second });
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps catalog loading closed while retaining a dirty financial draft", async () => {
    mocks.get.mockImplementation((path: string) => path.startsWith("/catalogs/")
      ? new Promise(() => {}) : Promise.resolve(selected));
    render(<ApprovedAmendmentModal line={selected} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(await screen.findByText("Cargando catálogos…")).toHaveAttribute("role", "status");
    expect(screen.getByText("Cargando catálogo de tipos de recurso…")).toBeInTheDocument();
    expect(screen.getByText("Cargando catálogo de fuentes…")).toBeInTheDocument();
    expect(screen.queryByText("No hay cambios pendientes")).not.toBeInTheDocument();
    expect(screen.queryByText(/No se pudo cargar el catálogo/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Importancia"), { target: { value: "Actividad no estratégica" } });
    expect(screen.getByLabelText("Tipo de recurso")).toBeDisabled();
    expect(screen.getByLabelText("Cambiar fuente Fuente A")).toBeDisabled();
    expect(screen.getByLabelText("Importancia")).toHaveValue("Actividad no estratégica");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.queryByText("No hay cambios pendientes")).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando catálogos…")).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("approved linked hierarchy contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readRevision.mockReset().mockResolvedValue(revision);
    mocks.get.mockReset().mockResolvedValue(line);
    mocks.save.mockReset().mockResolvedValue(response);
    mocks.patch.mockReset().mockResolvedValue({ name: "Unidad nueva" });
  });
  it("keeps financial editing available but disables hierarchy rename for a historical null resource", async () => {
    mocks.get.mockResolvedValue(line);
    mocks.readRevision.mockResolvedValue(revision);
    render(<ApprovedAmendmentModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/Revisión 4/);
    expect(screen.queryByRole("button", { name: "Guardar jerarquía" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre del recurso POA *")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });
  it("retains approved hierarchy draft on a 400 rejection without success", async () => {
    const linked = {
      ...line,
      resource_id: "r",
      organizational_unit_id: "ou2",
      planning_type: "PROGRAMA" as const,
      program_id: "p2",
      operative_action_id: "a2",
      poaHierarchy: {
        component: { id: "c2", name: "Nuevo componente" },
        action: { id: "a2", name: "Nueva acción" },
      },
    } as PlanningLine;
    mocks.get.mockResolvedValue(linked);
    mocks.readRevision.mockResolvedValue(revision);
    mocks.save.mockRejectedValue(
      new ApiRequestError(400, {
        statusCode: 400,
        error: "Bad Request",
        message: "private server detail",
        timestamp: "now",
        path: "",
      }),
    );
    const success = vi.fn();
    render(
      <ApprovedAmendmentModal
        line={linked}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Mi recurso" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/El servidor rechazó los datos/);
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
      "Mi recurso",
    );
    expect(screen.queryByText(/private server detail/)).not.toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });
  it("on hierarchy 409 preserves edits, reads R1/detail/R2, and requires explicit latest revision", async () => {
    const linked = {
      ...line,
      resource_id: "r",
      organizational_unit_id: "ou",
      planning_type: "PROGRAMA" as const,
      program_id: "p2",
      operative_action_id: "a2",
      poaHierarchy: {
        component: { id: "c2", name: "Nuevo componente" },
        action: { id: "a2", name: "Nueva acción" },
      },
    } as PlanningLine;
    mocks.get
      .mockResolvedValueOnce(linked)
      .mockResolvedValue({ ...linked, total_cost: 120 });
    mocks.readRevision
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce(revision)
      .mockResolvedValue({ line_id: "line-1", revision: "5" });
    mocks.save
      .mockRejectedValueOnce(
        new ApiRequestError(409, {
          statusCode: 409,
          error: "Conflict",
          message: "conflict",
          timestamp: "now",
          path: "",
        }),
      )
      .mockResolvedValue(response);
    const success = vi.fn();
    render(
      <ApprovedAmendmentModal
        line={linked}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.click(screen.getByRole("button", { name: "Unidad orgánica" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva unidad" }));
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Mi borrador" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/La versión actual es 5/);
    expect(mocks.readRevision).toHaveBeenCalledTimes(4);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
      "Mi borrador",
    );
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
    expect(success).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: /Usar revisión actual/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0]).toMatchObject({
      expected_revision: "5",
      hierarchy: {
        organizational_unit_id: "ou2",
        resource_name: "Mi borrador",
      },
    });
  });
  it("reviews the freshly matched concurrent hierarchy beside the pending target before accepting revision", async () => {
    const longName = "Unidad actual ".repeat(35);
    const linked = {
      ...line,
      resource_id: "r",
      organizational_unit_id: "ou",
      planning_type: "PROGRAMA" as const,
      program_id: "p2",
      operative_action_id: "a2",
      organizationalUnit: { id: "ou", name: "Unidad anterior" },
      program: { id: "p2", name: "Programa anterior" },
      poaHierarchy: {
        component: { id: "c2", name: "Componente anterior", fullCode: "C" },
        action: { id: "a2", name: "Acción anterior", fullCode: "A" },
        resource: { id: "r", name: "Recurso anterior", fullCode: "R" },
      },
    } as PlanningLine;
    const fresh = {
      ...linked,
      organizationalUnit: { id: "ou", name: longName },
      program: { id: "p2", name: "Programa concurrente" },
      poaHierarchy: {
        component: { id: "c2", name: "Componente concurrente", fullCode: "C" },
        action: { id: "a2", name: "Acción concurrente", fullCode: "A" },
        resource: { id: "r", name: "Recurso concurrente", fullCode: "R" },
      },
      privateContact: "not authorized for review",
    };
    const events: string[] = [];
    mocks.get
      .mockImplementationOnce(() => {
        events.push("detail");
        return Promise.resolve(linked);
      })
      .mockImplementationOnce(() => {
        events.push("detail");
        return Promise.resolve(fresh);
      });
    mocks.readRevision.mockImplementation(() => {
      events.push("revision");
      return Promise.resolve({
        line_id: "line-1",
        revision: events.length <= 3 ? "4" : "5",
      });
    });
    mocks.save.mockRejectedValueOnce(
      new ApiRequestError(409, {
        statusCode: 409,
        error: "Conflict",
        message: "private conflict detail",
        timestamp: "now",
        path: "",
      }),
    );
    render(
      <ApprovedAmendmentModal
        line={linked}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.click(screen.getByRole("button", { name: "Unidad orgánica" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva unidad" }));
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Mi destino" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const current = await screen.findByRole("group", {
      name: "Jerarquía actual de la revisión 5",
    });
    const pending = screen.getByRole("group", {
      name: "Jerarquía que intentaste guardar",
    });
    expect(events).toEqual([
      "revision", "detail", "revision", "revision", "detail", "revision",
    ]);
    expect(current).toHaveTextContent(longName.trim());
    expect(current).toHaveTextContent("Programa concurrente");
    expect(current).toHaveTextContent("Componente concurrente");
    expect(current).toHaveTextContent("Acción concurrente");
    expect(current).toHaveTextContent("Recurso concurrente");
    expect(pending).toHaveTextContent("Nueva unidad");
    expect(pending).toHaveTextContent("Nuevo programa");
    expect(pending).toHaveTextContent("Nuevo componente");
    expect(pending).toHaveTextContent("Nueva acción");
    expect(pending).toHaveTextContent("Mi destino");
    expect(
      screen.queryByText(/not authorized for review|private conflict detail/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
    const accept = screen.getByRole("button", { name: /Usar revisión actual/ });
    accept.focus();
    expect(accept).toHaveFocus();
    await userEvent.setup().keyboard("{Enter}");
    expect(
      screen.queryByRole("group", { name: "Jerarquía actual de la revisión 5" }),
    ).not.toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Nombre del recurso POA *")).toHaveValue(
      "Mi destino",
    );
  });
  it("shows safe missing hierarchy labels in a financial-only 409 without inventing a pending hierarchy", async () => {
    mocks.save.mockRejectedValueOnce(
      new ApiRequestError(409, {
        statusCode: 409,
        error: "Conflict",
        message: "conflict",
        timestamp: "now",
        path: "",
      }),
    );
    mocks.readRevision
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce(revision)
      .mockResolvedValue({ line_id: "line-1", revision: "5" });
    mocks.get
      .mockResolvedValueOnce(line)
      .mockResolvedValue({ ...line, resource_description: "" });
    render(
      <ApprovedAmendmentModal
        line={line}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.change(screen.getByLabelText("Descripción libre del recurso"), { target: { value: "Nuevo detalle" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const current = await screen.findByRole("group", {
      name: "Jerarquía actual de la revisión 5",
    });
    expect(current).toHaveTextContent("Sin dato");
    expect(
      screen.queryByRole("group", { name: "Jerarquía que intentaste guardar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
  });
  it("submits current financial snapshot and full hierarchy on an approved linked line without a resource POST", async () => {
    const linked = {
      ...line,
      resource_id: "r",
      organizational_unit_id: "ou",
      planning_type: "PROGRAMA" as const,
      program_id: "p2",
      operative_action_id: "a2",
      poaHierarchy: {
        component: { id: "c2", name: "Nuevo componente", fullCode: "C" },
        action: { id: "a2", name: "Nueva acción", fullCode: "A" },
        resource: { id: "r", name: "Recurso libre", fullCode: "R" },
      },
    };
    mocks.get.mockResolvedValue(linked);
    mocks.readRevision.mockResolvedValue(revision);
    mocks.save.mockResolvedValue(response);
    const success = vi.fn();
    render(
      <ApprovedAmendmentModal
        line={linked}
        onClose={vi.fn()}
        onSuccess={success}
      />,
    );
    await screen.findByText(/Revisión 4/);
    fireEvent.click(screen.getByRole("button", { name: "Unidad orgánica" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva unidad" }));
    fireEvent.change(screen.getByLabelText("Nombre del recurso POA *"), {
      target: { value: "Nombre nuevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          expected_revision: "4",
          unit_price: "100.00",
          quantity: "1.00",
          hierarchy: {
            organizational_unit_id: "ou2",
            planning_type: "PROGRAMA",
            program_id: "p2",
            component_id: "c2",
            operative_action_id: "a2",
            resource_name: "Nombre nuevo",
          },
        }),
      ),
    );
    expect(mocks.save.mock.calls[0][0].monthly).toHaveLength(12);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty(
      "resource_description",
    );
    expect(linked.organizational_unit_id).toBe("ou");
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("request_id");
    expect(success).toHaveBeenCalledWith(response.warnings);
  });
  it("sends revision, unchanged exact financial basis and twelve months with six hierarchy fields; no legacy resource description", () => {
    const fields = seedApprovedAmendment(line)!;
    const hierarchy = {
      organizational_unit_id: "ou2",
      planning_type: "PROGRAMA" as const,
      program_id: "p2",
      component_id: "c2",
      operative_action_id: "a2",
      resource_name: "Nuevo",
    };
    const result = buildApprovedAmendment(fields, "4", false, hierarchy);
    expect(result.request).toMatchObject({
      expected_revision: "4",
      unit_price: "100.00",
      quantity: "1.00",
      importance: line.importance,
      frequency: line.frequency,
      hierarchy,
    });
    expect(result.request?.monthly).toHaveLength(12);
    expect(result.request).not.toHaveProperty("resource_description");
    expect(result.request).not.toHaveProperty("resource_id");
    expect(result.request).not.toHaveProperty("new_resource");
  });
});
