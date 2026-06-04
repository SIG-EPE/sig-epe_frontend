import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, vi } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

describe("Dialog", () => {
  it("renderiza el overlay en body cubriendo el viewport dinámico", async () => {
    render(
      <div data-testid="contenedor-local">
        <Dialog open onOpenChange={() => undefined}>
          <DialogContent>
            <DialogTitle>Modal de prueba</DialogTitle>
          </DialogContent>
        </Dialog>
      </div>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Modal de prueba" });
    const portalRoot = dialog.parentElement;
    const backdrop = portalRoot?.firstElementChild;

    assert.isNotNull(portalRoot);
    assert.equal(portalRoot.parentElement, document.body);
    assert.isTrue(portalRoot.classList.contains("fixed"));
    assert.isTrue(portalRoot.classList.contains("inset-0"));
    assert.isTrue(portalRoot.classList.contains("min-h-dvh"));
    assert.isTrue(portalRoot.classList.contains("w-screen"));
    assert.isNotNull(backdrop);
    if (!backdrop) throw new Error("Backdrop no renderizado");
    assert.isTrue(backdrop.classList.contains("fixed"));
    assert.isTrue(backdrop.classList.contains("inset-0"));
    assert.isTrue(backdrop.classList.contains("min-h-dvh"));
    assert.isTrue(backdrop.classList.contains("w-screen"));
    assert.isTrue(backdrop.classList.contains("bg-black/50"));
  });

  it("mantiene cierre por Escape y backdrop", async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();

    render(
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogTitle>Modal cerrable</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Modal cerrable" });
    await user.keyboard("{Escape}");
    assert.deepEqual(handleOpenChange.mock.calls.at(-1), [false]);

    handleOpenChange.mockClear();
    const backdrop = dialog.parentElement?.firstElementChild;
    assert.isNotNull(backdrop);
    await user.click(backdrop as Element);

    await waitFor(() => {
      assert.deepEqual(handleOpenChange.mock.calls.at(-1), [false]);
    });
  });
});
