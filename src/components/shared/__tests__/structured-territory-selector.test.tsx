import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredTerritorySelector } from "../structured-territory-selector";
import type { TerritoryAxisDraft } from "@/lib/poa-territory-selection";

const useTerritories = vi.fn();
vi.mock("@/hooks/use-budget", () => ({ useTerritories: () => useTerritories() }));

const territories = [
  { id: "r1", code: "R1", name: "Amazonas", level: "REGION", parent_id: null, is_active: true },
  { id: "r2", code: "R2", name: "Ayacucho", level: "REGION", parent_id: null, is_active: true },
  { id: "p1", code: "P1", name: "Chachapoyas", level: "PROVINCIA", parent_id: "r1", is_active: true },
  { id: "p2", code: "P2", name: "Huamanga", level: "PROVINCIA", parent_id: "r2", is_active: true },
  { id: "d1", code: "D1", name: "Imaza", level: "DISTRITO", parent_id: "p1", is_active: true },
];

describe("StructuredTerritorySelector", () => {
  beforeEach(() => useTerritories.mockReturnValue({ data: territories, isLoading: false, error: null }));

  it("offers one official or aggregate target on every accessible axis", () => {
    render(<StructuredTerritorySelector value={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Región")).toHaveTextContent("Multiregional");
    expect(screen.getByLabelText("Provincia")).toHaveTextContent("Multiprovincial");
    expect(screen.getByLabelText("Distrito")).toHaveTextContent("Multidistrital");
  });

  it("supports mixed aggregate/official cases without synthetic reparenting", () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<TerritoryAxisDraft>({});
      return (
        <StructuredTerritorySelector
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Región"), {
      target: { value: "aggregate:75f8f352-9d76-4c32-8b01-000000000001" },
    });
    expect(screen.getByLabelText("Provincia")).toHaveTextContent("Chachapoyas");
    expect(screen.getByLabelText("Provincia")).toHaveTextContent("Huamanga");
    fireEvent.change(screen.getByLabelText("Provincia"), { target: { value: "territory:p1" } });
    expect(screen.getByLabelText("Distrito")).toHaveTextContent("Imaza");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      REGION: expect.objectContaining({ aggregate_option_id: expect.any(String) }),
      PROVINCIA: { axis: "PROVINCIA", territory_id: "p1" },
    }));
  });

  it("announces loading errors", () => {
    useTerritories.mockReturnValue({ data: null, isLoading: false, error: new Error("sin red") });
    render(<StructuredTerritorySelector value={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los territorios");
  });
});
