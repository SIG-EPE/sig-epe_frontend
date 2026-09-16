import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getGiofAssignmentBlockerMessage,
  GiofBulkAssignmentBar,
  GiofClaimableWorkPanel,
  GiofWorkScopeFilter,
  GiofWorkStatus,
} from "@/components/giof-work/giof-work-controls";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";
import {
  GIOF_WORK_POOL,
  GIOF_WORK_SCOPE,
  type GiofWorkMetadata,
} from "@/types/giof-work";

const claimUi = vi.hoisted(() => ({
  roleCode: "GIOF_GESTOR",
  error: null as Error | null,
  claim: vi.fn(),
  items: [
    {
      requestId: "request-claim",
      requestCode: "SOL-CLAIM",
      pool: "PAYMENT",
      requestType: "REIMBURSEMENT",
      status: "APPROVED",
      queueDate: "2026-09-14T10:00:00.000Z",
      assignmentVersion: "5",
      assignmentState: "TAKEOVER",
      leaseState: "EXPIRED",
    },
  ],
}));

vi.mock("@/hooks/use-giof-work", () => ({
  bulkAssignGiofWork: vi.fn(),
  fetchGiofAssignees: vi.fn().mockResolvedValue([]),
  fetchGiofHistory: vi.fn().mockResolvedValue([]),
  getGiofConflictMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Error",
  useGiofAssignees: vi.fn(() => ({
    data: [],
    isLoading: false,
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    refetch: vi.fn(),
  })),
  useGiofClaimableWork: vi.fn(() => ({
    items: claimUi.items,
    total: claimUi.items.length,
    page: 1,
    limit: 20,
    isLoading: false,
    isRefreshing: false,
    error: null,
    refetch: vi.fn(),
    isAdvisory: true,
  })),
  useGiofSelfClaim: vi.fn(() => ({
    claim: claimUi.claim,
    pendingRequestId: null,
    isSubmitting: false,
    error: claimUi.error,
    clearError: vi.fn(),
  })),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: { user: { role: { code: string } } }) => unknown,
  ) => selector({ user: { role: { code: claimUi.roleCode } } }),
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
  beforeEach(() => {
    claimUi.roleCode = "GIOF_GESTOR";
    claimUi.error = null;
    claimUi.items = [
      {
        requestId: "request-claim",
        requestCode: "SOL-CLAIM",
        pool: "PAYMENT",
        requestType: "REIMBURSEMENT",
        status: "APPROVED",
        queueDate: "2026-09-14T10:00:00.000Z",
        assignmentVersion: "5",
        assignmentState: "TAKEOVER",
        leaseState: "EXPIRED",
      },
    ];
    claimUi.claim.mockReset().mockResolvedValue({
      requestId: "request-claim",
      pool: GIOF_WORK_POOL.PAYMENT,
      assignmentVersion: "6",
      changed: true,
    });
  });

  it("muestra estado compacto sin exponer historial a un operador ordinario", () => {
    render(
      <GiofWorkStatus
        requestId="request-1"
        work={work}
        currentUserId="user-1"
      />,
    );
    expect(screen.getByText("Asignada a ti")).toBeInTheDocument();
    expect(screen.queryByText("v2")).not.toBeInTheDocument();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ver historial de asignación" }),
    ).not.toBeInTheDocument();
  });

  it("muestra el nombre completo de otra persona sin exponer su identificador", () => {
    render(
      <GiofWorkStatus
        requestId="request-1"
        work={{
          ...work,
          assigneeId: "8e0050b3-0000-4000-8000-000000000000",
          assigneeName: "María Pérez",
        }}
        currentUserId="user-1"
      />,
    );
    expect(screen.getByText("Asignada a María Pérez")).toBeInTheDocument();
    expect(screen.queryByText(/8e0050b3/)).not.toBeInTheDocument();
  });

  it("mantiene assignment y lease como badges GIOF independientes y accesibles", () => {
    const { rerender } = render(
      <GiofWorkStatus
        requestId="request-1"
        work={{
          ...work,
          assigneeId: null,
          assigneeName: null,
          readOnly: false,
        }}
        currentUserId="user-1"
      />,
    );

    expect(
      screen.getByRole("generic", { name: "Asignación GIOF: Sin asignar" }),
    ).toHaveTextContent("Sin asignar");

    rerender(
      <GiofWorkStatus
        requestId="request-1"
        work={{
          ...work,
          lease: {
            ownerId: "user-2",
            heartbeatAt: "2026-08-28T10:00:00.000Z",
            expiresAt: "2999-08-28T10:05:00.000Z",
          },
        }}
        currentUserId="user-1"
      />,
    );

    expect(
      screen.getByRole("generic", { name: "Asignación GIOF: En uso" }),
    ).toHaveTextContent("En uso");
    expect(
      screen.getByRole("generic", { name: "Asignación GIOF: Solo lectura" }),
    ).toHaveTextContent("Solo lectura");
  });

  it("expone selección contextual de asignación solo cuando el padre manager la renderiza", () => {
    const { rerender } = render(
      <GiofBulkAssignmentBar
        pool={GIOF_WORK_POOL.PAYMENT}
        items={[]}
        onClear={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("giof-bulk-assignment-bar"),
    ).not.toBeInTheDocument();
    rerender(
      <GiofBulkAssignmentBar
        pool={GIOF_WORK_POOL.PAYMENT}
        items={[{ requestId: "request-1", label: "SOL-1", work }]}
        onClear={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByTestId("giof-bulk-assignment-bar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Asignar / reasignar" }),
    ).toBeInTheDocument();
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
    [
      GIOF_HELP_CONTEXT.REQUEST,
      "/help/giof-assignment?context=request#request",
    ],
    [
      GIOF_HELP_CONTEXT.PAYMENT,
      "/help/giof-assignment?context=payment#payment",
    ],
    [GIOF_HELP_CONTEXT.REXAN, "/help/giof-assignment?context=rexan#rexan"],
  ])(
    "enlaza el filtro %s con la sección contextual de la misma guía",
    (helpContext, href) => {
      render(
        <GiofWorkScopeFilter
          value={GIOF_WORK_SCOPE.MINE}
          isManager={false}
          onChange={vi.fn()}
          helpContext={helpContext}
        />,
      );

      expect(
        screen.getByRole("link", {
          name: /abrir ayuda sobre asignación giof/i,
        }),
      ).toHaveAttribute("href", href);
    },
  );

  it("confirma Tomar trabajo con lenguaje sin identidad ajena y estado accesible", async () => {
    const user = userEvent.setup();
    render(
      <GiofClaimableWorkPanel
        pool={GIOF_WORK_POOL.PAYMENT}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByText("Asignado a otra persona, sin lease activo"),
    ).toBeInTheDocument();
    expect(screen.getByText(/lista es referencial/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /tomar trabajo sol-claim/i }),
    );
    expect(
      screen.getByRole("dialog", { name: "Tomar trabajo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/se actualizará la asignación/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar y tomar" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/asignado a ti/i),
    );
  });

  it("etiqueta estados mínimos sin inferir detalles sensibles de seguimiento PAYMENT", () => {
    claimUi.items = [
      {
        ...claimUi.items[0],
        assignmentState: "UNASSIGNED",
        leaseState: "NONE",
        status: "APPROVED",
      },
      {
        ...claimUi.items[0],
        requestId: "paid-follow-up",
        requestCode: "SOL-PAID",
        assignmentState: "OWN",
        leaseState: "OWN_ACTIVE",
        status: "PAID",
      },
    ];

    render(
      <GiofClaimableWorkPanel
        pool={GIOF_WORK_POOL.PAYMENT}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
    expect(screen.getByText("Ya está asignado a ti")).toBeInTheDocument();
    expect(
      screen.getByText("Pago pendiente de transferencia"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Seguimiento de pago pendiente: datos, constancia o activación REXAN",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/beneficiario|monto|responsable:/i),
    ).not.toBeInTheDocument();
  });

  it("se oculta para roles no operativos y sigue disponible para Manager sin reemplazar controles admin", () => {
    claimUi.roleCode = "ADMIN_SISTEMA";
    const { rerender } = render(
      <GiofClaimableWorkPanel
        pool={GIOF_WORK_POOL.REQUEST}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(
      screen.queryByTestId("giof-claimable-REQUEST"),
    ).not.toBeInTheDocument();

    claimUi.roleCode = "GIOF_MANAGER";
    rerender(
      <GiofClaimableWorkPanel
        pool={GIOF_WORK_POOL.REQUEST}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByTestId("giof-claimable-REQUEST")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tomar trabajo sol-claim/i }),
    ).toBeInTheDocument();
  });

  it("anuncia conflictos accionables sin mostrar identidad del responsable oculto", () => {
    claimUi.error = new Error(
      "La solicitud tiene un lease activo de otra persona. Actualiza la cola.",
    );
    render(
      <GiofClaimableWorkPanel
        pool={GIOF_WORK_POOL.PAYMENT}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /lease activo de otra persona/i,
    );
    expect(
      screen.queryByText(/user-|uuid|responsable:/i),
    ).not.toBeInTheDocument();
  });
});
