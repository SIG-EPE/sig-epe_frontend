import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  Legend: () => null,
  ResponsiveContainer: ({
    children,
    initialDimension,
    minHeight,
    minWidth,
  }: {
    children?: ReactNode;
    initialDimension?: { width: number; height: number };
    minHeight?: number | string;
    minWidth?: number | string;
  }) => (
    <div
      data-testid="responsive-container"
      data-initial-width={initialDimension?.width}
      data-initial-height={initialDimension?.height}
      data-min-width={minWidth}
      data-min-height={minHeight}
    >
      {children}
    </div>
  ),
  Tooltip: () => null,
}));

import { ChartContainer } from "../chart";

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

function mockChartBounds(width: number, height: number) {
  HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
}

describe("ChartContainer", () => {
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("does not mount Recharts while the measured container has invalid dimensions", () => {
    mockChartBounds(-1, -1);

    render(
      <ChartContainer height={320}>
        <div>chart</div>
      </ChartContainer>,
    );

    expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument();
  });

  it("passes measured initial dimensions to Recharts when the container is valid", async () => {
    mockChartBounds(640, 320);

    render(
      <ChartContainer height={320}>
        <div>chart</div>
      </ChartContainer>,
    );

    await waitFor(() => expect(screen.getByTestId("responsive-container")).toBeInTheDocument());
    expect(screen.getByTestId("responsive-container")).toHaveAttribute("data-initial-width", "640");
    expect(screen.getByTestId("responsive-container")).toHaveAttribute("data-initial-height", "320");
    expect(screen.getByTestId("responsive-container")).toHaveAttribute("data-min-width", "1");
    expect(screen.getByTestId("responsive-container")).toHaveAttribute("data-min-height", "1");
  });
});
