import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { BulkMarkPaidModal } from "../bulk-mark-paid-modal";
import type { PaymentRequest } from "@/types/requests";
const mocks = vi.hoisted(() => ({ mark: vi.fn() }));
vi.mock("@/hooks/use-requests", () => ({
  useBulkMarkPaid: () => ({ bulkMarkPaid: mocks.mark, isLoading: false }),
}));
const rows = ["a", "b"].map(
  (id) =>
    ({
      id,
      request_code: id,
      requested_amount: 1,
      currency: id === "a" ? "USD" : "PEN",
      request_type: "REIMBURSEMENT",
      status: "APPROVED",
    }) as PaymentRequest,
);
const prepare = vi.fn(async (requests: PaymentRequest[]) =>
  requests.map((row) => ({
    request_id: row.id,
    assignment_version: 1,
    lease_token: "lease",
  })),
);
const result = (
  id: string,
  commandId: string,
  outcome = "SUCCESS",
  code = "PAID",
) => ({
  request_id: id,
  command_id: commandId,
  outcome,
  payment_id: null,
  code,
  message: outcome === "FAILED" ? "Error independiente" : "Pago registrado",
  original: { amount: "1.00", currency: id === "a" ? "USD" : "PEN" },
  actual_disbursement: null,
  missing_fields: ["proof", "final_fx_rate"],
  valuation: null,
  rexan_activation: null,
});
beforeEach(() => {
  vi.clearAllMocks();
});
it("requires actual-transfer confirmation, sends independent keys, displays partial/conflict outcomes without shared TC", async () => {
  mocks.mark.mockImplementation(async (input) => ({
    items: [
      result("a", input.items[0].command_id),
      result(
        "b",
        input.items[1].command_id,
        "FAILED",
        "PAYMENT_COMMAND_CONFLICT",
      ),
    ],
    amounts_by_currency: { USD: "1.00" },
    unresolved_count: 1,
    totals_complete: false,
  }));
  const user = userEvent.setup();
  render(
    <BulkMarkPaidModal
      requests={rows}
      open
      onOpenChange={vi.fn()}
      onSuccess={vi.fn()}
      prepareItems={prepare}
    />,
  );
  expect(screen.getByRole("button", { name: "Marcar 2 pagos" })).toBeDisabled();
  expect(screen.queryByLabelText(/TC final/)).not.toBeInTheDocument();
  await user.type(screen.getByLabelText(/Fecha efectiva/), "2026-09-10T10:30");
  await user.click(screen.getByLabelText(/Confirmo que las transferencias/));
  await user.click(screen.getByRole("button", { name: "Marcar 2 pagos" }));
  await waitFor(() => expect(mocks.mark).toHaveBeenCalledOnce());
  const input = mocks.mark.mock.calls[0][0];
  expect(Object.keys(input)).toEqual(["items"]);
  expect(input.items[0]).toEqual(
    expect.objectContaining({
      command_id: expect.any(String),
      expected_original_amount: "1.00",
      expected_original_currency: "USD",
    }),
  );
  expect(input.items[1].command_id).not.toBe(input.items[0].command_id);
  expect(await screen.findByText(/Error independiente/)).toBeInTheDocument();
  expect(
    screen.getByText("Principal confirmado: USD 1.00"),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/Principal confirmado: PEN/),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Actualiza la cola y revisa/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Reintentar/ }),
  ).not.toBeInTheDocument();
});
it("explicit transport retry keeps identical commands and recovers already-processed items", async () => {
  mocks.mark
    .mockRejectedValueOnce(new Error("Sin respuesta"))
    .mockImplementationOnce(async (input) => ({
      items: [
        result("a", input.items[0].command_id, "ALREADY_PROCESSED"),
        result("b", input.items[1].command_id),
      ],
      amounts_by_currency: { USD: "1.00", PEN: "1.00" },
      unresolved_count: 0,
      totals_complete: true,
    }));
  const user = userEvent.setup();
  render(
    <BulkMarkPaidModal
      requests={rows}
      open
      onOpenChange={vi.fn()}
      onSuccess={vi.fn()}
      prepareItems={prepare}
    />,
  );
  await user.type(screen.getByLabelText(/Fecha efectiva/), "2026-09-10T10:30");
  await user.click(screen.getByLabelText(/Confirmo que las transferencias/));
  await user.click(screen.getByRole("button", { name: "Marcar 2 pagos" }));
  await screen.findByText("Sin respuesta");
  expect(mocks.mark).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: /Reintentar/ }));
  await waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(2));
  expect(mocks.mark.mock.calls[1][0]).toEqual(mocks.mark.mock.calls[0][0]);
  expect(screen.getByText(/Ya procesado/)).toBeInTheDocument();
});
it("refuses a selection over fifty", () => {
  const tooMany = Array.from({ length: 51 }, (_, index) => ({
    ...rows[index % rows.length],
    id: `request-${index + 1}`,
    request_code: `SOL-${index + 1}`,
  }));
  render(
    <BulkMarkPaidModal
      requests={tooMany}
      open
      onOpenChange={vi.fn()}
      onSuccess={vi.fn()}
      prepareItems={prepare}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Marcar 51 pagos" }),
  ).toBeDisabled();
});

it("keeps unresolved currency visible and refuses a write before acquiring leases", async () => {
  const user = userEvent.setup();
  render(
    <BulkMarkPaidModal
      requests={[{ ...rows[0], currency: null }]}
      open
      onOpenChange={vi.fn()}
      onSuccess={vi.fn()}
      prepareItems={prepare}
    />,
  );
  expect(
    screen.getByText(/Principal original: Moneda sin resolver/),
  ).toBeInTheDocument();
  await user.type(screen.getByLabelText(/Fecha efectiva/), "2026-09-10T10:30");
  await user.click(screen.getByLabelText(/Confirmo que las transferencias/));
  await user.click(screen.getByRole("button", { name: "Marcar 1 pagos" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Moneda original sin resolver",
  );
  expect(prepare).not.toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled();
});
