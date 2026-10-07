import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequestDocumentsCard } from "@/components/requests/request-documents-card";
import type { useRequestRenditionReport } from "@/hooks/use-requests";
import { api, ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { clearQueryCache, setQueryCacheAuthNamespace } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth-store";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_PURPOSE,
  REQUEST_DOCUMENT_SCOPE_TYPE,
  REQUEST_RECEIPT_TYPE,
  REQUEST_RECEIPT_DUPLICATE_STATUS,
  REQUEST_RECEIPT_OCR_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  REXAN_OUTCOME,
  SUPPLIER_DOCUMENT_ACTIVITY_STATE,
  SUPPLIER_DOCUMENT_ELIGIBILITY_STATE,
  SUPPLIER_DOCUMENT_PROJECTION_REASON,
  SUPPLIER_DOCUMENT_PROJECTION_STATE,
  type PaymentRequest,
  type RequestAllocation,
  type RequestDocument,
  type RequestReceiptReview,
  type RequestRenditionReport,
} from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    documentBlob: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public body: {
        statusCode: number;
        message: string;
        error: string;
        timestamp: string;
        path: string;
      },
    ) {
      super(body.message);
      this.name = "ApiRequestError";
    }
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "req-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.ADVANCE,
    status: REQUEST_STATUS.DRAFT,
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
    submitted_at: null,
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

