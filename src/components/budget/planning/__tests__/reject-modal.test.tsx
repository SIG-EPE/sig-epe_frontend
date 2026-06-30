import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RejectModal } from "@/components/budget/planning/reject-modal";

const mocks = vi.hoisted(() => ({
  reject: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/hooks/use-budget", () => ({
  getPlanningLineMutationErrorMessage: (error: unknown) => (error instanceof Error ? error.message : null),
  useRejectPlanningLine: () => ({ reject: mocks.reject, isLoading: false }),
}));

describe("RejectModal", () => {
  beforeEach(() => {
    mocks.reject.mockReset();
    mocks.refresh.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rechaza usando el hook autenticado y no fetch directo", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    render(<RejectModal lineId="line-1" open onOpenChange={onOpenChange} onSuccess={onSuccess} />);

    await user.type(screen.getByPlaceholderText(/Motivo del rechazo/), "Presupuesto no sustentado");
    await user.click(screen.getByRole("button", { name: "Rechazar" }));

    await waitFor(() => {
      expect(mocks.reject).toHaveBeenCalledWith({ rejection_reason: "Presupuesto no sustentado" });
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Linea rechazada");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("muestra el mensaje del backend cuando falla el rechazo", async () => {
    const user = userEvent.setup();
    mocks.reject.mockRejectedValue(new Error("No tienes permisos para rechazar esta línea"));

    render(<RejectModal lineId="line-1" open onOpenChange={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Motivo del rechazo/), "Motivo suficientemente largo");
    await user.click(screen.getByRole("button", { name: "Rechazar" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("No tienes permisos para rechazar esta línea");
    });
  });
});
