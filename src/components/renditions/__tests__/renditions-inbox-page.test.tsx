import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RenditionsInboxPage } from "@/components/renditions/renditions-inbox-page";
import { useRenditionsInbox } from "@/hooks/use-requests";
import { RENDITION_DEADLINE_BUCKET, RENDITION_DEADLINE_STATE, RENDITION_STATUS, type RenditionInboxCounts, type RenditionInboxFacets, type RenditionInboxRow } from "@/types/requests";

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();

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

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = vi.fn();
});

function makeCounts(overrides: Partial<RenditionInboxCounts> = {}): RenditionInboxCounts {
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

function makeRendition(overrides: Partial<RenditionInboxRow>): RenditionInboxRow {
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
  });

  it("activa solo la tarjeta exacta para pendientes y no duplica próximas", () => {
    render(<RenditionsInboxPage />);

    expect(screen.getByTestId("renditions-summary-card-pending")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("renditions-summary-card-due-soon")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Vencen en los próximos 15 días.")).toBeInTheDocument();
  });

  it("combina status con deadline bucket canónico sin serializar ALL", () => {
    render(<RenditionsInboxPage />);

    fireEvent.click(screen.getByTestId("renditions-summary-card-due-soon"));

    expect(replaceMock).toHaveBeenCalledWith("/renditions?status=PENDING&deadline_bucket=due_soon");
  });

  it("mantiene fallback local del bucket due-soon en 1–15 y separa vence hoy", () => {
    vi.mocked(useRenditionsInbox).mockReturnValue({
      renditions: [
        makeRendition({ advance_id: "today", deadline_state: RENDITION_DEADLINE_STATE.DUE_TODAY, calendar_days_to_deadline: 0 }),
        makeRendition({ advance_id: "day-15", calendar_days_to_deadline: 15 }),
        makeRendition({ advance_id: "day-16", calendar_days_to_deadline: 16 }),
        makeRendition({ advance_id: "presented", deadline_state: RENDITION_DEADLINE_STATE.PRESENTED, calendar_days_to_deadline: null }),
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

    expect(screen.getByTestId("renditions-summary-card-due-soon")).toHaveTextContent("1");
    expect(screen.queryByTestId("renditions-deadline-state-filter")).not.toBeInTheDocument();
  });

  it("ofrece exactamente la allowlist de estados derivados de Renditions", async () => {
    const user = userEvent.setup();
    render(<RenditionsInboxPage />);

    const statusFilter = screen.getByLabelText("Estado derivado de rendición");
    expect(statusFilter).toBe(screen.getByTestId("renditions-status-filter"));
    await user.click(statusFilter);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Ver todo",
      "Pendiente de rendición",
      "Vencida",
      "En revisión",
      "Observada",
      "Rendida",
    ]);

    await user.click(screen.getByRole("option", { name: "En revisión" }));
    expect(replaceMock).toHaveBeenCalledWith("/renditions?status=IN_REVIEW");
  });

  it("muestra summary exacto y comunica qué dimensión excluye cada facet", () => {
    vi.mocked(useRenditionsInbox).mockReturnValue({
      ...vi.mocked(useRenditionsInbox).mock.results[0]?.value,
      renditions: [], total: 1, page: 1, limit: 20, counts: makeCounts(),
      summary: { count: 1 }, facets: makeFacets(), isLoading: false,
      isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
    });

    render(<RenditionsInboxPage />);

    expect(screen.getByTestId("renditions-summary-card-results")).toHaveTextContent("1");
    expect(screen.getByTestId("renditions-summary-card-pending")).toHaveTextContent("8");
    expect(screen.getByTestId("renditions-summary-card-due-soon")).toHaveTextContent("5");
    expect(screen.getByText("Aplica todos los filtros activos.")).toBeInTheDocument();
    expect(screen.getAllByText("Facet: ignora solo el filtro de estado.").length).toBeGreaterThan(0);
    expect(screen.getByText("Facet: ignora solo el filtro de plazo.")).toBeInTheDocument();
  });

  it("canonicaliza aliases una vez y conserva reload/back sin loops", () => {
    searchParams = new URLSearchParams("status=ALL&bucket=due_soon&due_from=2026-06-01&page=2");

    const { rerender } = render(<RenditionsInboxPage />);
    expect(replaceMock).toHaveBeenCalledWith("/renditions?page=2&deadline_from=2026-06-01&deadline_bucket=due_soon");

    replaceMock.mockClear();
    searchParams = new URLSearchParams("page=2&deadline_from=2026-06-01&deadline_bucket=due_soon");
    rerender(<RenditionsInboxPage />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("expone controles, chips, clear y reset seguro sin filtros REXAN/documentales", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("search=viaje&deadline_from=2026-06-01&deadline_bucket=overdue");
    render(<RenditionsInboxPage />);

    expect(screen.getByLabelText("Plazo de rendición")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha límite desde")).toHaveValue("2026-06-01");
    expect(screen.getByText("Búsqueda: viaje")).toBeInTheDocument();
    expect(screen.queryByText(/completitud documental/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/estado REXAN/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar todos los filtros" }));
    expect(replaceMock).toHaveBeenCalledWith("/renditions");

    replaceMock.mockClear();
    searchParams = new URLSearchParams("document_complete=true");
    render(<RenditionsInboxPage />);
    await user.click(screen.getByRole("button", { name: "Restablecer filtros" }));
    expect(replaceMock).toHaveBeenCalledWith("/renditions");
  });
});
