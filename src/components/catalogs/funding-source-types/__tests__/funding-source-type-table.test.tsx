import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FundingSourceTypeTable } from "../funding-source-type-table";
import {
  useCatalogFundingSourceTypes,
  useDeactivateFundingSourceType,
  useReactivateFundingSourceType,
} from "@/hooks/use-catalogs";

vi.mock("@/hooks/use-catalogs", () => ({
  useCatalogFundingSourceTypes: vi.fn(),
  useDeactivateFundingSourceType: vi.fn(),
  useReactivateFundingSourceType: vi.fn(),
  useCreateFundingSourceType: vi.fn(() => ({ create: vi.fn(), isLoading: false })),
  useUpdateFundingSourceType: vi.fn(() => ({ update: vi.fn(), isLoading: false })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const useCatalogFundingSourceTypesMock = vi.mocked(useCatalogFundingSourceTypes);
const useDeactivateFundingSourceTypeMock = vi.mocked(useDeactivateFundingSourceType);
const useReactivateFundingSourceTypeMock = vi.mocked(useReactivateFundingSourceType);

function mockCatalogData() {
  useCatalogFundingSourceTypesMock.mockReturnValue({
    data: [
      {
        id: "fst-1",
        name: "Recursos ordinarios",
        description: "Fuente activa",
        is_active: true,
      },
      {
        id: "fst-2",
        name: "Back Office",
        description: null,
        is_active: false,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  useDeactivateFundingSourceTypeMock.mockReturnValue({ deactivate: vi.fn().mockResolvedValue(undefined), isLoading: false });
  useReactivateFundingSourceTypeMock.mockReturnValue({ reactivate: vi.fn().mockResolvedValue(undefined), isLoading: false });
}

describe("FundingSourceTypeTable", () => {
  it("muestra estado activo usando is_active del backend", () => {
    mockCatalogData();

    render(<FundingSourceTypeTable />);

    expect(screen.getByText("Recursos ordinarios")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
    expect(screen.queryByTitle("Editar")).not.toBeInTheDocument();
  });

  it("muestra acciones solo cuando el rol puede gestionar", () => {
    mockCatalogData();

    render(<FundingSourceTypeTable canManage onRefetch={vi.fn()} />);

    expect(screen.getByText("Acciones")).toBeInTheDocument();
    expect(screen.getAllByTitle("Editar")).toHaveLength(2);
    expect(screen.getByTitle("Desactivar")).toBeInTheDocument();
    expect(screen.getByTitle("Reactivar")).toBeInTheDocument();
  });

  it("reactiva un tipo inactivo y solicita refrescar", async () => {
    const user = userEvent.setup();
    const reactivate = vi.fn().mockResolvedValue(undefined);
    const onRefetch = vi.fn();
    mockCatalogData();
    useReactivateFundingSourceTypeMock.mockReturnValue({ reactivate, isLoading: false });

    render(<FundingSourceTypeTable canManage onRefetch={onRefetch} />);

    await user.click(screen.getByTitle("Reactivar"));

    expect(reactivate).toHaveBeenCalledTimes(1);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });
});
