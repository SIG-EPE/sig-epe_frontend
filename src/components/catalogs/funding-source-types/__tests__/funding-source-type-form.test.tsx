import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FundingSourceTypeForm } from "../funding-source-type-form";
import { useCreateFundingSourceType, useUpdateFundingSourceType } from "@/hooks/use-catalogs";

vi.mock("@/hooks/use-catalogs", () => ({
  useCreateFundingSourceType: vi.fn(),
  useUpdateFundingSourceType: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const useCreateFundingSourceTypeMock = vi.mocked(useCreateFundingSourceType);
const useUpdateFundingSourceTypeMock = vi.mocked(useUpdateFundingSourceType);

describe("FundingSourceTypeForm", () => {
  it("valida nombre requerido antes de guardar", async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    useCreateFundingSourceTypeMock.mockReturnValue({ create, isLoading: false });
    useUpdateFundingSourceTypeMock.mockReturnValue({ update: vi.fn(), isLoading: false });

    render(<FundingSourceTypeForm onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(screen.getByText("El nombre es requerido")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("envía valores recortados al crear", async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    useCreateFundingSourceTypeMock.mockReturnValue({ create, isLoading: false });
    useUpdateFundingSourceTypeMock.mockReturnValue({ update: vi.fn(), isLoading: false });

    render(<FundingSourceTypeForm onClose={onClose} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Nombre *"), "  Presupuestado  ");
    await user.type(screen.getByLabelText("Descripción (opcional)"), "  Fondos incluidos  ");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(create).toHaveBeenCalledWith({
      name: "Presupuestado",
      description: "Fondos incluidos",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
