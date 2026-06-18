"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const NAVIGATION_FEEDBACK_CONFIG = {
  SLOW_THRESHOLD_MS: 800,
  MAX_DURATION_MS: 10_000,
} as const;

interface NavigationFeedbackContextValue {
  pendingHref: string | null;
  isPending: boolean;
  startNavigation: (href: string) => void;
  clearNavigation: () => void;
}

const DEFAULT_NAVIGATION_FEEDBACK_CONTEXT: NavigationFeedbackContextValue = {
  pendingHref: null,
  isPending: false,
  startNavigation: () => undefined,
  clearNavigation: () => undefined,
};

const NavigationFeedbackContext = createContext<NavigationFeedbackContextValue>(
  DEFAULT_NAVIGATION_FEEDBACK_CONTEXT,
);

function normalizeHref(href: string) {
  if (!href) return "/";

  try {
    const url = new URL(href, "http://sig-epe.local");
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

function buildCurrentHref(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function isNavigationHrefCurrent(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
) {
  return normalizeHref(href) === buildCurrentHref(pathname, searchParams);
}

export function NavigationFeedbackProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const previousLocationRef = useRef(buildCurrentHref(pathname, searchParams));

  const clearNavigation = () => {
    setPendingHref(null);
    setIsSlow(false);
  };

  const startNavigation = (href: string) => {
    const normalizedHref = normalizeHref(href);

    if (isNavigationHrefCurrent(normalizedHref, pathname, searchParams)) {
      clearNavigation();
      return;
    }

    setPendingHref(normalizedHref);
    setIsSlow(false);
  };

  useEffect(() => {
    if (!pendingHref) return;

    const currentHref = buildCurrentHref(pathname, searchParams);
    if (currentHref !== previousLocationRef.current || currentHref === pendingHref) {
      previousLocationRef.current = currentHref;
      clearNavigation();
    }
  }, [pathname, pendingHref, searchParams]);

  useEffect(() => {
    if (!pendingHref) return;

    const slowTimer = window.setTimeout(() => {
      setIsSlow(true);
    }, NAVIGATION_FEEDBACK_CONFIG.SLOW_THRESHOLD_MS);
    const maxTimer = window.setTimeout(() => {
      clearNavigation();
    }, NAVIGATION_FEEDBACK_CONFIG.MAX_DURATION_MS);

    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(maxTimer);
    };
  }, [pendingHref]);

  return (
    <NavigationFeedbackContext.Provider
      value={{
        pendingHref,
        isPending: pendingHref !== null,
        startNavigation,
        clearNavigation,
      }}
    >
      {pendingHref ? (
        <div
          className="fixed inset-x-0 top-0 z-50"
          aria-busy="true"
          aria-live="polite"
          data-testid="navigation-feedback"
        >
          <div
            role="progressbar"
            aria-label="Cargando navegación"
            className="h-1 w-full overflow-hidden bg-primary/10"
          >
            <div className="h-full w-1/2 animate-pulse rounded-r-full bg-primary" />
          </div>
          <p
            className={cn(
              "sr-only",
              isSlow && "not-sr-only mx-auto mt-2 w-fit rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm",
            )}
          >
            La navegación sigue cargando...
          </p>
        </div>
      ) : null}
      {children}
    </NavigationFeedbackContext.Provider>
  );
}

export function useNavigationFeedback() {
  return useContext(NavigationFeedbackContext);
}