function makeDocument(
  overrides: Partial<RequestDocument> = {},
): RequestDocument {
  return {
    id: "doc-1",
    payment_request_id: "req-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT,
    safe_filename: "sustento.pdf",
    original_filename: "Sustento.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    sha256_hash: "hash",
    storage_provider: "DRIVE",
    upload_status: "PERMANENT",
    uploaded_by_id: "user-1",
    created_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeAllocation(
  overrides: Partial<RequestAllocation> = {},
): RequestAllocation {
  return {
    id: "alloc-1",
    payment_request_id: "req-1",
    budget_planning_line_id: "line-1",
    amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    budget_month: 1,
    fiscal_year: 2026,
    org_unit_id: "org-1",
    sort_order: 1,
    budgetPlanningLine: null,
    planning_line: {
      id: "line-1",
      line_code: "POA-1",
      resource_description: "Compra de equipos",
      total_cost: 100,
      status: "APPROVED",
      fiscal_year: { id: "fy-1", year: 2026 },
      org_unit: { id: "org-1", code: "UO1", name: "Unidad 1" },
      category: null,
      program: null,
      action: null,
      monthly_summary: [],
    },
    org_unit: { id: "org-1", code: "UO1", name: "Unidad 1" },
    documents: [],
    payment_execution: null,
    ...overrides,
  };
}

function makeReceiptReview(
  overrides: Partial<RequestReceiptReview> = {},
): RequestReceiptReview {
  return {
    receipt: {
      id: "receipt-1",
      request_id: "req-1",
      request_allocation_id: null,
      document_id: "doc-1",
      receipt_type: "INVOICE",
      issuer_document_type: "RUC",
      issuer_document_number: "20123456789",
      issuer_name: "Proveedor SAC",
      series: "F001",
      number: "123",
      issue_date: "2026-05-01",
      amount: 150.5,
      currency: REQUEST_CURRENCY.PEN,
      duplicate_status: REQUEST_RECEIPT_DUPLICATE_STATUS.UNIQUE,
      ocr_status: REQUEST_RECEIPT_OCR_STATUS.SUCCESS,
      corrected_fields: null,
      confirmed_by_id: null,
      confirmed_at: null,
    },
    latest_extraction: {
      id: "ocr-1",
      provider: "LOCAL",
      status: REQUEST_RECEIPT_OCR_STATUS.SUCCESS,
      confidence: 0.92,
      error_message: null,
      extracted_fields: null,
      created_at: "2026-05-01T10:00:00.000Z",
      updated_at: "2026-05-01T10:00:00.000Z",
    },
    duplicate_candidates: [],
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function makeTagReportResource(
  overrides: Partial<ReturnType<typeof useRequestRenditionReport>> = {},
): ReturnType<typeof useRequestRenditionReport> {
  const report: RequestRenditionReport = {
    id: "report-1", request_id: "req-1", status: "DRAFT", currency: "PEN",
    total_amount: 0, settlement_report_document_id: null,
    drive_sync_status: "PENDING", drive_sync_error: null,
    submitted_at: null, exported_at: null, rows: [], allocation_coverage: [],
    totals: { total_amount: 0, by_allocation: [], missing_allocations: [] },
  };
  return {
    report, data: report, isInitialLoading: false, isLoading: false,
    isRefreshing: false, error: null, refetch: vi.fn().mockResolvedValue(undefined),
    refetchOrThrow: vi.fn().mockResolvedValue(undefined), replaceReport: vi.fn(),
    upsertReportRow: vi.fn(), removeReportRow: vi.fn(), ...overrides,
  };
}

function makeUploadError(
  status: number,
  message: string,
  code?: string,
): ApiRequestError {
  return new ApiRequestError(status, {
    statusCode: status,
    message,
    error: status >= 500 ? "Internal Server Error" : "Too Many Requests",
    timestamp: "2026-05-01T10:00:00.000Z",
    path: "/requests/req-1/documents",
    ...(code ? { code } : {}),
  } as ConstructorParameters<typeof ApiRequestError>[1] & { code?: string });
}

describe("RequestDocumentsCard", () => {
  it("keeps ordinary source View separate from the authorized candidate action", async () => {
    const currentUser = useAuthStore.getState().user!;
    useAuthStore.setState({
      user: {
        ...currentUser,
        role: { code: ROLE_CODE.GIOF_GESTOR, name: "GIOF" },
      },
    });
    const candidateReview = makeReceiptReview({
      candidate_open_snapshot: "a".repeat(64),
      duplicate_candidates: [{
        receipt_id: "prior-receipt",
        request_id: "prior-request",
        document_id: "prior-document",
        issuer_document_number: null,
        series: null,
        number: null,
        issue_date: null,
        amount: null,
      }],
    });
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === "/requests/req-1/receipts" ? [candidateReview] : [],
    );
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })}
        readOnly
        documents={[makeDocument({
          document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          drive_web_url: "https://drive.google.com/file/d/source/view",
        })]}
      />,
    );
    expect(await screen.findByRole("button", {
      name: "Ver comprobante candidato",
    })).toBeInTheDocument();
    const ordinaryView = screen.getByRole("link", {
      name: /Ver documento Sustento.pdf/,
    });
    expect(ordinaryView).toHaveAttribute(
      "href", "https://drive.google.com/file/d/source/view",
    );
    expect(screen.getAllByRole("link").some((link) =>
      link.getAttribute("href")?.includes("prior-document"),
    )).toBe(false);
    expect(api.documentBlob).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "shows stable backend provenance without changing actions in readOnly=%s",
    async (readOnly) => {
      vi.mocked(api.get).mockResolvedValue([]);
      const storedDocument = makeDocument({
        provenance_label: "Agregado por GIOF",
        provenance_origin: "HUMAN",
        drive_web_url: "https://drive.google.com/file/d/example/view",
        metadata_json: { provenance_label: "Forged label" },
      });
      const { rerender, container } = render(
        <RequestDocumentsCard
          request={makeRequest()}
          readOnly={readOnly}
          documents={[storedDocument]}
        />,
      );
      expect(await screen.findByText("Agregado por GIOF")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Ver documento Sustento.pdf/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Eliminar Sustento.pdf" }) !==
          null,
      ).toBe(!readOnly);
      rerender(
        <RequestDocumentsCard
          request={makeRequest()}
          readOnly={readOnly}
          documents={[
            {
              ...storedDocument,
              uploaded_by_id: "private-refetched-actor",
              metadata_json: { provenance_label: "Another forged label" },
            },
          ]}
        />,
      );
      expect(screen.getByText("Agregado por GIOF")).toBeInTheDocument();
      expect(screen.queryByText(/forged label/i)).not.toBeInTheDocument();
      expect(container.innerHTML).not.toContain("private-refetched-actor");
    },
  );
  it.each([REQUEST_TYPE.ADVANCE, REQUEST_TYPE.REIMBURSEMENT, REQUEST_TYPE.ADVANCE_SETTLEMENT])("prompts for each generic OTHER file and sends independent titles in %s", async (requestType) => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockImplementation(async (_url, body) => makeDocument({ id: crypto.randomUUID(), document_category: REQUEST_DOCUMENT_CATEGORY.OTHER, original_filename: (body as FormData).get("file") instanceof File ? ((body as FormData).get("file") as File).name : "fallback.pdf" }));
    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: requestType })} />);
    if (requestType === REQUEST_TYPE.ADVANCE_SETTLEMENT) await user.click(screen.getByRole("combobox", { name: /categoría/i }));
    if (requestType === REQUEST_TYPE.ADVANCE_SETTLEMENT) await user.click(screen.getByRole("option", { name: /otro documento/i }));
    else await user.click(screen.getByRole("button", { name: /otros documentos ·/i }));
    fireEvent.change(screen.getByLabelText(/^archivo$/i), { target: { files: [new File(["a"], "uno.pdf", { type: "application/pdf" }), new File(["b"], "dos.pdf", { type: "application/pdf" })] } });
    await user.type(screen.getByRole("textbox", { name: /título.*uno.pdf/i }), "Primer informe");
    await user.type(screen.getByRole("textbox", { name: /título.*dos.pdf/i }), "Segundo informe");
    await user.click(screen.getByRole("button", { name: /agregar.*cola/i }));
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.postForm).mock.calls.map((call) => (call[1] as FormData).get("display_name"))).toEqual(["Primer informe", "Segundo informe"]);
  });

  it("allows blank OTHER title and blocks invalid explicit title inline before enqueue", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest()} />);
    await user.click(screen.getByRole("button", { name: /otros documentos ·/i }));
    fireEvent.change(screen.getByLabelText(/^archivo$/i), { target: { files: [new File(["a"], "anexo.pdf", { type: "application/pdf" })] } });
    const title = screen.getByRole("textbox", { name: /título.*anexo.pdf/i });
    await user.type(title, "../inseguro");
    expect(screen.getByRole("alert")).toHaveTextContent(/no incluyas/i);
    await user.click(screen.getByRole("button", { name: /agregar.*cola/i }));
    expect(title).toHaveFocus();
    await user.clear(title);
    await user.type(title, "   ");
    expect(screen.getByRole("button", { name: /agregar.*cola/i })).toBeEnabled();
  });
  it("uploads supplier OTHER with no title and retains server provenance on display", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const uploaded = makeDocument({
      id: "supplier-other-blank", document_category: REQUEST_DOCUMENT_CATEGORY.OTHER,
      original_filename: "origen.pdf", metadata_json: { supplier_document_v2: {
        display_name: "origen", display_filename: "origen.pdf", title_source: "ORIGINAL_FILENAME", original_filename: "origen.pdf",
      } },
    });
    vi.mocked(api.postForm).mockResolvedValue(uploaded);
    const user = userEvent.setup();
    const request = makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT });
    const { rerender } = render(<RequestDocumentsCard request={request} />);
    fireEvent.change(screen.getByLabelText("Archivo de Otros documentos"), { target: { files: [new File(["a"], "origen.pdf", { type: "application/pdf" })] } });
    await user.click(screen.getByRole("button", { name: "Adjuntar Otros documentos" }));
    await waitFor(() => expect(api.postForm).toHaveBeenCalled());
    expect((vi.mocked(api.postForm).mock.calls[0][1] as FormData).has("display_name")).toBe(false);
    rerender(<RequestDocumentsCard request={request} documents={[uploaded]} />);
    expect(screen.getByText("origen.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Nombre del archivo original · Archivo original: origen.pdf/)).toBeInTheDocument();
  });
  it("renders non-supplier OTHER business title and original provenance without enabling read-only actions", () => {
    render(<RequestDocumentsCard request={makeRequest()} readOnly documents={[makeDocument({
      document_category: REQUEST_DOCUMENT_CATEGORY.OTHER,
      original_filename: "evidencia-original.pdf",
      metadata_json: { request_other_document_v1: {
        title_source: "CUSTOM", display_name: "Informe de campo", display_filename: "Informe de campo.pdf", original_filename: "evidencia-original.pdf",
      } },
    })]} />);
    expect(screen.getByText("Informe de campo.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Nombre personalizado · Archivo original: evidencia-original.pdf/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });
  it.each([REQUEST_TYPE.SUPPLIER_PAYMENT, REQUEST_TYPE.ADVANCE_SETTLEMENT])(
    "hides path provenance in %s history, link, delete and confirmation names",
    async (requestType) => {
      vi.mocked(api.get).mockResolvedValue([]);
      const raw = "C:\\private\\case\\Informe año.pdf";
      render(
        <RequestDocumentsCard
          request={makeRequest({ request_type: requestType })}
          documents={[
            makeDocument({
              document_category: REQUEST_DOCUMENT_CATEGORY.OTHER,
              original_filename: raw,
              drive_web_url: "https://drive.google.com/file/d/example/view",
              metadata_json: {
                supplier_document_v2: {
                  title_source: "ORIGINAL_FILENAME",
                  display_filename: raw,
                  original_filename: raw,
                },
              },
            }),
          ]}
        />,
      );
      expect(screen.getByText("Informe año.pdf")).toBeInTheDocument();
      expect(
        screen.getByText(/Archivo original: Informe año.pdf/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Ver documento Informe año.pdf/ }),
      ).toBeInTheDocument();
      const deleteButton = screen.getByRole("button", {
        name: "Eliminar Informe año.pdf",
      });
      await userEvent.click(deleteButton);
      expect(screen.getByRole("dialog")).toHaveTextContent("Informe año.pdf");
      expect(screen.getByRole("dialog")).not.toHaveTextContent("private");
      expect(document.body.textContent).not.toContain("private");
      expect(document.body.innerHTML).not.toContain("private");
    },
  );
  it("keeps historical unnamed OTHER safe without synthesizing a second extension", () => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(
      <RequestDocumentsCard
        request={makeRequest()}
        readOnly
        documents={[
          makeDocument({
            document_category: REQUEST_DOCUMENT_CATEGORY.OTHER,
            original_filename: "/audit/Informe año.pdf",
            drive_web_url: "https://drive.google.com/file/d/example/view",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Informe año.pdf")).toBeInTheDocument();
    expect(screen.getByText("Nombre personalizado no registrado")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver documento Informe año.pdf/ }),
    ).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("/audit/");
    expect(document.body.textContent).not.toContain("Informe año.pdf.pdf");
  });
  let queryCacheSession = 0;
  it.each([
    { requestType: REQUEST_TYPE.ADVANCE, readOnly: false },
    { requestType: REQUEST_TYPE.ADVANCE, readOnly: true },
    { requestType: REQUEST_TYPE.SUPPLIER_PAYMENT, readOnly: false },
    { requestType: REQUEST_TYPE.SUPPLIER_PAYMENT, readOnly: true },
    { requestType: REQUEST_TYPE.REIMBURSEMENT, readOnly: false },
    { requestType: REQUEST_TYPE.REIMBURSEMENT, readOnly: true },
  ])(
    "uses the $requestType allocation document wording in readOnly=$readOnly",
    async ({ requestType, readOnly }) => {
      vi.mocked(api.get).mockResolvedValue([]);
      const documents =
        requestType === REQUEST_TYPE.SUPPLIER_PAYMENT
          ? [
              makeDocument({
                document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
              }),
            ]
          : [];

      render(
        <RequestDocumentsCard
          request={makeRequest({
            request_type: requestType,
            allocations: [makeAllocation()],
            uit_year_applied: 2026,
            uit_amount_applied: "5500.00",
          })}
          documents={documents}
          readOnly={readOnly}
        />,
      );

      expect(
        await screen.findByTestId("allocation-documents-groups"),
      ).toBeInTheDocument();
      if (requestType === REQUEST_TYPE.ADVANCE) {
        expect(
          screen.getByText(/Esta solicitud requiere un único PXQ activo/),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Un único PXQ activo asociado a la solicitud/),
        ).toBeInTheDocument();
        expect(screen.getByText("PXQ")).toBeInTheDocument();
        return;
      }

      expect(
        screen.getByText(
          "Los documentos asociados a cada línea POA son opcionales en esta etapa.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/Esta solicitud requiere un único PXQ activo/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Un único PXQ activo asociado a la solicitud/),
      ).not.toBeInTheDocument();
      if (requestType === REQUEST_TYPE.SUPPLIER_PAYMENT) {
        expect(screen.getByText("Documento principal")).toBeInTheDocument();
        expect(screen.getByText("Contrato o convenio")).toBeInTheDocument();
        expect(screen.queryByText(/RUS:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Casa de Retiro:/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
      } else {
        expect(
          screen.getByText("Comprobante real vinculado"),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/No requiere PXQ ni éxito de OCR/),
        ).toBeInTheDocument();
        expect(screen.queryByText("PXQ")).not.toBeInTheDocument();
      }
    },
  );

  it.each([false, true])(
    "keeps ADVANCE_SETTLEMENT structured allocation guidance in readOnly=%s",
    async (readOnly) => {
      vi.mocked(api.get).mockResolvedValue([]);

      render(
        <RequestDocumentsCard
          request={makeRequest({
            request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
            allocations: [makeAllocation()],
          })}
          documents={[]}
          readOnly={readOnly}
        />,
      );

      expect(
        await screen.findByText(
          /En esta rendición no debes volver a adjuntar los Excel PxQ del anticipo/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Comprobantes por línea POA"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Constancias de devolución por línea POA"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("allocation-documents-groups"),
      ).not.toBeInTheDocument();
    },
  );

  it.each(["PEN", "USD"] as const)(
    "shows nonblocking supplier contract guidance in %s with independent primary evidence",
    async (currency) => {
      vi.mocked(api.get).mockResolvedValue([]);
      render(
        <RequestDocumentsCard
          request={makeRequest({
            request_type: REQUEST_TYPE.SUPPLIER_PAYMENT,
            currency,
            requested_amount: 2500.01,
            uit_year_applied: 2026,
            uit_amount_applied: "5000.00",
            declares_rus: false,
            declares_casa_de_retiro: null,
          })}
          documents={[makeDocument({ document_category: "INVOICE" })]}
        />,
      );
      expect(
        screen.queryByText(
          "Falta un documento primario elegible del proveedor.",
        ),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/RUS:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Casa de Retiro:/)).not.toBeInTheDocument();
      if (currency === "USD") {
        expect(
          screen.getByText(
            "Opcional para solicitudes en dólares. El umbral de ½ UIT solo se aplica a solicitudes en soles.",
          ),
        ).toBeInTheDocument();
        expect(
          screen.queryByText(/recomendable adjuntar un contrato/i),
        ).not.toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalledWith(
          expect.stringMatching(/fx-reference|annual-uit/),
        );
      } else {
        const warning = screen.getByRole("status", {
          name: "Recomendación de contrato",
        });
        expect(warning).toHaveTextContent(
          /alcanza o supera ½ UIT.*recomendable adjuntar un contrato/i,
        );
        expect(warning).toHaveClass("border-amber-500/50");
      }
      expect(
        screen.getByTestId("supplier-category-CONTRACT"),
      ).toHaveTextContent(
        currency === "USD"
          ? "Opcional para solicitudes en dólares"
          : "no es obligatorio para continuar",
      );
    },
  );
  it("omits the warning for missing PEN UIT", async () => {
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === "/requests/lookups/annual-uit/2026"
        ? { year: 2026, annual_uit: null }
        : [],
    );
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        documents={[makeDocument({ document_category: "INVOICE" })]}
      />,
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/requests/lookups/annual-uit/2026",
        expect.any(Object),
      ),
    );
    expect(
      screen.queryByRole("status", { name: "Recomendación de contrato" }),
    ).not.toBeInTheDocument();
  });
  it("suppresses the threshold warning and shows attached state when a contract PDF exists", () => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.SUPPLIER_PAYMENT,
          requested_amount: 2500,
          uit_year_applied: 2026,
          uit_amount_applied: "5000.00",
        })}
        documents={[
          makeDocument({ document_category: "INVOICE" }),
          makeDocument({
            id: "c",
            document_category: "CONTRACT",
            original_filename: "contrato.pdf",
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole("status", { name: "Recomendación de contrato" }),
    ).not.toBeInTheDocument();
    const contractCard = screen.getByTestId("supplier-category-CONTRACT");
    expect(within(contractCard).getByText("Contrato o convenio")).toBeVisible();
    expect(within(contractCard).getByText("contrato.pdf")).toBeVisible();
    expect(contractCard).not.toHaveTextContent(/recomendable adjuntar/i);
  });
  it("shows an actionable lookup error without reporting UIT as not configured", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/lookups/annual-uit/2026")
        throw makeUploadError(403, "Forbidden");
      return [];
    });
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        documents={[makeDocument({ document_category: "INVOICE" })]}
      />,
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/requests/lookups/annual-uit/2026",
        expect.any(Object),
      ),
    );
    expect(
      screen.queryByRole("status", { name: "Recomendación de contrato" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Volver a consultar UIT" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/UIT no configurada para el año de la solicitud/),
    ).not.toBeInTheDocument();
  });
  it("shows lookup loading without reporting UIT as not configured", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/lookups/annual-uit/2026") {
        return new Promise(() => undefined);
      }
      return [];
    });
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        documents={[makeDocument({ document_category: "INVOICE" })]}
      />,
    );
    expect(
      screen.queryByRole("status", { name: "Recomendación de contrato" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/UIT no configurada para el año de la solicitud/),
    ).not.toBeInTheDocument();
  });
  it("allows a linked reimbursement receipt without OCR success or confirmation and without PXQ", async () => {
    const receipt = makeReceiptReview();
    receipt.receipt.ocr_status = "FAILED";
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === "/requests/req-1/receipts" ? [receipt] : [],
    );
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })}
        documents={[makeDocument({ document_category: "RECEIPT" })]}
      />,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: /adjuntar comprobante real vinculado/i,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/seleccionar pxq/i)).not.toBeInTheDocument();
  });
  it("characterizes one request-wide PXQ across two POA lines without requiring a second PXQ", () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const first = makeAllocation();
    const second = makeAllocation({
      id: "alloc-2",
      budget_planning_line_id: "line-2",
      sort_order: 2,
    });
    render(
      <RequestDocumentsCard
        request={makeRequest({ allocations: [first, second] })}
        documents={[
          makeDocument({
            id: "pxq-on-first-line",
            document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
            request_allocation_id: first.id,
            scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
          }),
        ]}
      />,
    );

    expect(screen.getAllByTestId("allocation-documents-group")).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", { name: /Adjuntar PXQ/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/no se requiere uno por línea/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Sustento.pdf")).toBeInTheDocument();
  });

  it("characterizes supplier 4+7 cards and historical OTHER display in read-only mode", () => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        readOnly
        documents={[
          makeDocument({
            document_category: REQUEST_DOCUMENT_CATEGORY.OTHER,
            original_filename: "anexo-historico.pdf",
            drive_web_url: "https://drive.google.com/file/d/example/view",
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("supplier-primary-grid").children).toHaveLength(
      4,
    );
    expect(
      screen.getByTestId("supplier-complementary-grid").children,
    ).toHaveLength(7);
    expect(screen.getByText("anexo-historico.pdf")).toBeInTheDocument();
    expect(
      screen.getByText("Nombre personalizado no registrado"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver documento anexo-historico.pdf/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Eliminar anexo-historico/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Archivo de Otros documentos"),
    ).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    queryCacheSession += 1;
    setQueryCacheAuthNamespace(`request-documents-${queryCacheSession}`);
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      configurable: true,
    });
    useAuthStore.setState({
      user: {
        id: "user-1",
        firstName: "Ana",
        lastName: "Solicitante",
        email: "ana@example.com",
        documentNumber: "12345678",
        onboardingCompleted: true,
        authSource: "LOCAL",
        role: { code: ROLE_CODE.SOLICITANTE_EPE, name: "Solicitante EPE" },
      },
      accessToken: "token",
      isLoading: false,
    });
  });

  it("individual POA tagging uses all settlement UUID options and reconciles the real PATCH without uploading", async () => {
    const user = userEvent.setup();
    const document = makeDocument({ document_category: "RECEIPT", scope_type: "REQUEST" });
    let review = makeReceiptReview();
    const allocations = Array.from({ length: 9 }, (_, index) => makeAllocation({
      id: `00000000-0000-4000-8000-00000000000${index}`, budget_month: index + 1,
    }));
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === "/requests/req-1/receipts" ? [review] : [document],
    );
    vi.mocked(api.patch).mockImplementation(async () => {
      review = { ...review, receipt: { ...review.receipt, request_allocation_id: allocations[8].id! } };
      return review;
    });
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations })}
      guidanceAllocations={[makeAllocation({ id: "advance-guidance-id" })]} reportResource={makeTagReportResource()} />);
    const selector = await screen.findByRole("combobox", { name: "POA de Sustento.pdf" });
    await waitFor(() => expect(selector).toBeEnabled());
    await user.click(selector);
    expect(screen.getAllByRole("option")).toHaveLength(9);
    expect(screen.getByRole("option", { name: /Línea 9: POA-1.*Mes: 9/ })).toBeInTheDocument();
    expect(screen.queryByText(/advance-guidance-id/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Línea 9:/ }));
    await user.click(screen.getByRole("button", { name: "Guardar POA de Sustento.pdf" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/requests/req-1/receipts/receipt-1", { request_allocation_id: allocations[8].id },
      { signal: expect.any(AbortSignal) },
    ));
    await waitFor(() => expect(screen.getAllByTestId("settlement-receipt-group")[8]).toHaveTextContent("Sustento.pdf"));
    expect(api.post).not.toHaveBeenCalled();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it.each([403, 409, 500])("individual POA tagging retains the upload and old group on PATCH %s", async (status) => {
    const user = userEvent.setup();
    const review = makeReceiptReview();
    review.receipt.request_allocation_id = "alloc-1";
    const document = makeDocument({ document_category: "RECEIPT", scope_type: "REQUEST" });
    vi.mocked(api.get).mockImplementation(async (path) => path.endsWith("/receipts") ? [review] : [document]);
    vi.mocked(api.patch).mockRejectedValue(makeUploadError(status, "La POA no pertenece a esta rendición"));
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [makeAllocation(), makeAllocation({ id: "alloc-2" })] })}
      reportResource={makeTagReportResource()} />);
    const selector = await screen.findByRole("combobox", { name: "POA de Sustento.pdf" });
    await waitFor(() => expect(selector).toBeEnabled());
    await user.click(selector);
    await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
    await user.click(screen.getByRole("button", { name: "Guardar POA de Sustento.pdf" }));
    expect(await screen.findByText(status === 403
      ? "No tienes permiso para realizar esta acción o tu asignación ya no está vigente."
      : "La POA no pertenece a esta rendición")).toBeInTheDocument();
    expect(screen.getAllByTestId("settlement-receipt-group")[0]).toHaveTextContent("Sustento.pdf");
    expect(screen.getAllByTestId("settlement-receipt-group")[1]).not.toHaveTextContent("Sustento.pdf");
    expect(api.postForm).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(["missing", "pending", "processing-extraction", "included-receipt", "included-document", "legacy", "readonly", "unknown-report", "report-error", "paid", "exported", "currency", "unauthorized"])(
    "individual POA tagging blocks %s without a mutation", async (guard) => {
      const review = makeReceiptReview();
      const document = makeDocument({ document_category: "RECEIPT", scope_type: "REQUEST" });
      const resource = makeTagReportResource();
      if (guard === "pending") review.receipt.ocr_status = "PENDING";
      if (guard === "processing-extraction") review.latest_extraction!.status = "PROCESSING";
      if (guard === "legacy") document.request_allocation_id = "alloc-1";
      if (guard === "currency") review.receipt.currency = "USD";
      if (guard === "unknown-report") resource.report = null;
      if (guard === "report-error") resource.error = new Error("Informe no disponible");
      if (guard === "exported") resource.report!.status = "EXPORTED";
      if (guard.startsWith("included")) resource.report!.rows = [{
        request_document_id: guard === "included-document" ? document.id : "other-document",
        request_receipt_id: guard === "included-receipt" ? review.receipt.id : null,
      } as RequestRenditionReport["rows"][number]];
      if (guard === "unauthorized") useAuthStore.setState({ user: null });
      vi.mocked(api.get).mockImplementation(async (path) => path.endsWith("/receipts") ? guard === "missing" ? [] : [review] : [document]);
      render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, status: guard === "paid" ? REQUEST_STATUS.PAID : REQUEST_STATUS.DRAFT, allocations: [makeAllocation()] })}
        readOnly={guard === "readonly"} reportResource={resource} />);
      await screen.findByText("Sustento.pdf");
      await waitFor(() => expect(screen.queryByRole("combobox", { name: "POA de Sustento.pdf" })).not.toBeInTheDocument());
      expect(api.patch).not.toHaveBeenCalled();
      expect(api.postForm).not.toHaveBeenCalled();
    },
  );

  it("ejecuta un reintento OCR real una sola vez y muestra el resultado terminal", async () => {
    const failed = makeReceiptReview();
    failed.receipt.ocr_status = REQUEST_RECEIPT_OCR_STATUS.FAILED;
    failed.latest_extraction = failed.latest_extraction
      ? {
          ...failed.latest_extraction,
          status: REQUEST_RECEIPT_OCR_STATUS.FAILED,
          error_message: "TIMEOUT: OCR command timed out",
        }
      : null;
    const reviewed = makeReceiptReview();
    reviewed.receipt.ocr_status = REQUEST_RECEIPT_OCR_STATUS.REQUIRES_REVIEW;
    reviewed.retry_execution = "SYNCHRONOUS";
    reviewed.retry_outcome = "REQUIRES_REVIEW";
    useAuthStore.setState({
      user: {
        id: "admin-1",
        firstName: "Ada",
        lastName: "Admin",
        email: "admin@example.com",
        documentNumber: "00000000",
        onboardingCompleted: true,
        authSource: "LOCAL",
        role: { code: ROLE_CODE.ADMIN_SISTEMA, name: "Admin" },
      },
      accessToken: "token",
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === "/requests/req-1/receipts" ? [failed] : [],
    );
    vi.mocked(api.post).mockResolvedValueOnce(reviewed);

    render(
      <RequestDocumentsCard
        request={makeRequest()}
        documents={[
          makeDocument({
            document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
          }),
        ]}
      />,
    );
    const retry = await screen.findByRole("button", {
      name: "Reintentar lectura",
    });
    await userEvent.click(retry);

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      "/requests/req-1/receipts/receipt-1/retry-ocr",
      {},
    );
    expect(await screen.findByText("Requiere revisión")).toBeInTheDocument();
  });

  it("distingue recargar estado de reintentar OCR", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network"));
    render(<RequestDocumentsCard request={makeRequest()} documents={[]} />);

    expect(
      await screen.findByRole("button", { name: "Volver a cargar estado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reintentar lectura" }),
    ).not.toBeInTheDocument();
  });

  it("muestra el timeout terminal devuelto por el contrato de reintento", async () => {
    const failed = makeReceiptReview();
    failed.receipt.ocr_status = REQUEST_RECEIPT_OCR_STATUS.FAILED;
    const timedOut = makeReceiptReview();
    timedOut.receipt.ocr_status = REQUEST_RECEIPT_OCR_STATUS.FAILED;
    timedOut.retry_execution = "SYNCHRONOUS";
    timedOut.retry_outcome = "FAILED";
    timedOut.retry_reason = "OCR_TIMEOUT";
    useAuthStore.setState({
      user: {
        id: "admin-1",
        firstName: "Ada",
        lastName: "Admin",
        email: "admin@example.com",
        documentNumber: "00000000",
        onboardingCompleted: true,
        authSource: "LOCAL",
        role: { code: ROLE_CODE.ADMIN_SISTEMA, name: "Admin" },
      },
      accessToken: "token",
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === "/requests/req-1/receipts" ? [failed] : [],
    );
    vi.mocked(api.post).mockResolvedValueOnce(timedOut);

    render(
      <RequestDocumentsCard
        request={makeRequest()}
        documents={[
          makeDocument({
            document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
          }),
        ]}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Reintentar lectura" }),
    );
    expect(await screen.findByText(/tiempo límite/i)).toBeInTheDocument();
  });

  it("renderiza documentos existentes y permite eliminarlos cuando la solicitud es editable", async () => {
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === "/requests/req-1/documents" ? [makeDocument()] : [],
    );
    vi.mocked(api.delete).mockResolvedValue(undefined);

    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Sustento de solicitud").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Proveedor: Google Drive")).toBeInTheDocument();
    expect(screen.getByText("Estado: Guardado")).toBeInTheDocument();
    expect(screen.getByText("Enlace no disponible")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /eliminar documento/i }),
    );

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(
        "/requests/req-1/documents/doc-1",
      );
    });
  }, 10_000);

  it("notifica cambios al eliminar un documento para refrescar recursos relacionados", async () => {
    const onDocumentsChanged = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.delete).mockResolvedValue(undefined);

    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [makeAllocation()],
        })}
        documents={[
          makeDocument({
            document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          }),
        ]}
        onDocumentsChanged={onDocumentsChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /eliminar documento/i }),
    );

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(
        "/requests/req-1/documents/doc-1",
      );
      expect(onDocumentsChanged).toHaveBeenCalled();
    });
  });

  it("oculta acciones de documentos y revisión OCR cuando el informe generado está bloqueado", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce([
        makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT }),
      ])
      .mockResolvedValueOnce([makeReceiptReview()]);

    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [makeAllocation()],
        })}
        structuredReportLocked
      />,
    );

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(
        /El informe generado bloquea la carga, eliminación y revisión de comprobantes/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Adjuntar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Eliminar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Revisar datos/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Confirmar datos/i }),
    ).not.toBeInTheDocument();
  });

  it("reabre acciones de comprobantes y evita constancia global cuando la rendición estructurada está observada", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce([
        makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT }),
      ])
      .mockResolvedValueOnce([makeReceiptReview()]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({
        id: "return-proof-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        original_filename: "constancia-devolucion.pdf",
      }),
    );

    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          status: REQUEST_STATUS.OBSERVED,
          rexan_outcome: REXAN_OUTCOME.DEVOLUCION,
          rexan_return_proof_document_id: null,
          allocations: [makeAllocation()],
          observations: [
            {
              id: "obs-1",
              payment_request_id: "req-1",
              observer_id: "giof-1",
              field_reference: "Constancia de devolución",
              comment:
                "Por favor adjunta la constancia de devolución por S/ 20.00 para continuar.",
              is_resolved: false,
              resolved_at: null,
              created_at: "2026-05-01T10:00:00.000Z",
              updated_at: "2026-05-01T10:00:00.000Z",
            },
          ],
        })}
        structuredReportLocked
      />,
    );

    expect(
      await screen.findByText("Comprobantes por línea POA"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Constancia de devolución"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /La rendición fue observada; puedes actualizar sustentos y regenerar el informe antes de reenviar/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Revisar datos/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Confirmar datos/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /^Adjuntar$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /El informe generado bloquea la carga, eliminación y revisión de comprobantes/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("muestra un enlace visible de Drive para revisores GIOF sin habilitar acciones de edición", async () => {
    const driveWebUrl = "https://drive.google.com/file/d/doc-1/view";
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({ drive_web_url: driveWebUrl }),
    ]);
    useAuthStore.setState({
      user: {
        id: "giof-1",
        firstName: "Gina",
        lastName: "Gestora",
        email: "gina@example.com",
        documentNumber: "87654321",
        onboardingCompleted: true,
        authSource: "LOCAL",
        role: { code: ROLE_CODE.GIOF_GESTOR, name: "GIOF Gestor" },
      },
      accessToken: "token",
      isLoading: false,
    });

    render(
      <RequestDocumentsCard
        request={makeRequest({ status: REQUEST_STATUS.SUBMITTED })}
      />,
    );

    const link = await screen.findByRole("link", { name: /ver documento/i });
    expect(link).toHaveAttribute("href", driveWebUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.queryByRole("button", { name: /adjuntar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /eliminar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no se muestran enlaces de drive/i),
    ).not.toBeInTheDocument();
  });

  it("mantiene a GIOF solo en lectura para una REXAN observada", async () => {
    const driveWebUrl = "https://drive.google.com/file/d/doc-1/view";
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({ drive_web_url: driveWebUrl }),
    ]);
    useAuthStore.setState({
      user: {
        id: "giof-1",
        firstName: "Gina",
        lastName: "Gestora",
        email: "gina@example.com",
        documentNumber: "87654321",
        onboardingCompleted: true,
        authSource: "LOCAL",
        role: { code: ROLE_CODE.GIOF_GESTOR, name: "GIOF Gestor" },
      },
      accessToken: "token",
      isLoading: false,
    });

    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          status: REQUEST_STATUS.OBSERVED,
        })}
      />,
    );

    expect(
      await screen.findByRole("link", { name: /ver documento/i }),
    ).toHaveAttribute("href", driveWebUrl);
    expect(
      screen.queryByRole("button", { name: /adjuntar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /eliminar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /GIOF solo puede revisar los documentos de una rendición observada/i,
      ),
    ).toBeInTheDocument();
  });

  it("explica que los documentos compartidos pueden abrirse cuando el acceso fue habilitado", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(
      await screen.findByText(/podrás abrir los documentos compartidos/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cuando el acceso haya sido habilitado/i),
    ).toBeInTheDocument();
  });

  it("muestra una indicación no intrusiva cuando el documento no tiene enlace", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        documents={[
          makeDocument({
            document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
            drive_web_url: null,
          }),
        ]}
      />,
    );

    expect(await screen.findByText("Enlace no disponible")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /ver documento/i }),
    ).not.toBeInTheDocument();
  });

  it("sube un archivo válido usando multipart", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({ id: "doc-2", original_filename: "nuevo.pdf" }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const file = new File(["contenido"], "nuevo.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith(
        "/requests/req-1/documents",
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT,
    );
    expect(
      await screen.findByText("1 documento adjuntado correctamente."),
    ).toBeInTheDocument();
  });

  it("suppresses the internal supplier-evidence GET when the resource is controlled", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const retry = vi.fn().mockResolvedValue(undefined);
    const commitEvidence = vi.fn();

    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        supplierEvidenceResource={
          {
            evidence: null,
            data: null,
            isInitialLoading: false,
            isRefreshing: false,
            isLoading: false,
            isBlocking: true,
            error: null,
            retry,
            refetch: retry,
            commitEvidence,
          } as never
        }
      />,
    );

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalledWith(
      "/requests/req-1/document-evidence",
      expect.anything(),
    );
    expect(
      vi
        .mocked(api.get)
        .mock.calls.some(
          ([path]) => path === "/requests/req-1/document-evidence",
        ),
    ).toBe(false);
  });

  it("shows the blocking evidence message and retries until authoritative success", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const commitEvidence = vi.fn();
    const resource = {
      evidence: null,
      data: null,
      isInitialLoading: false,
      isRefreshing: false,
      isLoading: false,
      isBlocking: true,
      error: new Error("network unavailable"),
      retry,
      refetch: retry,
      commitEvidence,
    };
    const { rerender } = render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        supplierEvidenceResource={resource as never}
      />,
    );

    const message = screen.getByText(
      "No pudimos confirmar el estado de tus documentos. Reintenta para continuar.",
    );
    expect(message.closest('[role="alert"]')).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);

    const readyEvidence = {
      state: SUPPLIER_DOCUMENT_PROJECTION_STATE.READY,
      eligible: true,
      primary_satisfied: true,
      reason_code: null,
      allowed_categories: [REQUEST_DOCUMENT_CATEGORY.INVOICE],
      documents: [],
    } as const;
    rerender(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        supplierEvidenceResource={
          {
            ...resource,
            evidence: readyEvidence,
            data: readyEvidence,
            isBlocking: false,
            error: null,
          } as never
        }
      />,
    );
    expect(
      screen.queryByText(
        "No pudimos confirmar el estado de tus documentos. Reintenta para continuar.",
      ),
    ).not.toBeInTheDocument();
  });

  it("refetches controlled supplier evidence after delete", async () => {
    const refreshEvidence = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.delete).mockResolvedValue(undefined);
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        documents={[
          makeDocument({
            document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
            document_category_normalized: REQUEST_DOCUMENT_CATEGORY.INVOICE,
          }),
        ]}
        supplierEvidenceResource={
          {
            evidence: {
              state: SUPPLIER_DOCUMENT_PROJECTION_STATE.READY,
              eligible: true,
              primary_satisfied: true,
              reason_code: null,
              allowed_categories: [REQUEST_DOCUMENT_CATEGORY.INVOICE],
              documents: [],
            },
            data: null,
            isInitialLoading: false,
            isRefreshing: false,
            isLoading: false,
            isBlocking: false,
            error: null,
            retry: refreshEvidence,
            refetch: refreshEvidence,
            commitEvidence: vi.fn(),
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /eliminar documento/i }),
    );

    await waitFor(() => expect(refreshEvidence).toHaveBeenCalledTimes(1));
  });

  it("commits the uploaded document and exact authoritative evidence without local inference", async () => {
    const authoritativeEvidence = {
      state: SUPPLIER_DOCUMENT_PROJECTION_STATE.BLOCKED,
      eligible: false,
      primary_satisfied: false,
      reason_code:
        SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED,
      allowed_categories: [REQUEST_DOCUMENT_CATEGORY.INVOICE],
      documents: [
        {
          id: "supplier-document-1",
          stored_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
          effective_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
          activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.INACTIVE,
          eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.INELIGIBLE,
          eligible: false,
          reason_code:
            SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_NOT_PERMANENT,
        },
      ],
    } as const;
    const uploadedDocument = {
      ...makeDocument({
        id: "supplier-document-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        document_category_normalized: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        original_filename: "factura.pdf",
      }),
      supplier_document_evidence: authoritativeEvidence,
    };
    vi.mocked(api.postForm).mockResolvedValue(uploadedDocument);
    const upsertDocument = vi.fn();
    const refreshDocuments = vi.fn().mockResolvedValue(undefined);
    const refreshReceipts = vi.fn().mockResolvedValue(undefined);
    const refreshEvidence = vi.fn().mockResolvedValue(undefined);
    const commitEvidence = vi.fn();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
        documentsResource={
          {
            documents: [],
            data: [],
            isInitialLoading: false,
            isRefreshing: false,
            isLoading: false,
            error: null,
            refetch: refreshDocuments,
            upsertDocument,
            removeDocument: vi.fn(),
          } as never
        }
        receiptsResource={
          {
            receipts: [],
            data: [],
            isInitialLoading: false,
            isRefreshing: false,
            isLoading: false,
            error: null,
            refetch: refreshReceipts,
            upsertReceipt: vi.fn(),
          } as never
        }
        supplierEvidenceResource={
          {
            evidence: null,
            data: null,
            isInitialLoading: false,
            isRefreshing: false,
            isLoading: false,
            isBlocking: true,
            error: null,
            retry: refreshEvidence,
            refetch: refreshEvidence,
            commitEvidence,
          } as never
        }
      />,
    );

    fireEvent.change(screen.getByLabelText("Seleccionar Factura"), {
      target: {
        files: [
          new File(["invoice"], "factura.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    await waitFor(() => expect(upsertDocument).toHaveBeenCalledTimes(1));
    expect(upsertDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "supplier-document-1" }),
    );
    expect(commitEvidence).toHaveBeenCalledTimes(1);
    expect(commitEvidence).toHaveBeenCalledWith(authoritativeEvidence);
    expect(commitEvidence.mock.calls[0]?.[0]).toMatchObject({
      state: SUPPLIER_DOCUMENT_PROJECTION_STATE.BLOCKED,
      primary_satisfied: false,
      reason_code:
        SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED,
    });
  });

  it("no anuncia éxito pleno cuando el backend responde upload_status FAILED", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({
        id: "doc-local",
        original_filename: "local.pdf",
        storage_provider: "LOCAL",
        upload_status: "FAILED",
      }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: {
        files: [
          new File(["contenido"], "local.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(
      await screen.findByText(
        /quedó guardado localmente.*incidencia.*Google Drive/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    expect(
      screen.queryByText("1 documento adjuntado correctamente."),
    ).not.toBeInTheDocument();
  });

  it("deja listo el cargador para otra tanda después de adjuntar un bloque completo", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm)
      .mockResolvedValueOnce(
        makeDocument({ id: "doc-block-1", original_filename: "bloque-1.pdf" }),
      )
      .mockResolvedValueOnce(
        makeDocument({ id: "doc-block-2", original_filename: "bloque-2.pdf" }),
      )
      .mockResolvedValueOnce(
        makeDocument({ id: "doc-next", original_filename: "siguiente.pdf" }),
      );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const firstBlock = [
      new File(["contenido-1"], "bloque-1.pdf", { type: "application/pdf" }),
      new File(["contenido-2"], "bloque-2.pdf", { type: "application/pdf" }),
    ];
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: firstBlock },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(
      await screen.findByText("2 documentos adjuntados correctamente."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cola de carga")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeDisabled();

    const nextFile = new File(["contenido-3"], "siguiente.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [nextFile] },
    });

    expect(await screen.findByText("siguiente.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledTimes(3);
    });
    expect(
      await screen.findByText("1 documento adjuntado correctamente."),
    ).toBeInTheDocument();
  });

  it("permite retirar un archivo pendiente de la cola local antes de subirlo", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const file = new File(["contenido"], "one.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });

    expect(await screen.findByText("En cola")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Presiona Adjuntar para iniciar la carga/i).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /retirar/i }));

    expect(screen.queryByText("En cola")).not.toBeInTheDocument();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("confirma antes de descartar la cola local al cambiar categoría", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: {
        files: [
          new File(["contenido"], "pendiente.pdf", { type: "application/pdf" }),
        ],
      },
    });
    expect(await screen.findByText("pendiente.pdf")).toBeInTheDocument();

    await user.click(within(screen.getByTestId("contextual-document-options")).getByRole("button", { name: /^Contrato ·/i }));

    expect(
      screen.getByRole("dialog", { name: "¿Cambiar la selección de carga?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("pendiente.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Conservar cola" }));
    expect(
      screen.queryByRole("dialog", { name: "¿Cambiar la selección de carga?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("pendiente.pdf")).toBeInTheDocument();

    await user.click(within(screen.getByTestId("contextual-document-options")).getByRole("button", { name: /^Contrato ·/i }));
    await user.click(
      screen.getByRole("button", { name: "Cambiar y retirar cola" }),
    );
    expect(screen.queryByText("pendiente.pdf")).not.toBeInTheDocument();
  });

  it("advierte al refrescar o cerrar la página mientras una carga está en curso", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const uploadDeferred = createDeferred<RequestDocument>();
    vi.mocked(api.postForm).mockReturnValue(uploadDeferred.promise);

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const file = new File(["contenido"], "nuevo.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(await screen.findByText("Subiendo")).toBeInTheDocument();
    expect(
      screen.getByText(/puede terminar en el servidor/i),
    ).toBeInTheDocument();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    uploadDeferred.resolve(
      makeDocument({ id: "doc-2", original_filename: "nuevo.pdf" }),
    );
    expect(
      await screen.findByText("1 documento adjuntado correctamente."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cola de carga")).toBeInTheDocument();
  });

  it("uploads the sole required PxQ at request level even when POA lines exist", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({ id: "doc-alloc-1", original_filename: "pxq.xlsx" }),
    );

    render(
      <RequestDocumentsCard
        request={makeRequest({
          allocations: [makeAllocation({ id: "alloc-1" })],
        })}
      />,
    );

    expect(
      await screen.findByText(/documentos asociados por línea poa/i),
    ).toBeInTheDocument();

    const file = new File(["contenido"], "pxq.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(screen.getByLabelText(/seleccionar pxq/i), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith(
        "/requests/req-1/documents",
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.PXQ,
    );
    expect(formData.get("scope_type")).toBeNull();
    expect(formData.get("request_allocation_id")).toBeNull();
  });

  it("uses one existing PxQ from any linked POA without per-line checklist gates", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({
        id: "doc-alloc-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
        original_filename: "pxq-linea-1.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: "alloc-1",
      }),
    ]);

    render(
      <RequestDocumentsCard
        request={makeRequest({
          allocations: [
            makeAllocation({
              id: "alloc-1",
              budget_planning_line_id: "line-1",
            }),
            makeAllocation({
              id: "alloc-2",
              budget_planning_line_id: "line-2",
              amount: 200,
              sort_order: 2,
              planning_line: {
                ...makeAllocation().planning_line!,
                id: "line-2",
                line_code: "POA-2",
                resource_description: "Servicios logísticos",
              },
            }),
          ],
        })}
      />,
    );

    expect(await screen.findByText("pxq-linea-1.xlsx")).toBeInTheDocument();
    const groups = screen.getAllByTestId("allocation-documents-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Con adjuntos");
    expect(groups[1]).toHaveTextContent("Opcional · sin adjuntos");
    expect(screen.getAllByText("PXQ").length).toBeGreaterThan(0);
    expect(screen.getByText("Adjunto")).toBeInTheDocument();
  });

  it.each([REQUEST_TYPE.ADVANCE, REQUEST_TYPE.REIMBURSEMENT])(
    "shows compact contextual options and operation limits for %s",
    (requestType) => {
      vi.mocked(api.get).mockResolvedValue([]);
      render(<RequestDocumentsCard request={makeRequest({ request_type: requestType })} documents={[]} />);
      const groups = screen.getByTestId("contextual-document-options");
      expect(within(groups).queryByRole("combobox", { name: "Categoría" })).not.toBeInTheDocument();
      expect(within(groups).getByRole("button", { name: /Hoja de movilidad.*PDF.*XLSX/i })).toBeEnabled();
      expect(within(groups).getByRole("button", { name: /Declaración jurada.*DOCX/i })).toBeEnabled();
      expect(within(groups).getByRole("button", { name: /Sustento de solicitud/i })).toBeEnabled();
      expect(within(groups).getByRole("button", { name: /Evidencias/i })).toBeEnabled();
      expect(within(groups).getByRole("button", { name: /Otros documentos/i })).toBeEnabled();
      expect(within(groups).getByRole("button", { name: /Constancia de pago/i })).toBeDisabled();
      expect(within(groups).getByText(/operación de pago/i)).toBeInTheDocument();
      expect(within(groups).getByRole("button", { name: /Informe de rendición/i })).toBeInTheDocument();
      expect(within(groups).getByRole("button", { name: /Constancia de devolución/i })).toBeInTheDocument();
    },
  );

  it.each([REQUEST_TYPE.ADVANCE, REQUEST_TYPE.REIMBURSEMENT])(
    "supports keyboard choice and named group hierarchy without narrowing %s",
    async (requestType) => {
      vi.mocked(api.get).mockResolvedValue([]);
      const user = userEvent.setup();
      render(<RequestDocumentsCard request={makeRequest({ request_type: requestType })} documents={[]} />);
      const choices = screen.getByRole("group", { name: "Categorías disponibles" });
      expect(within(choices).getAllByRole("group").length).toBeGreaterThan(1);
      expect(screen.getByRole("heading", { level: 2, name: "Documentos adjuntos" })).toBeInTheDocument();
      const mobility = within(choices).getByRole("button", { name: /Hoja de movilidad.*Solicitud/i });
      mobility.focus();
      await user.keyboard("{Enter}");
      expect(mobility).toHaveAttribute("aria-pressed", "true");
      const disclosure = within(choices).getByText("Documentos complementarios", { selector: "summary" });
      disclosure.focus();
      await user.keyboard("{Enter}");
      expect(disclosure.parentElement).not.toHaveAttribute("open");
      await user.keyboard(" ");
      expect(disclosure.parentElement).toHaveAttribute("open");
      expect(within(choices).getByRole("button", { name: /Constancia de pago/i })).toHaveAttribute("aria-describedby");
    },
  );

  it("focuses invalid individual OTHER title and preserves other titles and mobile reading order", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest()} documents={[]} />);
    await user.click(screen.getByRole("button", { name: /otros documentos ·/i }));
    fireEvent.change(screen.getByLabelText(/^archivo$/i), { target: { files: [new File(["a"], "uno.pdf", { type: "application/pdf" }), new File(["b"], "dos.pdf", { type: "application/pdf" })] } });
    const first = screen.getByRole("textbox", { name: "Título de uno.pdf" });
    const second = screen.getByRole("textbox", { name: "Título de dos.pdf" });
    await user.type(first, "../incorrecto");
    await user.type(second, "Informe dos");
    const add = screen.getByRole("button", { name: "Agregar a la cola" });
    await user.click(add);
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-invalid", "true");
    expect(second).toHaveValue("Informe dos");
    expect(first.closest("div.rounded-md")).toHaveClass("min-w-0");
    expect(first.parentElement).toHaveClass("flex-col");
    expect(screen.getByRole("alert")).toHaveAttribute("id", first.getAttribute("aria-describedby"));
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("moves focus to the failed file retry after a partial serial upload without reannouncing success", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValueOnce(makeDocument({ id: "saved-1" })).mockRejectedValueOnce(makeUploadError(429, "Espera antes de reintentar"));
    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest()} documents={[]} />);
    fireEvent.change(screen.getByLabelText(/^archivo$/i), { target: { files: [new File(["a"], "uno.pdf", { type: "application/pdf" }), new File(["b"], "dos.pdf", { type: "application/pdf" })] } });
    await user.click(screen.getByRole("button", { name: /^Adjuntar$/i }));
    const retry = await screen.findByRole("button", { name: "Reintentar dos.pdf" });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.getByText("uno.pdf", { selector: "li p" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /adjuntado correctamente/i })).not.toBeInTheDocument();
  });

  it("offers five OR reimbursement choices in one required control and does not duplicate them", () => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })} documents={[]} />);
    const required = screen.getByTestId("reimbursement-receipt-choices");
    for (const label of ["Comprobante", "Factura", "Recibo por honorarios", "Boleta", "Recibo de caja"]) {
      expect(within(required).getByRole("button", { name: new RegExp(`Adjuntar ${label}`) })).toBeEnabled();
    }
    expect(within(screen.getByTestId("contextual-document-options")).queryByRole("button", { name: /Factura/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adjuntar Comprobante real vinculado" })).not.toBeInTheDocument();
  });

  it("selects mobility with its own format and enqueues under that category", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET }));
    render(<RequestDocumentsCard request={makeRequest()} documents={[]} />);
    const choice = within(screen.getByTestId("contextual-document-options")).getByRole("button", { name: /Hoja de movilidad/ });
    await userEvent.click(choice);
    expect(choice).toHaveAttribute("aria-pressed", "true");
    const input = screen.getByLabelText("Archivo");
    expect(input).toHaveAttribute("accept", expect.stringContaining(".xlsx"));
    fireEvent.change(input, { target: { files: [new File(["sheet"], "movilidad.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })] } });
    await userEvent.click(screen.getByRole("button", { name: /^Adjuntar$/i }));
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
    expect((vi.mocked(api.postForm).mock.calls[0][1] as FormData).get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET);
  });

  it("uploads a typed reimbursement invoice through the single OR gate", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE }));
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })} documents={[]} />);
    fireEvent.change(within(screen.getByTestId("reimbursement-receipt-choices")).getByLabelText("Seleccionar Factura"), {
      target: { files: [new File(["invoice"], "factura.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
    expect((vi.mocked(api.postForm).mock.calls[0][1] as FormData).get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.INVOICE);
  });

  it("muestra la regla de comprobantes por línea POA para una rendición de anticipo", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({
        id: "receipt-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
        original_filename: "Comprobante.pdf",
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: "alloc-1",
      }),
    ]);

    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [
            makeAllocation({ id: "alloc-1" }),
            makeAllocation({
              id: "alloc-2",
              budget_planning_line_id: "line-2",
              amount: 200,
              sort_order: 2,
              planning_line: {
                ...makeAllocation().planning_line!,
                id: "line-2",
                line_code: "POA-2",
                resource_description: "Servicios logísticos",
              },
            }),
          ],
        })}
      />,
    );

    expect(
      await screen.findByText(
        /cada línea POA debe tener al menos un comprobante/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Comprobantes por línea POA/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByTestId("allocation-documents-groups"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Excel PxQ")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Falta adjuntar Excel PxQ."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Comprobante de la rendición"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId("settlement-receipt-group")).toHaveLength(2);
    expect(
      screen.getByText("Constancias de devolución por línea POA"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("settlement-return-proof-group")).toHaveLength(
      2,
    );
    expect(screen.getAllByText(/POA-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/POA-2/).length).toBeGreaterThan(0);
    expect(screen.getByText("Comprobante.pdf")).toBeInTheDocument();
  });

  it("muestra líneas del anticipo como referencia si la rendición aún no trae líneas", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [],
        })}
        guidanceAllocations={[
          makeAllocation({ id: "original-alloc-1" }),
          makeAllocation({
            id: "original-alloc-2",
            budget_planning_line_id: "line-2",
            amount: 200,
            sort_order: 2,
            planning_line: {
              ...makeAllocation().planning_line!,
              id: "line-2",
              line_code: "POA-2",
              resource_description: "Servicios logísticos",
            },
          }),
        ]}
      />,
    );

    expect(
      await screen.findByText(
        /líneas POA del anticipo original como referencia/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("settlement-receipt-group")).toHaveLength(2);
    expect(
      screen.getByText("Constancias de devolución por línea POA"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("settlement-return-proof-group")).toHaveLength(
      2,
    );
    expect(screen.getAllByText(/POA-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/POA-2/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("combobox", { name: /línea poa/i }),
    ).not.toBeInTheDocument();
  });

  it("separa documentos de rendición y no ofrece RETURN_PROOF ni SETTLEMENT_REPORT en otros documentos", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({
        id: "return-proof-unscoped",
        document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        original_filename: "Constancia sin línea.pdf",
        request_allocation_id: null,
      }),
      makeDocument({
        id: "return-proof-alloc-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
        original_filename: "Constancia línea 1.pdf",
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: "alloc-1",
      }),
    ]);

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [makeAllocation({ id: "alloc-1" })],
        })}
      />,
    );

    expect(
      await screen.findByText("Constancias de devolución por línea POA"),
    ).toBeInTheDocument();
    expect(screen.getByText("Constancia línea 1.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Estas constancias no están asociadas a una línea POA y no validan una devolución por línea/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Constancia sin línea.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /categoría/i }));

    expect(
      screen.queryByRole("option", { name: /constancia de devolución/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /informe de rendición/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Las constancias de devolución se adjuntan desde Saldos por línea POA/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /El Informe de rendición se genera desde la acción de rendición/i,
      ),
    ).toBeInTheDocument();
  });

  it("uploads a REXAN receipt at REQUEST scope without a POA", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({
        id: "receipt-alloc-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [
            makeAllocation({ id: "alloc-1" }),
            makeAllocation({ id: "alloc-2", sort_order: 2 }),
          ],
        })}
      />,
    );

    const categoryTrigger = await screen.findByRole("combobox", {
      name: /categoría/i,
    });
    await user.click(categoryTrigger);
    await user.click(
      await screen.findByRole("option", { name: /^comprobante$/i }),
    );
    expect(screen.queryByRole("combobox", { name: /línea poa/i })).not.toBeInTheDocument();
    const file = new File(["contenido"], "factura.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith(
        "/requests/req-1/documents",
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    );
    // REQUEST es el valor por defecto; el uploader solo envía ALLOCATION explícito.
    expect(formData.has("scope_type")).toBe(false);
    expect(formData.has("request_allocation_id")).toBe(false);
    expect(formData.has("document_purpose")).toBe(false);
  });

  it("accepts seven REXAN files once without POA metadata or financial mutations", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({
        id: "receipt-alloc-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [
            makeAllocation({ id: "alloc-1" }),
            makeAllocation({ id: "alloc-2", sort_order: 2 }),
          ],
        })}
      />,
    );

    const categoryTrigger = await screen.findByRole("combobox", {
      name: /categoría/i,
    });
    await user.click(categoryTrigger);
    await user.click(
      await screen.findByRole("option", { name: /^comprobante$/i }),
    );
    const files = Array.from({ length: 7 }, (_, index) => new File(
      [`contenido-${index}`], `factura-${index}.pdf`, { type: "application/pdf" },
    ));
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files },
    });

    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith(
        "/requests/req-1/documents",
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(7), { timeout: 12_000 });
    const calls = vi.mocked(api.postForm).mock.calls;
    expect(calls.map((call) => (call[1] as FormData).get("file"))).toEqual(files);
    for (const [, body, options] of calls) {
      const data = body as FormData;
      expect(data.has("scope_type")).toBe(false);
      expect(data.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.RECEIPT);
      expect(data.has("request_allocation_id")).toBe(false);
      expect(data.has("document_purpose")).toBe(false);
      expect(options?.headers).toEqual(expect.objectContaining({ "Idempotency-Key": expect.any(String) }));
    }
    expect(new Set(calls.map((call) => (call[2]?.headers as Record<string, string>)["Idempotency-Key"])).size).toBe(7);
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  }, 15_000);

  it("keeps long POA guidance visible without a pre-upload selector", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          allocations: [
            makeAllocation({
              id: "alloc-1",
              planning_line: {
                ...makeAllocation().planning_line!,
                line_code: "POA-LARGA-2026",
                resource_description:
                  "Descripción extensa de la línea POA para compras logísticas, materiales y servicios en territorio",
              },
            }),
          ],
        })}
      />,
    );

    await user.click(
      await screen.findByRole("combobox", { name: /categoría/i }),
    );
    await user.click(
      await screen.findByRole("option", { name: /^comprobante$/i }),
    );
    expect(screen.queryByRole("combobox", { name: /línea poa/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/POA-LARGA-2026/).length).toBeGreaterThan(0);
  });

  it("groups seven saved REXAN receipts by authoritative settlement UUIDs, not document scopes", async () => {
    const first = makeAllocation({ id: "11111111-1111-4111-8111-111111111111" });
    const second = makeAllocation({ id: "22222222-2222-4222-8222-222222222222", planning_line: {
      ...makeAllocation().planning_line!, line_code: "POA-2", resource_description: "Servicios",
    } });
    const documents = Array.from({ length: 7 }, (_, index) => makeDocument({
      id: `saved-${index}`, original_filename: `saved-${index}.pdf`,
      document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.REQUEST,
      request_allocation_id: index === 0 ? second.id : null,
    }));
    first.documents = [documents[0], documents[1]];
    const reviews = documents.map((document, index) => makeReceiptReview({ receipt: {
      ...makeReceiptReview().receipt, id: `review-${index}`, document_id: document.id,
      request_allocation_id: index < 3 ? first.id! : second.id!,
    } }));
    vi.mocked(api.get).mockImplementation(async (path) => path === "/requests/req-1/receipts" ? reviews : []);
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [first, second] })} documents={documents} readOnly />);
    await waitFor(() => expect(within(screen.getAllByTestId("settlement-receipt-group")[0]).getByText("saved-0.pdf")).toBeInTheDocument());
    const groups = screen.getAllByTestId("settlement-receipt-group");
    for (const [index, document] of documents.entries()) {
      expect(screen.getAllByText(document.original_filename)).toHaveLength(1);
      expect(within(groups[index < 3 ? 0 : 1]).getByText(document.original_filename)).toBeInTheDocument();
    }
    expect(documents[0].request_allocation_id).toBe(second.id);
    expect(documents[0].scope_type).toBe(REQUEST_DOCUMENT_SCOPE_TYPE.REQUEST);
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("keeps null/pending receipts unassigned, falls back only without a receipt, and exposes unresolved IDs", async () => {
    const allocation = makeAllocation();
    const sourceAdvanceId = "33333333-3333-4333-8333-333333333333";
    const documents = ["null", "pending", "legacy", "unresolved"].map((name) => makeDocument({
      id: name, original_filename: `${name}.pdf`, document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      scope_type: name === "pending" ? REQUEST_DOCUMENT_SCOPE_TYPE.REQUEST : REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
      request_allocation_id: name === "pending" ? null : allocation.id,
    }));
    allocation.documents = [documents[0], documents[2]];
    const reviews = ["null", "unresolved"].map((name) => makeReceiptReview({ receipt: {
      ...makeReceiptReview().receipt, id: `receipt-${name}`, document_id: name,
      request_allocation_id: name === "null" ? null : sourceAdvanceId,
      ocr_status: REQUEST_RECEIPT_OCR_STATUS.PENDING,
    } }));
    vi.mocked(api.get).mockImplementation(async (path) => path === "/requests/req-1/receipts" ? reviews : []);
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [allocation] })} documents={documents} guidanceAllocations={[makeAllocation({
      id: sourceAdvanceId, planning_line: { ...makeAllocation().planning_line!, line_code: "SOURCE-ADVANCE-POA" },
    })]} readOnly />);
    const pending = await screen.findByTestId("settlement-unassigned-receipts");
    await waitFor(() => expect(within(pending).getByText("null.pdf")).toBeInTheDocument());
    expect(pending).toHaveTextContent("Sin POA asignado");
    expect(within(pending).getByText("pending.pdf")).toBeInTheDocument();
    const group = screen.getByTestId("settlement-receipt-group");
    expect(within(group).getByText("legacy.pdf")).toBeInTheDocument();
    expect(within(group).queryByText("null.pdf")).not.toBeInTheDocument();
    expect(within(group).queryByText("unresolved.pdf")).not.toBeInTheDocument();
    expect(screen.getByTestId("settlement-unresolved-receipts")).toHaveTextContent("unresolved.pdf");
    expect(screen.queryByText(/SOURCE-ADVANCE-POA/)).not.toBeInTheDocument();
    for (const document of documents) expect(screen.getAllByText(document.original_filename)).toHaveLength(1);
  });

  it.each([false, true])("keeps a receipt visible without settlement allocations, source guidance=%s", async (withGuidance) => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(<RequestDocumentsCard
      request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [] })}
      guidanceAllocations={withGuidance ? [makeAllocation({ id: "source-advance-id" })] : []}
      documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT })]}
      readOnly
    />);
    expect(within(screen.getByTestId("settlement-unassigned-receipts")).getByText("Sustento.pdf")).toBeInTheDocument();
    if (withGuidance)
      expect(screen.getByTestId("settlement-receipt-group")).not.toHaveTextContent("Sustento.pdf");
    expect(screen.queryByText(/seleccionando esta línea POA en el cargador/i)).not.toBeInTheDocument();
  });

  it("moves only presentation after authoritative receipt refresh and retains the original REQUEST document", () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const document = makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.REQUEST, request_allocation_id: null });
    const request = makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      allocations: [makeAllocation()] });
    const resource = {
      receipts: [makeReceiptReview()], data: [makeReceiptReview()],
      isInitialLoading: false, isRefreshing: false, isLoading: false, error: null,
      refetch: vi.fn().mockResolvedValue(undefined), upsertReceipt: vi.fn(),
    };
    const { rerender } = render(<RequestDocumentsCard request={request}
      documents={[document]} receiptsResource={resource} readOnly />);
    expect(screen.getByTestId("settlement-unassigned-receipts")).toHaveTextContent("Sustento.pdf");
    const assigned = makeReceiptReview({ receipt: { ...makeReceiptReview().receipt,
      request_allocation_id: "alloc-1" } });
    rerender(<RequestDocumentsCard request={request} documents={[document]}
      receiptsResource={{ ...resource, receipts: [assigned], data: [assigned] }} readOnly />);
    expect(screen.getByTestId("settlement-receipt-group")).toHaveTextContent("Sustento.pdf");
    expect(screen.queryByTestId("settlement-unassigned-receipts")).not.toBeInTheDocument();
    expect(screen.getAllByText("Sustento.pdf")).toHaveLength(1);
    expect(document.scope_type).toBe(REQUEST_DOCUMENT_SCOPE_TYPE.REQUEST);
    expect(document.request_allocation_id).toBeNull();
    expect(api.postForm).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("retains the REXAN queue cap and OCR formats without a POA", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT })} />);
    await user.click(screen.getByRole("combobox", { name: /categoría/i }));
    await user.click(screen.getByRole("option", { name: /^comprobante$/i }));
    const input = screen.getByLabelText(/^archivo$/i);
    expect(input.getAttribute("accept")).toMatch(/pdf/);
    expect(input.getAttribute("accept")).toMatch(/png/);
    expect(input.getAttribute("accept")).toMatch(/jpeg|jpg/);
    fireEvent.change(input, { target: { files: Array.from({ length: 21 }, (_, index) =>
      new File([`${index}`], `cap-${index}.pdf`, { type: "application/pdf" }),
    ) } });
    expect(screen.getByText(/1 archivo fue omitido/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Retirar cap-/ })).toHaveLength(20);
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeEnabled();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("retries a REXAN receipt with the same file and immutable upload key without allocation", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockReset();
    vi.mocked(api.postForm).mockRejectedValueOnce(makeUploadError(500, "Temporary failure"))
      .mockResolvedValueOnce(makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT }));
    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [makeAllocation()] })} />);
    await user.click(screen.getByRole("combobox", { name: /categoría/i }));
    await user.click(screen.getByRole("option", { name: /^comprobante$/i }));
    const file = new File(["receipt"], "retry-rexan.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/^archivo$/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));
    const retry = await screen.findByRole("button", { name: /Reintentar retry-rexan.pdf/ });
    await waitFor(() => expect(retry).toBeEnabled());
    await user.click(retry);
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(api.postForm).mock.calls;
    expect(first[2]?.headers).toEqual(second[2]?.headers);
    for (const call of [first, second]) {
      const body = call[1] as FormData;
      expect(body.get("file")).toBe(file);
      expect(body.has("request_allocation_id")).toBe(false);
      expect(body.has("scope_type")).toBe(false);
      expect(body.has("document_purpose")).toBe(false);
    }
  });

  it("leaves EXTRA receipt presentation document-scoped rather than retagging it", async () => {
    const extra = makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      document_purpose: REQUEST_DOCUMENT_PURPOSE.EXTRA, scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.REQUEST });
    const review = makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, request_allocation_id: "alloc-1" } });
    vi.mocked(api.get).mockImplementation(async (path) => path === "/requests/req-1/receipts" ? [review] : []);
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [makeAllocation()] })} documents={[extra]} readOnly />);
    await waitFor(() => expect(screen.getByText("Pendiente de confirmación")).toBeInTheDocument());
    expect(screen.getAllByText("Sustento.pdf")).toHaveLength(1);
    expect(screen.getByTestId("settlement-receipt-group")).not.toHaveTextContent("Sustento.pdf");
    expect(screen.queryByTestId("settlement-unassigned-receipts")).not.toBeInTheDocument();
  });

  it("treats one PxQ from any linked POA as request-level completion", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({
        id: "doc-alloc-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
        original_filename: "POA_ALL_CONTROL INTERNO.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: "alloc-1",
      }),
    ]);

    render(
      <RequestDocumentsCard
        request={makeRequest({
          allocations: [
            makeAllocation({
              id: "alloc-1",
              document_checklist: {
                complete: false,
                required_documents: [
                  {
                    category: REQUEST_DOCUMENT_CATEGORY.PXQ,
                    label: "Excel PxQ",
                    required: false,
                    satisfied: false,
                  },
                ],
              },
            }),
            makeAllocation({
              id: "alloc-2",
              budget_planning_line_id: "line-2",
              amount: 200,
              sort_order: 2,
              planning_line: {
                ...makeAllocation().planning_line!,
                id: "line-2",
                line_code: "POA-2",
                resource_description: "Servicios logísticos",
              },
              document_checklist: {
                complete: false,
                required_documents: [
                  {
                    category: REQUEST_DOCUMENT_CATEGORY.PXQ,
                    label: "Excel PxQ",
                    required: false,
                    satisfied: false,
                  },
                ],
              },
            }),
          ],
        })}
      />,
    );

    expect(
      await screen.findByText("POA_ALL_CONTROL INTERNO.xlsx"),
    ).toBeInTheDocument();
    const groups = screen.getAllByTestId("allocation-documents-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Con adjuntos");
    expect(groups[1]).toHaveTextContent("Opcional · sin adjuntos");
    expect(screen.getAllByText("PXQ").length).toBeGreaterThan(0);
    expect(screen.getByText("Adjunto")).toBeInTheDocument();
    expect(
      screen.getByText(/no se requiere uno por línea/i),
    ).toBeInTheDocument();
  });

  it("mantiene la constancia de pago separada y fuera del cargador documental del proveedor", () => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.SUPPLIER_PAYMENT,
          allocations: [makeAllocation({ id: "alloc-1" })],
        })}
        documents={[
          makeDocument({
            id: "doc-payment",
            document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
            original_filename: "constancia-pago.pdf",
            drive_web_url: "https://drive.google.com/file/d/doc-payment",
          }),
        ]}
      />,
    );

    const paymentProofs = screen.getByRole("region", {
      name: "Constancias de pago",
    });
    expect(within(paymentProofs).getByText("Solo lectura")).toBeVisible();
    expect(
      within(paymentProofs).getByText("constancia-pago.pdf"),
    ).toBeVisible();
    expect(
      within(paymentProofs).getByRole("link", {
        name: /Ver documento .*pestaña nueva/,
      }),
    ).toBeVisible();
    expect(
      within(paymentProofs).queryByRole("button", { name: /Eliminar/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /categoría/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Adjuntar.*constancia de pago/i,
      }),
    ).not.toBeInTheDocument();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("muestra el mensaje específico cuando el comprobante ya fue registrado", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockRejectedValue(
      new ApiRequestError(409, {
        statusCode: 409,
        message: "Esta factura ya fue registrada",
        error: "Conflict",
        timestamp: "2026-05-01T10:00:00.000Z",
        path: "/requests/req-1/documents",
      }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const file = new File(["contenido"], "factura.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(
      await screen.findByText("Esta factura ya fue registrada"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^adjuntar$/i }),
    ).toBeInTheDocument();
  });

  it("crea una cola de hasta 20 archivos y descarta excedentes sin retener su File", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const files = Array.from(
      { length: 21 },
      (_, index) =>
        new File([`contenido-${index}`], `archivo-${index + 1}.pdf`, {
          type: "application/pdf",
        }),
    );
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files } });

    expect(await screen.findByText("Cola de carga")).toBeInTheDocument();
    expect(
      screen.getByText(/0 guardados · 0 con incidencia · 20 en cola/i),
    ).toBeInTheDocument();
    expect(screen.getByText("archivo-1.pdf")).toBeInTheDocument();
    expect(screen.queryByText("archivo-21.pdf")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "1 archivo fue omitido. Solo se conservan 20 archivos por tanda.",
      ),
    ).toBeInTheDocument();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("permite retirar pendientes y reintentar fallidos transitorios sin reenviar exitosos", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm)
      .mockRejectedValueOnce(
        makeUploadError(
          429,
          "Drive temporalmente limitado",
          "DRIVE_RATE_LIMITED",
        ),
      )
      .mockResolvedValueOnce(
        makeDocument({ id: "doc-retry", original_filename: "fallido.pdf" }),
      );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const failedFile = new File(["contenido"], "fallido.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [failedFile] },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(
      await screen.findByText("Drive temporalmente limitado"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeEnabled();

    const pendingFile = new File(["contenido"], "pendiente.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [pendingFile] },
    });
    expect(await screen.findByText("pendiente.pdf")).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: /retirar/i }).at(-1)!,
    );
    expect(screen.queryByText("pendiente.pdf")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText("1 documento adjuntado correctamente."),
    ).toBeInTheDocument();
  });

  it("conserva solo incidencias de una tanda parcial y permite agregar otra sin reenviar exitosos", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm)
      .mockResolvedValueOnce(
        makeDocument({ id: "doc-ok", original_filename: "correcto.pdf" }),
      )
      .mockRejectedValueOnce(
        makeUploadError(500, "No pudimos adjuntar este archivo"),
      )
      .mockResolvedValueOnce(
        makeDocument({ id: "doc-next", original_filename: "nuevo.pdf" }),
      );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    const blockFiles = [
      new File(["contenido-ok"], "correcto.pdf", { type: "application/pdf" }),
      new File(["contenido-fail"], "fallido.pdf", { type: "application/pdf" }),
    ];
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: blockFiles },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(
      await screen.findByText("No pudimos adjuntar este archivo"),
    ).toBeInTheDocument();
    expect(screen.getByText("correcto.pdf")).toBeInTheDocument();
    expect(screen.getByText("fallido.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeDisabled();

    const nextFile = new File(["contenido-next"], "nuevo.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [nextFile] },
    });

    expect(await screen.findByText("nuevo.pdf")).toBeInTheDocument();
    expect(screen.queryByText("correcto.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledTimes(3);
    });
  });

  it("muestra datos detectados del comprobante y permite corregirlos", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts")
        return [
          makeReceiptReview({
            receipt: {
              ...makeReceiptReview().receipt,
              issue_date: "2026-05-01T04:30:00.000Z",
            },
          }),
        ];
      return [
        makeDocument({
          document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          original_filename: "Factura.pdf",
        }),
      ];
    });
    vi.mocked(api.patch).mockResolvedValue(
      makeReceiptReview({
        receipt: {
          ...makeReceiptReview().receipt,
          issuer_name: "Proveedor Corregido SAC",
        },
      }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
        })}
      />,
    );

    expect(await screen.findByText("Factura.pdf")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de confirmación")).toBeInTheDocument();
    expect(
      screen.getByText(/Proveedor SAC · F001-123 · PEN 150.5/i),
    ).toBeInTheDocument();
    expect(screen.getByText("RUC: 20123456789")).toBeInTheDocument();
    expect(
      screen.getByText(
        /confirma los datos para usar este comprobante en el informe de rendición/i,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revisar datos/i }));
    const providerInput = await screen.findByLabelText(/proveedor/i);
    expect(screen.getByLabelText(/fecha del comprobante/i)).toHaveValue(
      "2026-05-01",
    );
    expect(
      screen.getByText(/selecciona solo día, mes y año/i),
    ).toBeInTheDocument();
    fireEvent.change(providerInput, {
      target: { value: "Proveedor Corregido SAC" },
    });
    await user.click(
      screen.getByRole("button", { name: /guardar corrección/i }),
    );

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/requests/req-1/receipts/receipt-1",
        expect.objectContaining({
          issuer_name: "Proveedor Corregido SAC",
          issuer_document_number: "20123456789",
        }),
      );
    });
  });

  it("mantiene una moneda de comprobante no resuelta hasta que el usuario la selecciona", async () => {
    const unresolvedReceipt = makeReceiptReview({
      receipt: { ...makeReceiptReview().receipt, currency: null },
    });
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [unresolvedReceipt];
      return [
        makeDocument({
          document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          original_filename: "Factura.pdf",
        }),
      ];
    });
    vi.mocked(api.patch).mockResolvedValue({
      ...unresolvedReceipt,
      receipt: { ...unresolvedReceipt.receipt, currency: REQUEST_CURRENCY.USD },
    });

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
        })}
      />,
    );

    expect(
      await screen.findByText(/150.5 · Moneda pendiente de resolución/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirmar datos/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /revisar datos/i }));
    expect(
      screen.getByRole("button", { name: /guardar corrección/i }),
    ).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: /moneda/i }));
    await user.click(
      await screen.findByRole("option", { name: "Dólares (USD)" }),
    );
    await user.click(
      screen.getByRole("button", { name: /guardar corrección/i }),
    );

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/requests/req-1/receipts/receipt-1",
        expect.objectContaining({ currency: REQUEST_CURRENCY.USD }),
      );
    });
  });

  it("confirma datos detectados del comprobante y no muestra reintento de lectura", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [makeReceiptReview()];
      return [
        makeDocument({
          document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          original_filename: "Factura.pdf",
        }),
      ];
    });
    vi.mocked(api.post).mockResolvedValue(
      makeReceiptReview({
        receipt: {
          ...makeReceiptReview().receipt,
          confirmed_by_id: "user-1",
          confirmed_at: "2026-05-01T11:00:00.000Z",
        },
      }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
        })}
      />,
    );

    expect(await screen.findByText("Factura.pdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reintentar lectura/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirmar datos/i }));

    expect(
      await screen.findByRole("dialog", {
        name: /confirmar datos del comprobante/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /esta confirmación es necesaria para que el comprobante pueda agregarse al informe de rendición/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /después de confirmar, podrás seleccionar la línea poa/i,
      ),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /confirmar para informe/i }),
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/requests/req-1/receipts/receipt-1/confirm",
      );
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/requests/req-1/receipts");
      expect(api.get).toHaveBeenCalledWith("/requests/req-1/documents");
    });
  });

  it.each([
    [REQUEST_TYPE.SUPPLIER_PAYMENT, REQUEST_DOCUMENT_CATEGORY.INVOICE, REQUEST_RECEIPT_TYPE.INVOICE, "Confirmar Factura"],
    [REQUEST_TYPE.SUPPLIER_PAYMENT, REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT, REQUEST_RECEIPT_TYPE.SALES_RECEIPT, "Confirmar Boleta"],
    [REQUEST_TYPE.SUPPLIER_PAYMENT, REQUEST_DOCUMENT_CATEGORY.INVOICE, REQUEST_RECEIPT_TYPE.SALES_RECEIPT, "Confirmar Factura"],
    [REQUEST_TYPE.REIMBURSEMENT, REQUEST_DOCUMENT_CATEGORY.RECEIPT, REQUEST_RECEIPT_TYPE.SALES_RECEIPT, "Confirmar comprobante"],
    [REQUEST_TYPE.REIMBURSEMENT, REQUEST_DOCUMENT_CATEGORY.RECEIPT, "UNKNOWN", "Confirmar comprobante"],
  ])("uses persisted category for %s %s and receipt type %s for %s, retaining confirmation API", async (requestType, category, receiptType, label) => {
    vi.mocked(api.get).mockImplementation(async (path) => path === "/requests/req-1/receipts"
      ? [makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, receipt_type: receiptType } })]
      : []);
    vi.mocked(api.post).mockResolvedValue(makeReceiptReview());
    render(<RequestDocumentsCard request={makeRequest({ request_type: requestType })}
      documents={[makeDocument({ document_category: category })]} />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar datos" }));
    const dialog = screen.getByRole("dialog", { name: "Confirmar datos del comprobante" });
    expect(within(dialog).getByRole("button", { name: label })).toBeEnabled();
    expect(dialog).not.toHaveTextContent("Informe de rendición");
    await userEvent.click(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/requests/req-1/receipts/receipt-1/confirm"));
  });

  it("keeps the REXAN report confirmation copy and makes the populated OCR panel flexible", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => path === "/requests/req-1/receipts" ? [makeReceiptReview()] : []);
    const { container } = render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT })}
      documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT })]} />);
    const summary = await screen.findByText(/Proveedor SAC · F001-123 · PEN 150.5/);
    expect(summary.closest('[role="status"]')).toHaveClass("w-full");
    expect(container.querySelector('[role="status"]')).toHaveTextContent("RUC: 20123456789");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar datos" }));
    expect(screen.getByRole("button", { name: "Confirmar para informe" })).toBeInTheDocument();
  });

  it("keeps loading OCR status compact and never offers OCR review for supplier RHE/CASH", async () => {
    const { rerender } = render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
      documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE })]} />);
    expect(screen.getByText("Procesando comprobante").closest('[role="status"]')).toHaveClass("w-full");
    rerender(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
      documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT })]} />);
    expect(screen.queryByText("Procesando comprobante")).not.toBeInTheDocument();
    rerender(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
      documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT })]} />);
    expect(screen.queryByRole("button", { name: "Confirmar datos" })).not.toBeInTheDocument();
  });

  it("reviews a supplier boleta through the existing PATCH without removing duplicate warnings", async () => {
    const duplicate = makeReceiptReview();
    duplicate.receipt.receipt_type = REQUEST_RECEIPT_TYPE.SALES_RECEIPT;
    duplicate.duplicate_candidates = [{
      receipt_id: "other-receipt", request_id: "other-request", document_id: null,
      issuer_document_number: "20123456789", series: "B001", number: "123",
      issue_date: "2026-05-01", amount: 150.5,
    }];
    vi.mocked(api.get).mockImplementation(async (path) => path === "/requests/req-1/receipts" ? [duplicate] : []);
    vi.mocked(api.patch).mockResolvedValue(duplicate);
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
      documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT })]} />);
    expect(await screen.findByText(/Ya existe un comprobante con la misma serie/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revisar datos del comprobante" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/requests/req-1/receipts/receipt-1", expect.objectContaining({ series: "F001", currency: "PEN" }),
    ));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("uses a neutral supplier label when the persisted normalized category is unknown", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => path === "/requests/req-1/receipts" ? [makeReceiptReview()] : []);
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })}
      documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        document_category_normalized: "LEGACY_UNKNOWN" as RequestDocument["document_category_normalized"] })]} />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar datos" }));
    expect(screen.getByRole("button", { name: "Confirmar comprobante" })).toBeInTheDocument();
  });

  it("mantiene el diálogo y enfoca el error cuando la confirmación del comprobante queda bloqueada", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [makeReceiptReview()];
      return [
        makeDocument({
          document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          original_filename: "Factura.pdf",
        }),
      ];
    });
    vi.mocked(api.post).mockRejectedValue(
      makeUploadError(
        409,
        "Completa los datos del comprobante antes de confirmar.",
      ),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
        })}
      />,
    );

    expect(await screen.findByText("Factura.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmar datos/i }));
    await user.click(
      await screen.findByRole("button", { name: /confirmar para informe/i }),
    );

    const blocker = await screen.findByText(
      /Completa los datos del comprobante antes de confirmar.*La confirmación sigue abierta/i,
    );
    expect(blocker).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: /confirmar datos del comprobante/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveTextContent(
        /Completa los datos del comprobante/i,
      ),
    );
  });

  it("muestra el PxQ requerido y permite adjuntarlo desde su botón directo", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({ id: "doc-2", original_filename: "pxq.xlsx" }),
    );

    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    expect(await screen.findByText("PXQ")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();

    const file = new File(["contenido"], "pxq.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(screen.getByLabelText(/seleccionar pxq/i), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith(
        "/requests/req-1/documents",
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.PXQ,
    );
  });

  it("no usa PxQ pendiente como categoría inicial del cargador de otros documentos", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({ id: "doc-2", original_filename: "sustento.pdf" }),
    );

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })}
      />,
    );

    expect(await screen.findByText("PXQ")).toBeInTheDocument();
    expect(
      screen.getByText(/puedes seleccionar hasta 20 archivos/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/archivo/i)).toHaveAttribute(
      "accept",
      expect.stringContaining(".pdf"),
    );
    expect(screen.getByLabelText(/archivo/i)).not.toHaveAttribute(
      "accept",
      expect.stringContaining(".xlsx"),
    );

    const file = new File(["contenido"], "sustento.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith(
        "/requests/req-1/documents",
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT,
    );
  });

  it("sube directamente el comprobante de reembolso desde el checklist requerido", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(
      makeDocument({ id: "doc-2", original_filename: "comprobante.pdf" }),
    );

    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })}
      />,
    );

    const file = new File(["contenido"], "comprobante.pdf", {
      type: "application/pdf",
    });
    const checklistInput = await screen.findByLabelText(
      /seleccionar comprobante$/i,
    );
    expect(checklistInput).toHaveAttribute(
      "accept",
      expect.stringContaining(".pdf"),
    );
    fireEvent.change(checklistInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith(
        "/requests/req-1/documents",
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    );
  });

  it("muestra Subiendo solo en la fila requerida que está cargando", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const deferredUpload = createDeferred<RequestDocument>();
    vi.mocked(api.postForm).mockReturnValue(deferredUpload.promise);

    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })}
      />,
    );

    const file = new File(["contenido"], "comprobante.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(
      await screen.findByLabelText(/seleccionar comprobante$/i),
      { target: { files: [file] } },
    );

    expect(
      await screen.findByRole("button", { name: /^subiendo/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^subiendo/i })).toHaveLength(
      1,
    );

    await act(async () => {
      deferredUpload.resolve(
        makeDocument({
          id: "doc-2",
          document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
        }),
      );
      await deferredUpload.promise;
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
           name: /^adjuntar comprobante$/i,
        }),
      ).toBeEnabled(),
    );
  });

  it("muestra Subiendo solo en el cargador genérico cuando se adjunta otro documento", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const deferredUpload = createDeferred<RequestDocument>();
    vi.mocked(api.postForm).mockReturnValue(deferredUpload.promise);

    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })}
      />,
    );

    expect(
      await screen.findByText("Comprobante real vinculado"),
    ).toBeInTheDocument();

    const file = new File(["contenido"], "sustento.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(
      await screen.findByRole("button", { name: /^adjuntando/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
         name: /^adjuntar comprobante$/i,
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /subiendo.*comprobante/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^adjuntando/i }),
    ).toHaveLength(1);

    await act(async () => {
      deferredUpload.resolve(
        makeDocument({
          id: "doc-2",
          document_category: REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT,
        }),
      );
      await deferredUpload.promise;
    });
    expect(
      await screen.findByText("1 documento adjuntado correctamente."),
    ).toBeInTheDocument();
  });

  it("mantiene el botón de checklist solo para documentos requeridos pendientes", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [];
      return [
        makeDocument({
          document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
          original_filename: "Comprobante.pdf",
        }),
      ];
    });

    render(
      <RequestDocumentsCard
        request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })}
      />,
    );

    expect(
      await screen.findByText("Comprobante real vinculado"),
    ).toBeInTheDocument();
    expect(
       screen.getByLabelText(/seleccionar comprobante$/i),
    ).toHaveAttribute("accept", expect.stringContaining(".pdf"));
  });

  it("aclara que el cargador genérico acepta hasta 20 archivos por tanda", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

     expect(await screen.findByRole("heading", { name: "Otros documentos" })).toBeInTheDocument();
    expect(
      screen.getByText(/puedes seleccionar hasta 20 archivos/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/máximo 20 archivos por tanda/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/archivo/i)).toHaveAttribute("multiple");
  });

  it("muestra nombres UTF-8 cuando llegan con mojibake latin1", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({ original_filename: "PlanificaciÃ³n aÃ±o.xlsx" }),
    ]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(
      await screen.findByText("Planificación año.xlsx"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("PlanificaciÃ³n aÃ±o.xlsx"),
    ).not.toBeInTheDocument();
  });

  it("muestra mensajes faltantes de la validación final", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(
      <RequestDocumentsCard
        request={makeRequest()}
        backendMissingMessages={["Falta adjuntar Excel PxQ."]}
      />,
    );

    expect(
      await screen.findByText("Documentos requeridos pendientes"),
    ).toBeInTheDocument();
    expect(screen.getByText("Falta adjuntar Excel PxQ.")).toBeInTheDocument();
  });

  it("bloquea archivo inválido antes de llamar al backend", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    const file = new File(["texto"], "nota.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/archivo/i), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(/formato no permitido/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeDisabled();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("oculta acciones de carga y eliminación para solicitudes no editables", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);

    render(
      <RequestDocumentsCard
        request={makeRequest({ status: REQUEST_STATUS.SUBMITTED })}
      />,
    );

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /adjuntar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /eliminar/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/borrador u observación/i)).toBeInTheDocument();
  });

  it("mantiene el detalle de un borrador en solo lectura cuando readOnly está activo", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);

    render(<RequestDocumentsCard request={makeRequest()} readOnly />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(/esta vista no permite adjuntar ni eliminar archivos/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /los documentos se gestionan desde el flujo de edición del borrador/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /adjuntar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /eliminar/i }),
    ).not.toBeInTheDocument();
  });

  it("omite el cargador opcional cuando hideOptionalUploader está activo", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);

    render(
      <RequestDocumentsCard
        request={makeRequest()}
        readOnly
        hideOptionalUploader
      />,
    );

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Otros documentos")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /los documentos se gestionan desde el flujo de edición del borrador/i,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /adjuntar/i }),
    ).not.toBeInTheDocument();
  });
});
