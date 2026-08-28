import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RenditionsInboxPage } from "@/components/renditions/renditions-inbox-page";
import { useRenditionsInbox } from "@/hooks/use-requests";
import { RENDITION_DEADLINE_STATE, RENDITION_STATUS, type RenditionInboxCounts, type RenditionInboxRow } from "@/types/requests";

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

  it("navega próximas a vencer con bucket explícito", () => {
    render(<RenditionsInboxPage />);

    fireEvent.click(screen.getByTestId("renditions-summary-card-due-soon"));

    expect(replaceMock).toHaveBeenCalledWith("/renditions?status=ALL&page=1&bucket=due_soon");
  });

  it("mantiene paridad local del card due-soon en 0/15/16 sin crear filtros de deadline", () => {
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
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RenditionsInboxPage />);

    expect(screen.getByTestId("renditions-summary-card-due-soon")).toHaveTextContent("2");
    expect(screen.queryByTestId("renditions-deadline-state-filter")).not.toBeInTheDocument();
  });
});
