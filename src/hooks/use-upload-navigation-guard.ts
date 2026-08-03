import { useEffect, useRef, useState } from "react";

interface UseUploadNavigationGuardOptions {
  active: boolean;
  message: string;
  managed?: boolean;
}

interface RequestGuardedNavigationOptions {
  internal?: boolean;
}

export interface UploadNavigationGuardController {
  isConfirmationOpen: boolean;
  requestNavigation: (navigation: () => void, options?: RequestGuardedNavigationOptions) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
}

function shouldIgnoreAnchorClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (anchor.hasAttribute("download")) return true;
  const target = anchor.getAttribute("target");
  return Boolean(target && target.toLowerCase() !== "_self");
}

function isSameDocumentHashNavigation(url: URL): boolean {
  return url.origin === window.location.origin
    && url.pathname === window.location.pathname
    && url.search === window.location.search
    && Boolean(url.hash);
}

export function useUploadNavigationGuard({
  active,
  message,
  managed = false,
}: UseUploadNavigationGuardOptions): UploadNavigationGuardController {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  function cancelNavigation(): void {
    pendingNavigationRef.current = null;
    setIsConfirmationOpen(false);
  }

  function confirmNavigation(): void {
    const navigation = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setIsConfirmationOpen(false);
    navigation?.();
  }

  function requestNavigation(navigation: () => void, options?: RequestGuardedNavigationOptions): void {
    if (!active || options?.internal) {
      navigation();
      return;
    }
    if (!managed) {
      if (window.confirm(`${message}\n\n¿Deseas salir de todos modos?`)) navigation();
      return;
    }
    pendingNavigationRef.current = navigation;
    setIsConfirmationOpen(true);
  }

  useEffect(() => {
    if (!active) {
      pendingNavigationRef.current = null;
      setIsConfirmationOpen(false);
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = message;
    }

    function handleDocumentClick(event: MouseEvent): void {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || shouldIgnoreAnchorClick(event, anchor)) return;
      const url = new URL(anchor.href, window.location.href);
      if (isSameDocumentHashNavigation(url)) return;

      if (!managed) {
        const confirmed = window.confirm(`${message}\n\n¿Deseas salir de todos modos?`);
        if (!confirmed) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pendingNavigationRef.current = () => window.location.assign(url.href);
      setIsConfirmationOpen(true);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [active, managed, message]);

  return {
    isConfirmationOpen,
    requestNavigation,
    confirmNavigation,
    cancelNavigation,
  };
}
