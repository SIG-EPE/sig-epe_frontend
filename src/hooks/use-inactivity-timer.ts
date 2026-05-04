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
  const onWarningRef = useRef(onWarning);
  const onTimeoutRef = useRef(onTimeout);

  onWarningRef.current = onWarning;
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    timerRef.current = new InactivityTimer(
      () => onWarningRef.current(),
      () => onTimeoutRef.current(),
    );
    timerRef.current.start();

    return () => {
      timerRef.current?.stop();
    };
  }, []);

  return {
    reset: () => timerRef.current?.reset(),
  };
}
