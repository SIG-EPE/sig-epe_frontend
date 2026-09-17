import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getGiofSelfAssignmentSelectionSummary,
  getGiofCurrentPageSelection,
  getGiofAssignmentBlockerMessage,
  GiofBulkAssignmentBar,
  GiofClaimableWorkPanel,
  GiofWorkScopeFilter,
  GiofWorkStatus,
} from "@/components/giof-work/giof-work-controls";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";
import {
  GIOF_BULK_ASSIGNMENT_MODE,
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
  GIOF_WORK_POOL,
  GIOF_WORK_SCOPE,
  SELF_BULK_ASSIGNMENT_OUTCOME,
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

const bulkSelfUi = vi.hoisted(() => ({
  assign: vi.fn(),
  isSubmitting: false,
  error: null as Error | null,
  result: null as null | {
    pool: "PAYMENT";
    total: number;
    counts: { assigned: number; unchangedSelf: number; blocked: number };
    results: Array<{
      requestId: string;
      outcome: "ASSIGNED" | "UNCHANGED_SELF" | "BLOCKED";
      code?: "VERSION_CONFLICT";
    }>;
  },
}));

vi.mock("@/hooks/use-giof-work", () => ({
  registerGiofClaimableRefetch: vi.fn(() => vi.fn()),
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
  useGiofBulkSelfAssignment: vi.fn(() => ({
    assign: bulkSelfUi.assign,
    isSubmitting: bulkSelfUi.isSubmitting,
    error: bulkSelfUi.error,
    result: bulkSelfUi.result,
    clearError: vi.fn(),
    clearResult: vi.fn(),
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
  assignmentState: GIOF_WORK_ASSIGNMENT_STATE.OTHER,
  leaseState: GIOF_WORK_LEASE_STATE.NONE,
  lease: null,
  canAssign: true,
  canAcquire: true,
  canEdit: false,
  readOnly: true,
};

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture)
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  if (!HTMLElement.prototype.releasePointerCapture)
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!HTMLElement.prototype.scrollIntoView)
    HTMLElement.prototype.scrollIntoView = vi.fn();
});

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
    bulkSelfUi.assign.mockReset();
    bulkSelfUi.isSubmitting = false;
    bulkSelfUi.error = null;
    bulkSelfUi.result = null;
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

  it("oculta la identidad ajena al Gestor y conserva el nombre para Manager", () => {
    const { rerender } = render(
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
    expect(
      screen.getByText(
        "Asignado a otra persona · No está siendo procesado",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/María Pérez/)).not.toBeInTheDocument();
    expect(screen.queryByText(/8e0050b3/)).not.toBeInTheDocument();

    rerender(
      <GiofWorkStatus
        requestId="request-1"
        work={{
          ...work,
          assigneeId: "8e0050b3-0000-4000-8000-000000000000",
          assigneeName: "María Pérez",
        }}
        currentUserId="user-1"
        isManager
      />,
    );
    expect(screen.getByText("Asignada a María Pérez")).toBeInTheDocument();
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

  it("conserva el modo Manager con responsable y operación todo-o-nada", async () => {
    const user = userEvent.setup();
    render(
      <GiofBulkAssignmentBar
        pool={GIOF_WORK_POOL.PAYMENT}
        items={[{ requestId: "request-1", label: "SOL-1", work }]}
        onClear={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Asignar / reasignar" }));
    expect(screen.getByText(/operación es todo-o-nada/i)).toBeInTheDocument();
    expect(screen.getByText("Responsable")).toBeInTheDocument();
    expect(screen.getByText("Nota opcional")).toBeInTheDocument();
  });

  it("muestra modo Gestor sin controles de autoridad y explica resultados mixtos", async () => {
    const user = userEvent.setup();
    render(
      <GiofBulkAssignmentBar
        mode={GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF}
        pool={GIOF_WORK_POOL.PAYMENT}
        items={[{ requestId: "request-1", label: "SOL-1", work }]}
        onClear={vi.fn()}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
        refetchClaimable={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Asignarme seleccionados" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Asignarme seleccionados" }),
    );
    expect(
      screen.getAllByText(/1 trabajo: 0 sin asignar y 1 asignado/i),
    ).toHaveLength(2);
    expect(screen.getByText(/resultados mixtos/i)).toBeInTheDocument();
    expect(screen.queryByText("Responsable")).not.toBeInTheDocument();
    expect(screen.queryByText("Nota opcional")).not.toBeInTheDocument();
    expect(screen.queryByText(/forzar/i)).not.toBeInTheDocument();
  });

  it.each([
    [
      [{ ...work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED }],
      "1 trabajo: 1 sin asignar y 0 asignados a otras personas.",
    ],
    [
      [{ ...work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.OTHER }],
      "1 trabajo: 0 sin asignar y 1 asignado a otra persona. Este último cambiará de responsable.",
    ],
    [
      [
        { ...work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED },
        { ...work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED },
        { ...work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED },
        { ...work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.OTHER },
        { ...work, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.OTHER },
      ],
      "5 trabajos: 3 sin asignar y 2 asignados a otras personas. Estos últimos cambiarán de responsable.",
    ],
  ])("resume selección Gestor con pluralización precisa", (works, expected) => {
    expect(
      getGiofSelfAssignmentSelectionSummary(
        works.map((candidate, index) => ({
          requestId: `request-${index}`,
          label: `SOL-${index}`,
          work: candidate,
        })),
      ),
    ).toBe(expected);
  });

  it("anuncia el resumen y cada bloqueo del resultado Gestor", async () => {
    const user = userEvent.setup();
    bulkSelfUi.result = {
      pool: "PAYMENT",
      total: 2,
      counts: { assigned: 1, unchangedSelf: 0, blocked: 1 },
      results: [
        { requestId: "request-1", outcome: SELF_BULK_ASSIGNMENT_OUTCOME.ASSIGNED },
        {
          requestId: "request-2",
          outcome: SELF_BULK_ASSIGNMENT_OUTCOME.BLOCKED,
          code: "VERSION_CONFLICT",
        },
      ],
    };
    render(
      <GiofBulkAssignmentBar
        mode={GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF}
        pool={GIOF_WORK_POOL.PAYMENT}
        items={[
          { requestId: "request-1", label: "SOL-1", work },
          { requestId: "request-2", label: "SOL-2", work },
        ]}
        onClear={vi.fn()}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
        refetchClaimable={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Asignarme seleccionados" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /1 asignado.*1 bloqueado/i,
    );
    expect(screen.getByText(/SOL-2.*versión.*cambió/i)).toBeInTheDocument();
  });

  it("filtra selección Gestor por metadata estricta y limita la página a 50", () => {
    const eligibleWork: GiofWorkMetadata = {
      ...work,
      assignmentState: GIOF_WORK_ASSIGNMENT_STATE.OTHER,
      leaseState: GIOF_WORK_LEASE_STATE.STALE,
      assignmentVersion: "7",
    };
    const page = Array.from({ length: 51 }, (_, index) => ({
      requestId: `request-${index + 1}`,
      label: `SOL-${index + 1}`,
      work: eligibleWork,
    }));
    const selectedIds = page.map((item) => item.requestId);

    expect(
      getGiofCurrentPageSelection(
        page.slice(0, 1),
        selectedIds,
        GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF,
      ),
    ).toHaveLength(1);
    expect(
      getGiofCurrentPageSelection(
        page.slice(0, 50),
        selectedIds,
        GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF,
      ),
    ).toHaveLength(50);
    expect(
      getGiofCurrentPageSelection(
        page,
        selectedIds,
        GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF,
      ),
    ).toHaveLength(50);

    const excluded = [
      { ...eligibleWork, assignmentState: GIOF_WORK_ASSIGNMENT_STATE.SELF },
      { ...eligibleWork, leaseState: GIOF_WORK_LEASE_STATE.ACTIVE_OTHER },
      { ...eligibleWork, canAssign: false },
      { ...eligibleWork, assignmentVersion: "" },
      { ...eligibleWork, assignmentState: undefined },
      { ...eligibleWork, leaseState: undefined },
    ];
    expect(
      getGiofCurrentPageSelection(
        excluded.map((candidate, index) => ({
          requestId: `excluded-${index}`,
          label: `Excluded ${index}`,
          work: candidate,
        })),
        excluded.map((_, index) => `excluded-${index}`),
        GIOF_BULK_ASSIGNMENT_MODE.GESTOR_SELF,
      ),
    ).toEqual([]);
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

  it("limita el alcance de Gestor a Todos y Mi trabajo", async () => {
    const user = userEvent.setup();
    render(
      <GiofWorkScopeFilter
        value={GIOF_WORK_SCOPE.ALL}
        isManager={false}
        onChange={vi.fn()}
        helpContext={GIOF_HELP_CONTEXT.REQUEST}
      />,
    );

    const scope = screen.getByRole("combobox", {
      name: "Alcance de trabajo GIOF",
    });
    expect(scope).toHaveTextContent("Todos");
    expect(
      screen.getByRole("link", { name: /abrir ayuda sobre asignación giof/i }),
    ).toBeInTheDocument();
    await user.click(scope);

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Todos", "Mi trabajo"]);
  });

  it("ofrece los cuatro alcances a Manager", async () => {
    const user = userEvent.setup();
    render(
      <GiofWorkScopeFilter
        value={GIOF_WORK_SCOPE.ALL}
        isManager
        onChange={vi.fn()}
        helpContext={GIOF_HELP_CONTEXT.REQUEST}
      />,
    );

    const scope = screen.getByRole("combobox", {
      name: "Alcance de trabajo GIOF",
    });
    expect(scope).toHaveTextContent("Todos");
    await user.click(scope);

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Todos", "Mi trabajo", "Sin asignar", "Por responsable"]);
  });

  it("confirma la reasignación sin identidad ajena y conserva el payload", async () => {
    const user = userEvent.setup();
    render(
      <GiofClaimableWorkPanel
        pool={GIOF_WORK_POOL.PAYMENT}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByText(
        "Asignado a otra persona · No está siendo procesado",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/asignados que no estén siendo procesados/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /reasignarme sol-claim/i }),
    );
    expect(
      screen.getByRole("dialog", { name: "Reasignarme" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Este trabajo ya tiene responsable. Al continuar, pasará a estar asignado a ti. No hay una sesión de procesamiento activa.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(claimUi.claim).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /reasignarme sol-claim/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar reasignación" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/asignado a ti/i),
    );
    expect(claimUi.claim).toHaveBeenCalledWith({
      requestId: "request-claim",
      expectedVersion: 5,
    });
  });

  it("asigna directamente el trabajo sin responsable", async () => {
    const user = userEvent.setup();
    claimUi.items = [
      {
        ...claimUi.items[0],
        assignmentState: "UNASSIGNED",
        leaseState: "NONE",
      },
    ];
    render(
      <GiofClaimableWorkPanel
        pool={GIOF_WORK_POOL.PAYMENT}
        refetchPoolQueue={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /asignarme sol-claim/i }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(claimUi.claim).toHaveBeenCalledWith({
      requestId: "request-claim",
      expectedVersion: 5,
    });
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
      screen.queryByRole("button", { name: /asignarme sol-paid|reasignarme sol-paid/i }),
    ).not.toBeInTheDocument();
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
      screen.getByRole("button", { name: /reasignarme sol-claim/i }),
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
