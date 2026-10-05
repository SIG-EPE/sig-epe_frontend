import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RenditionsInboxPage } from "@/components/renditions/renditions-inbox-page";
import { useRenditionsInbox } from "@/hooks/use-requests";
import { ApiRequestError } from "@/lib/api-client";
import { downloadRenditionsExport, saveRenditionsExport } from "@/lib/renditions-export";
import { toast } from "sonner";
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
const exportGate = vi.hoisted(() => ({ paymentReady: false, renditionReady: false }));

vi.mock("@/lib/business-queue-export-readiness", () => ({
  isPaymentExportReady: () => exportGate.paymentReady,
  isRenditionExportReady: () => exportGate.renditionReady,
}));

vi.mock("@/lib/renditions-export", () => ({
  downloadRenditionsExport: vi.fn(),
  saveRenditionsExport: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
    exportGate.paymentReady = false;
    exportGate.renditionReady = false;
    vi.mocked(downloadRenditionsExport).mockReset();
    vi.mocked(saveRenditionsExport).mockReset();
    vi.mocked(toast.error).mockReset();
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
    "elimina REXAN claimable para %s sin navegación automática",
    (role) => {
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

      expect(screen.queryByText("Trabajos que puedes tomar")).not.toBeInTheDocument();
      expect(giofMocks.useSelfClaim).not.toHaveBeenCalled();
      expect(replaceMock).not.toHaveBeenCalledWith(
        expect.stringContaining("mode=process"),
      );
    },
  );

  it("integra selección dirigida Gestor REXAN", async () => {
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
      screen.getByRole("button", { name: "Asignar / reasignar" }),
    );
    expect(screen.getByText("Responsable")).toBeInTheDocument();
    expect(giofMocks.bulkSelfAssign).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalledWith(
      expect.stringContaining("mode=process"),
    );
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER", "AUDITOR_DIRECCION", "ADMIN_SISTEMA"])(
    "permite exportar la bandeja para %s sin exigir REXAN enlazado",
    async (role) => {
      exportGate.renditionReady = true;
      roleCode = role;
      searchParams = new URLSearchParams(`status=PENDING&page=4&limit=20${role.startsWith("GIOF") ? "&work_scope=all" : ""}`);
      vi.mocked(useRenditionsInbox).mockReturnValue({
        renditions: [makeRendition({ settlement_request_id: null })],
        total: 1, page: 4, limit: 20, counts: makeCounts(), summary: { count: 1 },
        facets: makeFacets(), isLoading: false, isInitialLoading: false,
        isRefreshing: false, error: null, refetch: vi.fn(),
      });
      const download = { blob: new Blob(["xlsx"]), filename: "bandeja-rendiciones.xlsx" };
      vi.mocked(downloadRenditionsExport).mockResolvedValue(download);
      render(<RenditionsInboxPage />);
      expect(screen.getByText(/anticipos pendientes y la última REXAN vinculada/)).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole("button", { name: "Exportar Excel" }));
      await waitFor(() => expect(saveRenditionsExport).toHaveBeenCalledWith(download));
      expect(downloadRenditionsExport).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PENDING", page: 4, work_scope: role.startsWith("GIOF") ? "all" : undefined }),
        expect.any(AbortSignal),
      );
    },
  );

  it.each(["SOLICITANTE_EPE", "PATROCINADOR"])("oculta exportación para %s", (role) => {
    roleCode = role;
    render(<RenditionsInboxPage />);
    expect(screen.queryByRole("button", { name: "Exportar Excel" })).not.toBeInTheDocument();
  });

  it("bloquea URL inválida y muestra errores 403/400/422 sin guardar", async () => {
    exportGate.renditionReady = true;
    searchParams = new URLSearchParams("status=PENDING&tab=draft");
    const view = render(<RenditionsInboxPage />);
    expect(screen.getByRole("button", { name: "Exportar Excel" })).toBeDisabled();
    searchParams = new URLSearchParams("status=PENDING");
    view.rerender(<RenditionsInboxPage />);
    for (const status of [403, 400, 422]) {
      vi.mocked(downloadRenditionsExport).mockRejectedValueOnce(new ApiRequestError(status, {
        statusCode: status, message: "error", error: "Error", timestamp: "2026-09-30", path: "export",
      }));
      await userEvent.setup().click(screen.getByRole("button", { name: "Exportar Excel" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(status === 403 ? 1 : status === 400 ? 2 : 3));
    }
    expect(saveRenditionsExport).not.toHaveBeenCalled();
  });

  it("anuncia progreso, cancela y no guarda respuesta tardía", async () => {
    exportGate.renditionReady = true;
    let resolveDownload!: (value: { blob: Blob; filename: string }) => void;
    vi.mocked(downloadRenditionsExport).mockImplementation(() => new Promise((resolve) => { resolveDownload = resolve; }));
    render(<RenditionsInboxPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Exportar Excel" }));
    expect(screen.getByRole("button", { name: "Exportando Excel..." })).toBeDisabled();
    expect(screen.getByText(/Preparando el Excel/)).toHaveAttribute("role", "status");
    const signal = vi.mocked(downloadRenditionsExport).mock.calls[0][1];
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancelar descarga" }));
    expect(signal.aborted).toBe(true);
    resolveDownload({ blob: new Blob(["late"]), filename: "late.xlsx" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar Excel" })).toBeEnabled());
    expect(saveRenditionsExport).not.toHaveBeenCalled();
  });

  it.each([
    "GIOF_GESTOR",
    "GIOF_MANAGER",
    "AUDITOR_DIRECCION",
    "ADMIN_SISTEMA",
    "SOLICITANTE_EPE",
  ])(
    "mantiene oculto el nuevo Excel de Rendiciones para %s hasta aceptación",
    (role) => {
      exportGate.paymentReady = true;
      roleCode = role;
      render(<RenditionsInboxPage />);
      expect(screen.getByText("Bandeja de Rendiciones")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Exportar Excel" }),
      ).not.toBeInTheDocument();
      expect(downloadRenditionsExport).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["GIOF_GESTOR", "Todos", ["Todos", "Mi trabajo", "Sin asignar", "Por responsable"]],
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
      expect(screen.queryByText("Trabajos que puedes tomar")).not.toBeInTheDocument();
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
