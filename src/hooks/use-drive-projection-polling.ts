"use client";

import { useEffect, useRef } from "react";

const DRIVE_PROJECTION_POLL_INTERVAL_MS = 15_000;
const DRIVE_PROJECTION_OBSERVATION_WINDOW_MS = 180_000;

interface UseDriveProjectionPollingOptions {
  hasPendingProjection: boolean;
  refetch: () => Promise<unknown> | unknown;
}

export function useDriveProjectionPolling({
  hasPendingProjection,
  refetch,
}: UseDriveProjectionPollingOptions): void {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!hasPendingProjection) return;

    const observationEndsAt = Date.now() + DRIVE_PROJECTION_OBSERVATION_WINDOW_MS;
    let intervalId: number | null = null;

    function stopPolling(): void {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    }

    function startPolling(): void {
      if (document.hidden || intervalId !== null || Date.now() >= observationEndsAt) {
        return;
      }
      intervalId = window.setInterval(() => {
        if (document.hidden || Date.now() >= observationEndsAt) {
          stopPolling();
          return;
        }
        void refetchRef.current();
      }, DRIVE_PROJECTION_POLL_INTERVAL_MS);
    }

    function handleVisibilityChange(): void {
      if (document.hidden) {
        stopPolling();
        return;
      }
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startPolling();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, [hasPendingProjection]);
}
