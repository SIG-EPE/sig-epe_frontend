import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { RequestsPage } from "@/components/requests/requests-page";
import { ApiRequestError } from "@/lib/api-client";
import {
  downloadRequestReviewExport,
  saveRequestReviewExport,
} from "@/lib/request-review-export";
import { ACTIVE_REVIEW_STATUSES, REQUEST_REVIEW_QUEUE } from "@/lib/requests";
import {
  REQUEST_CURRENCY,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
  type RequestReviewFilters,
  type RequestsListFilters,
} from "@/types/requests";
import type { AuthUser } from "@/types/auth";
import { toast } from "sonner";

const replaceMock = vi.fn((href: string) => {
  currentQuery = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
});
const pushMock = vi.fn();
let currentQuery = "";
const useRequestsMock = vi.fn();
const useRequestReviewMock = vi.fn();
const giofMocks = vi.hoisted(() => ({
  useClaimableWork: vi.fn(),
  useSelfClaim: vi.fn(),
}));
let authUser: AuthUser | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: authUser,
    }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequests: (
    filters: RequestsListFilters,
    options?: { keepPreviousData?: boolean; cacheMode?: string },
  ) => useRequestsMock(filters, options),
  useRequestReview: (
    filters: RequestReviewFilters,
    options?: {
      keepPreviousData?: boolean;
      cacheMode?: string;
      enabled?: boolean;
    },
  ) => useRequestReviewMock(filters, options),
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
  useGiofAssignees: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
  fetchGiofHistory: vi.fn().mockResolvedValue([]),
  bulkAssignGiofWork: vi.fn(),
  getGiofConflictMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Error",
}));

