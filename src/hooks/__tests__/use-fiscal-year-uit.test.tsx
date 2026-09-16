import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError } from "@/lib/api-client";
import { invalidateQueryTag } from "@/lib/query-cache";
import { useActivateFiscalYear, useCreateFiscalYear, useUpdateFiscalYear } from "@/hooks/use-budget";

vi.mock("@/lib/api-client", async (original) => {
  const actual = await original<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, post: vi.fn(), patch: vi.fn() } };
});
vi.mock("@/lib/query-cache", async (original) => {
  const actual = await original<typeof import("@/lib/query-cache")>();
  return { ...actual, invalidateQueryTag: vi.fn() };
});
beforeEach(() => vi.clearAllMocks());
const serverYear = { id: "fy", year: 2027, annual_uit: "5500.00", status: "ACTIVE", notes: "Servidor", created_by: "trusted", updated_at: "server-time" };

describe("UIT fiscal-year HTTP contracts", () => {
  it("sends numeric create value and returns authoritative string/identity/status without merging", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(serverYear);
    const { result } = renderHook(useCreateFiscalYear);
    await act(async () => expect(await result.current.create({ year: 2027, annual_uit: 5500 })).toBe(serverYear));
    expect(api.post).toHaveBeenCalledWith("/budget/fiscal-years", { year: 2027, annual_uit: 5500 });
    expect(invalidateQueryTag).toHaveBeenCalledWith("budget");
    expect(invalidateQueryTag).toHaveBeenCalledWith("catalog");
    expect(invalidateQueryTag).toHaveBeenCalledWith("annual-uit");
  });
  it("preserves omission for existing notes-only updates", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce(serverYear);
    const { result } = renderHook(() => useUpdateFiscalYear("fy"));
    await act(async () => { await result.current.update({ notes: "Solo notas" }); });
    expect(api.patch).toHaveBeenCalledWith("/budget/fiscal-years/fy", { notes: "Solo notas" });
  });
  it("initializes via existing PATCH with exact audit metadata, no client actor/status or invented confirmation", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce(serverYear);
    const dto = { annual_uit: 5500, annual_uit_source: "Norma", annual_uit_reason: "Inicio" };
    const { result } = renderHook(() => useUpdateFiscalYear("fy"));
    await act(async () => expect(await result.current.update(dto)).toBe(serverYear));
    expect(api.patch).toHaveBeenCalledWith("/budget/fiscal-years/fy", dto);
  });
  it.each([
    [409, "ANNUAL_UIT_ALREADY_CONFIGURED"], [409, "FISCAL_YEAR_STATE_CONFLICT"],
    [400, "FISCAL_YEAR_INVALID_COMMAND"], [400, "INVALID_ANNUAL_UIT"],
    [400, "FISCAL_YEAR_CLOSED"], [403, "FISCAL_YEAR_ADMIN_FORBIDDEN"], [500, "INTERNAL_ERROR"],
  ])("propagates %s/%s and invalidates without retry", async (status, code) => {
    const error = new ApiRequestError(Number(status), { statusCode: Number(status), code: String(code), message: "Rechazado", error: "Error", timestamp: "now", path: "/budget/fiscal-years/fy" });
    vi.mocked(api.patch).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useUpdateFiscalYear("fy"));
    await act(async () => { await expect(result.current.update({ annual_uit: 1 })).rejects.toBe(error); });
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(invalidateQueryTag).toHaveBeenCalledWith("budget");
    expect(invalidateQueryTag).toHaveBeenCalledWith("catalog");
    expect(invalidateQueryTag).toHaveBeenCalledWith("annual-uit");
    expect(result.current.isLoading).toBe(false);
  });
  it("prevents simultaneous mutation submissions", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api.patch).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useUpdateFiscalYear("fy"));
    await act(async () => {
      const first = result.current.update({ annual_uit: 1 });
      await expect(result.current.update({ annual_uit: 2 })).rejects.toThrow("Operación en curso");
      resolve(serverYear); await first;
    });
    expect(api.patch).toHaveBeenCalledTimes(1);
  });
  it("activation missing UIT retains the real error and refresh eligibility", async () => {
    const error = new ApiRequestError(400, { statusCode: 400, code: "UIT_NOT_CONFIGURED", message: "Configure UIT", error: "Bad Request", timestamp: "now", path: "/activate" });
    vi.mocked(api.post).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useActivateFiscalYear("fy"));
    await act(async () => { await expect(result.current.activate()).rejects.toBe(error); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(invalidateQueryTag).toHaveBeenCalledWith("catalog");
    expect(invalidateQueryTag).toHaveBeenCalledWith("annual-uit");
  });
});
