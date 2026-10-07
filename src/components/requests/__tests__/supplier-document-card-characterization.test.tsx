import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestDocumentsCard } from "@/components/requests/request-documents-card";
import { api } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import {
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_RECEIPT_DUPLICATE_STATUS,
  REQUEST_RECEIPT_OCR_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  SUPPLIER_DOCUMENT_ACTIVITY_STATE,
  SUPPLIER_DOCUMENT_ELIGIBILITY_STATE,
  SUPPLIER_DOCUMENT_PROJECTION_REASON,
  SUPPLIER_DOCUMENT_PROJECTION_STATE,
  type PaymentRequest,
  type RequestDocument,
  type RequestReceiptReview,
  type SupplierDocumentEvidenceProjection,
} from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const PRIMARY_CATEGORIES = [
  REQUEST_DOCUMENT_CATEGORY.INVOICE,
  REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
  REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT,
] as const;

const COMPLEMENTARY_CATEGORIES = [
  REQUEST_DOCUMENT_CATEGORY.QUOTATION,
  REQUEST_DOCUMENT_CATEGORY.CONTRACT,
  REQUEST_DOCUMENT_CATEGORY.EVIDENCE,
  REQUEST_DOCUMENT_CATEGORY.FOURTH_CATEGORY_SUSPENSION,
  REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET,
  REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION,
  REQUEST_DOCUMENT_CATEGORY.OTHER,
] as const;

function request(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "request-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.SUPPLIER_PAYMENT,
    status: REQUEST_STATUS.DRAFT,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Pago caracterizado",
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
    declares_rus: null,
    declares_casa_de_retiro: null,
    uit_year_applied: 2026,
    uit_amount_applied: "5500.00",
    submitted_at: null,
    observed_at: null,
    approved_at: null,
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-09-22T12:00:00.000Z",
    updated_at: "2026-09-22T12:00:00.000Z",
    ...overrides,
  };
}

function document(
  id: string,
  category: RequestDocument["document_category"],
): RequestDocument {
  return {
    id,
    payment_request_id: "request-1",
    document_category: category,
    document_category_normalized: category,
    safe_filename: `${id}.pdf`,
    original_filename: `${id}.pdf`,
    mime_type: "application/pdf",
    size_bytes: 128,
    sha256_hash: "hash",
    storage_provider: "DRIVE",
    drive_web_url: `https://drive.google.com/file/d/${id}`,
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    uploaded_by_id: "user-1",
    created_at: "2026-09-22T12:00:00.000Z",
  };
}

function evidence(
  documents: SupplierDocumentEvidenceProjection["documents"] = [],
): SupplierDocumentEvidenceProjection {
  const primarySatisfied = documents.some((item) => item.eligible);
  return {
    state: primarySatisfied
      ? SUPPLIER_DOCUMENT_PROJECTION_STATE.READY
      : SUPPLIER_DOCUMENT_PROJECTION_STATE.BLOCKED,
    eligible: primarySatisfied,
    primary_satisfied: primarySatisfied,
    reason_code: primarySatisfied
      ? null
      : SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED,
    allowed_categories: [...PRIMARY_CATEGORIES, ...COMPLEMENTARY_CATEGORIES],
    documents,
  };
}

function evidenceResource(value: SupplierDocumentEvidenceProjection) {
  return {
    evidence: value,
    data: value,
    isInitialLoading: false,
    isRefreshing: false,
    isLoading: false,
    isBlocking: !value.primary_satisfied,
    error: null,
    retry: vi.fn().mockResolvedValue(undefined),
    refetch: vi.fn().mockResolvedValue(undefined),
    commitEvidence: vi.fn(),
  };
}

