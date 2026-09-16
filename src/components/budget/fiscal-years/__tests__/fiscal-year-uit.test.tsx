import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FiscalYearForm } from "../fiscal-year-form";
import { FiscalYearUitForm } from "../fiscal-year-uit-form";
import { FiscalYearTable } from "../fiscal-year-table";
import type { FiscalYear } from "@/types/budget";
import { ApiRequestError } from "@/lib/api-client";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), refresh: vi.fn(), role: "GIOF_MANAGER", years: [] as FiscalYear[] }));
vi.mock("@/hooks/use-budget", () => ({
  useCreateFiscalYear: () => ({ create: mocks.create, isLoading: false }),
  useUpdateFiscalYear: () => ({ update: mocks.update, isLoading: false }),
  useFiscalYears: () => ({ data: mocks.years, isLoading: false, refetch: mocks.refresh }),
  useActivateFiscalYear: () => ({ activate: vi.fn(), isLoading: false }),
  useCloseFiscalYear: () => ({ close: vi.fn(), isLoading: false }),
}));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { role: { code: mocks.role } } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const year = (status: FiscalYear["status"] = "DRAFT", annual_uit: string | null = null): FiscalYear => ({ id: "fy", year: 2027, status, annual_uit, created_by: "actor", created_at: "2027-01-01", updated_at: "2027-01-01" });
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => { vi.clearAllMocks(); mocks.role = "GIOF_MANAGER"; mocks.years = []; mocks.create.mockResolvedValue(year()); mocks.update.mockResolvedValue(year("ACTIVE", "5500.00")); });

