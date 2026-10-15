import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonthlyFxPanel } from "../monthly-fx-panel";
import { monthlyFxApi } from "@/lib/monthly-fx";
import { api } from "@/lib/api-client";

const january = {
  year: 2026,
  month: 1,
  referenceRate: "3.7654",
  closeRate: null,
};

describe("MonthlyFxPanel", () => {
  it("muestra doce meses sin activación y requiere helper de cierre", () => {
    render(
      <MonthlyFxPanel
        year={2026}
        months={[january, { ...january, year: 2025 }]}
        onCreateReference={vi.fn()}
        onRetryReference={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(13);
    expect(within(rows[1]).getByText("3.77")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Provisional")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Sin referencia")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /publicar cierre/i }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/tc de cierre/i)).toBeDisabled();
    expect(
      screen.getByText(
        /referencias editables antes del primer uso financiero/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/activar|política activa|aún no activo/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /activar/i }),
    ).not.toBeInTheDocument();
  });

  it("valida valor decimal positivo antes de enviar", async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    render(
      <MonthlyFxPanel
        year={2026}
        months={[]}
        onCreateReference={create}
        onRetryReference={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("TC referencial (PEN por USD)"), "0");
    await user.click(
      screen.getByRole("button", { name: "Guardar referencia" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/positivo/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("numeric UI rechaza letras y pegado inválido en ambos campos sin guardar", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(
      <MonthlyFxPanel
        year={2026}
        months={[january]}
        onCreateReference={save}
        onRetryReference={save}
        onRefresh={vi.fn()}
        onCloseMonth={save}
      />,
    );
    for (const label of [
      "TC referencial (PEN por USD)",
      "TC de cierre (PEN por USD)",
    ]) {
      const input = screen.getByLabelText(label);
      await user.type(input, "3.70asd");
      expect(input).toHaveValue("3.70");
      await user.paste("abc3.70");
      expect(input).toHaveValue("3.70");
      for (const invalid of [
        "3e2", "3E2", "-3", "+3", " 3", "3 7", "3.,7",
      ]) {
        fireEvent.change(input, { target: { value: invalid } });
        expect(input).toHaveValue("3.70");
      }
      await user.click(
        screen.getByRole("button", {
          name: label.startsWith("TC referencial")
            ? "Editar referencia"
            : "Publicar cierre",
        }),
      );
      expect(save).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await user.clear(input);
      await user.type(input, "asd");
      expect(input).toHaveValue("");
    }
    await user.click(screen.getByRole("button", { name: "Editar referencia" }));
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    expect(save).not.toHaveBeenCalled();
  });

  it("numeric UI conserva coma e intermedios y envía 3.70 con el helper real", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, "post").mockResolvedValue(january);
    try {
      render(
        <MonthlyFxPanel
          year={2026}
          months={[]}
          onCreateReference={monthlyFxApi.createReference}
          onRetryReference={monthlyFxApi.retryReference}
          onRefresh={vi.fn()}
        />,
      );
      const input = screen.getByLabelText("TC referencial (PEN por USD)");
      await user.type(input, "3,");
      expect(input).toHaveValue("3,");
      await user.type(input, "70{Backspace}0");
      expect(input).toHaveValue("3,70");
      await user.click(
        screen.getByRole("button", { name: "Guardar referencia" }),
      );
      expect(post).toHaveBeenCalledWith(
        "/catalogs/monthly-fx/rates",
        { year: 2026, month: 1, referenceRate: "3.70" },
        undefined,
      );
    } finally {
      post.mockRestore();
    }
  });

  it("numeric UI muestra dos decimales pero confirma y envía cierre exacto", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, "post").mockResolvedValue(january);
    try {
      render(
        <MonthlyFxPanel
          year={2026}
          months={[
            {
              ...january,
              referenceRate: "3.700000000000",
              closeRate: "3.700000000000",
            },
            { ...january, month: 2, referenceRate: "3.785" },
          ]}
          onCreateReference={monthlyFxApi.createReference}
          onRetryReference={monthlyFxApi.retryReference}
          onRefresh={vi.fn()}
          onCloseMonth={monthlyFxApi.closeMonth}
        />,
      );
      const rows = screen.getAllByRole("row");
      expect(within(rows[1]).getAllByText("3.70")).toHaveLength(2);
      expect(within(rows[2]).getByText("3.79")).toBeInTheDocument();
      expect(
        screen.getByText(/Referencia existente: 3.70\./),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Cierre inmutable: 3.70\./),
      ).toBeInTheDocument();
      await user.selectOptions(screen.getByRole("combobox"), "2");
      const input = screen.getByLabelText("TC de cierre (PEN por USD)");
      await user.type(input, "3.785");
      expect(input).toHaveValue("3.785");
      await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
      const cancel = screen.getByRole("button", { name: "Cancelar" });
      const confirm = screen.getByRole("button", { name: "Confirmar cierre" });
      expect(cancel).toHaveAttribute("data-variant", "outline");
      expect(cancel).toHaveClass("border", "bg-background", "focus-visible:ring-[3px]");
      expect(confirm).toHaveAttribute("data-variant", "default");
      expect(confirm).toHaveClass("bg-primary", "text-primary-foreground", "disabled:opacity-50");
      expect(
        within(screen.getByRole("dialog")).getByText(
          /TC 3.79 \(3.785\) PEN por USD/,
        ),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Confirmar cierre" }));
      expect(post).toHaveBeenCalledWith(
        "/catalogs/monthly-fx/rates/close",
        { year: 2026, month: 2, closeRate: "3.785" },
        undefined,
      );
    } finally {
      post.mockRestore();
    }
  });

  it("numeric UI preserva doce dígitos y precisión, límites y reset mensual", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(
      <MonthlyFxPanel
        year={2026}
        months={[{ ...january, referenceRate: "999999999999.995000000001" }]}
        onCreateReference={save}
        onRetryReference={save}
        onRefresh={vi.fn()}
        onCloseMonth={save}
      />,
    );
    expect(
      within(screen.getAllByRole("row")[1]).getByText("1000000000000.00"),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("TC referencial (PEN por USD)");
    fireEvent.change(input, {
      target: { value: "999999999999.1234567890123" },
    });
    await user.click(screen.getByRole("button", { name: "Editar referencia" }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "9999999999999.12" } });
    await user.click(screen.getByRole("button", { name: "Editar referencia" }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(input, {
      target: { value: "999999999999.123456789012" },
    });
    expect(input).toHaveValue("999999999999.123456789012");
    await user.click(screen.getByRole("button", { name: "Editar referencia" }));
    expect(save).toHaveBeenCalledWith({
      year: 2026,
      month: 1,
      referenceRate: "999999999999.123456789012",
    });
    await user.type(input, "3.805");
    await user.type(
      screen.getByLabelText("TC de cierre (PEN por USD)"),
      "3.805",
    );
    await user.selectOptions(screen.getByRole("combobox"), "2");
    expect(input).toHaveValue("");
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveValue("");
    await user.type(input, "3.805");
    await user.click(screen.getByRole("button", { name: "Guardar referencia" }));
    expect(save).toHaveBeenLastCalledWith({
      year: 2026,
      month: 2,
      referenceRate: "3.805",
    });
  });

  it("un GET cerrado invalida el diálogo previo y permite gestionar otro mes", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const props = {
      year: 2026,
      onCreateReference: vi.fn(),
      onRetryReference: vi.fn(),
      onRefresh: vi.fn(),
      onCloseMonth: close,
    };
    const { rerender } = render(<MonthlyFxPanel {...props} months={[january]} />);
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3.5212");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(<MonthlyFxPanel {...props} months={[{ ...january, closeRate: "3.50" }]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const input = screen.getByLabelText("TC de cierre (PEN por USD)");
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveValue("3.50");
    fireEvent.change(input, { target: { value: "3.9" } });
    await user.type(input, "{Enter}3.9");
    expect(input).toHaveValue("3.50");
    expect(screen.queryByRole("button", { name: /Publicar cierre|Reintentar cierre/ })).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Mes"), "2");
    expect(input).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Guardar referencia" })).toBeEnabled();
  });

  it("el helper conserva replay numérico exacto sin ofrecerlo como acción de mes cerrado", async () => {
    const stored = { ...january, closeRate: "3.8" };
    const post = vi.spyOn(api, "post").mockResolvedValue(stored);
    try {
      const input = { year: 2026, month: 1, closeRate: "3.800000000000" };
      expect(await monthlyFxApi.closeMonth(input)).toEqual(stored);
      expect(post).toHaveBeenCalledWith("/catalogs/monthly-fx/rates/close", input, undefined);
    } finally {
      post.mockRestore();
    }
  });
});
