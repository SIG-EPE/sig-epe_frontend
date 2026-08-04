import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePoaHierarchy, executePoaNodeAction } from "../use-poa-hierarchy";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

vi.mock("@/lib/api-client", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/config/features", () => ({
  isPoaCatalogCodeModelEnabled: () => true,
  isPoaCatalogAliasWorkflowEnabled: () => false,
}));

describe("usePoaHierarchy", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "token", isLoading: false });
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/catalogs/budget-programs") return [];
      if (path.endsWith("/dependencies")) return { total: 0 };
      return [];
    });
  });

  it("carga todos los niveles e incluye inactivos", async () => {
    const { result } = renderHook(() => usePoaHierarchy());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.get).toHaveBeenCalledWith("/catalogs/strategic-components?include_inactive=true");
    expect(api.get).toHaveBeenCalledWith("/catalogs/operative-actions?include_inactive=true");
    expect(api.get).toHaveBeenCalledWith("/catalogs/poa-resources?include_inactive=true");
  });

  it("usa rutas backend existentes y nunca envía código al crear", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "new" });
    await act(() => executePoaNodeAction({ kind: "create", level: "resource", name: "Descripción", parentId: "a1" }));
    expect(api.post).toHaveBeenCalledWith("/catalogs/poa-resources", { name: "Descripción", action_id: "a1" });
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).not.toHaveProperty("fullCode");
  });

  it.each([
    ["rename", "/catalogs/operative-actions/a1", { name: "Nuevo nombre" }],
    ["publish", "/catalogs/operative-actions/a1/publish", undefined],
    ["deactivate", "/catalogs/operative-actions/a1/deactivate", undefined],
    ["reactivate", "/catalogs/operative-actions/a1/reactivate", undefined],
  ] as const)("ejecuta %s contra la ruta gobernada", async (kind, path, body) => {
    vi.mocked(api.patch).mockResolvedValue({ id: "a1" });
    await executePoaNodeAction({ kind, level: "action", id: "a1", name: "Nuevo nombre" });
    if (body) expect(api.patch).toHaveBeenCalledWith(path, body);
    else expect(api.patch).toHaveBeenCalledWith(path);
  });

  it("envía reemplazos solo con nombre, padre y motivo", async () => {
    vi.mocked(api.post).mockResolvedValue({ replacement: { id: "r2" } });
    await executePoaNodeAction({
      kind: "replacement",
      level: "resource",
      id: "r1",
      name: "Descripción corregida",
      parentId: "a1",
      reason: "Corrección aprobada",
    });
    expect(api.post).toHaveBeenCalledWith("/catalogs/poa-resources/r1/replacement", {
      name: "Descripción corregida",
      parent_id: "a1",
      reason: "Corrección aprobada",
    });
  });
});
