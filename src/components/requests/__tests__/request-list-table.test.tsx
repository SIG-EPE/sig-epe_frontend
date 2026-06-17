import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RequestListTable } from "@/components/requests/request-list-table";
import { ROLE_CODE } from "@/lib/constants";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_STORAGE_PROVIDER, REQUEST_DOCUMENT_UPLOAD_STATUS, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestDocument } from "@/types/requests";

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
    document_category: REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT,
    safe_filename: "rendicion.xlsx",
    original_filename: "rendicion.xlsx",
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size_bytes: 1234,
    storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.LOCAL,
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    created_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("RequestListTable", () => {
  it("muestra acciones de fila solo dentro del menú de tres puntos", async () => {
    const user = userEvent.setup();

    render(<RequestListTable requests={[makeRequest()]} isLoading={false} roleCode={ROLE_CODE.SOLICITANTE_EPE} currentUserId="user-1" />);

    expect(screen.getByRole("columnheader", { name: "Acciones" })).toBeInTheDocument();
    expect(screen.getByTitle("Más acciones de solicitud")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sin documentos" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Continuar edición" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Más acciones de solicitud" }));

    expect(await screen.findByRole("menuitem", { name: "Continuar edición" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Ver" })).not.toBeInTheDocument();
  });

  it("mantiene la acción de gestión accesible desde el menú para GIOF", async () => {
    const user = userEvent.setup();

    render(
      <RequestListTable
        requests={[makeRequest({ status: REQUEST_STATUS.SUBMITTED, submitted_at: "2026-05-01T10:00:00.000Z" })]}
        isLoading={false}
        roleCode={ROLE_CODE.GIOF_GESTOR}
      />,
    );

    expect(screen.queryByRole("link", { name: "Gestionar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Más acciones de solicitud" }));

    expect(await screen.findByRole("menuitem", { name: "Gestionar" })).toBeInTheDocument();
  });

  it("marca REXAN con sustentos completos en la bandeja de revisión", () => {
    render(
      <RequestListTable
        requests={[makeRequest({
          request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
          status: REQUEST_STATUS.SUBMITTED,
          updated_at: "2026-05-02T10:00:00.000Z",
          documents: [
            makeDocument(),
            makeDocument({ id: "doc-2", document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT, original_filename: "comprobante.pdf", safe_filename: "comprobante.pdf", mime_type: "application/pdf" }),
          ],
        })]}
        isLoading={false}
        roleCode={ROLE_CODE.GIOF_GESTOR}
      />,
    );

    expect(screen.getByText("Sustentos completos")).toBeInTheDocument();
    expect(screen.getByText("Modificación")).toBeInTheDocument();
  });

  it("muestra el responsable en la bandeja de revisión", () => {
    render(
      <RequestListTable
        requests={[makeRequest({ beneficiary_name: "María Responsable" })]}
        isLoading={false}
        roleCode={ROLE_CODE.GIOF_GESTOR}
        showResponsible
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Responsable" })).toBeInTheDocument();
    expect(screen.getByText("María Responsable")).toBeInTheDocument();
  });

  it("muestra un acceso directo interno a documentos cuando la solicitud tiene documentos", () => {
    render(
      <RequestListTable
        requests={[makeRequest({ documents_count: 2 })]}
        isLoading={false}
        roleCode={ROLE_CODE.GIOF_GESTOR}
      />,
    );

    const documentsLink = screen.getByRole("link", { name: "Ver documentos" });

    expect(documentsLink).toHaveAttribute("href", "/requests/req-1#documents");
    expect(screen.queryByRole("button", { name: "Sin documentos" })).not.toBeInTheDocument();
  });

  it("mantiene separado el acceso interno a documentos y la carpeta Drive segura", () => {
    render(
      <RequestListTable
        requests={[makeRequest({
          documents_count: 1,
          drive_folder_url: "https://drive.google.com/drive/folders/abc",
        })]}
        isLoading={false}
        roleCode={ROLE_CODE.GIOF_GESTOR}
      />,
    );

    expect(screen.getByRole("link", { name: "Ver documentos" })).toHaveAttribute("href", "/requests/req-1#documents");
    expect(screen.getByRole("link", { name: "Abrir carpeta Drive" })).toHaveAttribute("href", "https://drive.google.com/drive/folders/abc");
  });

  it("oculta la carpeta Drive cuando la URL no es segura", () => {
    render(
      <RequestListTable
        requests={[makeRequest({
          documents_count: 1,
          drive_folder_url: "javascript:alert(1)",
        })]}
        isLoading={false}
        roleCode={ROLE_CODE.GIOF_GESTOR}
      />,
    );

    expect(screen.getByRole("link", { name: "Ver documentos" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir carpeta Drive" })).not.toBeInTheDocument();
  });
});
