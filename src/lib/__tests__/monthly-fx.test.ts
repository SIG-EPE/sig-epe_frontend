import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
import { monthlyFxApi, isMonthlyFxRate, normalizeMonthlyFxRate } from "@/lib/monthly-fx";

vi.mock("@/lib/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

describe("monthly FX backend contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lee rutas protegidas sin parámetros de año ni respuesta sintética", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ active: false })
      .mockResolvedValueOnce([]);
    expect(await monthlyFxApi.getPolicy()).toEqual({ active: false });
    expect(await monthlyFxApi.getRates()).toEqual([]);
    expect(api.get).toHaveBeenNthCalledWith(1, "/catalogs/monthly-fx/policy", undefined);
    expect(api.get).toHaveBeenNthCalledWith(2, "/catalogs/monthly-fx/rates", { cache: "no-store" });
  });

  it("solo ofrece POST nuevo y PUT de reintento para referencia", async () => {
    const input = { year: 2026, month: 9, referenceRate: "3.805" };
    await monthlyFxApi.createReference(input);
    await monthlyFxApi.retryReference(input);
    expect(api.post).toHaveBeenCalledWith("/catalogs/monthly-fx/rates", input, undefined);
    expect(api.put).toHaveBeenCalledWith("/catalogs/monthly-fx/rates", input, undefined);
  });

  it.each(["0", "-3.8", "1e3", "1000000000000", "3.1234567890123", "3,8,1", "NaN", ".5"])("rechaza decimal inválido %s", (rate) => {
    expect(isMonthlyFxRate(normalizeMonthlyFxRate(rate))).toBe(false);
  });

  it("preserva precisión máxima y solo normaliza coma y espacio externo", () => {
    const value = normalizeMonthlyFxRate(" 999999999999,123456789012 ");
    expect(value).toBe("999999999999.123456789012");
    expect(isMonthlyFxRate(value)).toBe(true);
    expect(isMonthlyFxRate("0.000000000001")).toBe(true);
  });
});
