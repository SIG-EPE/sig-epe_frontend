import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    document_category: REQUEST_DOCUMENT_CATEGORY.SUPPORT,
    safe_filename: "sustento.pdf",
    original_filename: "Sustento.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    sha256_hash: "hash",
    storage_provider: "local",
    upload_status: "UPLOADED",
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
    render(<RequestDocumentsCard request={makeRequest()} />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Sustento").length).toBeGreaterThan(0);
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /eliminar/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/requests/req-1/documents/doc-1");
    });
  });

  it("sube un archivo válido usando multipart", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.postForm).mockResolvedValue(makeDocument({ id: "doc-2", original_filename: "nuevo.pdf" }));

    const user = userEvent.setup();
    render(<RequestDocumentsCard request={makeRequest()} />);

    const file = new File(["contenido"], "nuevo.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /adjuntar/i }));

    await waitFor(() => {
      expect(api.postForm).toHaveBeenCalledWith("/requests/req-1/documents", expect.any(FormData));
    });
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("document_category")).toBe(REQUEST_DOCUMENT_CATEGORY.SUPPORT);
  });

  it("oculta acciones de carga y eliminación para solicitudes no editables", async () => {
    vi.mocked(api.get).mockResolvedValue([makeDocument()]);

    render(<RequestDocumentsCard request={makeRequest({ status: REQUEST_STATUS.SUBMITTED })} />);

    expect(await screen.findByText("Sustento.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adjuntar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });
});