function receiptReview(documentId: string): RequestReceiptReview {
  return {
    receipt: {
      id: `receipt-${documentId}`,
      request_id: "request-1",
      request_allocation_id: null,
      document_id: documentId,
      receipt_type: "INVOICE",
      issuer_document_type: "RUC",
      issuer_document_number: "20123456789",
      issuer_name: "Proveedor",
      series: "F001",
      number: "1",
      issue_date: "2026-09-22",
      amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      duplicate_status: REQUEST_RECEIPT_DUPLICATE_STATUS.UNIQUE,
      ocr_status: REQUEST_RECEIPT_OCR_STATUS.SUCCESS,
      corrected_fields: null,
      confirmed_by_id: null,
      confirmed_at: null,
    },
    latest_extraction: null,
    duplicate_candidates: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("supplier document card approved grouping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue([]);
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

  it("renders exactly four primary and seven complementary responsive category cards", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    const primary = screen.getByRole("region", { name: "Documento principal" });
    const complementary = screen.getByRole("region", {
      name: "Documentos complementarios",
    });
    expect(within(primary).getAllByRole("article")).toHaveLength(4);
    expect(within(complementary).getAllByRole("article")).toHaveLength(7);
    expect(within(primary).getByTestId("supplier-primary-grid")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-2",
    );
    expect(
      within(complementary).getByTestId("supplier-complementary-grid"),
    ).toHaveClass("grid-cols-1", "md:grid-cols-2");

    for (const label of [
      "Factura",
      "Recibo por honorarios",
      "Boleta",
      "Recibo de caja",
      "Cotización",
      "Contrato o convenio",
      "Evidencias",
      "Suspensión de 4ta categoría",
      "Planilla de movilidad",
      "Declaración Jurada",
      "Otros documentos",
    ]) {
      expect(screen.getByRole("heading", { name: label })).toBeVisible();
    }
    expect(
      screen.queryByText("Checklist de documentos generales"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
    expect(screen.queryByText(/RUS:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Casa de Retiro:/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Adjuntar Comprobante/i }),
    ).not.toBeInTheDocument();

    const otherCard = screen.getByTestId("supplier-category-OTHER");
    expect(
      within(otherCard).getByLabelText("Nombre del documento"),
    ).toBeVisible();
    expect(
      within(otherCard).getByLabelText("Archivo de Otros documentos"),
    ).toBeEnabled();
    expect(
      within(otherCard).getByRole("button", {
        name: "Adjuntar Otros documentos",
      }),
    ).toBeDisabled();
  });

  it("exposes the approved landmark and heading hierarchy in DOM reading order", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[document("historico-1", REQUEST_DOCUMENT_CATEGORY.RECEIPT)]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Documentos adjuntos" }),
    ).toBeVisible();
    const sectionHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(sectionHeadings.map((heading) => heading.textContent)).toEqual([
      "Documento principal",
      "Documentos complementarios",
      "Documentos históricos",
    ]);
    expect(
      screen.getByRole("heading", { level: 4, name: "Factura" }),
    ).toBeVisible();
  });

  it("gives every supplier upload control a category-specific accessible name", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    for (const label of [
      "Factura",
      "Recibo por honorarios",
      "Boleta",
      "Recibo de caja",
      "Cotización",
      "Contrato o convenio",
      "Evidencias",
      "Suspensión de 4ta categoría",
      "Planilla de movilidad",
      "Declaración Jurada",
    ]) {
      expect(
        screen.getByRole("button", { name: `Adjuntar ${label}` }),
      ).toBeVisible();
      expect(screen.getByLabelText(`Seleccionar ${label}`)).toBeInTheDocument();
    }
    const otherCard = screen.getByRole("article", {
      name: "Otros documentos",
    });
    expect(
      within(otherCard).getByLabelText("Archivo de Otros documentos"),
    ).toBeEnabled();
    expect(
      within(otherCard).getByRole("button", {
        name: "Adjuntar Otros documentos",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /^Adjuntar archivo$/ }),
    ).not.toBeInTheDocument();
  });

  it("announces only the authoritative aggregate state and moves focus after retry succeeds", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const failedResource = {
      ...evidenceResource(evidence()),
      evidence: null,
      data: null,
      isBlocking: true,
      error: new Error("network unavailable"),
      retry,
      refetch: retry,
    };
    const { rerender } = render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={failedResource as never}
      />,
    );

    const alert = screen.getByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Documento principal",
    });
    await waitFor(() => expect(heading).toHaveFocus());
    const aggregateStatus = screen.getByRole("status", {
      name: "Estado del requisito de documento principal",
    });
    expect(aggregateStatus).toHaveAttribute("aria-live", "polite");
    expect(aggregateStatus).toHaveTextContent("Pendiente · 0 válidos");
  });

  it("uses one live announcement path for a completed OTHER upload", async () => {
    vi.mocked(api.postForm).mockResolvedValue(
      document("other-uploaded", REQUEST_DOCUMENT_CATEGORY.OTHER),
    );
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const otherCard = screen.getByTestId("supplier-category-OTHER");
    fireEvent.change(within(otherCard).getByLabelText("Nombre del documento"), {
      target: { value: "Informe de visita" },
    });
    fireEvent.change(
      within(otherCard).getByLabelText("Archivo de Otros documentos"),
      {
        target: {
          files: [
            new File(["other"], "visita.pdf", { type: "application/pdf" }),
          ],
        },
      },
    );
    fireEvent.click(
      within(otherCard).getByRole("button", {
        name: "Adjuntar Otros documentos",
      }),
    );

    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(
      screen.queryByText("Documento adjuntado correctamente"),
    ).not.toBeInTheDocument();
  });

  it("associates the OTHER help and validation and supports a keyboard upload flow", async () => {
    vi.mocked(api.postForm).mockResolvedValue(
      document("other-uploaded", REQUEST_DOCUMENT_CATEGORY.OTHER),
    );
    const user = userEvent.setup();
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const otherCard = screen.getByRole("article", {
      name: "Otros documentos",
    });
    const title = within(otherCard).getByLabelText("Nombre del documento");
    const chooser = within(otherCard).getByLabelText(
      "Archivo de Otros documentos",
    );

    await user.type(title, "ab");
    await user.tab();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(
      /Nombre opcional de 3 a 120 caracteres\. En blanco se usa el nombre original del archivo\..*Ingresa un nombre de 3 a 120 caracteres\./,
    );
    expect(chooser).toBeDisabled();

    await user.clear(title);
    expect(title).not.toHaveAttribute("aria-invalid", "true");
    expect(chooser).toBeEnabled();
    await user.type(title, "Informe de visita");
    expect(chooser).toBeEnabled();
    await user.upload(
      chooser,
      new File(["other"], "visita.pdf", { type: "application/pdf" }),
    );
    await user.tab();
    const submit = within(otherCard).getByRole("button", {
      name: "Adjuntar Otros documentos",
    });
    expect(submit).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
  });

  it("communicates historical read-only links and responsive overflow safeguards", () => {
    const historical = document(
      "historico-1",
      REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    );
    historical.original_filename = `${"archivo-muy-largo-".repeat(8)}.pdf`;
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[historical]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    const section = screen.getByRole("region", {
      name: "Documentos históricos",
    });
    expect(within(section).getByText("Solo lectura")).toBeVisible();
    const link = within(section).getByRole("link", {
      name: /Ver documento .*se abre en una pestaña nueva/,
    });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveClass("min-h-11");
    expect(
      within(section)
        .getByText(historical.original_filename)
        .closest("div.flex.min-w-0"),
    ).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("supplier-complementary-grid")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-2",
    );
    expect(screen.getByTestId("supplier-complementary-grid")).not.toHaveClass(
      "xl:grid-cols-3",
    );
  });

  it("shows the authoritative pending and satisfied count without local inference", () => {
    const pending = evidence();
    const { rerender } = render(
      <RequestDocumentsCard
        request={request()}
        documents={[
          document("local-invoice", REQUEST_DOCUMENT_CATEGORY.INVOICE),
        ]}
        supplierEvidenceResource={evidenceResource(pending)}
      />,
    );

    expect(screen.getByText("Debes adjuntar al menos uno.")).toBeVisible();
    expect(screen.getByText("Pendiente · 0 válidos")).toBeVisible();

    const satisfied = evidence([
      {
        id: "server-invoice",
        stored_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        effective_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
        activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.ACTIVE,
        eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.ELIGIBLE,
        eligible: true,
        reason_code: null,
      },
      {
        id: "server-boleta",
        stored_category: REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
        effective_category: REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
        activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.ACTIVE,
        eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.ELIGIBLE,
        eligible: true,
        reason_code: null,
      },
    ]);
    rerender(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(satisfied)}
      />,
    );
    expect(
      screen.getByText("Requisito cumplido · 2 documentos válidos"),
    ).toBeVisible();
  });

  it("renders stable human-readable activity and eligibility reasons from the authoritative projection", () => {
    const pendingInvoice = document(
      "factura-pendiente",
      REQUEST_DOCUMENT_CATEGORY.INVOICE,
    );
    const deletedSalesReceipt = document(
      "boleta-eliminada",
      REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
    );
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[pendingInvoice, deletedSalesReceipt]}
        supplierEvidenceResource={evidenceResource(
          evidence([
            {
              id: pendingInvoice.id,
              stored_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
              effective_category: REQUEST_DOCUMENT_CATEGORY.INVOICE,
              activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.INACTIVE,
              eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.INELIGIBLE,
              eligible: false,
              reason_code:
                SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_NOT_PERMANENT,
            },
            {
              id: deletedSalesReceipt.id,
              stored_category: REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
              effective_category: REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT,
              activity_state: SUPPLIER_DOCUMENT_ACTIVITY_STATE.INACTIVE,
              eligibility_state: SUPPLIER_DOCUMENT_ELIGIBILITY_STATE.INELIGIBLE,
              eligible: false,
              reason_code: SUPPLIER_DOCUMENT_PROJECTION_REASON.DOCUMENT_DELETED,
            },
          ]),
        )}
      />,
    );

    expect(
      within(screen.getByTestId("supplier-category-INVOICE")).getByText(
        "Inactivo · No cuenta para el requisito. Aún no terminó de guardarse.",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("supplier-category-SALES_RECEIPT")).getByText(
        "Inactivo · No cuenta para el requisito. El documento fue eliminado.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/SUPPLIER_DOCUMENT_|DOCUMENT_NOT_PERMANENT/),
    ).not.toBeInTheDocument();
  });

  it("shows exact approved formats and OCR language only for Factura and Boleta", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    const expectedFormats = new Map([
      ["INVOICE", "PDF, JPG, JPEG o PNG"],
      ["PROFESSIONAL_FEE_RECEIPT", "PDF, JPG, JPEG o PNG"],
      ["SALES_RECEIPT", "PDF, JPG, JPEG o PNG"],
      ["CASH_RECEIPT", "PDF, JPG, JPEG o PNG"],
      ["QUOTATION", "PDF, JPG, JPEG o PNG"],
      ["CONTRACT", "PDF"],
      ["EVIDENCE", "PDF, JPG, JPEG, PNG, XLSX, DOCX, RAR o ZIP"],
      ["FOURTH_CATEGORY_SUSPENSION", "PDF"],
      ["MOBILITY_SHEET", "PDF o XLSX"],
      ["SWORN_DECLARATION", "PDF, XLSX o DOCX"],
      ["OTHER", "PDF, JPG, JPEG, PNG, XLSX, DOCX, RAR o ZIP"],
    ]);
    for (const [category, formats] of expectedFormats) {
      expect(
        within(screen.getByTestId(`supplier-category-${category}`)).getByText(
          formats,
        ),
      ).toBeVisible();
    }
    expect(
      within(screen.getByTestId("supplier-category-INVOICE")).getByText(
        "Lectura automática",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("supplier-category-SALES_RECEIPT")).getByText(
        "Lectura automática",
      ),
    ).toBeVisible();
    expect(
      within(
        screen.getByTestId("supplier-category-PROFESSIONAL_FEE_RECEIPT"),
      ).queryByText(/Lectura automática/),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("supplier-category-CASH_RECEIPT")).queryByText(
        /Lectura automática/,
      ),
    ).not.toBeInTheDocument();
  });

  it("groups multiple files by category and keeps historical RECEIPT view-only", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[
          document("factura-1", REQUEST_DOCUMENT_CATEGORY.INVOICE),
          document("factura-2", REQUEST_DOCUMENT_CATEGORY.INVOICE),
          document("cotizacion-1", REQUEST_DOCUMENT_CATEGORY.QUOTATION),
          document("historico-1", REQUEST_DOCUMENT_CATEGORY.RECEIPT),
        ]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    const invoiceCard = screen.getByTestId("supplier-category-INVOICE");
    expect(within(invoiceCard).getByText("factura-1.pdf")).toBeVisible();
    expect(within(invoiceCard).getByText("factura-2.pdf")).toBeVisible();
    expect(
      within(screen.getByTestId("supplier-category-QUOTATION")).getByText(
        "cotizacion-1.pdf",
      ),
    ).toBeVisible();

    const historical = screen.getByRole("region", {
      name: "Documentos históricos",
    });
    expect(within(historical).getByText("historico-1.pdf")).toBeVisible();
    expect(
      within(historical).getByRole("link", {
        name: /Ver documento historico-1\.pdf .*pestaña nueva/,
      }),
    ).toBeVisible();
    expect(
      within(historical).queryByRole("button", { name: /Eliminar/ }),
    ).not.toBeInTheDocument();
    expect(
      within(historical).queryByRole("button", { name: /Adjuntar/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps active rows on the existing View and authorized Delete actions only", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[
          document("active-invoice", REQUEST_DOCUMENT_CATEGORY.INVOICE),
        ]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    const invoiceCard = screen.getByTestId("supplier-category-INVOICE");
    expect(
      within(invoiceCard).getByRole("link", {
        name: "Ver documento active-invoice.pdf",
      }),
    ).toBeVisible();
    expect(
      within(invoiceCard).getByRole("button", {
        name: "Eliminar active-invoice.pdf",
      }),
    ).toBeVisible();
    expect(
      within(invoiceCard).queryByRole("button", { name: /Reemplazar/i }),
    ).not.toBeInTheDocument();
    expect(
      within(invoiceCard).queryByRole("link", { name: /Descargar/i }),
    ).not.toBeInTheDocument();
    expect(
      within(invoiceCard).queryByRole("button", { name: /Editar/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Reemplazar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Descargar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Editar/)).not.toBeInTheDocument();
  });

  it("names the delete target, locks dismissal and double-submit in flight, then restores focus predictably", async () => {
    const pendingDelete = deferred<unknown>();
    vi.mocked(api.delete).mockReturnValue(pendingDelete.promise);
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[
          document("factura-objetivo", REQUEST_DOCUMENT_CATEGORY.INVOICE),
        ]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const invoiceCard = screen.getByTestId("supplier-category-INVOICE");
    const deleteTrigger = within(invoiceCard).getByRole("button", {
      name: "Eliminar factura-objetivo.pdf",
    });

    await userEvent.click(deleteTrigger);
    const dialog = screen.getByRole("dialog", { name: "Eliminar documento" });
    expect(within(dialog).getByText("factura-objetivo.pdf")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cerrar" })).toHaveClass(
      "min-h-11",
      "min-w-11",
    );
    const cancel = within(dialog).getByRole("button", { name: "Cancelar" });
    expect(cancel).toHaveClass("min-h-11", "min-w-11");
    await userEvent.click(cancel);
    await waitFor(() => expect(deleteTrigger).toHaveFocus());

    await userEvent.click(deleteTrigger);
    const confirm = within(
      screen.getByRole("dialog", { name: "Eliminar documento" }),
    ).getByRole("button", { name: "Eliminar documento" });
    expect(confirm).toHaveClass("min-h-11", "min-w-11");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Eliminar documento" }),
    ).toBeVisible();

    pendingDelete.resolve(undefined);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Eliminar documento" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(invoiceCard).toHaveFocus());
  });

  it("keeps the delete dialog open and focuses its actionable error after failure", async () => {
    vi.mocked(api.delete).mockRejectedValue(new Error("No se pudo eliminar"));
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[
          document("factura-con-error", REQUEST_DOCUMENT_CATEGORY.INVOICE),
        ]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    await userEvent.click(
      within(screen.getByTestId("supplier-category-INVOICE")).getByRole(
        "button",
        { name: "Eliminar factura-con-error.pdf" },
      ),
    );
    await userEvent.click(
      within(
        screen.getByRole("dialog", { name: "Eliminar documento" }),
      ).getByRole("button", { name: "Eliminar documento" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No se pudo eliminar. El documento no fue eliminado; puedes volver a intentarlo o cancelar.",
    );
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(
      screen.getByRole("dialog", { name: "Eliminar documento" }),
    ).toBeVisible();
  });

  it("keeps supplier actions at least 44px and responsive without forbidden actions", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[
          document("active-invoice", REQUEST_DOCUMENT_CATEGORY.INVOICE),
        ]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const supplierSections = [
      screen.getByRole("region", { name: "Documento principal" }),
      screen.getByRole("region", { name: "Documentos complementarios" }),
    ];
    for (const section of supplierSections) {
      const controls = [
        ...within(section).getAllByRole("button"),
        ...within(section).queryAllByRole("link"),
      ];
      for (const control of controls) {
        expect(control).toHaveClass("min-h-11", "min-w-11");
        expect(control).toHaveClass("max-w-full");
      }
    }
    expect(screen.getByTestId("supplier-primary-grid")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-2",
    );
    expect(
      screen.queryByText(/Reemplazar|Descargar|Editar/),
    ).not.toBeInTheDocument();
  });

  it("keeps PAYMENT_PROOF in a separate read-only section and out of supplier upload cards", () => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[
          document("payment-proof", REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF),
        ]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    const paymentProofs = screen.getByRole("region", {
      name: "Constancias de pago",
    });
    expect(within(paymentProofs).getByText("Solo lectura")).toBeVisible();
    expect(within(paymentProofs).getByText("payment-proof.pdf")).toBeVisible();
    expect(
      within(paymentProofs).getByRole("link", {
        name: /Ver documento payment-proof\.pdf .*pestaña nueva/,
      }),
    ).toBeVisible();
    expect(
      within(paymentProofs).queryByRole("button", {
        name: /Eliminar|Adjuntar/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("supplier-category-PAYMENT_PROOF"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Adjuntar.*constancia de pago/i }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      currency: REQUEST_CURRENCY.PEN,
      expected:
        "El total en soles alcanza o supera ½ UIT del año de la solicitud. Es recomendable adjuntar un contrato o convenio PDF, pero no es obligatorio para continuar.",
    },
    {
      currency: REQUEST_CURRENCY.USD,
      expected:
        "Opcional para solicitudes en dólares. El umbral de ½ UIT solo se aplica a solicitudes en soles.",
    },
  ])(
    "preserves the exact contract and UIT guidance for $currency",
    ({ currency, expected }) => {
      render(
        <RequestDocumentsCard
          request={request({ currency, requested_amount: 2750 })}
          documents={[]}
          supplierEvidenceResource={evidenceResource(evidence())}
        />,
      );

      const contractCard = screen.getByTestId("supplier-category-CONTRACT");
      expect(within(contractCard).getByText(expected)).toBeVisible();
      expect(within(contractCard).getByText("PDF")).toBeVisible();
      expect(
        within(contractCard).getByRole("button", {
          name: "Adjuntar Contrato o convenio",
        }),
      ).toBeEnabled();
      if (currency === REQUEST_CURRENCY.USD) {
        expect(
          screen.queryByRole("status", { name: "Recomendación de contrato" }),
        ).not.toBeInTheDocument();
      } else {
        expect(
          screen.getByRole("status", { name: "Recomendación de contrato" }),
        ).toBeVisible();
      }
    },
  );

  it("leaves the established non-supplier document rendering unaffected", () => {
    render(
      <RequestDocumentsCard
        request={request({ request_type: REQUEST_TYPE.ADVANCE })}
        documents={[]}
        receiptsResource={
          {
            receipts: [],
            data: [],
            isInitialLoading: false,
            isRefreshing: false,
            isLoading: false,
            error: null,
            refetch: vi.fn().mockResolvedValue(undefined),
            upsertReceipt: vi.fn(),
          } as never
        }
      />,
    );

    expect(screen.getByText("Checklist de documentos generales")).toBeVisible();
    expect(screen.getByText("PXQ")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Documento principal" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("supplier-category-INVOICE"),
    ).not.toBeInTheDocument();
  });

  it("uploads each explicit category independently with the existing action", async () => {
    vi.mocked(api.postForm).mockResolvedValue(
      document("uploaded-invoice", REQUEST_DOCUMENT_CATEGORY.INVOICE),
    );
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    const invoice = new File(["invoice"], "factura.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Seleccionar Factura"), {
      target: { files: [invoice] },
    });
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(api.postForm).mock.calls[0]?.[1] as FormData;
    expect(formData.get("file")).toBe(invoice);
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.INVOICE,
    );
    expect(formData.has("display_name")).toBe(false);
    expect(
      screen.getByRole("button", { name: "Adjuntar Factura" }),
    ).toBeEnabled();
  });

  it.each([
    ["ab", "Ingresa un nombre de 3 a 120 caracteres."],
    ["a".repeat(121), "Ingresa un nombre de 3 a 120 caracteres."],
    [
      "Anexo / privado",
      "Usa letras o números; no incluyas /, \\, <, >, comillas ni saltos de línea.",
    ],
    [
      'Anexo "privado"',
      "Usa letras o números; no incluyas /, \\, <, >, comillas ni saltos de línea.",
    ],
    [
      "...",
      "Usa letras o números; no incluyas /, \\, <, >, comillas ni saltos de línea.",
    ],
  ])("blocks OTHER chooser for invalid title %s", (title, expectedError) => {
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const otherCard = screen.getByTestId("supplier-category-OTHER");
    const titleInput = within(otherCard).getByLabelText("Nombre del documento");

    fireEvent.change(titleInput, { target: { value: title } });
    fireEvent.blur(titleInput);

    expect(within(otherCard).getByRole("alert")).toHaveTextContent(
      expectedError,
    );
    expect(within(otherCard).getByRole("alert")).not.toHaveTextContent(title);
    expect(titleInput).toHaveAttribute("aria-invalid", "true");
    expect(
      within(otherCard).getByLabelText("Archivo de Otros documentos"),
    ).toBeDisabled();
  });

  it("accepts whitespace-only OTHER title with original filename fallback", async () => {
    vi.mocked(api.postForm).mockResolvedValue(
      document("other-blank", REQUEST_DOCUMENT_CATEGORY.OTHER),
    );
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const otherCard = screen.getByTestId("supplier-category-OTHER");
    const titleInput = within(otherCard).getByLabelText("Nombre del documento");
    const chooser = within(otherCard).getByLabelText(
      "Archivo de Otros documentos",
    );
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.blur(titleInput);
    expect(titleInput).not.toHaveAttribute("aria-invalid", "true");
    expect(within(otherCard).queryByRole("alert")).not.toBeInTheDocument();
    expect(chooser).toBeEnabled();

    const file = new File(["other"], "captura-original.png", {
      type: "image/png",
    });
    fireEvent.change(chooser, { target: { files: [file] } });
    fireEvent.click(
      within(otherCard).getByRole("button", {
        name: "Adjuntar Otros documentos",
      }),
    );
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(api.postForm).mock.calls[0]?.[1] as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("document_category")).toBe(
      REQUEST_DOCUMENT_CATEGORY.OTHER,
    );
    expect(formData.has("display_name")).toBe(false);
  });

  it.each(["Á1x", `Ñ${"a".repeat(119)}`, "ＡＢＣ", "Cafe\u0301 técnico"])(
    "enables the OTHER chooser at a valid title boundary",
    (title) => {
      render(
        <RequestDocumentsCard
          request={request()}
          documents={[]}
          supplierEvidenceResource={evidenceResource(evidence())}
        />,
      );
      const otherCard = screen.getByTestId("supplier-category-OTHER");
      fireEvent.change(
        within(otherCard).getByLabelText("Nombre del documento"),
        {
          target: { value: title },
        },
      );

      expect(
        within(otherCard).getByLabelText("Archivo de Otros documentos"),
      ).toBeEnabled();
      expect(within(otherCard).queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("retains the OTHER title and file on error, then clears both after committed retry", async () => {
    vi.mocked(api.postForm)
      .mockRejectedValueOnce(new Error("No se pudo adjuntar"))
      .mockResolvedValueOnce(
        document("other-uploaded", REQUEST_DOCUMENT_CATEGORY.OTHER),
      );
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const otherCard = screen.getByTestId("supplier-category-OTHER");
    const titleInput = within(otherCard).getByLabelText("Nombre del documento");
    const fileInput = within(otherCard).getByLabelText(
      "Archivo de Otros documentos",
    );
    const file = new File(["other"], "fuente-original.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(titleInput, { target: { value: "Informe técnico Ñ" } });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(
      within(otherCard).getByRole("button", {
        name: "Adjuntar Otros documentos",
      }),
    );

    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(titleInput).toHaveValue("Informe técnico Ñ"));
    const uploadError = await screen.findByText("No se pudo adjuntar");
    expect(uploadError.closest('[tabindex="-1"]')).toHaveFocus();
    expect(within(otherCard).getByText(/fuente-original\.pdf/)).toBeVisible();
    const failedFormData = vi.mocked(api.postForm).mock
      .calls[0]?.[1] as FormData;
    expect(failedFormData.get("display_name")).toBe("Informe técnico Ñ");

    fireEvent.click(
      within(otherCard).getByRole("button", {
        name: "Adjuntar Otros documentos",
      }),
    );
    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(titleInput).toHaveValue(""));
    expect(
      within(otherCard).queryByText(/fuente-original\.pdf/),
    ).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Documento adjuntado correctamente"),
    ).not.toBeInTheDocument();
  });

  it("uploads multiple OTHER files sequentially with independent titles", async () => {
    vi.mocked(api.postForm)
      .mockResolvedValueOnce(
        document("other-1", REQUEST_DOCUMENT_CATEGORY.OTHER),
      )
      .mockResolvedValueOnce(
        document("other-2", REQUEST_DOCUMENT_CATEGORY.OTHER),
      );
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const otherCard = screen.getByTestId("supplier-category-OTHER");
    const titleInput = within(otherCard).getByLabelText("Nombre del documento");

    for (const [title, filename] of [
      ["Primer anexo", "primero.pdf"],
      ["Segundo anexo", "segundo.pdf"],
    ]) {
      fireEvent.change(titleInput, { target: { value: title } });
      fireEvent.change(
        within(otherCard).getByLabelText("Archivo de Otros documentos"),
        {
          target: {
            files: [
              new File([filename], filename, { type: "application/pdf" }),
            ],
          },
        },
      );
      fireEvent.click(
        within(otherCard).getByRole("button", {
          name: "Adjuntar Otros documentos",
        }),
      );
      await waitFor(() => expect(titleInput).toHaveValue(""));
    }

    const titles = vi
      .mocked(api.postForm)
      .mock.calls.map((call) => (call[1] as FormData).get("display_name"));
    expect(titles).toEqual(["Primer anexo", "Segundo anexo"]);
  });

  it("renders stored OTHER business title, original provenance and neutral legacy fallback", () => {
    const titled = document("other-titled", REQUEST_DOCUMENT_CATEGORY.OTHER);
    titled.original_filename = "captura-original.png";
    titled.metadata_json = {
      supplier_document_v2: {
        version: 2,
        display_name: "Acta de coordinación",
        original_filename: "captura-original.png",
        safe_filename: "OtroDocumento_001_seguro.png",
      },
    };
    const historical = document(
      "other-legacy",
      REQUEST_DOCUMENT_CATEGORY.OTHER,
    );
    historical.original_filename = "archivo-historico.pdf";
    historical.safe_filename = "safe-no-visible.pdf";
    render(
      <RequestDocumentsCard
        request={request()}
        documents={[titled, historical]}
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );
    const otherCard = screen.getByTestId("supplier-category-OTHER");

    expect(within(otherCard).getByText("Acta de coordinación")).toBeVisible();
    expect(
      within(otherCard).getByText(
        "Nombre personalizado · Archivo original: captura-original.png",
      ),
    ).toBeVisible();
    expect(within(otherCard).getByText("archivo-historico.pdf")).toBeVisible();
    expect(
      within(otherCard).getByText("Nombre personalizado no registrado"),
    ).toBeVisible();
    expect(
      within(otherCard).queryByText("safe-no-visible.pdf"),
    ).not.toBeInTheDocument();
    expect(
      within(otherCard).queryByText(/Reemplazar|Descargar|Editar nombre/i),
    ).not.toBeInTheDocument();
  });

  it("maps per-file OCR status only on Factura and Boleta", () => {
    const documents = [
      document("invoice", REQUEST_DOCUMENT_CATEGORY.INVOICE),
      document("fee", REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT),
      document("sales", REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT),
      document("cash", REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT),
    ];
    const receipts = documents.map((item) => receiptReview(item.id));
    render(
      <RequestDocumentsCard
        request={request()}
        documents={documents}
        receiptsResource={
          {
            receipts,
            data: receipts,
            isInitialLoading: false,
            isRefreshing: false,
            isLoading: false,
            error: null,
            refetch: vi.fn().mockResolvedValue(undefined),
            upsertReceipt: vi.fn(),
          } as never
        }
        supplierEvidenceResource={evidenceResource(evidence())}
      />,
    );

    expect(
      within(screen.getByTestId("supplier-category-INVOICE")).getByText(
        "Lectura automática del comprobante",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("supplier-category-SALES_RECEIPT")).getByText(
        "Lectura automática del comprobante",
      ),
    ).toBeVisible();
    expect(
      within(
        screen.getByTestId("supplier-category-PROFESSIONAL_FEE_RECEIPT"),
      ).queryByText("Lectura automática del comprobante"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("supplier-category-CASH_RECEIPT")).queryByText(
        "Lectura automática del comprobante",
      ),
    ).not.toBeInTheDocument();
  });
});
