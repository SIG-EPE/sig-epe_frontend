import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "@/components/ui/progress-bar";

describe("ProgressBar", () => {
  it("expone progreso determinado accesible por archivos", () => {
    render(<ProgressBar value={3} max={20} label="3 de 20 archivos procesados" />);

    const progressbar = screen.getByRole("progressbar", { name: "3 de 20 archivos procesados" });
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "20");
    expect(progressbar).toHaveAttribute("aria-valuenow", "3");
    expect(progressbar.firstElementChild).toHaveStyle({ width: "15%" });
  });
});
