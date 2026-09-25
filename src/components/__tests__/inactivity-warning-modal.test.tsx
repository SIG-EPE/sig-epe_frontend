import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InactivityWarningModal } from "@/components/inactivity-warning-modal";

describe("InactivityWarningModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onContinue from the keep-session action", () => {
    const onContinue = vi.fn();

    render(
      <InactivityWarningModal
        open
        remainingSeconds={600}
        onContinue={onContinue}
        onLogout={vi.fn()}
        onExpire={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /mantener sesion/i }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("shows a live countdown seeded from the warning window", () => {
    render(
      <InactivityWarningModal
        open
        remainingSeconds={600}
        onContinue={vi.fn()}
        onLogout={vi.fn()}
        onExpire={vi.fn()}
      />,
    );

    expect(screen.getByText("10:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("9:59")).toBeInTheDocument();
  });

  it("separates automatic expiry from the explicit logout action", () => {
    const onExpire = vi.fn();
    const onLogout = vi.fn();
    render(
      <InactivityWarningModal
        open
        remainingSeconds={1}
        onContinue={vi.fn()}
        onLogout={onLogout}
        onExpire={onExpire}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cerrar sesion/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
