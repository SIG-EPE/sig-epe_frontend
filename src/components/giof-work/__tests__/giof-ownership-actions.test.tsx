import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GiofOwnershipActions } from "@/components/giof-work/giof-ownership-actions";
import { ROLE_CODE } from "@/lib/constants";
import {
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
  GIOF_WORK_POOL,
  type GiofWorkAssignmentState,
  type GiofWorkLeaseState,
  type GiofWorkMetadata,
  type GiofWorkPool,
} from "@/types/giof-work";

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  take: vi.fn(),
  forceReassign: vi.fn(),
  clearError: vi.fn(),
  error: null as Error | null,
  isSubmitting: false,
}));

vi.mock("@/hooks/use-giof-work", () => ({
  useGiofAssignees: vi.fn(() => ({
    data: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        firstName: "Rosa",
        lastName: "Gestora",
        role: ROLE_CODE.GIOF_GESTOR,
      },
    ],
    isLoading: false,
    error: null,
  })),
  useGiofOwnershipCommands: vi.fn(() => mocks),
}));

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture)
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  if (!HTMLElement.prototype.releasePointerCapture)
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!HTMLElement.prototype.scrollIntoView)
    HTMLElement.prototype.scrollIntoView = vi.fn();
});

function makeWork(
  pool: GiofWorkPool,
  assignmentState: GiofWorkAssignmentState = GIOF_WORK_ASSIGNMENT_STATE.SELF,
  leaseState: GiofWorkLeaseState = GIOF_WORK_LEASE_STATE.NONE,
): GiofWorkMetadata {
  return {
    requestId: `request-${pool.toLowerCase()}`,
    pool,
    assignmentState,
    assignmentVersion: "7",
    leaseState,
    assigneeId:
      assignmentState === GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED
        ? null
        : assignmentState === GIOF_WORK_ASSIGNMENT_STATE.SELF
          ? "user-current"
          : "user-other",
    canAssign: true,
    canAcquire: assignmentState === GIOF_WORK_ASSIGNMENT_STATE.SELF,
    canEdit: false,
    readOnly: true,
  };
}

describe("GiofOwnershipActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.error = null;
    mocks.isSubmitting = false;
    mocks.release.mockResolvedValue({ changed: true });
    mocks.take.mockResolvedValue({ changed: true });
    mocks.forceReassign.mockResolvedValue({ changed: true });
  });

  it.each([
    GIOF_WORK_POOL.REQUEST,
    GIOF_WORK_POOL.PAYMENT,
    GIOF_WORK_POOL.REXAN,
  ])(
    "muestra liberar al propietario en %s y envía la fila segura",
    async (pool) => {
      const user = userEvent.setup();
      render(
        <GiofOwnershipActions
          requestId={`request-${pool.toLowerCase()}`}
          label={`Fila ${pool}`}
          work={makeWork(pool)}
          roleCode={ROLE_CODE.GIOF_GESTOR}
          currentUserId="user-current"
          refetchPoolQueue={vi.fn()}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /liberar trabajo/i }),
      );
      expect(
        screen.getByRole("dialog", { name: "Liberar trabajo" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Confirmar liberación" }),
      );

      await waitFor(() =>
        expect(mocks.release).toHaveBeenCalledWith({
          requestId: `request-${pool.toLowerCase()}`,
          pool,
          expectedAssignmentVersion: 7,
        }),
      );
    },
  );

  it("permite al Gestor tomar una fila ajena sin lease y bloquea lease ajeno activo", () => {
    const { rerender } = render(
      <GiofOwnershipActions
        requestId="request-1"
        label="SOL-1"
        work={makeWork(
          GIOF_WORK_POOL.REQUEST,
          GIOF_WORK_ASSIGNMENT_STATE.OTHER,
        )}
        roleCode={ROLE_CODE.GIOF_GESTOR}
        currentUserId="user-current"
        refetchPoolQueue={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Tomar para mí" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /forzar/i }),
    ).not.toBeInTheDocument();

    rerender(
      <GiofOwnershipActions
        requestId="request-1"
        label="SOL-1"
        work={makeWork(
          GIOF_WORK_POOL.REQUEST,
          GIOF_WORK_ASSIGNMENT_STATE.OTHER,
          GIOF_WORK_LEASE_STATE.ACTIVE_OTHER,
        )}
        roleCode={ROLE_CODE.GIOF_GESTOR}
        currentUserId="user-current"
        refetchPoolQueue={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "En proceso por otro gestor" }),
    ).toBeDisabled();
  });

  it("exige responsable, motivo y confirmación de interrupción para forzar PAYMENT", async () => {
    const user = userEvent.setup();
    render(
      <GiofOwnershipActions
        requestId="payment-1"
        label="PAG-1"
        work={makeWork(
          GIOF_WORK_POOL.PAYMENT,
          GIOF_WORK_ASSIGNMENT_STATE.OTHER,
          GIOF_WORK_LEASE_STATE.ACTIVE_OTHER,
        )}
        roleCode={ROLE_CODE.GIOF_MANAGER}
        currentUserId="manager-1"
        refetchPoolQueue={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Forzar reasignación" }),
    );
    expect(
      screen.getByText(/interrumpir el trabajo de pago/i),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "Confirmar reasignación",
    });
    expect(confirm).toBeDisabled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Responsable destino" }),
      "22222222-2222-4222-8222-222222222222",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Motivo" }),
      "Cobertura operativa",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /confirmo la interrupción/i }),
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() =>
      expect(mocks.forceReassign).toHaveBeenCalledWith({
        requestId: "payment-1",
        pool: GIOF_WORK_POOL.PAYMENT,
        expectedAssignmentVersion: 7,
        targetAssigneeId: "22222222-2222-4222-8222-222222222222",
        reason: "Cobertura operativa",
        confirmed: true,
        acknowledgePaymentInterruption: true,
      }),
    );
  });

  it("no expone acciones a roles de solo lectura", () => {
    render(
      <GiofOwnershipActions
        requestId="request-1"
        label="SOL-1"
        work={makeWork(GIOF_WORK_POOL.REQUEST)}
        roleCode={ROLE_CODE.AUDITOR_DIRECCION}
        currentUserId="auditor-1"
        refetchPoolQueue={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("no expone liberar para un owner fuera del lifecycle elegible", () => {
    render(
      <GiofOwnershipActions
        requestId="request-draft"
        label="SOL-DRAFT"
        work={{
          ...makeWork(GIOF_WORK_POOL.REQUEST),
          canAssign: false,
          canAcquire: false,
        }}
        roleCode={ROLE_CODE.GIOF_GESTOR}
        currentUserId="user-current"
        refetchPoolQueue={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Liberar trabajo" }),
    ).not.toBeInTheDocument();
  });
});
