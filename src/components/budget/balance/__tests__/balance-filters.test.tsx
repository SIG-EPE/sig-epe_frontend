import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BalanceFilters } from "@/components/budget/balance/balance-filters";

vi.mock("@/hooks/use-budget", () => ({
  useFiscalYears: () => ({
    data: [{ id: "fy-2026", year: 2026, status: "ACTIVE" }],
    isLoading: false,
  }),
  useOrganizationalUnits: () => ({
    data: [{ id: "ou-dir", code: "DIR_EJECUTIVA", name: "DIRECCIÓN EJECUTIVA" }],
    isLoading: false,
  }),
}));

vi.mock("@/components/shared/territory-selector", () => ({
  TerritorySelector: () => <div data-testid="territory-selector" />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("BalanceFilters", () => {
  it("muestra labels limpios en filtros de año fiscal y unidad orgánica", () => {
    render(<BalanceFilters />);

    expect(screen.getByText("2026 — Activo")).toBeInTheDocument();
    expect(screen.queryByText(/ACTIVE/)).not.toBeInTheDocument();
    expect(screen.getByText("Dirección Ejecutiva")).toBeInTheDocument();
    expect(screen.queryByText(/DIR_EJECUTIVA/)).not.toBeInTheDocument();
  });
});
