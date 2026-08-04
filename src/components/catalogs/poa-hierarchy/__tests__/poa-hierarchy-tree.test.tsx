import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PoaHierarchyTree } from "../poa-hierarchy-tree";
import type { PoaHierarchyData } from "@/types/catalogs";

const hierarchy: PoaHierarchyData = {
  programs: [{ id: "program-1", code: "P-01", name: "Programa Lectura", is_active: true }],
  components: [{
    id: "component-1", name: "Componente Aprendizaje", programId: "program-1",
    sequenceNumber: "1", fullCode: "CMP-000001", isActive: true, publishedAt: null,
    dependencies: { activeChildren: 1, total: 1 },
  }],
  actions: [{
    id: "action-1", name: "Acción acompañamiento", componentId: "component-1",
    sequenceNumber: "1", fullCode: "CMP-000001-ACT-000001", isActive: true, publishedAt: null,
    dependencies: { activeChildren: 1, planningLines: 2, total: 3 },
  }],
  resources: [{
    id: "resource-1", name: "Material pedagógico", actionId: "action-1",
    sequenceNumber: "1", fullCode: "CMP-000001-ACT-000001-REC-00000001", isActive: false,
    publishedAt: "2026-07-31T00:00:00.000Z", dependencies: { planningLines: 2, total: 2 },
  }],
};

describe("PoaHierarchyTree", () => {
  it("muestra Programa→Componente→Acción→Recurso con código, estado y dependencias", async () => {
    const user = userEvent.setup();
    render(<PoaHierarchyTree data={hierarchy} canManage onAction={vi.fn()} />);

    expect(screen.getByText("Programa Lectura")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /expandir programa lectura/i }));
    expect(screen.getByText("CMP-000001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /expandir componente aprendizaje/i }));
    expect(screen.getByText("CMP-000001-ACT-000001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /expandir acción acompañamiento/i }));
    expect(screen.getByText("CMP-000001-ACT-000001-REC-00000001")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByText("2 dependencias")).toBeInTheDocument();
  });

  it("permite consulta sin exponer acciones de gestión", () => {
    render(<PoaHierarchyTree data={hierarchy} canManage={false} onAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /crear componente/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /renombrar/i })).not.toBeInTheDocument();
  });

  it("usa estructura responsive sin tabla horizontal", () => {
    const { container } = render(
      <PoaHierarchyTree data={hierarchy} canManage onAction={vi.fn()} />,
    );
    expect(container.querySelector("[role='tree']")).toHaveClass("min-w-0");
    expect(container.querySelector("table")).not.toBeInTheDocument();
  });
});
