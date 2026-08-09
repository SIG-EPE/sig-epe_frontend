import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getGiofAssignmentBlockerMessage, GiofBulkAssignmentBar, GiofWorkScopeFilter, GiofWorkStatus } from "@/components/giof-work/giof-work-controls";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";
import { GIOF_WORK_POOL, GIOF_WORK_SCOPE, type GiofWorkMetadata } from "@/types/giof-work";

vi.mock("@/hooks/use-giof-work", () => ({
  bulkAssignGiofWork: vi.fn(),
  fetchGiofAssignees: vi.fn().mockResolvedValue([]),
  fetchGiofHistory: vi.fn().mockResolvedValue([]),
  getGiofConflictMessage: (error: unknown) => error instanceof Error ? error.message : "Error",
}));

const work: GiofWorkMetadata = {
  pool: GIOF_WORK_POOL.PAYMENT,
  assigneeId: "user-1",
  assigneeName: "Ana Operadora",
  assignmentVersion: "2",
  lease: null,
  canAssign: true,
  canAcquire: true,
  canEdit: false,
  readOnly: true,
};

describe("controles GIOF", () => {
  it("muestra estado compacto sin exponer historial a un operador ordinario", () => {
    render(<GiofWorkStatus requestId="request-1" work={work} currentUserId="user-1" />);
    expect(screen.getByText("Asignado a ti")).toBeInTheDocument();
    expect(screen.queryByText("v2")).not.toBeInTheDocument();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver historial de asignación" })).not.toBeInTheDocument();
  });

  it("muestra el nombre completo de otra persona sin exponer su identificador", () => {
    render(<GiofWorkStatus requestId="request-1" work={{ ...work, assigneeId: "8e0050b3-0000-4000-8000-000000000000", assigneeName: "María Pérez" }} currentUserId="user-1" />);
    expect(screen.getByText("Asignado a María Pérez")).toBeInTheDocument();
    expect(screen.queryByText(/8e0050b3/)).not.toBeInTheDocument();
  });

  it("expone selección contextual de asignación solo cuando el padre manager la renderiza", () => {
    const { rerender } = render(<GiofBulkAssignmentBar pool={GIOF_WORK_POOL.PAYMENT} items={[]} onClear={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByTestId("giof-bulk-assignment-bar")).not.toBeInTheDocument();
    rerender(<GiofBulkAssignmentBar pool={GIOF_WORK_POOL.PAYMENT} items={[{ requestId: "request-1", label: "SOL-1", work }]} onClear={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByTestId("giof-bulk-assignment-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asignar / reasignar" })).toBeInTheDocument();
  });

  it("traduce causas de bloqueo conservando el código preciso y sin versiones técnicas", () => {
    const message = getGiofAssignmentBlockerMessage({
      requestId: "request-1",
      requestCode: "SOL-1",
      reason: "INELIGIBLE_LIFECYCLE",
      currentStatus: "PAID",
      currentVersion: "9",
    });
    expect(message).toContain("El estado actual no permite asignarlo");
    expect(message).toContain("INELIGIBLE_LIFECYCLE");
    expect(message).toContain("PAID");
    expect(message).not.toContain("v9");
  });

  it.each([
    [GIOF_HELP_CONTEXT.REQUEST, "/help/giof-assignment?context=request#request"],
    [GIOF_HELP_CONTEXT.PAYMENT, "/help/giof-assignment?context=payment#payment"],
    [GIOF_HELP_CONTEXT.REXAN, "/help/giof-assignment?context=rexan#rexan"],
  ])("enlaza el filtro %s con la sección contextual de la misma guía", (helpContext, href) => {
    render(<GiofWorkScopeFilter value={GIOF_WORK_SCOPE.MINE} isManager={false} onChange={vi.fn()} helpContext={helpContext} />);

    expect(screen.getByRole("link", { name: /abrir ayuda sobre asignación giof/i })).toHaveAttribute("href", href);
  });
});