describe("fiscal UIT administration", () => {
  it.each([
    [" ", "Motivo"], ["x".repeat(501), "Motivo"],
    ["Norma", " "], ["Norma", "x".repeat(1001)],
  ])("rejects invalid audit metadata", async (source, reason) => {
    render(<FiscalYearUitForm fiscalYear={year("ACTIVE")} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, "5500"); fill(/Fuente/, source); fill(/Motivo/, reason);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Inicializar Valor UIT" }));
    await screen.findByRole("alert"); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("supports keyboard confirmation with an accessible immutable-intent label", async () => {
    const user = userEvent.setup();
    render(<FiscalYearUitForm fiscalYear={year("ACTIVE")} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    const checkbox = screen.getByRole("checkbox", { name: "Confirmo que esta inicialización es única e inmutable" });
    checkbox.focus(); await user.keyboard(" "); expect(checkbox).toBeChecked();
    await user.tab(); expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
  });
  it.each(["GIOF_GESTOR", "SOLICITANTE_EPE"])("direct form access cannot bypass %s permissions", (role) => {
    mocks.role = role;
    const { unmount } = render(<FiscalYearUitForm fiscalYear={year("ACTIVE")} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    expect(screen.queryByRole("button", { name: "Inicializar Valor UIT" })).not.toBeInTheDocument();
    unmount(); render(<FiscalYearForm onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Crear año fiscal" })).not.toBeInTheDocument();
  });
  it.each(["0", "1.001", "1e3", "10000000000"])("blocks invalid create value %s", async (value) => {
    render(<FiscalYearForm onClose={vi.fn()} onSuccess={vi.fn()} />);
    fill(/Año \*/, "2027"); fill(/Valor UIT/, value);
    fireEvent.click(screen.getByRole("button", { name: "Crear año fiscal" }));
    await waitFor(() => expect(screen.getByLabelText(/Valor UIT/)).toHaveAttribute("aria-invalid", "true"));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not guess year and rejects pre-2020 years", async () => {
    render(<FiscalYearForm onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByLabelText(/Año \*/)).toHaveValue("");
    fill(/Año \*/, "2019");
    fireEvent.click(screen.getByRole("button", { name: "Crear año fiscal" }));
    await waitFor(() => expect(screen.getByLabelText(/Año \*/)).toHaveAttribute("aria-invalid", "true"));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["", "5500.00"])("does not clear/rewrite unchanged DRAFT UIT %s", async (value) => {
    const close = vi.fn();
    render(<FiscalYearUitForm fiscalYear={year("DRAFT", "5500.00")} onClose={close} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, value);
    fireEvent.click(screen.getByRole("button", { name: "Guardar Valor UIT" }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("DRAFT edit sends only changed UIT, not notes or status", async () => {
    render(<FiscalYearUitForm fiscalYear={year("DRAFT", "5500.00")} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, "5500.01"); fireEvent.click(screen.getByRole("button", { name: "Guardar Valor UIT" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ annual_uit: 5500.01 }));
  });
  it("prevents duplicate submission and closing while pending", async () => {
    let resolve!: (value: FiscalYear) => void;
    mocks.update.mockImplementationOnce(() => new Promise<FiscalYear>((done) => { resolve = done; }));
    render(<FiscalYearUitForm fiscalYear={year()} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, "5500");
    fireEvent.click(screen.getByRole("button", { name: "Guardar Valor UIT" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Guardando..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Guardando..." }).closest("form")!);
    await act(async () => { resolve(year()); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("configured ACTIVE retains close action and has no UIT rewrite control", () => {
    mocks.years = [year("ACTIVE", "5500.00")]; render(<FiscalYearTable onRefetch={vi.fn()} />);
    expect(screen.getByText("PEN 5500.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Valor UIT/ })).not.toBeInTheDocument();
  });
  it("ACTIVE null exposes explicit initialization while zero is invalid, never missing", () => {
    mocks.years = [year("ACTIVE")];
    const { rerender } = render(<FiscalYearTable onRefetch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Inicializar Valor UIT" })).toBeEnabled();
    mocks.years = [year("ACTIVE", "0.00")]; rerender(<FiscalYearTable onRefetch={vi.fn()} />);
    expect(screen.getByText("PEN 0.00 (inválido)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inicializar Valor UIT" })).not.toBeInTheDocument();
  });
  it.each(["FISCAL_YEAR_STATE_CONFLICT", "FISCAL_YEAR_CLOSED", "FISCAL_YEAR_INVALID_COMMAND", "INVALID_ANNUAL_UIT", "FISCAL_YEAR_ADMIN_FORBIDDEN"])("shows authoritative %s and refreshes without replay", async (code) => {
    mocks.update.mockRejectedValueOnce(new ApiRequestError(code.includes("CONFLICT") ? 409 : 400, { statusCode: 400, code, message: ["Estado del servidor", "Revise la configuración"], error: "Error", timestamp: "now", path: "/fiscal-years/fy" }));
    render(<FiscalYearUitForm fiscalYear={year()} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, "5500"); fireEvent.click(screen.getByRole("button", { name: "Guardar Valor UIT" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(code);
    expect(screen.getByRole("alert")).toHaveTextContent("Estado del servidor. Revise la configuración");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("failed refresh stays blocked and allows only closing/reopening from refreshed list", async () => {
    mocks.update.mockRejectedValueOnce(new Error("Respuesta perdida"));
    mocks.refresh.mockRejectedValueOnce(new Error("Sin conexión"));
    render(<FiscalYearUitForm fiscalYear={year()} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, "5500"); fireEvent.click(screen.getByRole("button", { name: "Guardar Valor UIT" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo actualizar"));
    expect(screen.getByRole("button", { name: "Guardar Valor UIT" })).toBeDisabled();
  });
  it("refresh result, not attempted value, controls subsequent actions after conflict", async () => {
    mocks.years = [year("ACTIVE")];
    mocks.update.mockRejectedValueOnce(new Error("ANNUAL_UIT_ALREADY_CONFIGURED"));
    mocks.refresh.mockImplementationOnce(async () => { mocks.years = [year("ACTIVE", "5700.00")]; });
    const { rerender } = render(<FiscalYearTable onRefetch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Inicializar Valor UIT" }));
    fill(/Valor UIT \(PEN\)/, "5500"); fill(/Fuente/, "Norma"); fill(/Motivo/, "Inicial"); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getAllByRole("button", { name: "Inicializar Valor UIT" })[1]);
    await screen.findByRole("alert");
    rerender(<FiscalYearTable onRefetch={vi.fn()} />);
    expect(screen.getByText("PEN 5700.00")).toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
    await waitFor(() => expect(closeButtons[closeButtons.length - 1]).toBeEnabled());
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByRole("button", { name: "Inicializar Valor UIT" })).not.toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("creates with optional UIT omitted", async () => {
    render(<FiscalYearForm onClose={vi.fn()} onSuccess={vi.fn()} />);
    fill(/Año \*/, "2027");
    fireEvent.click(screen.getByRole("button", { name: "Crear año fiscal" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("annual_uit");
  });
  it("creates a validated exact UIT", async () => {
    render(<FiscalYearForm onClose={vi.fn()} onSuccess={vi.fn()} />);
    fill(/Año \*/, "2027"); fill(/Valor UIT/, "5500.01");
    fireEvent.click(screen.getByRole("button", { name: "Crear año fiscal" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ annual_uit: 5500.01 })));
  });
  it("requires ACTIVE confirmation, source and reason, sends only actual DTO fields", async () => {
    render(<FiscalYearUitForm fiscalYear={year("ACTIVE")} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, "5500");
    fireEvent.click(screen.getByRole("button", { name: "Inicializar Valor UIT" }));
    await screen.findAllByRole("alert"); expect(mocks.update).not.toHaveBeenCalled();
    fill(/Fuente/, " Norma oficial "); fill(/Motivo/, " Configuración inicial ");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Inicializar Valor UIT" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ annual_uit: 5500, annual_uit_source: "Norma oficial", annual_uit_reason: "Configuración inicial" }));
  });
  it.each(["ADMIN_SISTEMA", "GIOF_MANAGER"])("permits %s draft and active-null actions, blocks missing activation", (role) => {
    mocks.role = role; mocks.years = [year()];
    render(<FiscalYearTable onRefetch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Editar Valor UIT/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Activar" })).toBeDisabled();
    expect(screen.getByText("Sin configurar")).toBeInTheDocument();
  });
  it.each(["GIOF_GESTOR", "SOLICITANTE_EPE", "AUDITOR_DIRECCION", "PATROCINADOR"])("denies %s UIT commands", (role) => {
    mocks.role = role; mocks.years = [year()];
    render(<FiscalYearTable onRefetch={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Valor UIT/ })).not.toBeInTheDocument();
  });
  it.each([year("ACTIVE", "5500.00"), year("CLOSED"), year("CLOSED", "5500.00")])("renders immutable year read-only", (fy) => {
    render(<FiscalYearUitForm fiscalYear={fy} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    expect(screen.queryByRole("textbox", { name: /Valor UIT/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar|Inicializar/ })).not.toBeInTheDocument();
  });
  it("refreshes on ambiguous failure, blocks blind retry, preserves error", async () => {
    mocks.update.mockRejectedValue(new Error("ANNUAL_UIT_ALREADY_CONFIGURED"));
    render(<FiscalYearUitForm fiscalYear={year()} onClose={vi.fn()} onSuccess={vi.fn()} onRefresh={mocks.refresh} />);
    fill(/Valor UIT/, "5500"); fireEvent.click(screen.getByRole("button", { name: "Guardar Valor UIT" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ANNUAL_UIT_ALREADY_CONFIGURED");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Guardar Valor UIT" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar Valor UIT" }));
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
