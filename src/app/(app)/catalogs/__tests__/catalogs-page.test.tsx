import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CatalogsPage from "../page";

describe("CatalogsPage", () => {
  it("expone la tarjeta Jerarquía POA", () => {
    render(<CatalogsPage />);
    expect(screen.getByRole("link", { name: /jerarquía poa/i })).toHaveAttribute(
      "href",
      "/catalogs/poa-hierarchy",
    );
  });
});
