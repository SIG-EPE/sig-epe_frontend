import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PoaNodeDialog } from "../poa-node-dialog";
import { executePoaNodeAction } from "@/hooks/use-poa-hierarchy";

vi.mock("@/hooks/use-poa-hierarchy", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/use-poa-hierarchy")>();
  return { ...original, executePoaNodeAction: vi.fn() };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("PoaNodeDialog", () => {
  it("gestiona la descripción del recurso sin permitir editar el código", async () => {
    const user = userEvent.setup();
    vi.mocked(executePoaNodeAction).mockResolvedValue({ id: "r1" });
    render(
      <PoaNodeDialog
        action={{
          kind: "rename",
          level: "resource",
          id: "r1",
          parentId: "a1",
          currentName: "Material anterior",
          fullCode: "CMP-000001-ACT-000001-REC-00000001",
        }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/código/i)).toHaveAttribute("readonly");
    const description = screen.getByLabelText(/descripción del recurso/i);
    await user.clear(description);
    await user.type(description, "Material actualizado");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(executePoaNodeAction).toHaveBeenCalledWith(expect.objectContaining({
      kind: "rename",
      id: "r1",
      name: "Material actualizado",
    }));
  });
});