vi.mock("@/lib/request-review-export", () => ({
  downloadRequestReviewExport: vi.fn(),
  saveRequestReviewExport: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const downloadReviewExportMock = vi.mocked(downloadRequestReviewExport);
const saveReviewExportMock = vi.mocked(saveRequestReviewExport);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

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

function makeUser(role: NonNullable<AuthUser["role"]>["code"]): AuthUser {
  return {
    ...makeGiofUser(),
    id: `${role.toLowerCase()}-1`,
    role: { code: role, name: role },
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

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture)
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  if (!HTMLElement.prototype.releasePointerCapture)
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!HTMLElement.prototype.scrollIntoView)
    HTMLElement.prototype.scrollIntoView = vi.fn();
});

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
    useRequestReviewMock.mockReturnValue({
      requests: [makeRequest()],
      total: 1,
      page: 1,
      limit: 20,
      summary: {
        count: 1,
        requested_amount_by_currency: { PEN: "100.00" },
        status_counts: { SUBMITTED: 1 },
      },
      isLoading: false,
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
    downloadReviewExportMock.mockReset();
    saveReviewExportMock.mockReset();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    downloadReviewExportMock.mockResolvedValue({
      blob: new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])]),
      filename: "bandeja-revision-backend.xlsx",
    });
  });

  it("muestra Mis Solicitudes por defecto para GIOF y permite crear", async () => {
    const user = userEvent.setup();
    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent(
      "Mis Solicitudes",
    );
    expect(screen.getByTestId("new-request-button")).toBeInTheDocument();
    expect(screen.queryByText("Por revisar")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("requests-status-filter"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("requests-status-summary"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("new-request-button"));

    expect(pushMock).toHaveBeenCalledWith("/requests/new");
  });

  it("restaura la Bandeja de Revisión para GIOF_MANAGER con controles de asignación pero sin acciones de gestor", () => {
    currentQuery = "scope=review";
    authUser = makeUser("GIOF_MANAGER");

    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent(
      "Bandeja de Revisión",
    );
    expect(screen.getByTestId("giof-work-scope-filter")).toBeInTheDocument();
    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "review",
        work_scope: "all",
      }),
      expect.anything(),
    );
    expect(screen.queryByText("Procesar")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("giof-claimable-REQUEST")).toHaveLength(1);
  });

  it("muestra Todos y Mi trabajo en Review para Gestor con default Todos", async () => {
    const user = userEvent.setup();
    currentQuery = "scope=review";

    render(<RequestsPage />);

    const scope = screen.getByRole("combobox", {
      name: "Alcance de trabajo GIOF",
    });
    expect(scope).toHaveTextContent("Todos");
    await user.click(scope);
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Todos", "Mi trabajo"]);
    expect(useRequestReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ work_scope: "all" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.getByTestId("giof-claimable-REQUEST")).toBeInTheDocument();
  });

  it("muestra los cuatro alcances de Review para Manager", async () => {
    const user = userEvent.setup();
    currentQuery = "scope=review";
    authUser = makeUser("GIOF_MANAGER");

    render(<RequestsPage />);

    const scope = screen.getByRole("combobox", {
      name: "Alcance de trabajo GIOF",
    });
    await user.click(scope);
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Todos", "Mi trabajo", "Sin asignar", "Por responsable"]);
  });

  it.each(["GIOF_GESTOR", "GIOF_MANAGER"] as const)(
    "integra REQUEST claimable para %s y conecta el refetch autoritativo sin navegar",
    async (role) => {
      currentQuery = "scope=review";
      authUser = makeUser(role);
      const refetch = vi.fn().mockResolvedValue(undefined);
      useRequestReviewMock.mockReturnValue({
        requests: [makeRequest()],
        total: 1,
        page: 1,
        limit: 20,
        summary: null,
        isLoading: false,
        isRefreshing: false,
        error: null,
        refetch,
      });

      render(<RequestsPage />);

      expect(screen.getByTestId("giof-claimable-REQUEST")).toBeInTheDocument();
      expect(giofMocks.useClaimableWork).toHaveBeenCalledWith(
        expect.objectContaining({ pool: "REQUEST", enabled: true }),
      );
      const options = giofMocks.useSelfClaim.mock.calls.at(-1)?.[0];
      await options.refetchPoolQueue({ force: true });
      expect(refetch).toHaveBeenCalledWith({ force: true });
      expect(pushMock).not.toHaveBeenCalled();
    },
  );

  it.each(["SOLICITANTE_EPE", "AUDITOR_DIRECCION", "ADMIN_SISTEMA"] as const)(
    "no habilita scope review para %s",
    (role) => {
      currentQuery = "scope=review";
      authUser = makeUser(role);

      render(<RequestsPage />);

      expect(screen.getByTestId("requests-page-title")).toHaveTextContent(
        "Mis Solicitudes",
      );
      expect(useRequestsMock).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "mine" }),
        expect.anything(),
      );
      expect(
        screen.queryByRole("combobox", { name: "Alcance de trabajo GIOF" }),
      ).not.toBeInTheDocument();
    },
  );

  it("retira las tarjetas y el ordenamiento heredados del scope de revisión", () => {
    currentQuery = "scope=review";
    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent(
      "Bandeja de Revisión",
    );
    expect(screen.queryByTestId("new-request-button")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(
        `requests-review-queue-card-${REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1}`,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("requests-sort-control"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Colaboradores bloqueados"),
    ).not.toBeInTheDocument();
  });

  it("carga Mis Solicitudes por defecto con scope propio", () => {
    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "mine",
        statuses: undefined,
        status: undefined,
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("carga el link directo de Mis Solicitudes con scope mine explícito", () => {
    currentQuery = "scope=mine&page=2&status=OBSERVED&search=abc";

    render(<RequestsPage />);

    expect(screen.getByTestId("requests-page-title")).toHaveTextContent(
      "Mis Solicitudes",
    );
    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "mine",
        page: 2,
        status: REQUEST_STATUS.OBSERVED,
        search: "abc",
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );
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

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "mine",
        page: 1,
        limit: 20,
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );
    expect(screen.getByText("Cargando solicitudes...")).toBeInTheDocument();
    expect(
      screen.queryByText("Aún no hay solicitudes registradas."),
    ).not.toBeInTheDocument();
  });

  it("carga estados activos de revisión cuando el scope es review", () => {
    currentQuery = "scope=review";
    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "review",
        statuses: [...ACTIVE_REVIEW_STATUSES],
        status: undefined,
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );
  });

  it("usa carga directa sin caché para Mis Solicitudes, Bandeja e Historial", () => {
    const { rerender } = render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "mine" }),
      expect.objectContaining({
        keepPreviousData: false,
        cacheMode: "no-store",
      }),
    );

    useRequestsMock.mockClear();
    currentQuery = "scope=review";
    rerender(<RequestsPage />);
    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "review" }),
      expect.objectContaining({
        keepPreviousData: false,
        cacheMode: "no-store",
      }),
    );

    useRequestsMock.mockClear();
    currentQuery = "scope=history";
    rerender(<RequestsPage />);
    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "history" }),
      expect.objectContaining({
        keepPreviousData: false,
        cacheMode: "no-store",
      }),
    );
  });

  it("en link directo scope=review muestra loading inicial y no vacío hasta terminar fetch", () => {
    currentQuery = "scope=review";
    useRequestReviewMock.mockReturnValue({
      requests: [],
      total: 0,
      summary: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RequestsPage />);

    expect(screen.getByText("Cargando solicitudes...")).toBeInTheDocument();
    expect(
      screen.queryByText("Aún no hay solicitudes registradas."),
    ).not.toBeInTheDocument();
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

    expect(
      screen.queryByText("Cargando solicitudes..."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Aún no hay solicitudes registradas."),
    ).toBeInTheDocument();
  });

  it("muestra en Historial el vocabulario lifecycle exacto", () => {
    currentQuery = "scope=history";

    render(<RequestsPage />);

    expect(screen.getByText("Enviadas a revisión")).toBeInTheDocument();
    expect(
      screen.getByText("Aprobadas · pendientes de pago"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Enviadas / Por revisar"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("En gestión de pago")).not.toBeInTheDocument();
    expect(screen.getByTestId("requests-status-filter")).toBeInTheDocument();
  });

  it("muestra quién creó un reembolso sin usar el beneficiario como responsable", () => {
    currentQuery = "scope=review";
    useRequestReviewMock.mockReturnValue({
      requests: [
        makeRequest({
          id: "reimbursement-1",
          request_type: REQUEST_TYPE.REIMBURSEMENT,
          beneficiary_name: "Beneficiario cuenta",
          requester_name: "Ana Paredes",
        }),
      ],
      total: 1,
      summary: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RequestsPage />);

    expect(
      screen.getByRole("columnheader", { name: "Registrado por" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "A nombre de" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Paredes")).toBeInTheDocument();
    expect(screen.getByText("Beneficiario cuenta")).toBeInTheDocument();
  });

  it("no emite una carga inicial de Mis Solicitudes cuando la URL directa solicita revisión y el rol aún no está hidratado", () => {
    currentQuery = "scope=review";
    authUser = null;

    render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "review",
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );
    expect(useRequestsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "mine",
      }),
      expect.anything(),
    );
    expect(screen.getByText("Cargando solicitudes...")).toBeInTheDocument();
    expect(
      screen.queryByText("Aún no hay solicitudes registradas."),
    ).not.toBeInTheDocument();
  });

  it("sincroniza los filtros con la URL al volver a Bandeja de Revisión", async () => {
    currentQuery = "scope=mine&status=OBSERVED&search=antiguo";
    const { rerender } = render(<RequestsPage />);

    expect(screen.getByTestId("requests-search-input")).toHaveValue("antiguo");
    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "mine",
        status: REQUEST_STATUS.OBSERVED,
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );

    useRequestsMock.mockClear();
    currentQuery = "scope=review";
    rerender(<RequestsPage />);

    await waitFor(() =>
      expect(screen.getByLabelText("Buscar solicitudes")).toHaveValue(""),
    );
    expect(useRequestReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        work_scope: "all",
      }),
      expect.objectContaining({ keepPreviousData: false, enabled: true }),
    );
    const lastEnabledReviewFilters = useRequestReviewMock.mock.calls
      .filter((call) => call[1]?.enabled)
      .at(-1)?.[0];
    expect(lastEnabledReviewFilters).not.toHaveProperty("status");
    expect(lastEnabledReviewFilters).not.toHaveProperty("search");
  });

  it("oculta la tarjeta no soportada de colaboradores bloqueados", () => {
    currentQuery = "scope=review";
    render(<RequestsPage />);

    expect(
      screen.queryByTestId(
        `requests-review-queue-card-${REQUEST_REVIEW_QUEUE.BLOCKED}`,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("requests-review-queue-note"),
    ).not.toBeInTheDocument();
  });

  it("mantiene fecha exacta de historial como mismo date_from y date_to", () => {
    currentQuery = "scope=history&date_from=2026-06-01&date_to=2026-06-01";
    render(<RequestsPage />);

    expect(screen.getByLabelText("Fecha exacta")).toHaveValue("2026-06-01");
    expect(screen.getByText("1 filtros activos")).toBeInTheDocument();
    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "history",
        date_from: "2026-06-01",
        date_to: "2026-06-01",
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );
  });

  it("limpia filtros exclusivos de Historial al navegar de vuelta a Mis Solicitudes", async () => {
    currentQuery =
      "scope=history&date_from=2026-06-01&date_to=2026-06-01&request_type=ADVANCE&requester_id=user-2";
    const { rerender } = render(<RequestsPage />);

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "history",
        date_from: "2026-06-01",
        date_to: "2026-06-01",
        request_type: REQUEST_TYPE.ADVANCE,
        requester_id: "user-2",
      }),
      expect.objectContaining({ keepPreviousData: false }),
    );

    useRequestsMock.mockClear();
    currentQuery = "scope=mine";
    rerender(<RequestsPage />);

    await waitFor(() => {
      expect(useRequestsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "mine",
          date_from: undefined,
          date_to: undefined,
          date_field: undefined,
          request_type: undefined,
          requester_id: undefined,
        }),
        expect.objectContaining({ keepPreviousData: false }),
      );
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debouncea la búsqueda y no consulta el backend por términos demasiado cortos", () => {
    vi.useFakeTimers();
    render(<RequestsPage />);
    useRequestsMock.mockClear();

    fireEvent.change(screen.getByTestId("requests-search-input"), {
      target: { value: "2" },
    });
    act(() => vi.advanceTimersByTime(500));

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
      expect.anything(),
    );
    expect(useRequestsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: "2" }),
      expect.anything(),
    );

    useRequestsMock.mockClear();
    fireEvent.change(screen.getByTestId("requests-search-input"), {
      target: { value: "2 l" },
    });
    expect(useRequestsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: "2 l" }),
      expect.anything(),
    );

    act(() => vi.advanceTimersByTime(499));
    expect(useRequestsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: "2 l" }),
      expect.anything(),
    );

    act(() => vi.advanceTimersByTime(1));

    expect(useRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: "2 l" }),
      expect.anything(),
    );
  });

  it("muestra un mensaje amigable para errores 429 sin exponer ThrottlerException", () => {
    useRequestsMock.mockImplementation((filters: RequestsListFilters) => ({
      requests: [],
      total: 0,
      isLoading: false,
      error:
        filters.limit === 100
          ? null
          : new ApiRequestError(429, {
              statusCode: 429,
              message: "ThrottlerException: Too Many Requests",
              error: "Too Many Requests",
              timestamp: "2026-06-19T00:00:00.000Z",
              path: "/requests",
            }),
      refetch: vi.fn(),
    }));

    render(<RequestsPage />);

    expect(
      screen.getByText(
        "Hay muchas búsquedas seguidas. Espera unos segundos e inténtalo nuevamente.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/ThrottlerException|Too Many Requests/i),
    ).not.toBeInTheDocument();
  });

  it("usa el endpoint aditivo de revisión con la URL como fuente de verdad y conserva el alcance por rol", () => {
    currentQuery = "scope=review&page=3&status=OBSERVED&search=viatico";
    authUser = makeUser("GIOF_MANAGER");

    render(<RequestsPage />);

    expect(useRequestReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 3,
        limit: 20,
        status: REQUEST_STATUS.OBSERVED,
        search: "viatico",
        work_scope: "all",
      }),
      expect.objectContaining({ enabled: true, keepPreviousData: false }),
    );
    expect(
      screen.queryByTestId("requests-sort-control"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Total: 1")).toBeInTheDocument();
  });

  it("no consulta parámetros de revisión inválidos y ofrece una recuperación segura", async () => {
    currentQuery = "scope=review&sort=OLDEST_FIRST&status=OBSERVED";
    const user = userEvent.setup();

    render(<RequestsPage />);

    expect(useRequestReviewMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron aplicar los filtros de la URL",
    );
    expect(screen.queryByText("OLDEST_FIRST")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Restablecer filtros" }),
    );
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/requests?scope=review&work_scope=all",
    );
  });

  it("acepta el alcance all canónico de Gestor", () => {
    currentQuery = "scope=review&work_scope=all";

    render(<RequestsPage />);

    expect(useRequestReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ work_scope: "all" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.getByTestId("giof-work-scope-filter")).toBeInTheDocument();
    expect(
      screen.queryByTestId("giof-assignee-filter"),
    ).not.toBeInTheDocument();
  });

  it("actualiza filtros de revisión en la URL, reinicia página y preserva filtros válidos no relacionados", async () => {
    currentQuery = "scope=review&page=4&status=OBSERVED";
    const user = userEvent.setup();

    render(<RequestsPage />);
    await user.type(screen.getByLabelText("Buscar solicitudes"), "viático");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(replaceMock).toHaveBeenLastCalledWith(
      "/requests?scope=review&work_scope=all&status=OBSERVED&search=vi%C3%A1tico",
    );
  });

  it("reproduce chips desde URL, elimina uno y limpia todos sin perder el scope", async () => {
    currentQuery = "scope=review&page=2&status=SUBMITTED&search=viatico";
    const user = userEvent.setup();

    render(<RequestsPage />);
    expect(
      screen.getByRole("button", { name: "Quitar filtro Búsqueda: viatico" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Quitar filtro Búsqueda: viatico" }),
    );
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/requests?scope=review&work_scope=all&status=SUBMITTED",
    );

    await user.click(
      screen.getByRole("button", { name: "Limpiar todos los filtros" }),
    );
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/requests?scope=review&work_scope=all",
    );
  });

  it("muestra errores de revisión accionables sin exponer detalles técnicos", () => {
    currentQuery = "scope=review";
    useRequestReviewMock.mockReturnValue({
      requests: [],
      total: 0,
      summary: null,
      isLoading: false,
      isRefreshing: false,
      error: new Error(
        "QueryFailedError: relation payment_requests_internal does not exist",
      ),
      refetch: vi.fn(),
    });

    render(<RequestsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron cargar las solicitudes para revisión",
    );
    expect(
      screen.queryByText(/QueryFailedError|payment_requests_internal/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
  });

  describe("exportación Excel de Bandeja Review", () => {
    it("exporta exactamente los filtros activos de la URL y deja page/limit al helper all-filtered", async () => {
      currentQuery =
        "scope=review&page=3&limit=50&work_scope=assignee&assignee_id=11111111-1111-4111-8111-111111111111&status=OBSERVED&currency=PEN&amount_min=10.00&amount_max=200.00&search=viatico";
      authUser = makeUser("GIOF_MANAGER");
      const user = userEvent.setup();

      render(<RequestsPage />);
      await user.click(screen.getByRole("button", { name: "Exportar Excel" }));

      expect(downloadReviewExportMock).toHaveBeenCalledWith(
        {
          page: 3,
          limit: 50,
          work_scope: "assignee",
          assignee_id: "11111111-1111-4111-8111-111111111111",
          status: "OBSERVED",
          currency: "PEN",
          amount_min: "10.00",
          amount_max: "200.00",
          search: "viatico",
        },
        expect.any(AbortSignal),
      );
      expect(saveReviewExportMock).toHaveBeenCalledWith(
        expect.objectContaining({ filename: "bandeja-revision-backend.xlsx" }),
      );
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Excel de Bandeja de Revisión descargado correctamente.",
      );
    });

    it("se oculta fuera de Bandeja y se deshabilita con rol pendiente o URL inválida", () => {
      const { rerender } = render(<RequestsPage />);
      expect(
        screen.queryByRole("button", { name: "Exportar Excel" }),
      ).not.toBeInTheDocument();

      currentQuery = "scope=review";
      authUser = null;
      rerender(<RequestsPage />);
      expect(
        screen.getByRole("button", { name: "Exportar Excel" }),
      ).toBeDisabled();

      authUser = makeGiofUser();
      currentQuery = "scope=review&sort=OLDEST_FIRST";
      rerender(<RequestsPage />);
      expect(
        screen.getByRole("button", { name: "Exportar Excel" }),
      ).toBeDisabled();
    });

    it("muestra loading indeterminado, impide doble click y cancela best-effort", async () => {
      currentQuery = "scope=review";
      downloadReviewExportMock.mockImplementation(
        (_filters, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      );
      const user = userEvent.setup();

      render(<RequestsPage />);
      const exportButton = screen.getByRole("button", {
        name: "Exportar Excel",
      });
      await user.click(exportButton);

      expect(exportButton).toBeDisabled();
      expect(
        screen.getByText("Preparando el Excel. La cancelación es best-effort."),
      ).toHaveAttribute("role", "status");
      await user.click(exportButton);
      expect(downloadReviewExportMock).toHaveBeenCalledOnce();

      await user.click(
        screen.getByRole("button", { name: "Cancelar descarga" }),
      );
      expect(downloadReviewExportMock.mock.calls[0]?.[1].aborted).toBe(true);
      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith(
          "La descarga del Excel fue cancelada.",
        ),
      );
      expect(
        screen.getByRole("button", { name: "Exportar Excel" }),
      ).toBeEnabled();
    });

    it.each([
      [400, "Revisa los filtros activos antes de exportar el Excel."],
      [
        401,
        "Tu sesión no está disponible. Vuelve a iniciar sesión para descargar el Excel.",
      ],
      [403, "No tienes permisos para exportar la Bandeja de Revisión."],
      [
        422,
        "No se pudo generar el Excel con los filtros activos. Ajusta los filtros e inténtalo nuevamente.",
      ],
      [
        429,
        "Hay muchas exportaciones seguidas. Espera unos segundos e inténtalo nuevamente.",
      ],
    ])(
      "muestra un error claro para HTTP %i sin retry automático",
      async (statusCode, message) => {
        currentQuery = "scope=review";
        downloadReviewExportMock.mockRejectedValue(
          new ApiRequestError(statusCode, {
            statusCode,
            message: "technical backend detail",
            error: "Error",
            timestamp: "2026-08-28T00:00:00.000Z",
            path: "/requests/review/export.xlsx",
          }),
        );
        const user = userEvent.setup();

        render(<RequestsPage />);
        await user.click(
          screen.getByRole("button", { name: "Exportar Excel" }),
        );

        await waitFor(() =>
          expect(toastErrorMock).toHaveBeenCalledWith(message),
        );
        expect(downloadReviewExportMock).toHaveBeenCalledOnce();
        expect(saveReviewExportMock).not.toHaveBeenCalled();
      },
    );

    it("muestra el conteo y límite del 422 para orientar el ajuste de filtros", async () => {
      currentQuery = "scope=review";
      const limitBody = {
        statusCode: 422,
        code: "REQUEST_REVIEW_EXPORT_ROW_LIMIT_EXCEEDED",
        message: "Review export contains 1048576 rows; maximum is 1048575",
        error: "Unprocessable Entity",
        timestamp: "2026-08-28T00:00:00.000Z",
        path: "/requests/review/export.xlsx",
        count: 1_048_576,
        max: 1_048_575,
      };
      downloadReviewExportMock.mockRejectedValue(
        new ApiRequestError(422, limitBody),
      );
      const user = userEvent.setup();

      render(<RequestsPage />);
      await user.click(screen.getByRole("button", { name: "Exportar Excel" }));

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith(
          "El Excel tendría 1,048,576 filas y el máximo permitido es 1,048,575. Ajusta los filtros activos.",
        ),
      );
      expect(downloadReviewExportMock).toHaveBeenCalledOnce();
    });

    it("muestra un error general seguro y no reintenta", async () => {
      currentQuery = "scope=review";
      downloadReviewExportMock.mockRejectedValue(
        new Error("network internals"),
      );
      const user = userEvent.setup();

      render(<RequestsPage />);
      await user.click(screen.getByRole("button", { name: "Exportar Excel" }));

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith(
          "No se pudo descargar el Excel. Inténtalo nuevamente.",
        ),
      );
      expect(downloadReviewExportMock).toHaveBeenCalledOnce();
    });
  });
});
