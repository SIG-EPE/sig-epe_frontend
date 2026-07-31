import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundingSourceDistribution } from "@/components/budget/detail/funding-source-distribution";
import { ApiRequestError } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  refetchFundingSources: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

vi.mock("@/hooks/use-budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-budget")>();
  return {
    ...actual,
    useLineFundingSources: () => ({
      data: [],
      isLoading: false,
      refetch: mocks.refetchFundingSources,
    }),
    useAddLineFundingSource: () => ({ add: mocks.add, isLoading: false }),
    useRemoveLineFundingSource: () => ({ remove: mocks.remove, isLoading: false }),
  };
});

vi.mock("@/hooks/use-catalogs", () => ({
  useCatalogFundingSources: () => ({
    data: [{ id: "fs-1", code: "FS1", name: "Fuente uno" }],
    isLoading: false,
  }),
}));

describe("FundingSourceDistribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cierra, descarta la selección y refresca cuando pierde una carrera", async () => {
    const user = userEvent.setup();
    const onConflictRefetch = vi.fn();
    mocks.add.mockRejectedValue(
      new ApiRequestError(409, {
        statusCode: 409,
        code: "PLANNING_LINE_STATE_CONFLICT",
        message: "La línea ya no está en borrador.",
        error: "Conflict",
        timestamp: "2026-07-26T00:00:00.000Z",
        path: "/budget/planning-lines/line-1/funding-sources",
      }),
    );

    render(
      <FundingSourceDistribution
        lineId="line-1"
        totalCost={100}
        fiscalYearId="fy-1"
        status="DRAFT"
        onConflictRefetch={onConflictRefetch}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Configurar/ }));
    await user.click(screen.getByRole("checkbox", { name: /Fuente uno/ }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "La línea ya no está en borrador.",
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mocks.refetchFundingSources).toHaveBeenCalledTimes(1);
      expect(onConflictRefetch).toHaveBeenCalledTimes(1);
    });
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
