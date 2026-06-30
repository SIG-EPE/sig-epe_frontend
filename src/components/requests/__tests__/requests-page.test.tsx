import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RequestsPage } from "@/components/requests/requests-page";
import { ApiRequestError } from "@/lib/api-client";
import { ACTIVE_REVIEW_STATUSES, REQUEST_REVIEW_QUEUE } from "@/lib/requests";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestsListFilters } from "@/types/requests";
import type { AuthUser } from "@/types/auth";

const replaceMock = vi.fn((href: string) => {
  currentQuery = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
});
const pushMock = vi.fn();
let currentQuery = "";
const useRequestsMock = vi.fn();
let authUser: AuthUser | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: authUser,
  }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequests: (filters: RequestsListFilters, options?: { keepPreviousData?: boolean; cacheMode?: string }) => useRequestsMock(filters, options),
}));

function makeGiofUser(): AuthUser {
  return {
    id: "giof-1",
    firstName: "Giof",
    lastName: "Gestor",
    email: "giof@example.com",
    documentNumber: "12345679",
    onboardingCompleted: true,
    authSource: "LOCAL",
    role: { code: "GIOF_GESTOR", name: "GIOF Gestor" },
  };
}

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
    authUser = makeGiofUser();
    replaceMock.mockClear();
    pushMock.mockClear();
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

  it("muestra Mis Solicitudes por defecto para GIOF y permite crear", async () => {
    const user = userEvent.setup();
    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent("Mis Solicitudes");
    expect(screen.getByTestId("new-request-button")).toBeInTheDocument();
    expect(screen.queryByText("Por revisar")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("new-request-button"));

    expect(pushMock).toHaveBeenCalledWith("/requests/new");
  });

  it("renderiza tarjetas GIOF en scope de revisión y activa el filtro de validación en la URL", async () => {
    currentQuery = "scope=review";
    const user = userEvent.setup();
    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent("Bandeja de Revisión");
    expect(screen.getByTestId("new-request-button")).toBeInTheDocument();
    expect(screen.getByTestId(`requests-review-queue-card-${REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1}`)).toHaveTextContent("Por revisar");
    expect(screen.getByTestId(`requests-review-queue-card-${REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2}`)).toHaveTextContent("En validación");
    expect(screen.getByTestId(`requests-review-queue-card-${REQUEST_REVIEW_QUEUE.OBSERVED_RETURNED}`)).toHaveTextContent("Observadas");
    expect(screen.queryByText("Colaboradores bloqueados")).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`requests-review-queue-card-${REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2}`));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenLastCalledWith("/requests?scope=review&queue=pending-level-2&status=IN_VALIDATION&sort=OLDEST_FIRST&page=1");
    });
  });

  it("carga Mis Solicitudes por defecto con scope propio", () => {
    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "mine",
      statuses: undefined,
      status: undefined,
    }), expect.objectContaining({ keepPreviousData: false }));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("carga el link directo de Mis Solicitudes con scope mine explícito", () => {
    currentQuery = "scope=mine&page=2&status=OBSERVED&search=abc";

    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent("Mis Solicitudes");
    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "mine",
      page: 2,
      status: REQUEST_STATUS.OBSERVED,
      search: "abc",
    }), expect.objectContaining({ keepPreviousData: false }));
  });

  it("al volver desde Nueva Solicitud sin scope mantiene loading y no muestra vacío falso", () => {
    useRequestsMock.mockImplementation((filters: RequestsListFilters) => ({
      requests: [],
      total: 0,
      isLoading: filters.scope === "mine" && filters.limit !== 100,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "mine",
      page: 1,
      limit: 20,
    }), expect.objectContaining({ keepPreviousData: false }));
    expect(screen.getByText("Cargando solicitudes...")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay solicitudes registradas.")).not.toBeInTheDocument();
  });

  it("carga estados activos de revisión cuando el scope es review", () => {
    currentQuery = "scope=review";
    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "review",
      statuses: [...ACTIVE_REVIEW_STATUSES],
      status: undefined,
    }), expect.objectContaining({ keepPreviousData: false }));
  });

  it("usa carga directa sin caché para Mis Solicitudes, Bandeja e Historial", () => {
    const { rerender } = render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({ scope: "mine" }), expect.objectContaining({
      keepPreviousData: false,
      cacheMode: "no-store",
    }));

    useRequestsMock.mockClear();
    currentQuery = "scope=review";
    rerender(<RequestsPage />);
    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({ scope: "review" }), expect.objectContaining({
      keepPreviousData: false,
      cacheMode: "no-store",
    }));

    useRequestsMock.mockClear();
    currentQuery = "scope=history";
    rerender(<RequestsPage />);
    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({ scope: "history" }), expect.objectContaining({
      keepPreviousData: false,
      cacheMode: "no-store",
    }));
  });

  it("en link directo scope=review muestra loading inicial y no vacío hasta terminar fetch", () => {
    currentQuery = "scope=review";
    useRequestsMock.mockImplementation((filters: RequestsListFilters) => ({
      requests: [],
      total: 0,
      isLoading: filters.scope === "review" && filters.limit !== 100,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<RequestsPage />);

    expect(screen.getByText("Cargando solicitudes...")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay solicitudes registradas.")).not.toBeInTheDocument();
  });

  it("muestra vacío solo cuando la respuesta exitosa del scope vigente terminó vacía", () => {
    currentQuery = "scope=history";
    useRequestsMock.mockImplementation(() => ({
      requests: [],
      total: 0,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<RequestsPage />);

    expect(screen.queryByText("Cargando solicitudes...")).not.toBeInTheDocument();
    expect(screen.getByText("Aún no hay solicitudes registradas.")).toBeInTheDocument();
  });

  it("muestra quién creó un reembolso sin usar el beneficiario como responsable", () => {
    currentQuery = "scope=review";
    useRequestsMock.mockImplementation(() => ({
      requests: [makeRequest({
        id: "reimbursement-1",
        request_type: REQUEST_TYPE.REIMBURSEMENT,
        beneficiary_name: "Beneficiario cuenta",
        requester_name: "Ana Paredes",
      })],
      total: 1,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<RequestsPage />);

    expect(screen.getByRole("columnheader", { name: "Registrado por" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "A nombre de" })).toBeInTheDocument();
    expect(screen.getByText("Ana Paredes")).toBeInTheDocument();
    expect(screen.getByText("Beneficiario cuenta")).toBeInTheDocument();
  });

  it("no emite una carga inicial de Mis Solicitudes cuando la URL directa solicita revisión y el rol aún no está hidratado", () => {
    currentQuery = "scope=review";
    authUser = null;

    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "review",
    }), expect.objectContaining({ keepPreviousData: false }));
    expect(useRequestsMock).not.toHaveBeenCalledWith(expect.objectContaining({
      scope: "mine",
    }), expect.anything());
  });

  it("sincroniza los filtros con la URL al volver a Bandeja de Revisión", async () => {
    currentQuery = "scope=mine&status=OBSERVED&search=antiguo";
    const { rerender } = render(<RequestsPage />);

    expect(screen.getByTestId("requests-search-input")).toHaveValue("antiguo");
    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "mine",
      status: REQUEST_STATUS.OBSERVED,
    }), expect.objectContaining({ keepPreviousData: false }));

    useRequestsMock.mockClear();
    currentQuery = "scope=review";
    rerender(<RequestsPage />);

    await waitFor(() => expect(screen.getByTestId("requests-search-input")).toHaveValue(""));
    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "review",
      statuses: [...ACTIVE_REVIEW_STATUSES],
      status: undefined,
      search: undefined,
    }), expect.objectContaining({ keepPreviousData: false }));
  });

  it("oculta la tarjeta no soportada de colaboradores bloqueados", () => {
    currentQuery = "scope=review";
    render(<RequestsPage />);

    expect(screen.queryByTestId(`requests-review-queue-card-${REQUEST_REVIEW_QUEUE.BLOCKED}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("requests-review-queue-note")).not.toBeInTheDocument();
  });

  it("mantiene fecha exacta de historial como mismo date_from y date_to", () => {
    currentQuery = "scope=history&date_from=2026-06-01&date_to=2026-06-01";
    render(<RequestsPage />);

    expect(screen.getByLabelText("Fecha exacta")).toHaveValue("2026-06-01");
    expect(screen.getByText("1 filtros activos")).toBeInTheDocument();
    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "history",
      date_from: "2026-06-01",
      date_to: "2026-06-01",
    }), expect.objectContaining({ keepPreviousData: false }));
  });

  it("limpia filtros exclusivos de Historial al navegar de vuelta a Mis Solicitudes", async () => {
    currentQuery = "scope=history&date_from=2026-06-01&date_to=2026-06-01&request_type=ADVANCE&requester_id=user-2";
    const { rerender } = render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "history",
      date_from: "2026-06-01",
      date_to: "2026-06-01",
      request_type: REQUEST_TYPE.ADVANCE,
      requester_id: "user-2",
    }), expect.objectContaining({ keepPreviousData: false }));

    useRequestsMock.mockClear();
    currentQuery = "scope=mine";
    rerender(<RequestsPage />);

    await waitFor(() => {
      expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
        scope: "mine",
        date_from: undefined,
        date_to: undefined,
        date_field: undefined,
        request_type: undefined,
        requester_id: undefined,
      }), expect.objectContaining({ keepPreviousData: false }));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debouncea la búsqueda y no consulta el backend por términos demasiado cortos", () => {
    vi.useFakeTimers();
    render(<RequestsPage />);
    useRequestsMock.mockClear();

    fireEvent.change(screen.getByTestId("requests-search-input"), { target: { value: "2" } });
    act(() => vi.advanceTimersByTime(500));

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({ search: undefined }), expect.anything());
    expect(useRequestsMock).not.toHaveBeenCalledWith(expect.objectContaining({ search: "2" }), expect.anything());

    useRequestsMock.mockClear();
    fireEvent.change(screen.getByTestId("requests-search-input"), { target: { value: "2 l" } });
    expect(useRequestsMock).not.toHaveBeenCalledWith(expect.objectContaining({ search: "2 l" }), expect.anything());

    act(() => vi.advanceTimersByTime(499));
    expect(useRequestsMock).not.toHaveBeenCalledWith(expect.objectContaining({ search: "2 l" }), expect.anything());

    act(() => vi.advanceTimersByTime(1));

    expect(useRequestsMock).toHaveBeenCalledWith(expect.objectContaining({ search: "2 l" }), expect.anything());
  });

  it("muestra un mensaje amigable para errores 429 sin exponer ThrottlerException", () => {
    useRequestsMock.mockImplementation((filters: RequestsListFilters) => ({
      requests: [],
      total: 0,
      isLoading: false,
      error: filters.limit === 100 ? null : new ApiRequestError(429, {
        statusCode: 429,
        message: "ThrottlerException: Too Many Requests",
        error: "Too Many Requests",
        timestamp: "2026-06-19T00:00:00.000Z",
        path: "/requests",
      }),
      refetch: vi.fn(),
    }));

    render(<RequestsPage />);

    expect(screen.getByText("Hay muchas búsquedas seguidas. Espera unos segundos e inténtalo nuevamente.")).toBeInTheDocument();
    expect(screen.queryByText(/ThrottlerException|Too Many Requests/i)).not.toBeInTheDocument();
  });
});
