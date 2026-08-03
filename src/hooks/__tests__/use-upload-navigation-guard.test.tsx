import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";

describe("useUploadNavigationGuard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("retiene navegación programática hasta confirmar y permite pasos internos sin aviso", () => {
    const navigate = vi.fn();
    const internalNavigate = vi.fn();
    const { result } = renderHook(() => useUploadNavigationGuard({
      active: true,
      managed: true,
      message: "El archivo activo puede terminar en el servidor aunque salgas.",
    }));

    act(() => result.current.requestNavigation(navigate));
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.isConfirmationOpen).toBe(true);

    act(() => result.current.cancelNavigation());
    expect(result.current.isConfirmationOpen).toBe(false);

    act(() => result.current.requestNavigation(navigate));
    act(() => result.current.confirmNavigation());
    expect(navigate).toHaveBeenCalledOnce();

    act(() => result.current.requestNavigation(internalNavigate, { internal: true }));
    expect(internalNavigate).toHaveBeenCalledOnce();
    expect(result.current.isConfirmationOpen).toBe(false);
  });

  it("protege beforeunload y anchors de salida, pero no enlaces target blank ni hashes internos", () => {
    const { result } = renderHook(() => useUploadNavigationGuard({
      active: true,
      managed: true,
      message: "Carga pendiente",
    }));
    const unloadEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);

    const external = document.createElement("a");
    external.href = "/requests";
    document.body.append(external);
    const externalClick = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => external.dispatchEvent(externalClick));
    expect(externalClick.defaultPrevented).toBe(true);
    expect(result.current.isConfirmationOpen).toBe(true);
    act(() => result.current.cancelNavigation());

    const blank = document.createElement("a");
    blank.href = "/requests";
    blank.target = "_blank";
    document.body.append(blank);
    const blankClick = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    blank.dispatchEvent(blankClick);
    expect(blankClick.defaultPrevented).toBe(false);

    const hash = document.createElement("a");
    hash.href = `${window.location.pathname}${window.location.search}#documents`;
    document.body.append(hash);
    const hashClick = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    hash.dispatchEvent(hashClick);
    expect(hashClick.defaultPrevented).toBe(false);
  });
});
