import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/requests/status-badge";
import { REQUEST_STATUS_SURFACE } from "@/lib/request-status-vocabulary";
import { REQUEST_STATUS } from "@/types/requests";

describe("StatusBadge", () => {
  it("expone el dominio y copy contextual de detalle", () => {
    render(<StatusBadge status={REQUEST_STATUS.SUBMITTED} surface={REQUEST_STATUS_SURFACE.DETAIL} />);

    expect(screen.getByText("Enviada a revisión")).toHaveAccessibleName("Estado de solicitud: Enviada a revisión");
  });

  it("distingue Review de detalle sin crear request IN_REVIEW", () => {
    render(<StatusBadge status={REQUEST_STATUS.SUBMITTED} surface={REQUEST_STATUS_SURFACE.REVIEW} />);

    expect(screen.getByText("Por revisar")).toHaveAccessibleName("Estado de solicitud en Review: Por revisar");
  });

  it("mantiene estados reservados legacy renderizables", () => {
    render(<StatusBadge status={REQUEST_STATUS.VOIDED} surface={REQUEST_STATUS_SURFACE.DETAIL} />);

    expect(screen.getByText("Anulada")).toBeInTheDocument();
  });
});
