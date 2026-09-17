import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RenditionsInboxPage } from "@/components/renditions/renditions-inbox-page";
import { useRenditionsInbox } from "@/hooks/use-requests";
import {
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
  GIOF_WORK_POOL,
} from "@/types/giof-work";
import {
  RENDITION_DEADLINE_BUCKET,
  RENDITION_DEADLINE_STATE,
  RENDITION_STATUS,
  type RenditionInboxCounts,
  type RenditionInboxFacets,
  type RenditionInboxRow,
} from "@/types/requests";

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
let roleCode = "GIOF_GESTOR";
const giofMocks = vi.hoisted(() => ({
  bulkSelfAssign: vi.fn(),
  useClaimableWork: vi.fn(),
  useSelfClaim: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

vi.mock("@/hooks/use-requests", () => ({
  useRenditionsInbox: vi.fn(),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: "user-1", role: { code: roleCode } } }),
}));

vi.mock("@/hooks/use-giof-work", () => ({
  registerGiofClaimableRefetch: vi.fn(() => vi.fn()),
  useGiofOwnershipCommands: vi.fn(() => ({
    release: vi.fn(),
    take: vi.fn(),
    forceReassign: vi.fn(),
    isSubmitting: false,
    error: null,
    clearError: vi.fn(),
  })),
  useGiofClaimableWork: giofMocks.useClaimableWork,
  useGiofSelfClaim: giofMocks.useSelfClaim,
  useGiofBulkSelfAssignment: vi.fn(() => ({
    assign: giofMocks.bulkSelfAssign,
    isSubmitting: false,
    error: null,
    result: null,
    clearError: vi.fn(),
    clearResult: vi.fn(),
  })),
  useGiofAssignees: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  fetchGiofHistory: vi.fn().mockResolvedValue([]),
  bulkAssignGiofWork: vi.fn(),
  getGiofConflictMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Error",
}));

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture)
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  if (!HTMLElement.prototype.releasePointerCapture)
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!HTMLElement.prototype.scrollIntoView)
    HTMLElement.prototype.scrollIntoView = vi.fn();
});

function makeCounts(
  overrides: Partial<RenditionInboxCounts> = {},
): RenditionInboxCounts {
  return {
    [RENDITION_STATUS.PENDING]: 2,
    [RENDITION_STATUS.OVERDUE]: 1,
    [RENDITION_STATUS.IN_REVIEW]: 0,
    [RENDITION_STATUS.OBSERVED]: 0,
    [RENDITION_STATUS.SETTLED]: 0,
    due_soon: 1,
    ...overrides,
  };
}

function makeRendition(
  overrides: Partial<RenditionInboxRow>,
): RenditionInboxRow {
  return {
    advance_id: "advance-1",
    request_code: "SOL-1",
    requester: "Ana Pérez",
    org_unit: "Operaciones",
    concept: "Anticipo",
    requested_amount: 100,
    amount_paid: 100,
    paid_at: "2026-05-01T00:00:00.000Z",
    scheduled_rendition_at: "2026-05-20",
    deadline_date: "2026-05-20",
    deadline_state: RENDITION_DEADLINE_STATE.OPEN,
    calendar_days_to_deadline: 15,
    rendition_status: RENDITION_STATUS.PENDING,
    days_overdue: null,
    days_until_due: 15,
    days_remaining: 15,
    settlement_request_id: null,
    settlement_status: null,
    settlement_updated_at: null,
    settlement_submitted_at: null,
    settlement_document_count: 0,
    settlement_documents_complete: false,
    payment_proof_document_id: null,
    last_activity_at: null,
    ...overrides,
  };
}

function makeFacets(): RenditionInboxFacets {
  return {
    status: {
      excluded_filters: ["status"],
      counts: makeCounts({ [RENDITION_STATUS.PENDING]: 8 }),
    },
    deadline_bucket: {
      excluded_filters: ["deadline_bucket"],
      counts: {
        [RENDITION_DEADLINE_BUCKET.NONE]: 2,
        [RENDITION_DEADLINE_BUCKET.DUE_TODAY]: 3,
        [RENDITION_DEADLINE_BUCKET.DUE_SOON]: 5,
        [RENDITION_DEADLINE_BUCKET.OVERDUE]: 1,
      },
    },
  };
}

