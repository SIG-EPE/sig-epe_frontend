import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequestDocumentsCard } from "@/components/requests/request-documents-card";
import { api } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestDocument } from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
    postForm: vi.fn(),
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

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.SUPPLIER_PAYMENT })} />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Sustento de solicitud").length).toBeGreaterThan(0);
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Proveedor: Google Drive")).toBeInTheDocument();
    expect(screen.getByText("Estado: Guardado")).toBeInTheDocument();
    expect(screen.getByText("Enlace no disponible")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /eliminar/i }));
    await user.click(screen.getByRole("button", { name: /eliminar documento/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/requests/req-1/documents/doc-1");
    });
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
    await user.click(screen.getByRole("button", { name: /adjuntar/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.RECEIPT);
    expect(await screen.findByText(/puede enviar una notificación por correo/i)).toBeInTheDocument();
  });

  it("muestra checklist requerido y permite Excel para PxQ", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-2", original_filename: "pxq.xlsx" }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest({ request_type: REQUEST_TYPE.ADVANCE })} />);

    expect(await screen.findByText("Excel PxQ")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText(/formatos esperados: XLS o XLSX/i)).toBeInTheDocument();

    const file = new File(["contenido"], "pxq.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /adjuntar/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.PXQ);
  });

  it("muestra mensajes faltantes de la validación final", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} backendMissingMessages={["Falta adjuntar Excel PxQ."]} />);

    expect(await screen.findByText(/documentos requeridos pendientes/i)).toBeInTheDocument();
    expect(screen.getByText("Falta adjuntar Excel PxQ.")).toBeInTheDocument();
  });

  it("bloquea archivo inválido antes de llamar al backend", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<RequestDocumentsCard request={makeRequest()} />);

    const file = new File(["texto"], "nota.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [file] } });

    expect(await screen.findByText(/formato no permitido/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adjuntar/i })).toBeDisabled();
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
});
