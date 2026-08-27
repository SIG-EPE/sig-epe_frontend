import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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

  it("moves focus inside, traps Tab, and restores focus to the opener", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Abrir modal</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Modal con foco</DialogTitle>
              <input aria-label="Primero" data-autofocus />
              <button type="button">Último</button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir modal" });
    await user.click(opener);
    const first = await screen.findByLabelText("Primero");
    const last = screen.getByRole("button", { name: "Cerrar" });
    await waitFor(() => assert.equal(document.activeElement, first));
    last.focus();
    await user.tab();
    assert.equal(document.activeElement, first);
    await user.keyboard("{Escape}");
    await waitFor(() => assert.equal(document.activeElement, opener));
  });

  it("blocks Escape and backdrop while closeDisabled is active", async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent closeDisabled>
          <DialogTitle>Carga protegida</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Carga protegida" });
    await user.keyboard("{Escape}");
    await user.click(dialog.parentElement?.firstElementChild as Element);
    assert.equal(handleOpenChange.mock.calls.length, 0);
  });
});
