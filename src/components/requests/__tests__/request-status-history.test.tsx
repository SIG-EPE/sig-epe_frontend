import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RequestStatusHistory } from "../request-status-history";
import { REQUEST_STATUS, type RequestStatusHistoryItem } from "@/types/requests";

describe("RequestStatusHistory", () => {
  it("distingue el rechazo de pago y publica motivo, fecha y actor sin acciones", () => {
    const paymentRejection: RequestStatusHistoryItem = {
      id: "history-1",
      payment_request_id: "request-1",
      from_status: REQUEST_STATUS.APPROVED,
      to_status: REQUEST_STATUS.REJECTED,
      actor_id: "private-id",
      actor_role: "GIOF_GESTOR",
      actor: { first_name: "Ana <script>", last_name: "Gestora" },
      reason: "PAYMENT_REJECTED",
      comment: "Cuenta <cerrada>",
      created_at: "2026-09-15T12:00:00.000Z",
    };
    render(<RequestStatusHistory items={[paymentRejection]} />);

    expect(screen.getByText("Pago rechazado")).toBeInTheDocument();
    expect(screen.getByText("Motivo: Cuenta <cerrada>")).toBeInTheDocument();
    expect(screen.getByText("Actor: Ana <script> Gestora")).toBeInTheDocument();
    expect(screen.getByText(/Fecha:/)).toBeInTheDocument();
    expect(screen.queryByText("private-id")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("mantiene Solicitud rechazada para el rechazo de revisión", () => {
    render(
      <RequestStatusHistory
        items={[
          {
            id: "history-2",
            payment_request_id: "request-1",
            from_status: REQUEST_STATUS.SUBMITTED,
            to_status: REQUEST_STATUS.REJECTED,
            actor_id: null,
            actor_role: null,
            reason: "REQUEST_REJECTED",
            comment: "Documentación inválida",
            created_at: "2026-09-14T12:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Solicitud rechazada")).toBeInTheDocument();
    expect(screen.queryByText("Pago rechazado")).not.toBeInTheDocument();
  });
});
