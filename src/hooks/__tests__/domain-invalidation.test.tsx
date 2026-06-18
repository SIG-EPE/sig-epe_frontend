import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateBudgetProgram, useDeactivateTerritory, useUpdateFundingSource } from "@/hooks/use-catalogs";
import { useCreateRequest, useRegisterPayment, useRequestRenditionReportActions } from "@/hooks/use-requests";
import { useCreateUser } from "@/hooks/use-users";
import { api } from "@/lib/api-client";
import { invalidateCatalogDomain, invalidateRequestDomain, invalidateUserDomain } from "@/lib/query-tags";

vi.mock("@/lib/api-client", () => ({
  api: {
    post: vi.fn(),
    postForm: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string | null }) => unknown) => selector({ isLoading: false, accessToken: "token" }),
}));

vi.mock("@/lib/query-tags", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/query-tags")>();
  return {
    ...actual,
    invalidateCatalogDomain: vi.fn(),
    invalidateRequestDomain: vi.fn(),
    invalidateUserDomain: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("domain mutation invalidation", () => {
  it("invalida el dominio de usuarios al crear usuarios", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({});
    const { result } = renderHook(() => useCreateUser());

    await act(async () => {
      await result.current.createUser({ firstName: "Ana", lastName: "Paz", epeDni: "12345678", roleCode: "ADMIN_SISTEMA" });
    });

    expect(api.post).toHaveBeenCalledWith("/users", expect.objectContaining({ epeDni: "12345678" }));
    expect(invalidateUserDomain).toHaveBeenCalledTimes(1);
  });

  it("invalida catálogos al crear, actualizar o desactivar catálogos presupuestales", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ id: "program-1" });
    vi.mocked(api.patch).mockResolvedValueOnce({ id: "source-1" }).mockResolvedValueOnce({ id: "territory-1" });
    const { result: createProgram } = renderHook(() => useCreateBudgetProgram());
    const { result: updateSource } = renderHook(() => useUpdateFundingSource("source-1"));
    const { result: deactivateTerritory } = renderHook(() => useDeactivateTerritory("territory-1"));

    await act(async () => {
      await createProgram.current.create({ code: "P1", name: "Programa", planningType: "ACTIVITY" } as never);
      await updateSource.current.update({ name: "Fuente" } as never);
      await deactivateTerritory.current.deactivate();
    });

    expect(invalidateCatalogDomain).toHaveBeenCalledTimes(3);
  });

  it("invalida solicitudes, pagos y rendiciones desde mutaciones del dominio solicitudes", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ id: "request-1" }).mockResolvedValueOnce({ report: { id: "report-1" } });
    vi.mocked(api.postForm).mockResolvedValueOnce({ id: "payment-1" });
    const { result: createRequest } = renderHook(() => useCreateRequest());
    const { result: registerPayment } = renderHook(() => useRegisterPayment());
    const { result: renditionActions } = renderHook(() => useRequestRenditionReportActions());

    await act(async () => {
      await createRequest.current.createRequest({ concept: "Solicitud" } as never);
      await registerPayment.current.registerPayment("request-1", {
        paid_at: "2026-06-18T10:00:00.000Z",
        operation_reference: "OP-1",
        amount_paid: 10,
        proof: new File(["proof"], "proof.pdf", { type: "application/pdf" }),
      });
      await renditionActions.current.generateReport("request-1");
    });

    expect(invalidateRequestDomain).toHaveBeenCalledTimes(3);
  });
});
