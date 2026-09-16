import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PaymentValuation } from "../payment-valuation";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
it("shows only safe source/date and provisional PEN value; absent valuation stays unresolved", () => {
  const { rerender } = render(<PaymentValuation valuation={{ amount_pen: "3.70", accounting_currency: "PEN", state: "PROVISIONAL", reference: { rate: "3.70", source: "SBS_BCRPDATA", side: "SALE", series: "PD04640PD", effective_date: "2026-09-09", retrieved_at: "2026-09-10T10:00:00Z", manual_source: null, reason: null }, final_rate: null, final_confirmed_at: null, final_confirmed_by: null, origin_execution_id: null }} />);
  expect(screen.getByText(/PEN 3.70.*Provisional/)).toBeInTheDocument();
  expect(screen.getByText(/SBS_BCRPDATA.*2026-09-09.*2026-09-10/)).toBeInTheDocument();
  rerender(<PaymentValuation valuation={null} />);
  expect(screen.getByText(/Pendiente \/ sin valoración/)).toBeInTheDocument();
  expect(screen.queryByText(/PEN 0/)).not.toBeInTheDocument();
});
it("FX-only legacy state is pending without claiming reference is missing", () => {
  expect(getPaymentCompletenessPresentation({ completeness: "REFERENCE_PENDING", missing_fields: ["final_fx_rate", "final_fx_confirmed"] })).toMatchObject({ hasPendingDetails: true, missingFields: ["final_fx_rate", "final_fx_confirmed"], labels: ["Falta TC final confirmado"] });
});
