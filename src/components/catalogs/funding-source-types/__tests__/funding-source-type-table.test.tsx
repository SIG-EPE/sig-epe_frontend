import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FundingSourceTypeTable } from "../funding-source-type-table";
import { useFundingSourceTypes } from "@/hooks/use-catalogs";

vi.mock("@/hooks/use-catalogs", () => ({
  useFundingSourceTypes: vi.fn(),
}));

const useFundingSourceTypesMock = vi.mocked(useFundingSourceTypes);

describe("FundingSourceTypeTable", () => {
  it("muestra estado activo usando is_active del backend", () => {
    useFundingSourceTypesMock.mockReturnValue({
      data: [
        {
          id: "fst-1",
          name: "Recursos ordinarios",
          description: "Fuente activa",
          is_active: true,
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FundingSourceTypeTable />);

    expect(screen.getByText("Recursos ordinarios")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.queryByText("Inactivo")).not.toBeInTheDocument();
  });
});
