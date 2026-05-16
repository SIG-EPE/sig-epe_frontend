import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStart, mockStop, mockReset, mockInactivityTimer } = vi.hoisted(
  () => ({
    mockStart: vi.fn(),
    mockStop: vi.fn(),
    mockReset: vi.fn(),
    mockInactivityTimer: vi.fn(class {
      start = mockStart;
      stop = mockStop;
      reset = mockReset;
    }),
  }),
);

vi.mock("@/lib/auth/inactivity-timer", () => ({
  InactivityTimer: mockInactivityTimer,
}));

import { useInactivityTimer } from "@/hooks/use-inactivity-timer";

function HookHarness({
  warningLabel,
  timeoutLabel,
}: {
  warningLabel: string;
  timeoutLabel: string;
}) {
  useInactivityTimer({
    onWarning: () => warningLabel,
    onTimeout: () => timeoutLabel,
  });

  return null;
}

describe("useInactivityTimer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a single timer instance across rerenders", () => {
    const { rerender, unmount } = render(
      <HookHarness warningLabel="first" timeoutLabel="first" />,
    );

    rerender(<HookHarness warningLabel="second" timeoutLabel="second" />);

    expect(mockInactivityTimer).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);

    unmount();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});
