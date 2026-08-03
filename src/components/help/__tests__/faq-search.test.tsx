import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FaqSearch } from "@/components/help/faq-search";
import { FAQ_ITEMS } from "@/lib/help-content";

describe("FaqSearch", () => {
  it("renders the complete catalog and an accessible search input", () => {
    render(<FaqSearch items={FAQ_ITEMS} />);

    expect(screen.getByRole("searchbox", { name: /buscar en preguntas frecuentes/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /¿/ })).toHaveLength(18);
  });

  it("filters locally by question, answer and keyword", async () => {
    const user = userEvent.setup();
    render(<FaqSearch items={FAQ_ITEMS} />);
    const searchbox = screen.getByRole("searchbox", { name: /buscar en preguntas frecuentes/i });

    await user.type(searchbox, "SSO institucional");
    expect(
      screen.getByRole("button", { name: "¿Cómo ingreso desde la plataforma de Enseña Perú?" }),
    ).toBeInTheDocument();

    await user.clear(searchbox);
    await user.type(searchbox, "bandeja de entrada");
    expect(screen.getByRole("button", { name: /qué correos envía sig-epe/i })).toBeInTheDocument();
  });

  it("shows an empty status and clears the query", async () => {
    const user = userEvent.setup();
    render(<FaqSearch items={FAQ_ITEMS} />);

    await user.type(
      screen.getByRole("searchbox", { name: /buscar en preguntas frecuentes/i }),
      "sin-coincidencias-987654",
    );

    expect(screen.queryByRole("button", { name: /¿/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/no encontramos preguntas/i);

    await user.click(screen.getByRole("button", { name: /limpiar búsqueda/i }));
    expect(screen.getAllByRole("button", { name: /¿/ })).toHaveLength(18);
    expect(screen.getByRole("searchbox", { name: /buscar en preguntas frecuentes/i })).toHaveValue("");
  });

  it("uses independent native buttons with stable ARIA relationships", async () => {
    const user = userEvent.setup();
    render(<FaqSearch items={FAQ_ITEMS.slice(0, 2)} />);
    const first = screen.getByRole("button", { name: FAQ_ITEMS[0].question });
    const second = screen.getByRole("button", { name: FAQ_ITEMS[1].question });
    const firstPanelId = first.getAttribute("aria-controls");
    const secondPanelId = second.getAttribute("aria-controls");

    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(firstPanelId).toBe("faq-panel-sso-institucional");
    expect(secondPanelId).toBe("faq-panel-sso-no-disponible");
    expect(document.getElementById(firstPanelId!)).toHaveAttribute("aria-labelledby", first.id);
    expect(document.getElementById(firstPanelId!)).toHaveAttribute("role", "region");

    await user.click(first);
    await user.keyboard("{Tab}{Enter}");

    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(firstPanelId!)).not.toHaveAttribute("hidden");
    expect(document.getElementById(secondPanelId!)).not.toHaveAttribute("hidden");
  });

  it("toggles a focused question with Space without affecting the search input", async () => {
    const user = userEvent.setup();
    render(<FaqSearch items={FAQ_ITEMS.slice(0, 1)} />);
    const question = screen.getByRole("button", { name: FAQ_ITEMS[0].question });

    question.focus();
    await user.keyboard(" ");

    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(
      within(document.getElementById("faq-panel-sso-institucional")!).getByText(/acceso automático desde Enseña Perú/i),
    ).toBeVisible();
  });
});
