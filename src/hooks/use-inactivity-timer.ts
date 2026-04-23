"use client";

import { useEffect, useRef } from "react";
import { InactivityTimer } from "@/lib/auth/inactivity-timer";

interface UseInactivityTimerOptions {
  onWarning: () => void;
  onTimeout: () => void;
}

export function useInactivityTimer({
  onWarning,
  onTimeout,
}: UseInactivityTimerOptions) {
  const timerRef = useRef<InactivityTimer | null>(null);

  useEffect(() => {
    timerRef.current = new InactivityTimer(onWarning, onTimeout);
    timerRef.current.start();

    return () => {
      timerRef.current?.stop();
    };
  }, [onWarning, onTimeout]);

  return {
    reset: () => timerRef.current?.reset(),
  };
}