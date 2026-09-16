import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RejectApprovedPaymentModal } from "../reject-approved-payment-modal";
import { ApiRequestError } from "@/lib/api-client";
import {
  REQUEST_CURRENCY,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
} from "@/types/requests";
import { GIOF_WORK_POOL, type GiofWorkLease } from "@/types/giof-work";

const mocks = vi.hoisted(() => ({
  rejectApprovedPayment: vi.fn(),
  toastSuccess: vi.fn(),
}));

let loading = false;

vi.mock("@/hooks/use-requests", () => ({
  useRejectApprovedPayment: () => ({
    rejectApprovedPayment: mocks.rejectApprovedPayment,
    isLoading: loading,
    error: null,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

function makeRequest(): PaymentRequest {
  return {
    id: "request-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.REIMBURSEMENT,
    status: REQUEST_STATUS.APPROVED,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Pago externo",
    requester_id: "requester-1",
    budget_planning_line_id: null,
    budget_month: 1,
    organizational_unit_id: null,
    scheduled_rendition_at: null,
    related_request_id: null,
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: "Persona",
    beneficiary_document_type: null,
    beneficiary_document_number: null,
    bank_code: null,
    bank_name: null,
    account_type: null,
    bank_account: null,
    bank_cci: null,
    submitted_at: null,
    observed_at: null,
    approved_at: "2026-09-15T10:00:00.000Z",
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-15T10:00:00.000Z",
  };
}

function makeLease(): GiofWorkLease {
  return {
    pool: GIOF_WORK_POOL.PAYMENT,
    requestId: "request-1",
    ownerId: "giof-1",
    token: "lease-token",
    assignmentVersion: "2",
    heartbeatAt: "2026-09-15T10:00:00.000Z",
    expiresAt: "2099-09-15T10:05:00.000Z",
    ttlSeconds: 300,
    heartbeatIntervalSeconds: 60,
  };
}

function renderModal(overrides: Partial<Parameters<typeof RejectApprovedPaymentModal>[0]> = {}) {
  const props: Parameters<typeof RejectApprovedPaymentModal>[0] = {
    request: makeRequest(),
    lease: makeLease(),
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    onFailureRefresh: vi.fn(),
    ...overrides,
  };
  const view = render(<RejectApprovedPaymentModal {...props} />);
  return {
    ...props,
    rerenderModal(next: Partial<typeof props>) {
      view.rerender(<RejectApprovedPaymentModal {...props} {...next} />);
    },
  };
}

describe("RejectApprovedPaymentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loading = false;
  });

  it("enfoca el motivo, anuncia límites y exige confirmación escrita", async () => {
    const user = userEvent.setup();
    renderModal();

    const reason = await screen.findByRole("textbox", { name: /motivo/i });
    expect(reason).toHaveFocus();
    expect(screen.getByText("0/1000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rechazar pago" }));
    expect(
      await screen.findByText("Ingresa el motivo del rechazo."),
    ).toHaveAttribute("role", "alert");
    expect(mocks.rejectApprovedPayment).not.toHaveBeenCalled();

    await user.type(reason, "  Cuenta bancaria bloqueada  ");
    await user.type(
      screen.getByRole("textbox", { name: /escribe rechazar/i }),
      "rechazar",
    );
    await user.click(screen.getByRole("button", { name: "Rechazar pago" }));

    expect(
      await screen.findByText("Escribe RECHAZAR exactamente para confirmar."),
    ).toHaveAttribute("role", "alert");
    expect(mocks.rejectApprovedPayment).not.toHaveBeenCalled();
  });

  it("recorta el motivo, acepta 1000 caracteres y evita el doble envío", async () => {
    const user = userEvent.setup();
    let resolve!: (value: PaymentRequest) => void;
    mocks.rejectApprovedPayment.mockReturnValue(
      new Promise<PaymentRequest>((next) => {
        resolve = next;
      }),
    );
    const props = renderModal();
    const reason = await screen.findByRole("textbox", { name: /motivo/i });
    fireEvent.change(reason, { target: { value: ` ${"x".repeat(1000)} ` } });
    await user.type(
      screen.getByRole("textbox", { name: /escribe rechazar/i }),
      "RECHAZAR",
    );
    const submit = screen.getByRole("button", { name: "Rechazar pago" });
    await user.click(submit);
    await user.click(submit);

    expect(mocks.rejectApprovedPayment).toHaveBeenCalledTimes(1);
    expect(mocks.rejectApprovedPayment).toHaveBeenCalledWith(
      "request-1",
      { reason: "x".repeat(1000) },
      expect.objectContaining({ token: "lease-token" }),
    );

    resolve({
      ...makeRequest(),
      status: REQUEST_STATUS.REJECTED,
      rejected_at: "2026-09-15T12:00:00.000Z",
    });
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalled());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Pago rechazado.");
  });

  it("rechaza 1001 caracteres y conserva la entrada tras un 409 recuperable", async () => {
    const user = userEvent.setup();
    const conflict = new ApiRequestError(409, {
      statusCode: 409,
      code: "PAYMENT_REJECTION_STATE_CONFLICT",
      message: "Conflict",
      error: "Conflict",
      timestamp: "2026-09-15T00:00:00.000Z",
      path: "/requests/request-1/reject-payment",
    });
    mocks.rejectApprovedPayment.mockRejectedValueOnce(conflict);
    const props = renderModal();
    const reason = await screen.findByRole("textbox", { name: /motivo/i });
    fireEvent.change(reason, { target: { value: "x".repeat(1001) } });
    await user.type(
      screen.getByRole("textbox", { name: /escribe rechazar/i }),
      "RECHAZAR",
    );
    await user.click(screen.getByRole("button", { name: "Rechazar pago" }));
    expect(
      await screen.findByText("El motivo admite máximo 1000 caracteres."),
    ).toHaveAttribute("role", "alert");
    expect(mocks.rejectApprovedPayment).not.toHaveBeenCalled();

    await user.clear(reason);
    await user.type(reason, "Cuenta cerrada");
    await user.click(screen.getByRole("button", { name: "Rechazar pago" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ya no está aprobada para pago",
    );
    expect(reason).toHaveValue("Cuenta cerrada");
    expect(props.onFailureRefresh).toHaveBeenCalledWith(conflict);
    expect(props.onOpenChange).not.toHaveBeenCalled();

    mocks.rejectApprovedPayment.mockResolvedValueOnce({
      ...makeRequest(),
      status: REQUEST_STATUS.REJECTED,
      rejected_at: "2026-09-15T12:00:00.000Z",
    });
    await user.click(screen.getByRole("button", { name: "Rechazar pago" }));
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalled());
  });

  it("permite cerrar con Escape y devuelve el foco al disparador", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Abrir rechazo";
    document.body.append(trigger);
    trigger.focus();
    const props = renderModal();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    props.rerenderModal({ open: false });
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it("anuncia una sesión ausente, conserva el motivo y solicita refresco autoritativo", async () => {
    const user = userEvent.setup();
    const props = renderModal({ lease: null });
    const reason = await screen.findByRole("textbox", { name: /motivo/i });
    await user.type(reason, "Cuenta cerrada");
    await user.type(
      screen.getByRole("textbox", { name: /escribe rechazar/i }),
      "RECHAZAR",
    );

    await user.click(screen.getByRole("button", { name: "Rechazar pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La sesión PAYMENT no está vigente",
    );
    expect(reason).toHaveValue("Cuenta cerrada");
    expect(props.onFailureRefresh).toHaveBeenCalledWith(expect.any(Error));
    expect(mocks.rejectApprovedPayment).not.toHaveBeenCalled();
  });
});
