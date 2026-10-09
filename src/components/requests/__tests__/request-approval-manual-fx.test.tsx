import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestDetailPage } from "../request-detail-page";
import { ApiRequestError } from "@/lib/api-client";
import { REQUEST_TYPE } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  release: vi.fn(),
  patch: vi.fn(),
  refetch: vi.fn(),
  documentsRefetch: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  roleCode: "GIOF_GESTOR",
  realApproval: false,
  request: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "request-1" }),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ user: { id: "giof-1", role: { code: mocks.roleCode } } }),
    { getState: () => ({ accessToken: "test-session" }) },
  ),
}));
vi.mock("@/hooks/use-requests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-requests")>();
  return {
  useRequest: () => ({
    request: mocks.request,
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    refetch: mocks.refetch,
    patchRequest: mocks.patch,
  }),
  useRequestDocuments: () => ({
    documents: [],
    isLoading: false,
    refetch: mocks.documentsRefetch,
  }),
  useRequestRenditionReport: () => ({
    report: null,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useSettlementContext: () => ({
    context: null,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useApproveRequest: () => mocks.realApproval ? actual.useApproveRequest() : ({
    approveRequest: mocks.approve,
    isLoading: false,
  }),
  useObserveRequest: () => ({ observeRequest: vi.fn(), isLoading: false }),
  useRejectRequest: () => ({ rejectRequest: vi.fn(), isLoading: false }),
  useStartAdvanceSettlement: () => ({
    startAdvanceSettlement: vi.fn(),
    isLoading: false,
  }),
  useRetryRexanActivation: () => ({
    retryRexanActivation: vi.fn(),
    isLoading: false,
  }),
  };
});
vi.mock("@/hooks/use-giof-work", () => ({
  useAutoAcquireGiofWorkLease: () => ({ release: mocks.release }),
}));
vi.mock("@/hooks/use-drive-projection-polling", () => ({
  useDriveProjectionPolling: vi.fn(),
}));
vi.mock("@/components/giof-work/giof-work-controls", () => ({
  GiofWorkStatus: () => null,
}));
vi.mock("../request-documents-card", () => ({
  RequestDocumentsCard: () => null,
}));
vi.mock("../request-status-stepper", () => ({
  RequestStatusStepper: () => null,
}));
vi.mock("../request-status-history", () => ({
  RequestStatusHistory: () => null,
}));
vi.mock("../structured-rendition-report-card", () => ({
  StructuredRenditionReportCard: () => null,
}));

function error(status: number, code: string) {
  return new ApiRequestError(status, {
    statusCode: status,
    code,
    message: "Error de aprobación",
    error: "Error",
    timestamp: "2026-09-28T00:00:00Z",
    path: "/requests/request-1/approve",
  });
}

function openApproval() {
  render(<RequestDetailPage />);
  fireEvent.click(
    screen.getByRole("button", { name: /^Aprobar(?: rendición)?$/ }),
  );
}

function fillManual(rate = "3.805", date = "2026-09-01") {
  fireEvent.change(screen.getByLabelText(/Tasa de referencia/), {
    target: { value: rate },
  });
  fireEvent.change(screen.getByLabelText(/Fecha de la tasa/), {
    target: { value: date },
  });
  fireEvent.change(screen.getByLabelText(/Fuente manual/), {
    target: { value: "bank" },
  });
  fireEvent.change(screen.getByLabelText(/Justificación/), {
    target: { value: "BCRP no disponible" },
  });
}

describe("ordinary USD approval manual FX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realApproval = false;
    mocks.roleCode = "GIOF_GESTOR";
    mocks.request = {
      id: "request-1",
      requester_id: "other",
      request_type: REQUEST_TYPE.SUPPLIER_PAYMENT,
      status: "SUBMITTED",
      currency: "USD",
      requested_amount: "100",
      concept: "Compra",
      giof_work: { canEdit: true, canAcquire: true, assignmentState: "SELF" },
    };
    mocks.approve.mockResolvedValue({ ...mocks.request, status: "APPROVED" });
    mocks.release.mockResolvedValue(undefined);
    mocks.refetch.mockResolvedValue(undefined);
    mocks.documentsRefetch.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts the exact legacy USD100 manual DTO through the real approval hook with no FX lookup", async () => {
    mocks.realApproval = true;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { ...mocks.request, status: "APPROVED" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    openApproval();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fillManual(" 3,70 ");
    fireEvent.change(screen.getByLabelText(/Justificación/), {
      target: { value: " Documento bancario revisado " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/requests\/request-1\/approve$/);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      reference_fx_rate: "3.70",
      reference_effective_date: "2026-09-01",
      reference_manual_source: "Banco/entidad financiera (documento consultado)",
      reference_reason: "Documento bancario revisado",
    });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it.each([403, 409])("real approval HTTP %s keeps form state without retry or lookup", async (status) => {
    mocks.realApproval = true;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(error(status, "REQUEST_STATE_CONFLICT").body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    openApproval();
    fillManual("3,70");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await screen.findByRole("alert");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(screen.getByLabelText(/Tasa de referencia/)).toHaveValue("3,70");
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("cancels without approval and resets the manual form on reopen", () => {
    openApproval();
    fillManual();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Aprobar$/ }));
    expect(screen.getByLabelText(/Tasa de referencia/)).toHaveValue("");
    expect(screen.getByLabelText(/Fuente manual/)).toHaveValue("");
  });

  it.each(["role", "assignment", "state"])("blocks approval when %s changes while dialog is open", (change) => {
    const view = render(<RequestDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Aprobar$/ }));
    fillManual();
    if (change === "role") mocks.roleCode = "SOLICITANTE_EPE";
    if (change === "assignment") mocks.request.giof_work = { canEdit: false, assignmentState: "OTHER" };
    if (change === "state") mocks.request.status = "APPROVED";
    view.rerender(<RequestDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it.each([null, "MONTHLY_V1"])("does not offer approval to a requester for cohort %s", (cohort) => {
    mocks.roleCode = "SOLICITANTE_EPE";
    mocks.request.fx_policy_version = cohort;
    render(<RequestDetailPage />);
    expect(screen.queryByRole("button", { name: /^Aprobar$/ })).not.toBeInTheDocument();
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("approves explicitly monthly USD without manual FX or a frontend rate default", async () => {
    mocks.request.fx_policy_version = "MONTHLY_V1";
    openApproval();
    expect(screen.queryByRole("button", { name: "Usar referencia manual" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tasa de referencia|Fecha de la tasa|Fuente manual|Justificación/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith("request-1", { comment: undefined }));
  });

  it("directs monthly missing-reference errors to Manager without a manual fallback", async () => {
    mocks.request.fx_policy_version = "MONTHLY_V1";
    mocks.approve.mockRejectedValue(error(400, "MONTHLY_FX_REFERENCE_REQUIRED"));
    openApproval();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Manager configure TC referencial del mes");
    expect(screen.queryByRole("button", { name: "Usar referencia manual" })).not.toBeInTheDocument();
    expect(mocks.approve).toHaveBeenCalledWith("request-1", { comment: undefined });
  });

  it("requires all four manual fields by default for legacy USD without a toggle", () => {
    openApproval();
    expect(screen.queryByRole("button", { name: "Usar referencia manual" })).not.toBeInTheDocument();
    for (const label of [/Tasa de referencia/, /Fecha de la tasa/, /Fuente manual/, /Justificación/]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("sends four manual fields and comment, then refreshes", async () => {
    openApproval();
    fireEvent.change(screen.getByPlaceholderText("Comentario opcional"), {
      target: { value: " Revisado " },
    });
    fillManual("3,70");
    expect(
      screen.getByText(
        /referencia provisional para aprobación; TC final en Cola de Pagos/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith("request-1", {
        comment: "Revisado",
        reference_fx_rate: "3.70",
        reference_effective_date: "2026-09-01",
        reference_manual_source:
          "Banco/entidad financiera (documento consultado)",
        reference_reason: "BCRP no disponible",
      }),
    );
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        expect.objectContaining({ status: "APPROVED" }),
      ),
    );
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.documentsRefetch).toHaveBeenCalledOnce();
    expect(mocks.approve).toHaveBeenCalledOnce();
  });

  it("blocks invalid date and nonpositive rate without POST", () => {
    openApproval();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(mocks.approve).not.toHaveBeenCalled();
    fillManual("0", "2026-02-30");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(mocks.approve).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Tasa de referencia/), {
      target: { value: "3.8" },
    });
    fireEvent.change(screen.getByLabelText(/Fecha de la tasa/), {
      target: { value: "2999-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it.each([
    ["Tasa de referencia", ""],
    ["Fecha de la tasa", ""],
    ["Fuente manual", ""],
    ["Justificación", " "],
  ])("blocks missing %s without POST", (field, value) => {
    openApproval();
    fillManual();
    fireEvent.change(screen.getByLabelText(new RegExp(field)), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("shows unfilled rate guidance and a labelled native date picker limited to today in Lima", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-29T02:00:00Z"));
      openApproval();
      const rate = screen.getByLabelText(
        /Tasa de referencia/,
      ) as HTMLInputElement;
      expect(rate.value).toBe("");
      expect(rate).toHaveAttribute(
        "placeholder",
        "Si 1 dólar equivale a S/ 3,75, escribe 3,75",
      );
      expect(
        screen.getByText(/Si 1 dólar equivale a S\/ 3,75, escribe 3,75/),
      ).toBeInTheDocument();
      const date = screen.getByLabelText(
        /Fecha de la tasa/,
      ) as HTMLInputElement;
      expect(date.type).toBe("date");
      expect(date.max).toBe("2026-09-28");
      expect(date.value).toBe("");
      expect(date).toHaveAttribute("id", "reference-date");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers traceable source choices and requires detail for Otra fuente", async () => {
    openApproval();
    const source = screen.getByLabelText(/Fuente manual/) as HTMLSelectElement;
    expect(source).toHaveAttribute("id", "reference-source");
    expect(Array.from(source.options, (option) => option.textContent)).toEqual([
      "Selecciona la fuente consultada",
      "BCRP/SBS (consulta verificada)",
      "Banco/entidad financiera (documento consultado)",
      "Documento institucional",
      "Otra fuente",
    ]);
    expect(
      screen.getByText(/elige lo que consultaste realmente/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Detalle de la fuente/),
    ).not.toBeInTheDocument();
    fireEvent.change(source, { target: { value: "other" } });
    expect(screen.getByLabelText(/Detalle de la fuente/)).toHaveAttribute(
      "required",
    );
    fireEvent.change(screen.getByLabelText(/Tasa de referencia/), {
      target: { value: "3,75" },
    });
    fireEvent.change(screen.getByLabelText(/Fecha de la tasa/), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText(/Justificación/), {
      target: { value: "Consulta alternativa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    expect(mocks.approve).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Detalle de la fuente/), {
      target: { value: " Boletín interno de tesorería " },
    });
    fireEvent.change(source, { target: { value: "institution" } });
    expect(
      screen.queryByLabelText(/Detalle de la fuente/),
    ).not.toBeInTheDocument();
    fireEvent.change(source, { target: { value: "other" } });
    expect(screen.getByLabelText(/Detalle de la fuente/)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(/Detalle de la fuente/), {
      target: { value: " Boletín interno de tesorería " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith(
        "request-1",
        expect.objectContaining({
          reference_fx_rate: "3.75",
          reference_manual_source: "Otra fuente: Boletín interno de tesorería",
          reference_reason: "Consulta alternativa",
        }),
      ),
    );
  });

  it.each(["3,805", "3.805"])(
    "sends rate %s as a dot-decimal string without rounding",
    async (rate) => {
      openApproval();
      fillManual(rate);
      fireEvent.click(
        screen.getByRole("button", { name: "Aprobar solicitud" }),
      );
      await waitFor(() =>
        expect(mocks.approve).toHaveBeenCalledWith(
          "request-1",
          expect.objectContaining({
            reference_fx_rate: "3.805",
          }),
        ),
      );
    },
  );

  it("keeps the date and source controls keyboard-focusable with accessible names", async () => {
    const user = userEvent.setup();
    openApproval();
    const rate = screen.getByRole("textbox", { name: /Tasa de referencia/ });
    const date = screen.getByLabelText(/Fecha de la tasa/);
    const source = screen.getByRole("combobox", { name: /Fuente manual/ });
    rate.focus();
    await user.tab();
    expect(date).toHaveFocus();
    await user.tab();
    expect(source).toHaveFocus();
    await user.selectOptions(source, "institution");
    expect(source).toHaveValue("institution");
  });

  it.each(["3,5.2", "3,1234567890123", "0"])(
    "blocks malformed rate %s",
    (rate) => {
      openApproval();
      fillManual(rate);
      fireEvent.click(
        screen.getByRole("button", { name: "Aprobar solicitud" }),
      );
      expect(mocks.approve).not.toHaveBeenCalled();
    },
  );

  it.each(["PEN", "USD"])(
    "does not show manual FX for %s settlement or PEN ordinary",
    (currency) => {
      mocks.request.currency = currency;
      mocks.request.request_type =
        currency === "PEN"
          ? REQUEST_TYPE.ADVANCE
          : REQUEST_TYPE.ADVANCE_SETTLEMENT;
      openApproval();
      expect(
        screen.queryByRole("button", { name: "Usar referencia manual" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Tasa de referencia/),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Fuente manual/)).not.toBeInTheDocument();
    },
  );

  it("retains manual fields and comment on missing FX without retry", async () => {
    mocks.approve.mockRejectedValueOnce(error(400, "FX_REFERENCE_REQUIRED"));
    openApproval();
    fillManual();
    fireEvent.change(screen.getByPlaceholderText("Comentario opcional"), {
      target: { value: "Mi revisión" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("Comentario opcional")).toHaveValue(
      "Mi revisión",
    );
    expect(mocks.approve).toHaveBeenCalledOnce();
    expect(mocks.approve).toHaveBeenCalledWith("request-1", expect.objectContaining({
      comment: "Mi revisión",
      reference_fx_rate: "3.805",
    }));
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Tasa de referencia/)).toHaveValue("3.805");
  });

  it("approves PEN without manual fields", async () => {
    mocks.request.currency = "PEN";
    openApproval();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith("request-1", {
        comment: undefined,
      }),
    );
    expect(mocks.approve).toHaveBeenCalledOnce();
  });

  it("prevents duplicate approval during pending POST", async () => {
    let resolveApproval!: (value: unknown) => void;
    mocks.approve.mockReturnValue(
      new Promise((resolve) => {
        resolveApproval = resolve;
      }),
    );
    openApproval();
    fillManual();
    const approveButton = screen.getByRole("button", {
      name: "Aprobar solicitud",
    });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);
    expect(mocks.approve).toHaveBeenCalledOnce();
    resolveApproval({ ...mocks.request, status: "APPROVED" });
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledOnce());
  });

  it.each([
    [400, "INVALID_MANUAL_REFERENCE"],
    [400, "BUDGET_CEILING_EXCEEDED"],
    [409, "REQUEST_STATE_CONFLICT"],
    [403, "GIOF_OPERATION_FORBIDDEN"],
  ])("does not retry or release on %s %s", async (status, code) => {
    mocks.approve.mockRejectedValueOnce(error(status, code));
    openApproval();
    fillManual();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar solicitud" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(mocks.approve).toHaveBeenCalledOnce();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Tasa de referencia/)).toHaveValue("3.805");
  });
});
