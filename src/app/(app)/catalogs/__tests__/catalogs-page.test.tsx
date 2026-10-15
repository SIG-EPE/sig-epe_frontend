import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CatalogsPage from "../page";
import PoaHierarchyCatalogPage from "../poa-hierarchy/page";

vi.mock("@/components/catalogs/poa-hierarchy/poa-hierarchy-page", () => ({
  PoaHierarchyPage: () => <div>Vista de jerarquía POA</div>,
}));

describe("CatalogsPage", () => {
  it("oculta solo la tarjeta Jerarquía POA del índice", () => {
    render(<CatalogsPage />);
    expect(
      screen.queryByRole("link", { name: /jerarquía poa/i }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('a[href="/catalogs/poa-hierarchy"]'),
    ).not.toBeInTheDocument();

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        "/catalogs/organizational-units",
        "/catalogs/budget-programs",
        "/catalogs/funding-source-types",
        "/catalogs/funding-sources",
        "/catalogs/territories",
        "/catalogs/budget-categories",
      ]),
    );
  });

  it("conserva la página de acceso directo a la jerarquía", () => {
    render(<PoaHierarchyCatalogPage />);
    expect(screen.getByText("Vista de jerarquía POA")).toBeInTheDocument();
  });
});
