import { useEffect } from "react";

interface UseUploadNavigationGuardOptions {
  active: boolean;
  message: string;
}

export function useUploadNavigationGuard({ active, message }: UseUploadNavigationGuardOptions): void {
  useEffect(() => {
    if (!active) return;

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = message;
    }

    function handleDocumentClick(event: MouseEvent): void {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor) return;

      const confirmed = window.confirm(`${message}\n\n¿Deseas salir de todos modos?`);
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [active, message]);
}
