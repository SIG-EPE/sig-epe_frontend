import { describe, expect, it } from "vitest";

import { filterPoaHierarchy } from "../poa-hierarchy-filter";
import type { PoaHierarchyData } from "@/types/catalogs";

const data: PoaHierarchyData = {
  programs: [{ id: "p1", code: "P1", name: "Programa Uno", is_active: true }],
  components: [{ id: "c1", name: "Lectura inicial", programId: "p1", sequenceNumber: "1", fullCode: "CMP-000001", isActive: true, publishedAt: null }],
  actions: [{ id: "a1", name: "Acompañamiento", componentId: "c1", sequenceNumber: "1", fullCode: "CMP-000001-ACT-000001", isActive: true, publishedAt: null }],
  resources: [{ id: "r1", name: "Cuaderno docente", actionId: "a1", sequenceNumber: "1", fullCode: "CMP-000001-ACT-000001-REC-00000001", isActive: false, publishedAt: null }],
};

describe("filterPoaHierarchy", () => {
  it("busca código exacto y conserva sus ancestros", () => {
    const result = filterPoaHierarchy(data, { search: "CMP-000001-ACT-000001", status: "all", programId: "all" });
    expect(result.programs).toHaveLength(1);
    expect(result.components).toHaveLength(1);
    expect(result.actions.map((node) => node.id)).toEqual(["a1"]);
    expect(result.resources).toHaveLength(0);
  });

  it("busca nombre sin distinguir mayúsculas ni tildes y filtra inactivos", () => {
    const result = filterPoaHierarchy(data, { search: "cuaderno", status: "inactive", programId: "all" });
    expect(result.resources.map((node) => node.id)).toEqual(["r1"]);
    expect(result.actions.map((node) => node.id)).toEqual(["a1"]);
  });

  it("conserva ancestros activos al mostrar todos los nodos inactivos", () => {
    const result = filterPoaHierarchy(data, { search: "", status: "inactive", programId: "all" });
    expect(result.programs.map((node) => node.id)).toEqual(["p1"]);
    expect(result.components.map((node) => node.id)).toEqual(["c1"]);
    expect(result.actions.map((node) => node.id)).toEqual(["a1"]);
    expect(result.resources.map((node) => node.id)).toEqual(["r1"]);
  });
});
