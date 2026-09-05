import { describe, expect, it } from "vitest";

import {
  formatDriveProjectionStatus,
  formatRexanActivationStatus,
  getPaymentCompletenessLabels,
} from "@/lib/integration-status-vocabulary";
import {
  DRIVE_PAYMENT_PROJECTION_STATUS,
  PAYMENT_REXAN_STATUS,
} from "@/types/requests";

describe("integration status vocabulary", () => {
  it("qualifies Drive health without replacing payment completeness", () => {
    expect(formatDriveProjectionStatus(DRIVE_PAYMENT_PROJECTION_STATUS.SOURCE_REQUIRED)).toBe("Drive: pendiente");
    expect(formatDriveProjectionStatus(DRIVE_PAYMENT_PROJECTION_STATUS.PENDING)).toBe("Drive: pendiente");
    expect(formatDriveProjectionStatus(DRIVE_PAYMENT_PROJECTION_STATUS.PROCESSING)).toBe("Drive: procesando");
    expect(formatDriveProjectionStatus(DRIVE_PAYMENT_PROJECTION_STATUS.SUCCEEDED)).toBe("Drive: completado");
    expect(formatDriveProjectionStatus(DRIVE_PAYMENT_PROJECTION_STATUS.FAILED)).toBe("Drive: requiere atención");
    expect(formatDriveProjectionStatus("LEGACY_UNKNOWN")).toBe("Drive: estado no reconocido (LEGACY_UNKNOWN)");
  });

  it("qualifies every current REXAN activation status and its fallback", () => {
    expect(formatRexanActivationStatus(PAYMENT_REXAN_STATUS.PENDING)).toBe("REXAN: pendiente");
    expect(formatRexanActivationStatus(PAYMENT_REXAN_STATUS.PROCESSING)).toBe("REXAN: procesando");
    expect(formatRexanActivationStatus(PAYMENT_REXAN_STATUS.RETRYING)).toBe("REXAN: procesando");
    expect(formatRexanActivationStatus(PAYMENT_REXAN_STATUS.CREATED)).toBe("REXAN: activada");
    expect(formatRexanActivationStatus(PAYMENT_REXAN_STATUS.REUSED)).toBe("REXAN: reutilizada");
    expect(formatRexanActivationStatus(PAYMENT_REXAN_STATUS.SKIPPED)).toBe("REXAN: no aplica");
    expect(formatRexanActivationStatus(PAYMENT_REXAN_STATUS.FAILED)).toBe("REXAN: requiere atención");
    expect(formatRexanActivationStatus("LEGACY_UNKNOWN")).toBe("REXAN: estado no reconocido (LEGACY_UNKNOWN)");
  });

  it("keeps simultaneous payment completeness labels independent", () => {
    expect(getPaymentCompletenessLabels({
      proofPending: false,
      referencePending: false,
      sourceAccountPending: false,
    })).toEqual(["Datos de pago completos"]);
    expect(getPaymentCompletenessLabels({
      proofPending: true,
      referencePending: true,
      sourceAccountPending: true,
    })).toEqual([
      "Falta constancia",
      "Falta referencia",
      "Falta cuenta de origen",
    ]);
  });
});
