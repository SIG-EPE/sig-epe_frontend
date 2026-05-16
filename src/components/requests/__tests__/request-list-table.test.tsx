import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RequestListTable } from "@/components/requests/request-list-table";
import { ROLE_CODE } from "@/lib/constants";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest } from "@/types/requests";

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

describe("RequestListTable", () => {
  it("muestra acciones de fila solo dentro del menú de tres puntos", async () => {
    const user = userEvent.setup();

    render(<RequestListTable requests={[makeRequest()]} isLoading={false} roleCode={ROLE_CODE.SOLICITANTE_EPE} />);

    expect(screen.getByRole("columnheader", { name: "Acciones" })).toBeInTheDocument();
    expect(screen.getByTitle("Más acciones de solicitud")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Más acciones de solicitud" }));

    expect(await screen.findByRole("menuitem", { name: "Editar" })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "Ver" })).toBeInTheDocument();
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
});
