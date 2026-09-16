import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequestContractAdvisory } from "../request-contract-advisory";
import type { PaymentRequest, RequestFxReferenceResult } from "@/types/requests";

const mocks = vi.hoisted(() => ({ data: null as RequestFxReferenceResult | null }));
vi.mock("@/hooks/use-request-currency", () => ({ useRequestFxReference: () => ({ data: mocks.data }), useRequestAnnualUit: () => ({ annualUit: null }) }));
const request: PaymentRequest = {
  id: "request-1",
  request_code: "SOL-1",
  sequential_number: null,
  request_type: "SUPPLIER_PAYMENT",
  status: "DRAFT",
  fiscal_year: 2026,
  requested_amount: 1,
  currency: "USD",
  concept: "Servicio",
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
  created_at: "2026-01-02T14:00:00.000Z",
  updated_at: "2026-01-02T14:00:00.000Z",
};
describe("dated advisory only, never final TC", () => {
  it("labels valid manual provenance, exact estimate and unavailable annual comparison", () => {
    mocks.data = { direction: "PEN/USD", fallback: "CACHE", last_refresh_failure: "TIMEOUT", reference: { rate: "3.805", source: "MANUAL", side: "SALE", series: null, effective_date: "2026-01-02", retrieved_at: "2026-01-02T14:00:00.000Z", manual_source: "Documento de referencia", reason: "Declarada" } };
    render(<RequestContractAdvisory request={request} />);
    expect(screen.getByText(/Estimación: PEN 3.81/)).toBeInTheDocument();
    expect(screen.getByText(/Manual · Documento de referencia.*2026-01-02/)).toBeInTheDocument();
    expect(screen.getByText(/no es un TC final/)).toBeInTheDocument();
    expect(screen.getByText(/Comparación con ½ UIT no disponible/)).toBeInTheDocument();
    expect(screen.getByText(/Falló la última actualización: TIMEOUT/)).toBeInTheDocument();
  });
  it("does not invent a reference when provider is disabled", () => {
    mocks.data = { direction: "PEN/USD", fallback: "UNAVAILABLE", last_refresh_failure: "PROVIDER_DISABLED", reference: null };
    render(<RequestContractAdvisory request={request} />);
    expect(screen.queryByText(/Estimación:/)).not.toBeInTheDocument();
    expect(screen.getByText(/PROVIDER_DISABLED/)).toBeInTheDocument();
  });
  it("rejects a future-dated observation instead of presenting it as valid", () => {
    mocks.data = { direction: "PEN/USD", fallback: "NONE", last_refresh_failure: null, reference: { rate: "3.805", source: "SBS_BCRPDATA", side: "SALE", series: "PD04640PD", effective_date: "2999-01-02", retrieved_at: "2999-01-02T14:00:00.000Z", manual_source: null, reason: null } };
    render(<RequestContractAdvisory request={request} />);
    expect(screen.queryByText(/Estimación:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Referencia cambiaria no disponible/)).toBeInTheDocument();
  });
});
