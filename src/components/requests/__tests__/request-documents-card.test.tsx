import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequestDocumentsCard } from "@/components/requests/request-documents-card";
import { api, ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_RECEIPT_DUPLICATE_STATUS, REQUEST_RECEIPT_OCR_STATUS, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestDocument, type RequestReceiptReview } from "@/types/requests";

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

function makeReceiptReview(overrides: Partial<RequestReceiptReview> = {}): RequestReceiptReview {
  return {
    receipt: {
      id: "receipt-1",
      request_id: "req-1",
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

describe("RequestDocumentsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(await screen.findByText(/puede enviar una notificación por correo/i)).toBeInTheDocument();
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

  it("muestra datos detectados del comprobante y permite corregirlos", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/requests/req-1/receipts") return [makeReceiptReview()];
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
    expect(screen.getByText("Datos detectados")).toBeInTheDocument();
    expect(screen.getByText(/Proveedor SAC · F001-123 · PEN 150.5/i)).toBeInTheDocument();
    expect(screen.getByText("RUC: 20123456789")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revisar datos/i }));
    const providerInput = await screen.findByLabelText(/proveedor/i);
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

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/requests/req-1/receipts/receipt-1/confirm");
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/requests/req-1/receipts");
    });
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
    expect(screen.getByText(/usa este cargador solo para documentos adicionales que no se solicitan en el checklist/i)).toBeInTheDocument();
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

    expect(await screen.findByRole("button", { name: /^subiendo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /adjuntar informe de rendición excel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /adjuntar comprobante/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /subiendo.*informe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /subiendo.*comprobante/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^subiendo/i })).toHaveLength(1);

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

  it("aclara que el cargador genérico acepta un solo archivo por carga", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(await screen.findByText(/otros documentos/i)).toBeInTheDocument();
    expect(screen.getByText(/este cargador adjunta un archivo por vez/i)).toBeInTheDocument();
    expect(screen.getByText(/selecciona un solo archivo por carga/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/archivo/i)).not.toHaveAttribute("multiple");
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
});