describe("RenditionsInboxPage", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    roleCode = "GIOF_GESTOR";
    searchParams = new URLSearchParams("status=PENDING&page=1");
    vi.mocked(useRenditionsInbox).mockReturnValue({
      renditions: [],
      total: 0,
      page: 1,
      limit: 20,
      counts: makeCounts(),
      summary: { count: 0 },
      facets: makeFacets(),
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    giofMocks.useClaimableWork.mockReturnValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    giofMocks.useSelfClaim.mockReturnValue({
      claim: vi.fn(),
      pendingRequestId: null,
      isSubmitting: false,
      error: null,
      clearError: vi.fn(),
    });
    giofMocks.bulkSelfAssign.mockReset();
    giofMocks.bulkSelfAssign.mockResolvedValue({
      pool: GIOF_WORK_POOL.REXAN,
      total: 1,
      counts: { assigned: 1, unchangedSelf: 0, blocked: 0 },
      results: [{ requestId: "settlement-1", outcome: "ASSIGNED" }],
    });
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"])(
    "integra REXAN claimable para %s con refetch autoritativo y sin navegación automática",
    async (role) => {
      roleCode = role;
      const refetch = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useRenditionsInbox).mockReturnValue({
        renditions: [],
        total: 0,
        page: 1,
        limit: 20,
        counts: makeCounts(),
        summary: { count: 0 },
        facets: makeFacets(),
        isLoading: false,
        isInitialLoading: false,
        isRefreshing: false,
        error: null,
        refetch,
      });

      render(<RenditionsInboxPage />);

      expect(screen.getByTestId("giof-claimable-REXAN")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Trabajos que puedes tomar" }),
      ).toBeInTheDocument();
      const options = giofMocks.useSelfClaim.mock.calls.at(-1)?.[0];
      await options.refetchPoolQueue({ force: true });
      expect(refetch).toHaveBeenCalledWith({ force: true });
      expect(replaceMock).not.toHaveBeenCalledWith(
        expect.stringContaining("mode=process"),
      );
    },
  );

  it("integra selección Gestor REXAN con el requestId y versión del trabajo", async () => {
    vi.mocked(useRenditionsInbox).mockReturnValue({
      renditions: [
        makeRendition({
          settlement_request_id: "settlement-1",
          giof_work: {
            requestId: "settlement-1",
            pool: GIOF_WORK_POOL.REXAN,
            assignmentState: GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED,
            assignmentVersion: "6",
            leaseState: GIOF_WORK_LEASE_STATE.NONE,
            canAssign: true,
            canAcquire: false,
            canEdit: false,
            readOnly: true,
          },
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
      counts: makeCounts(),
      summary: { count: 1 },
      facets: makeFacets(),
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    const user = userEvent.setup();
    render(<RenditionsInboxPage />);

    await user.click(
      screen.getByRole("checkbox", {
        name: "Seleccionar SOL-1 para asignar",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Asignarme seleccionados" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar asignación" }),
    );

    expect(giofMocks.bulkSelfAssign).toHaveBeenCalledWith([
      { requestId: "settlement-1", expectedAssignmentVersion: 6 },
    ]);
    expect(replaceMock).not.toHaveBeenCalledWith(
      expect.stringContaining("mode=process"),
    );
  });

  it.each([
    ["GIOF_GESTOR", "Todos", ["Todos", "Mi trabajo"]],
    [
      "GIOF_MANAGER",
      "Todos",
      ["Todos", "Mi trabajo", "Sin asignar", "Por responsable"],
    ],
  ])(
    "muestra los alcances permitidos de Renditions para %s",
    async (role, selected, expectedOptions) => {
      const user = userEvent.setup();
      roleCode = role;

      render(<RenditionsInboxPage />);

      const scope = screen.getByRole("combobox", {
        name: "Alcance de trabajo GIOF",
      });
      expect(scope).toHaveTextContent(selected);
      await user.click(scope);
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(expectedOptions);
      expect(useRenditionsInbox).toHaveBeenCalledWith(
        expect.objectContaining({
          work_scope: "all",
        }),
        expect.objectContaining({ enabled: true }),
      );
      expect(screen.getByTestId("giof-claimable-REXAN")).toBeInTheDocument();
    },
  );

  it("oculta REXAN claimable para roles no operativos", () => {
    roleCode = "ADMIN_SISTEMA";
    render(<RenditionsInboxPage />);
    expect(
      screen.queryByTestId("giof-claimable-REXAN"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Alcance de trabajo GIOF" }),
    ).not.toBeInTheDocument();
  });

  it("activa solo la tarjeta exacta para pendientes y no duplica próximas", () => {
    render(<RenditionsInboxPage />);

    expect(
      screen.getByTestId("renditions-summary-card-pending"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("renditions-summary-card-due-soon"),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Vencen en los próximos 15 días."),
    ).toBeInTheDocument();
  });

  it("combina status con deadline bucket canónico sin serializar ALL", () => {
    render(<RenditionsInboxPage />);

    fireEvent.click(screen.getByTestId("renditions-summary-card-due-soon"));

    expect(replaceMock).toHaveBeenCalledWith(
      "/renditions?status=PENDING&work_scope=all&deadline_bucket=due_soon",
    );
  });

  it("mantiene fallback local del bucket due-soon en 1–15 y separa vence hoy", () => {
    vi.mocked(useRenditionsInbox).mockReturnValue({
      renditions: [
        makeRendition({
          advance_id: "today",
          deadline_state: RENDITION_DEADLINE_STATE.DUE_TODAY,
          calendar_days_to_deadline: 0,
        }),
        makeRendition({ advance_id: "day-15", calendar_days_to_deadline: 15 }),
        makeRendition({ advance_id: "day-16", calendar_days_to_deadline: 16 }),
        makeRendition({
          advance_id: "presented",
          deadline_state: RENDITION_DEADLINE_STATE.PRESENTED,
          calendar_days_to_deadline: null,
        }),
      ],
      total: 4,
      page: 1,
      limit: 20,
      counts: undefined,
      summary: { count: 4 },
      facets: null,
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RenditionsInboxPage />);

    expect(
      screen.getByTestId("renditions-summary-card-due-soon"),
    ).toHaveTextContent("1");
    expect(
      screen.queryByTestId("renditions-deadline-state-filter"),
    ).not.toBeInTheDocument();
  });

  it("ofrece exactamente la allowlist de estados derivados de Renditions", async () => {
    const user = userEvent.setup();
    render(<RenditionsInboxPage />);

    const statusFilter = screen.getByLabelText("Estado derivado de rendición");
    expect(statusFilter).toBe(screen.getByTestId("renditions-status-filter"));
    await user.click(statusFilter);

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "Ver todo",
      "Pendiente de rendición",
      "Vencida",
      "En revisión",
      "Observada",
      "Rendida",
    ]);

    await user.click(screen.getByRole("option", { name: "En revisión" }));
    expect(replaceMock).toHaveBeenCalledWith(
      "/renditions?status=IN_REVIEW&work_scope=all",
    );
  });

  it("muestra summary exacto y comunica qué dimensión excluye cada facet", () => {
    vi.mocked(useRenditionsInbox).mockReturnValue({
      ...vi.mocked(useRenditionsInbox).mock.results[0]?.value,
      renditions: [],
      total: 1,
      page: 1,
      limit: 20,
      counts: makeCounts(),
      summary: { count: 1 },
      facets: makeFacets(),
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RenditionsInboxPage />);

    expect(
      screen.getByTestId("renditions-summary-card-results"),
    ).toHaveTextContent("1");
    expect(
      screen.getByTestId("renditions-summary-card-pending"),
    ).toHaveTextContent("8");
    expect(
      screen.getByTestId("renditions-summary-card-due-soon"),
    ).toHaveTextContent("5");
    expect(
      screen.getByText("Aplica todos los filtros activos."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Facet: ignora solo el filtro de estado.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Facet: ignora solo el filtro de plazo."),
    ).toBeInTheDocument();
  });

  it("canonicaliza aliases una vez y conserva reload/back sin loops", () => {
    searchParams = new URLSearchParams(
      "status=ALL&bucket=due_soon&due_from=2026-06-01&page=2",
    );

    const { rerender } = render(<RenditionsInboxPage />);
    expect(replaceMock).toHaveBeenCalledWith(
      "/renditions?page=2&work_scope=all&deadline_from=2026-06-01&deadline_bucket=due_soon",
    );

    replaceMock.mockClear();
    searchParams = new URLSearchParams(
      "page=2&work_scope=all&deadline_from=2026-06-01&deadline_bucket=due_soon",
    );
    rerender(<RenditionsInboxPage />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("expone controles, chips, clear y reset seguro sin filtros REXAN/documentales", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams(
      "search=viaje&deadline_from=2026-06-01&deadline_bucket=overdue",
    );
    render(<RenditionsInboxPage />);

    expect(screen.getByLabelText("Plazo de rendición")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha límite desde")).toHaveValue(
      "2026-06-01",
    );
    expect(screen.getByText("Búsqueda: viaje")).toBeInTheDocument();
    expect(
      screen.queryByText(/completitud documental/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/estado REXAN/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Limpiar todos los filtros" }),
    );
    expect(replaceMock).toHaveBeenCalledWith("/renditions?work_scope=all");

    replaceMock.mockClear();
    searchParams = new URLSearchParams("document_complete=true");
    render(<RenditionsInboxPage />);
    await user.click(
      screen.getByRole("button", { name: "Restablecer filtros" }),
    );
    expect(replaceMock).toHaveBeenCalledWith("/renditions?work_scope=all");
  });
});
