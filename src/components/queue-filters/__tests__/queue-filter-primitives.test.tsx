import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QueueFilterChips } from "@/components/queue-filters/queue-filter-chips";
import { QueueFilterReset } from "@/components/queue-filters/queue-filter-reset";

describe("queue filter UI primitives", () => {
  it("renderiza chips removibles y clear sin imponer labels ni patches de ruta", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onClear = vi.fn();

    render(
      <QueueFilterChips
        chips={[{ key: "search", label: "Búsqueda: viático", onRemove }]}
        onClear={onClear}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Quitar filtro Búsqueda: viático" }));
    await user.click(screen.getByRole("button", { name: "Limpiar todos los filtros" }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("expone un reset accionable con copy definido por la ruta", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <QueueFilterReset
        message="No se pudieron aplicar los filtros de la URL. Restablécelos y vuelve a intentarlo."
        onReset={onReset}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron aplicar los filtros de la URL");
    await user.click(screen.getByRole("button", { name: "Restablecer filtros" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
