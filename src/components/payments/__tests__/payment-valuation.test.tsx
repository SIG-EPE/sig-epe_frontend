import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PaymentValuation } from "../payment-valuation";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import type { FxValuation, PaymentRequest } from "@/types/requests";

const monthlyRequest = {
  currency: "USD", fx_policy_version: "MONTHLY_V1",
  original: { amount: "100.00", currency: "USD" },
  monthly_fx_applied_close_month: null, monthly_fx_applied_close_rate: null,
} satisfies Partial<PaymentRequest>;
const monthlyValuation: FxValuation = {
  amount_pen: "375.00", accounting_currency: "PEN", state: "PROVISIONAL",
  reference: null, final_rate: null, final_confirmed_at: null,
  final_confirmed_by: null, origin_execution_id: null,
};

it("separates actual bank reference from approval and monthly close without computing PEN", () => {
  const bank = { year: 2026, month: 9, reference_rate: "3.750000000000" };
  const { rerender } = render(<PaymentValuation request={monthlyRequest} valuation={monthlyValuation} monthlyReference={bank} />);
  expect(screen.getByText(/PEN 375.00.*Provisional/)).toBeInTheDocument();
  expect(screen.getByText(/Referencia bancaria mensual: 3.75 PEN por USD.*2026-09/)).toBeInTheDocument();
  expect(screen.queryByText(/TC final confirmado|consultado|3.70/)).not.toBeInTheDocument();
  const closed = { ...monthlyRequest, monthly_fx_applied_close_month: "2026-09-01", monthly_fx_applied_close_rate: "3.780000000000" };
  rerender(<PaymentValuation request={closed} valuation={{ ...monthlyValuation, amount_pen: "378.00", state: "FINAL", final_rate: "3.780000000000" }} monthlyReference={bank} />);
  expect(screen.getByText(/PEN 378.00.*Cerrado/)).toBeInTheDocument();
  expect(screen.getByText(/TC de cierre mensual: 3.78 PEN por USD.*2026-09/)).toBeInTheDocument();
  expect(screen.getByText(/Referencia bancaria mensual: 3.75/)).toBeInTheDocument();
  expect(monthlyRequest.original.amount).toBe("100.00");
  rerender(<PaymentValuation request={{ ...closed, monthly_fx_applied_close_rate: null }} valuation={{ ...monthlyValuation, state: "FINAL", final_rate: "3.78" }} />);
  expect(screen.getByText(/PEN 375.00.*Provisional/)).toBeInTheDocument();
  expect(screen.queryByText(/Cerrado|TC de cierre|TC final confirmado|Referencia bancaria/)).not.toBeInTheDocument();
});

it("monthly list without payment never guesses a bank reference; exact 12 decimals survive", () => {
  const { rerender } = render(<PaymentValuation request={monthlyRequest} valuation={monthlyValuation} monthlyReference={null} />);
  expect(screen.queryByText(/Referencia bancaria/)).not.toBeInTheDocument();
  rerender(<PaymentValuation request={monthlyRequest} valuation={monthlyValuation} monthlyReference={{ year: 2026, month: 9, reference_rate: "3.123456789012" }} />);
  expect(screen.getByText(/3.123456789012 PEN por USD/)).toBeInTheDocument();
});
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

it("approval snapshot is never labeled as bank reference; legacy source and final labels survive", () => {
  const reference: NonNullable<FxValuation["reference"]> = { rate: "3.70", source: "MANUAL", side: "SALE", series: null, effective_date: "2026-09-01", retrieved_at: "2026-09-02T10:00:00Z", manual_source: "Histórico", reason: null };
  const { rerender } = render(<PaymentValuation request={monthlyRequest} valuation={{ ...monthlyValuation, reference }} monthlyReference={{ year: 2026, month: 9, reference_rate: "3.75" }} />);
  expect(screen.getByText(/Aprobación: 3.70/)).toBeInTheDocument();
  expect(screen.getByText(/Referencia bancaria mensual: 3.75/)).toBeInTheDocument();
  expect(screen.queryByText(/Referencia bancaria mensual: 3.70/)).not.toBeInTheDocument();
  rerender(<PaymentValuation valuation={{ ...monthlyValuation, state: "FINAL", reference, final_rate: "3.81", final_confirmed_at: "2026-09-03" }} />);
  expect(screen.getByText(/PEN 375.00.*Final/)).toBeInTheDocument();
  expect(screen.getByText(/TC final confirmado: 3.81.*2026-09-03/)).toBeInTheDocument();
  expect(screen.getByText("Fuente manual: Histórico")).toBeInTheDocument();
  rerender(<PaymentValuation request={{ currency: "PEN" }} valuation={{ ...monthlyValuation, amount_pen: "100.00", state: "IDENTITY" }} />);
  expect(screen.getByText(/PEN 100.00.*Identidad PEN/)).toBeInTheDocument();
});
