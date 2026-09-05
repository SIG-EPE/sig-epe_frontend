import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDriveProjectionPolling } from "@/hooks/use-drive-projection-polling";

describe("useDriveProjectionPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls every 15 seconds only during the bounded pending observation window", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(
      ({ pending }) =>
        useDriveProjectionPolling({
          hasPendingProjection: pending,
          refetch,
        }),
      { initialProps: { pending: true } },
    );

    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(refetch).toHaveBeenCalledTimes(1);

    rerender({ pending: false });
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refetch).toHaveBeenCalledTimes(1);

    rerender({ pending: true });
    await act(async () => vi.advanceTimersByTimeAsync(180_000));
    expect(refetch).toHaveBeenCalledTimes(12);

    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refetch).toHaveBeenCalledTimes(12);
  });

  it("pauses while the tab is hidden and resumes while the window remains active", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useDriveProjectionPolling({
        hasPendingProjection: true,
        refetch,
      }),
    );

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refetch).not.toHaveBeenCalled();

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
