import { describe, expect, it } from "vitest";

import { formatBusinessName, getCatalogOptionLabel, getFiscalYearSelectLabel, getFiscalYearStatusLabel, getOrgUnitFilterLabel } from "@/lib/ui-labels";

describe("ui-labels", () => {
  it("traduce estados de año fiscal y no expone enums técnicos", () => {
    expect(getFiscalYearStatusLabel("ACTIVE")).toBe("Activo");
    expect(getFiscalYearStatusLabel("CLOSED")).toBe("Cerrado");
    expect(getFiscalYearSelectLabel({ year: 2026, status: "ACTIVE" })).toBe("2026 — Activo");
    expect(getFiscalYearSelectLabel({ year: 2026, status: "ACTIVE" }, { includeStatus: false })).toBe("2026");
  });

  it("muestra unidades orgánicas limpias sin códigos internos", () => {
    expect(getOrgUnitFilterLabel({ name: "DIRECCIÓN EJECUTIVA" })).toBe("Dirección Ejecutiva");
    expect(getOrgUnitFilterLabel({ name: "Unidad de Finanzas" })).toBe("Unidad de Finanzas");
  });

  it("permite etiquetas administrativas con código cuando es identificador de negocio", () => {
    expect(getCatalogOptionLabel({ code: "PROG-01", name: "PROGRAMA AMAZÓNICO" }, { includeCode: true })).toBe("PROG-01 — Programa Amazónico");
    expect(getCatalogOptionLabel({ code: "DIR_EJECUTIVA", name: "DIRECCIÓN EJECUTIVA" })).toBe("Dirección Ejecutiva");
  });

  it("convierte nombres en mayúsculas sin romper siglas conocidas", () => {
    expect(formatBusinessName("PLAN POA SIG EPE")).toBe("Plan POA SIG EPE");
  });
});
