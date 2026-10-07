import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@/lib/api-client";
import { RequestDetailPage } from "@/components/requests/request-detail-page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refetch: vi.fn(),
  useRequest: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "request-secret" }),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { id: "user-1", role: { code: "SOLICITANTE_EPE" } },
  }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequest: () => mocks.useRequest(),
  useRequestDocuments: () => ({ documents: [], isLoading: false, refetch: vi.fn() }),
  useRequestRenditionReport: () => ({ report: null, isLoading: false, refetch: vi.fn() }),
  useSettlementContext: () => ({ context: null, isLoading: false, refetch: vi.fn() }),
  useApproveRequest: () => ({ approveRequest: vi.fn(), isLoading: false }),
  useObserveRequest: () => ({ observeRequest: vi.fn(), isLoading: false }),
  useRejectRequest: () => ({ rejectRequest: vi.fn(), isLoading: false }),
  useStartAdvanceSettlement: () => ({ startAdvanceSettlement: vi.fn(), isLoading: false }),
  useRetryRexanActivation: () => ({ retryRexanActivation: vi.fn(), isLoading: false }),
}));

vi.mock("@/hooks/use-giof-work", () => ({
  useAutoAcquireGiofWorkLease: () => ({ release: vi.fn() }),
}));

vi.mock("@/hooks/use-drive-projection-polling", () => ({
  useDriveProjectionPolling: vi.fn(),
}));

function apiError(status: number): ApiRequestError {
  return new ApiRequestError(status, {
    statusCode: status,
    message: "sensitive backend detail",
    error: "Error",
    timestamp: "2026-09-17T00:00:00.000Z",
    path: "/requests/request-secret",
  });
}

describe("RequestDetailPage error states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [403, "No tienes acceso a esta solicitud."],
    [404, "La solicitud no existe o ya no está disponible."],
  ])("renders a safe %s state without retrying or exposing backend details", (status, message) => {
    mocks.useRequest.mockReturnValue({
      request: null,
      isInitialLoading: false,
      isRefreshing: false,
      error: apiError(status),
      refetch: mocks.refetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("sensitive backend detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /volver a solicitudes/i }));
    expect(mocks.push).toHaveBeenCalledWith("/requests");
    expect(window.location.pathname).not.toBe("/login");
  });

  it("retains generic retry behavior for non-terminal errors", () => {
    mocks.useRequest.mockReturnValue({
      request: null,
      isInitialLoading: false,
      isRefreshing: false,
      error: new Error("No se pudo cargar"),
      refetch: mocks.refetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);
    expect(screen.getByText("No se pudo cargar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
