import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { monthlyFxApi } from "@/lib/monthly-fx";
import { MonthlyFxCatalogSection } from "../monthly-fx-catalog-section";

vi.mock("@/lib/monthly-fx", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/monthly-fx")>(),
  monthlyFxApi: {
    getPolicy: vi.fn(),
    getRates: vi.fn(),
    createReference: vi.fn(),
    retryReference: vi.fn(),
    closeMonth: vi.fn(),
  },
}));

const error = (status: number) =>
  new ApiRequestError(status, {
    statusCode: status,
    message: "Error",
    error: "Error",
    timestamp: "2026-09-29T00:00:00Z",
    path: "/catalogs/monthly-fx/rates",
  });

describe("MonthlyFxCatalogSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(monthlyFxApi.getPolicy).mockResolvedValue({ active: false });
    vi.mocked(monthlyFxApi.getRates).mockResolvedValue([]);
  });

  it.each([
    undefined,
    ROLE_CODE.GIOF_GESTOR,
    ROLE_CODE.ADMIN_SISTEMA,
    ROLE_CODE.SOLICITANTE_EPE,
  ])("no consulta ni edita para %s", (role) => {
    render(<MonthlyFxCatalogSection role={role} />);
    expect(monthlyFxApi.getPolicy).not.toHaveBeenCalled();
    expect(monthlyFxApi.getRates).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /guardar referencia/i }),
    ).not.toBeInTheDocument();
  });

  it("muestra carga y año vacío sin inferir tasas; política OFF no tiene control de activación", async () => {
    const user = userEvent.setup();
    render(<MonthlyFxCatalogSection role={ROLE_CODE.GIOF_MANAGER} />);
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/configuración mensual en preparación/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/sin referencia/i)).toHaveLength(12);
    expect(
      screen.queryByRole("button", { name: /activar/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/tc de cierre/i)).toBeDisabled();
    expect(
      screen.getByText(/política mensual OFF/i),
    ).toBeInTheDocument();
    expect(monthlyFxApi.getRates).toHaveBeenCalledTimes(1);
    await user.clear(screen.getByLabelText("Año"));
    await user.type(screen.getByLabelText("Año"), "2027");
    expect(screen.getByText(/2027/)).toBeInTheDocument();
  });

  it("guarda POST y relee tasas antes de mostrar el nuevo valor", async () => {
    const user = userEvent.setup();
    vi.mocked(monthlyFxApi.createReference).mockResolvedValue({
      year: 2026,
      month: 1,
      referenceRate: "3.81",
      closeRate: null,
    });
    vi.mocked(monthlyFxApi.getRates)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { year: 2026, month: 1, referenceRate: "3.81", closeRate: null },
      ]);
    render(<MonthlyFxCatalogSection role={ROLE_CODE.GIOF_MANAGER} />);
    await screen.findByText(/configuración mensual en preparación/i);
    await user.type(
      screen.getByLabelText("TC referencial (PEN por USD)"),
      "3.81",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar referencia" }),
    );
    expect(monthlyFxApi.createReference).toHaveBeenCalledWith({
      year: 2026,
      month: 1,
      referenceRate: "3.81",
    }, { signal: expect.any(AbortSignal) });
    expect(await screen.findByText("3.81")).toBeInTheDocument();
    expect(monthlyFxApi.getRates).toHaveBeenCalledTimes(2);
  });

  it("conflicto de POST relee la tasa; cambio no se sobrescribe ni se reintenta automáticamente", async () => {
    const user = userEvent.setup();
    vi.mocked(monthlyFxApi.createReference).mockRejectedValue(error(409));
    vi.mocked(monthlyFxApi.getRates)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { year: 2026, month: 1, referenceRate: "3.9", closeRate: null },
      ]);
    render(<MonthlyFxCatalogSection role={ROLE_CODE.GIOF_MANAGER} />);
    await screen.findByText(/configuración mensual en preparación/i);
    await user.type(
      screen.getByLabelText("TC referencial (PEN por USD)"),
      "3.8",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar referencia" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/conflicto/i);
    await waitFor(() => expect(screen.getByText("3.90")).toBeInTheDocument());
    expect(monthlyFxApi.retryReference).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /reintentar misma/i }),
    ).not.toBeInTheDocument();
  });

  it("permite PUT explícito distinto antes de uso, con autorización del servidor", async () => {
    const user = userEvent.setup();
    vi.mocked(monthlyFxApi.getRates).mockResolvedValue([
      { year: 2026, month: 1, referenceRate: "3.81", closeRate: null },
    ]);
    vi.mocked(monthlyFxApi.retryReference).mockResolvedValue({
      year: 2026,
      month: 1,
      referenceRate: "3.81",
      closeRate: null,
    });
    render(<MonthlyFxCatalogSection role={ROLE_CODE.GIOF_MANAGER} />);
    await screen.findByText("3.81");
    await user.type(
      screen.getByLabelText("TC referencial (PEN por USD)"),
      "3.82",
    );
    expect(
      screen.getByRole("button", { name: /editar referencia/i }),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText("TC referencial (PEN por USD)"));
    await user.type(
      screen.getByLabelText("TC referencial (PEN por USD)"),
      "3.81",
    );
    await user.click(screen.getByRole("button", { name: /reintentar misma/i }));
    expect(monthlyFxApi.retryReference).toHaveBeenCalledWith({
      year: 2026,
      month: 1,
      referenceRate: "3.81",
    }, { signal: expect.any(AbortSignal) });
    expect(monthlyFxApi.createReference).not.toHaveBeenCalled();
  });

  it("un 503 no presenta catálogo vacío ni habilita escritura", async () => {
    vi.mocked(monthlyFxApi.getRates).mockRejectedValue(error(503));
    render(<MonthlyFxCatalogSection role={ROLE_CODE.GIOF_MANAGER} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no disponible/i,
    );
    expect(
      screen.queryByRole("button", { name: /guardar referencia/i }),
    ).not.toBeInTheDocument();
  });

  it("rechaza filas con contrato inesperado en vez de permitir escritura sobre catálogo corrupto", async () => {
    vi.mocked(monthlyFxApi.getRates).mockResolvedValue([
      { year: 2026, month: 1, referenceRate: 3.8, closeRate: null },
    ] as unknown as Awaited<ReturnType<typeof monthlyFxApi.getRates>>);
    render(<MonthlyFxCatalogSection role={ROLE_CODE.GIOF_MANAGER} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no disponible/i,
    );
    expect(
      screen.queryByRole("button", { name: /guardar referencia/i }),
    ).not.toBeInTheDocument();
  });

  it("un fallo de recarga tras guardar bloquea una segunda escritura sin catálogo actualizado", async () => {
    const user = userEvent.setup();
    vi.mocked(monthlyFxApi.getRates)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(error(503));
    vi.mocked(monthlyFxApi.createReference).mockResolvedValue({
      year: 2026,
      month: 1,
      referenceRate: "3.81",
      closeRate: null,
    });
    render(<MonthlyFxCatalogSection role={ROLE_CODE.GIOF_MANAGER} />);
    await screen.findByText(/configuración mensual en preparación/i);
    await user.type(
      screen.getByLabelText("TC referencial (PEN por USD)"),
      "3.81",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar referencia" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no disponible/i,
    );
    expect(
      screen.queryByRole("button", { name: /guardar referencia/i }),
    ).not.toBeInTheDocument();
  });
});
