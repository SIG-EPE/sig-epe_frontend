import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DriveProjectionState } from "../drive-projection-state";

describe("DriveProjectionState", () => {
  it.each([
    ["PENDING", "Drive: pendiente de organización"],
    ["PROCESSING", "Drive: organizando carpeta…"],
    ["SUCCEEDED", "Drive: carpeta organizada"],
  ] as const)(
    "localizes the compact %s status",
    (status, label) => {
      render(
        <DriveProjectionState
          payment={{
            drive_projection_status: status,
            drive_projection_phase:
              status === "PROCESSING" ? "MOVE" : "PREPARED",
            drive_projection_error_code: null,
            drive_projection_error_message: null,
            drive_projection_reconciliation_required: false,
            drive_projection_frozen: false,
          }}
          compact
        />,
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(/Fase: (PREPARED|MOVE)/)).toBeInTheDocument();
    },
  );

  it("shows the failed operator detail without hiding technical evidence", () => {
    render(
      <DriveProjectionState
        payment={{
          drive_projection_status: "FAILED",
          drive_projection_phase: "MOVE",
          drive_projection_error_code: "MOVE_RECONCILIATION_REQUIRED",
          drive_projection_error_message: "Parent evidence contradicted",
          drive_projection_reconciliation_required: true,
          drive_projection_frozen: true,
        }}
      />,
    );

    expect(screen.getByText("Drive: requiere atención")).toBeInTheDocument();
    expect(
      screen.getByText(
        "El pago quedó registrado, pero la carpeta requiere revisión en Drive.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/MOVE_RECONCILIATION_REQUIRED/)).toBeInTheDocument();
    expect(screen.getByText(/Parent evidence contradicted/)).toBeInTheDocument();
    expect(screen.getByText(/reconciliación requerida/i)).toBeInTheDocument();
  });

  it("keeps SOURCE_REQUIRED actionable", () => {
    render(
      <DriveProjectionState
        payment={{ drive_projection_status: "SOURCE_REQUIRED" }}
        compact
      />,
    );

    expect(screen.getByText("Falta cuenta de origen")).toBeInTheDocument();
  });
});
