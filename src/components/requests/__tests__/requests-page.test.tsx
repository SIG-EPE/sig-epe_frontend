import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestsPage } from "@/components/requests/requests-page";
import { ACTIVE_REVIEW_STATUSES, REQUEST_REVIEW_QUEUE } from "@/lib/requests";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestsListFilters } from "@/types/requests";

const replaceMock = vi.fn((href: string) => {
  currentQuery = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
});
let currentQuery = "";
const useRequestsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: {
      id: "giof-1",
      firstName: "Giof",
      lastName: "Gestor",
      email: "giof@example.com",
      documentNumber: "12345679",
      onboardingCompleted: true,
      authSource: "LOCAL",
      role: { code: "GIOF_GESTOR", name: "GIOF Gestor" },
    },
  }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequests: (filters: RequestsListFilters) => useRequestsMock(filters),
}));

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "req-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.ADVANCE,
    status: REQUEST_STATUS.SUBMITTED,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Solicitud de prueba",
    requester_id: "user-1",
    budget_planning_line_id: null,
    budget_month: 1,
    organizational_unit_id: null,
    scheduled_rendition_at: null,
    related_request_id: null,
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: null,
    beneficiary_document_type: null,
    beneficiary_document_number: null,
    bank_code: null,
    bank_name: null,
    account_type: null,
    bank_account: null,
    bank_cci: null,
    submitted_at: "2026-05-01T10:00:00.000Z",
    observed_at: null,
    approved_at: null,
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("RequestsPage", () => {
  beforeEach(() => {
    currentQuery = "";
    replaceMock.mockClear();
    useRequestsMock.mockImplementation((filters: RequestsListFilters) => {
      const allRequests = [
        makeRequest({ id: "submitted", status: REQUEST_STATUS.SUBMITTED }),
        makeRequest({ id: "validation", status: REQUEST_STATUS.IN_VALIDATION }),
        makeRequest({ id: "observed", status: REQUEST_STATUS.OBSERVED }),
      ];
      const requests = filters.status
        ? allRequests.filter((request) => request.status === filters.status)
        : allRequests;

      return {
        requests: filters.limit === 100 ? allRequests : requests,
        total: requests.length,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      };
    });
  });

  it("renderiza tarjetas GIOF migradas y activa el filtro Nivel 2 en la URL", async () => {
    const user = userEvent.setup();
    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent("Bandeja de Revisión");
    expect(screen.getByText("Pendientes Nivel 1")).toBeInTheDocument();
    expect(screen.getByText("Pendientes Nivel 2")).toBeInTheDocument();
    expect(screen.getByText("Solicitudes devueltas/observadas")).toBeInTheDocument();
    expect(screen.queryByText("Colaboradores bloqueados")).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`requests-review-queue-card-${REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2}`));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenLastCalledWith("/requests?queue=pending-level-2&status=IN_VALIDATION&sort=OLDEST_FIRST&page=1");
    });
  });

  it("carga por defecto solo estados activos de revisión sin forzar una cola individual", () => {
    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      statuses: [...ACTIVE_REVIEW_STATUSES],
      status: undefined,
    }));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("oculta la tarjeta no soportada de colaboradores bloqueados", () => {
    render(<RequestsPage />);

    expect(screen.queryByTestId(`requests-review-queue-card-${REQUEST_REVIEW_QUEUE.BLOCKED}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("requests-review-queue-note")).not.toBeInTheDocument();
  });
});
