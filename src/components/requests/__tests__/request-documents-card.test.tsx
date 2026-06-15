import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequestDocumentsCard } from "@/components/requests/request-documents-card";
import { api, ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_SCOPE_TYPE, REQUEST_RECEIPT_DUPLICATE_STATUS, REQUEST_RECEIPT_OCR_STATUS, REQUEST_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type PaymentRequest, type RequestAllocation, type RequestDocument, type RequestReceiptReview } from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public body: { statusCode: number; message: string; error: string; timestamp: string; path: string },
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

function makeDocument(overrides: Partial<RequestDocument> = {}): RequestDocument {
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

function makeAllocation(overrides: Partial<RequestAllocation> = {}): RequestAllocation {
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

function makeReceiptReview(overrides: Partial<RequestReceiptReview> = {}): RequestReceiptReview {
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

function makeUploadError(status: number, message: string, code?: string): ApiRequestError {
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
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { value: vi.fn(), configurable: true });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
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

  it("renderiza documentos existentes y permite eliminarlos cuando la solicitud es editable", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);
    vi.mocked(api.delete).mockResolvedValue(undefined);

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Sustento de solicitud").length).toBeGreaterThan(0);
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Proveedor: Google Drive")).toBeInTheDocument();
    expect(screen.getByText("Estado: Guardado")).toBeInTheDocument();
    expect(screen.getByText("Enlace no disponible")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: /eliminar documento/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/requests/req-1/documents/doc-1");
    });
  }, 10_000);

  it("notifica cambios al eliminar un documento para refrescar recursos relacionados", async () => {
    const onDocumentsChanged = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.delete).mockResolvedValue(undefined);

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [makeAllocation()] })} documents={[makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT })]} onDocumentsChanged={onDocumentsChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: /eliminar documento/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/requests/req-1/documents/doc-1");
      expect(onDocumentsChanged).toHaveBeenCalled();
    });
  });

  it("oculta acciones de documentos y revisión OCR cuando el informe generado está bloqueado", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce([makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT })])
      .mockResolvedValueOnce([makeReceiptReview()]);

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [makeAllocation()] })} structuredReportLocked />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.getByText(/El informe generado bloquea la carga, eliminación y revisión de comprobantes/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adjuntar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Eliminar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar datos/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar datos/i })).not.toBeInTheDocument();
  });

  it("reabre acciones de comprobantes y evita constancia global cuando la rendición estructurada está observada", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce([makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT })])
      .mockResolvedValueOnce([makeReceiptReview()]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({
      id: "return-proof-1",
      document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
      original_filename: "constancia-devolucion.pdf",
    }));

    render(<RequestDocumentsCard request={makeRequest({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.OBSERVED,
      rexan_outcome: REXAN_OUTCOME.DEVOLUCION,
      rexan_return_proof_document_id: null,
      allocations: [makeAllocation()],
      observations: [{
        id: "obs-1",
        payment_request_id: "req-1",
        observer_id: "giof-1",
        field_reference: "Constancia de devolución",
        comment: "Por favor adjunta la constancia de devolución por S/ 20.00 para continuar.",
        is_resolved: false,
        resolved_at: null,
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z",
      }],
    })} structuredReportLocked />);

    expect(await screen.findByText("Comprobantes por línea POA")).toBeInTheDocument();
    expect(screen.queryByText("Constancia de devolución")).not.toBeInTheDocument();
    expect(screen.getByText(/La rendición fue observada; puedes actualizar sustentos y regenerar el informe antes de reenviar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Revisar datos/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Confirmar datos/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Adjuntar$/i })).toBeInTheDocument();
    expect(screen.queryByText(/El informe generado bloquea la carga, eliminación y revisión de comprobantes/i)).not.toBeInTheDocument();
  });

  it("muestra un enlace visible de Drive para revisores GIOF sin habilitar acciones de edición", async () => {
    const driveWebUrl = "https://drive.google.com/file/d/doc-1/view";
    vi.mocked(api.get).mockResolvedValue([makeDocument({ drive_web_url: driveWebUrl })]);
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

    render(<RequestDocumentsCard request={makeRequest({ status: REQUEST_STATUS.SUBMITTED })} />);

    const link = await screen.findByRole("link", { name: /ver documento/i });
    expect(link).toHaveAttribute("href", driveWebUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("button", { name: /adjuntar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no se muestran enlaces de drive/i)).not.toBeInTheDocument();
  });

  it("mantiene a GIOF solo en lectura para una REXAN observada", async () => {
    const driveWebUrl = "https://drive.google.com/file/d/doc-1/view";
    vi.mocked(api.get).mockResolvedValue([makeDocument({ drive_web_url: driveWebUrl })]);
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

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, status: REQUEST_STATUS.OBSERVED })} />);

    expect(await screen.findByRole("link", { name: /ver documento/i })).toHaveAttribute("href", driveWebUrl);
    expect(screen.queryByRole("button", { name: /adjuntar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/GIOF solo puede revisar los documentos de una rendición observada/i)).toBeInTheDocument();
  });

  it("explica que los documentos compartidos pueden abrirse cuando el acceso fue habilitado", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(await screen.findByText(/podrás abrir los documentos compartidos/i)).toBeInTheDocument();
    expect(screen.getByText(/cuando el acceso haya sido habilitado/i)).toBeInTheDocument();
  });

  it("muestra una indicación no intrusiva cuando el documento no tiene enlace", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument({ drive_web_url: null })]);

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    expect(await screen.findByText("Enlace no disponible")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ver documento/i })).not.toBeInTheDocument();
  });

  it("sube un archivo válido usando multipart", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-2", original_filename: "nuevo.pdf" }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    const file = new File(["contenido"], "nuevo.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT);
    expect(await screen.findByText("1 documento adjuntado correctamente.")).toBeInTheDocument();
  });

  it("sube el PxQ de una línea POA con alcance de asignación", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-alloc-1", original_filename: "pxq.xlsx" }));

    render(<RequestDocumentsCard request={makeRequest({ allocations: [makeAllocation({ id: "alloc-1" })] })} />);

    expect(await screen.findByText(/documentos por línea poa/i)).toBeInTheDocument();

    const file = new File(["contenido"], "pxq.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText(/seleccionar excel pxq/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.PXQ);
    expect(formData.get("scope_type")).toBe(REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION);
    expect(formData.get("request_allocation_id")).toBe("alloc-1");
  });

  it("no marca otra línea POA como satisfecha cuando solo una tiene PxQ", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({
        id: "doc-alloc-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
        original_filename: "pxq-linea-1.xlsx",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: "alloc-1",
      }),
    ]);

    render(<RequestDocumentsCard request={makeRequest({ allocations: [
      makeAllocation({ id: "alloc-1", budget_planning_line_id: "line-1" }),
      makeAllocation({ id: "alloc-2", budget_planning_line_id: "line-2", amount: 200, sort_order: 2, planning_line: {
        ...makeAllocation().planning_line!,
        id: "line-2",
        line_code: "POA-2",
        resource_description: "Servicios logísticos",
      } }),
    ] })} />);

    expect(await screen.findByText("pxq-linea-1.xlsx")).toBeInTheDocument();
    const groups = screen.getAllByTestId("allocation-documents-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Completo");
    expect(groups[0]).toHaveTextContent("Adjunto");
    expect(groups[1]).toHaveTextContent("Pendiente");
    expect(groups[1]).toHaveTextContent("Falta adjuntar Excel PxQ.");
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

    render(<RequestDocumentsCard request={makeRequest({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      allocations: [makeAllocation({ id: "alloc-1" }), makeAllocation({
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
      })],
    })} />);

    expect(await screen.findByText(/cada línea POA debe tener al menos un comprobante/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Comprobantes por línea POA/i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("allocation-documents-groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Excel PxQ")).not.toBeInTheDocument();
    expect(screen.queryByText("Falta adjuntar Excel PxQ.")).not.toBeInTheDocument();
    expect(screen.queryByText("Comprobante de la rendición")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("settlement-receipt-group")).toHaveLength(2);
    expect(screen.getByText(/POA-1/)).toBeInTheDocument();
    expect(screen.getByText(/POA-2/)).toBeInTheDocument();
    expect(screen.getByText("Comprobante.pdf")).toBeInTheDocument();
  });

  it("muestra líneas del anticipo como referencia si la rendición aún no trae líneas", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard
      request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, allocations: [] })}
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
    />);

    expect(await screen.findByText(/líneas POA del anticipo original como referencia/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("settlement-receipt-group")).toHaveLength(2);
    expect(screen.getByText(/POA-1/)).toBeInTheDocument();
    expect(screen.getByText(/POA-2/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /línea poa/i })).not.toBeInTheDocument();
  });

  it("sube un comprobante de rendición asociado a una línea POA", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "receipt-alloc-1", document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      allocations: [makeAllocation({ id: "alloc-1" }), makeAllocation({ id: "alloc-2", sort_order: 2 })],
    })} />);

    const categoryTrigger = await screen.findByRole("combobox", { name: /categoría/i });
    await user.click(categoryTrigger);
    await user.click(await screen.findByRole("option", { name: /^comprobante$/i }));
    const allocationTrigger = screen.getByRole("combobox", { name: /línea poa/i });
    await user.click(allocationTrigger);
    await user.click(await screen.findByRole("option", { name: /línea 1/i }));
    const file = new File(["contenido"], "factura.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.RECEIPT);
    expect(formData.get("scope_type")).toBe(REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION);
    expect(formData.get("request_allocation_id")).toBe("alloc-1");
  });

  it("mantiene Adjuntar deshabilitado para comprobantes hasta seleccionar línea POA", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "receipt-alloc-1", document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      allocations: [makeAllocation({ id: "alloc-1" }), makeAllocation({ id: "alloc-2", sort_order: 2 })],
    })} />);

    const categoryTrigger = await screen.findByRole("combobox", { name: /categoría/i });
    await user.click(categoryTrigger);
    await user.click(await screen.findByRole("option", { name: /^comprobante$/i }));
    const file = new File(["contenido"], "factura.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });

    expect(screen.getAllByText("Selecciona la línea POA antes de adjuntar el comprobante.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: /línea poa/i }));
    await user.click(await screen.findByRole("option", { name: /línea 1/i }));

    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });

    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("request_allocation_id")).toBe("alloc-1");
  });

  it("usa etiquetas compactas para seleccionar líneas POA largas al adjuntar comprobantes", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      allocations: [makeAllocation({
        id: "alloc-1",
        planning_line: {
          ...makeAllocation().planning_line!,
          line_code: "POA-LARGA-2026",
          resource_description: "Descripción extensa de la línea POA para compras logísticas, materiales y servicios en territorio",
        },
      })],
    })} />);

    await user.click(await screen.findByRole("combobox", { name: /categoría/i }));
    await user.click(await screen.findByRole("option", { name: /^comprobante$/i }));
    await user.click(screen.getByRole("combobox", { name: /línea poa/i }));

    expect(await screen.findByRole("option", { name: "Línea 1 · POA-LARGA-2026" })).toBeInTheDocument();
  });

  it("marca completo el bloque con PxQ aunque el checklist del request aún venga pendiente", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeDocument({
        id: "doc-alloc-1",
        document_category: REQUEST_DOCUMENT_CATEGORY.PXQ,
        original_filename: "POA_ALL_CONTROL INTERNO.xlsx",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
        request_allocation_id: "alloc-1",
      }),
    ]);

    render(<RequestDocumentsCard request={makeRequest({ allocations: [
      makeAllocation({
        id: "alloc-1",
        document_checklist: {
          complete: false,
          required_documents: [{
            category: REQUEST_DOCUMENT_CATEGORY.PXQ,
            label: "Excel PxQ",
            required: true,
            satisfied: false,
          }],
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
          required_documents: [{
            category: REQUEST_DOCUMENT_CATEGORY.PXQ,
            label: "Excel PxQ",
            required: true,
            satisfied: false,
          }],
        },
      }),
    ] })} />);

    expect(await screen.findByText("POA_ALL_CONTROL INTERNO.xlsx")).toBeInTheDocument();
    const groups = screen.getAllByTestId("allocation-documents-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Completo");
    expect(groups[0]).toHaveTextContent("Adjunto");
    expect(groups[1]).toHaveTextContent("Pendiente");
  });

  it("mantiene la constancia de pago como documento general aunque se envíe alcance", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-payment", document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT, allocations: [makeAllocation({ id: "alloc-1" })] })} />);

    const categoryTrigger = await screen.findByRole("combobox", { name: /categoría/i });
    await user.click(categoryTrigger);
    await user.click(await screen.findByRole("option", { name: /constancia de pago/i }));
    const file = new File(["contenido"], "pago.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF);
    expect(formData.get("scope_type")).toBeNull();
    expect(formData.get("request_allocation_id")).toBeNull();
  });

  it("muestra el mensaje específico cuando el comprobante ya fue registrado", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockRejectedValue(new ApiRequestError(409, {
      statusCode: 409,
      message: "Esta factura ya fue registrada",
      error: "Conflict",
      timestamp: "2026-05-01T10:00:00.000Z",
      path: "/requests/req-1/documents",
    }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    const file = new File(["contenido"], "factura.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(await screen.findByText("Esta factura ya fue registrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeInTheDocument();
  });

  it("crea una cola de hasta 20 archivos y rechaza excedentes por archivo", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    const files = Array.from({ length: 21 }, (_, index) => new File([`contenido-${index}`], `archivo-${index + 1}.pdf`, { type: "application/pdf" }));
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files } });

    expect(await screen.findByText("Cola de carga")).toBeInTheDocument();
    expect(screen.getByText(/0 completados · 1 con incidencia · 20 pendientes/i)).toBeInTheDocument();
    expect(screen.getByText("archivo-1.pdf")).toBeInTheDocument();
    expect(screen.getByText("archivo-21.pdf")).toBeInTheDocument();
    expect(screen.getByText("Solo puedes cargar hasta 20 archivos por tanda.")).toBeInTheDocument();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("permite retirar pendientes y reintentar fallidos transitorios sin reenviar exitosos", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm)
      .mockRejectedValueOnce(makeUploadError(429, "Drive temporalmente limitado", "DRIVE_RATE_LIMITED"))
      .mockResolvedValueOnce(makeDocument({ id: "doc-retry", original_filename: "fallido.pdf" }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    const failedFile = new File(["contenido"], "fallido.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [failedFile] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(await screen.findByText("Drive temporalmente limitado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeEnabled();

    const pendingFile = new File(["contenido"], "pendiente.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [pendingFile] } });
    expect(await screen.findByText("pendiente.pdf")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /retirar/i }).at(-1)!);
    expect(screen.queryByText("pendiente.pdf")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("1 documento adjuntado correctamente.")).toBeInTheDocument();
  });

  it("muestra datos detectados del comprobante y permite corregirlos", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [makeReceiptReview({ receipt: { ...makeReceiptReview().receipt, issue_date: "2026-05-01T04:30:00.000Z" } })];
      return [makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT, original_filename: "Factura.pdf" })];
    });
    vi.mocked(api.patch).mockResolvedValue(makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        issuer_name: "Proveedor Corregido SAC",
      },
    }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    expect(await screen.findByText("Factura.pdf")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de confirmación")).toBeInTheDocument();
    expect(screen.getByText(/Proveedor SAC · F001-123 · PEN 150.5/i)).toBeInTheDocument();
    expect(screen.getByText("RUC: 20123456789")).toBeInTheDocument();
    expect(screen.getByText(/confirma los datos para usar este comprobante en el informe de rendición/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revisar datos/i }));
    const providerInput = await screen.findByLabelText(/proveedor/i);
    expect(screen.getByLabelText(/fecha del comprobante/i)).toHaveValue("2026-05-01");
    expect(screen.getByText(/selecciona solo día, mes y año/i)).toBeInTheDocument();
    fireEvent.change(providerInput, { target: { value: "Proveedor Corregido SAC" } });
    await user.click(screen.getByRole("button", { name: /guardar corrección/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/requests/req-1/receipts/receipt-1", expect.objectContaining({
        issuer_name: "Proveedor Corregido SAC",
        issuer_document_number: "20123456789",
      }));
    });
  });

  it("confirma datos detectados del comprobante y no muestra reintento de lectura", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [makeReceiptReview()];
      return [makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT, original_filename: "Factura.pdf" })];
    });
    vi.mocked(api.post).mockResolvedValue(makeReceiptReview({
      receipt: {
        ...makeReceiptReview().receipt,
        confirmed_by_id: "user-1",
        confirmed_at: "2026-05-01T11:00:00.000Z",
      },
    }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    expect(await screen.findByText("Factura.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar lectura/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirmar datos/i }));

    expect(await screen.findByRole("dialog", { name: /confirmar datos del comprobante/i })).toBeInTheDocument();
    expect(screen.getByText(/esta confirmación es necesaria para que el comprobante pueda agregarse al informe de rendición/i)).toBeInTheDocument();
    expect(screen.getByText(/después de confirmar, podrás seleccionar la línea poa/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmar para informe/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/requests/req-1/receipts/receipt-1/confirm");
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/requests/req-1/receipts");
      expect(api.get).toHaveBeenCalledWith("/requests/req-1/documents");
    });
  });

  it("mantiene el diálogo y enfoca el error cuando la confirmación del comprobante queda bloqueada", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [makeReceiptReview()];
      return [makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT, original_filename: "Factura.pdf" })];
    });
    vi.mocked(api.post).mockRejectedValue(makeUploadError(409, "Completa los datos del comprobante antes de confirmar."));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    expect(await screen.findByText("Factura.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmar datos/i }));
    await user.click(await screen.findByRole("button", { name: /confirmar para informe/i }));

    const blocker = await screen.findByText(/Completa los datos del comprobante antes de confirmar.*La confirmación sigue abierta/i);
    expect(blocker).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /confirmar datos del comprobante/i })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toHaveTextContent(/Completa los datos del comprobante/i));
  });

  it("muestra checklist requerido y permite Excel para PxQ desde su botón directo", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-2", original_filename: "pxq.xlsx" }));

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })} />);

    expect(await screen.findByText("Excel PxQ")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText(/formatos esperados: XLS o XLSX/i)).toBeInTheDocument();

    const file = new File(["contenido"], "pxq.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText(/seleccionar excel pxq/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.PXQ);
  });

  it("no usa PxQ pendiente como categoría inicial del cargador de otros documentos", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-2", original_filename: "sustento.pdf" }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })} />);

    expect(await screen.findByText("Excel PxQ")).toBeInTheDocument();
    expect(screen.getByText(/puedes seleccionar hasta 20 archivos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/archivo/i)).toHaveAttribute("accept", expect.stringContaining(".pdf"));
    expect(screen.getByLabelText(/archivo/i)).not.toHaveAttribute("accept", expect.stringContaining(".xlsx"));

    const file = new File(["contenido"], "sustento.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT);
  });

  it("sube directamente el archivo seleccionado desde el checklist requerido", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-2", original_filename: "comprobante.pdf" }));

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })} />);

    const file = new File(["contenido"], "comprobante.pdf", { type: "application/pdf" });
    const checklistInput = await screen.findByLabelText(/seleccionar comprobante/i);
    expect(checklistInput).toHaveAttribute("accept", expect.stringContaining(".pdf"));
    fireEvent.change(checklistInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.RECEIPT);
  });

  it("muestra Subiendo solo en la fila requerida que está cargando", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const deferredUpload = createDeferred<RequestDocument>();
    vi.mocked(api.postForm).mockReturnValue(deferredUpload.promise);

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })} />);

    const file = new File(["contenido"], "comprobante.pdf", { type: "application/pdf" });
    fireEvent.change(await screen.findByLabelText(/seleccionar comprobante/i), { target: { files: [file] } });

    expect(await screen.findByRole("button", { name: /^subiendo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /adjuntar informe de rendición excel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /subiendo.*informe/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^subiendo/i })).toHaveLength(1);

    deferredUpload.resolve(makeDocument({ id: "doc-2", document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT }));
  });

  it("muestra Subiendo solo en el cargador genérico cuando se adjunta otro documento", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const deferredUpload = createDeferred<RequestDocument>();
    vi.mocked(api.postForm).mockReturnValue(deferredUpload.promise);

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })} />);

    expect(await screen.findByText("Informe de rendición Excel")).toBeInTheDocument();

    const file = new File(["contenido"], "sustento.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /^adjuntar$/i }));

    expect(await screen.findByRole("button", { name: /^adjuntando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /adjuntar informe de rendición excel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /adjuntar comprobante/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /subiendo.*informe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /subiendo.*comprobante/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^adjuntando/i })).toHaveLength(1);

    deferredUpload.resolve(makeDocument({ id: "doc-2", document_category: REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT }));
  });

  it("mantiene el botón de checklist solo para documentos requeridos pendientes", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [];
      return [makeDocument({ document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT, original_filename: "Comprobante.pdf" })];
    });

    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT })} />);

    expect(await screen.findByText("Comprobante")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adjuntar comprobante/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/seleccionar informe de rendición excel/i)).toHaveAttribute("accept", expect.stringContaining(".xlsx"));
  });

  it("aclara que el cargador genérico acepta hasta 20 archivos por tanda", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(await screen.findByText(/otros documentos/i)).toBeInTheDocument();
    expect(screen.getByText(/puedes seleccionar hasta 20 archivos/i)).toBeInTheDocument();
    expect(screen.getByText(/máximo 20 archivos por tanda/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/archivo/i)).toHaveAttribute("multiple");
  });

  it("muestra nombres UTF-8 cuando llegan con mojibake latin1", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument({ original_filename: "PlanificaciÃ³n aÃ±o.xlsx" })]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(await screen.findByText("Planificación año.xlsx")).toBeInTheDocument();
    expect(screen.queryByText("PlanificaciÃ³n aÃ±o.xlsx")).not.toBeInTheDocument();
  });

  it("muestra mensajes faltantes de la validación final", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} backendMissingMessages={["Falta adjuntar Excel PxQ."]} />);

    expect(await screen.findByText("Documentos requeridos pendientes")).toBeInTheDocument();
    expect(screen.getByText("Falta adjuntar Excel PxQ.")).toBeInTheDocument();
  });

  it("bloquea archivo inválido antes de llamar al backend", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    const file = new File(["texto"], "nota.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });

    expect(await screen.findByText(/formato no permitido/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^adjuntar$/i })).toBeDisabled();
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it("oculta acciones de carga y eliminación para solicitudes no editables", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);

    render(<RequestDocumentsCard request={makeRequest({ status: REQUEST_STATUS.SUBMITTED })} />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adjuntar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/borrador u observación/i)).toBeInTheDocument();
  });

  it("mantiene el detalle de un borrador en solo lectura cuando readOnly está activo", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);

    render(<RequestDocumentsCard request={makeRequest()} readOnly />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.getByText(/esta vista no permite adjuntar ni eliminar archivos/i)).toBeInTheDocument();
    expect(screen.getByText(/los documentos se gestionan desde el flujo de edición del borrador/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adjuntar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it("omite el cargador opcional cuando hideOptionalUploader está activo", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);

    render(<RequestDocumentsCard request={makeRequest()} readOnly hideOptionalUploader />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Otros documentos")).not.toBeInTheDocument();
    expect(screen.queryByText(/los documentos se gestionan desde el flujo de edición del borrador/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adjuntar/i })).not.toBeInTheDocument();
  });
});
