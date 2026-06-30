import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RenditionsInboxPage } from "@/components/renditions/renditions-inbox-page";
import { useRenditionsInbox } from "@/hooks/use-requests";
import { RENDITION_STATUS, type RenditionInboxCounts } from "@/types/requests";

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
});
