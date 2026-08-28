import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RequestStatusStepper } from "@/components/requests/request-status-stepper";
import {
  REQUEST_CURRENCY,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
} from "@/types/requests";

function makeSubmittedRequest(): PaymentRequest {
  return {
    id: "request-submitted",
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
    submitted_at: "2026-08-28T10:00:00.000Z",
    observed_at: null,
    approved_at: null,
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-08-28T09:00:00.000Z",
    updated_at: "2026-08-28T10:00:00.000Z",
  };
}

describe("RequestStatusStepper", () => {
  it("presenta SUBMITTED con el vocabulario de detalle, no como un estado IN_REVIEW", () => {
    render(<RequestStatusStepper request={makeSubmittedRequest()} />);

    expect(screen.getByText("Enviada a revisión")).toBeInTheDocument();
    expect(screen.queryByText("En revisión")).not.toBeInTheDocument();
  });
});
