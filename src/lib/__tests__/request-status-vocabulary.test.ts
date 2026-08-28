import { describe, expect, it } from "vitest";

import {
  REQUEST_PAYMENT_SELECTOR_STATUSES,
  REQUEST_RENDITION_SELECTOR_STATUSES,
  REQUEST_REVIEW_SELECTOR_STATUSES,
  REQUEST_STATUS_SURFACE,
  formatRequestStatus,
} from "@/lib/request-status-vocabulary";
import { RENDITION_STATUS, REQUEST_STATUS } from "@/types/requests";

describe("request status vocabulary", () => {
  it("formats lifecycle labels for request detail", () => {
    const cases = [
      [REQUEST_STATUS.DRAFT, "Borrador"],
      [REQUEST_STATUS.SUBMITTED, "Enviada a revisión"],
      [REQUEST_STATUS.OBSERVED, "Observada"],
      [REQUEST_STATUS.APPROVED, "Aprobada · pendiente de pago"],
      [REQUEST_STATUS.REJECTED, "Rechazada"],
      [REQUEST_STATUS.PAID, "Pagada"],
    ] as const;

    for (const [status, label] of cases) {
      expect(formatRequestStatus(status, { surface: REQUEST_STATUS_SURFACE.DETAIL })).toBe(label);
    }
  });

  it("uses contextual labels in Review, Payment and dashboard surfaces", () => {
    expect(formatRequestStatus(REQUEST_STATUS.SUBMITTED, {
      surface: REQUEST_STATUS_SURFACE.REVIEW,
    })).toBe("Por revisar");
    expect(formatRequestStatus(REQUEST_STATUS.APPROVED, {
      surface: REQUEST_STATUS_SURFACE.PAYMENT,
    })).toBe("Pendiente de pago");
    expect(formatRequestStatus(REQUEST_STATUS.PAID, {
      surface: REQUEST_STATUS_SURFACE.PAYMENT,
    })).toBe("Pago registrado");
    expect(formatRequestStatus(REQUEST_STATUS.SUBMITTED, {
      surface: REQUEST_STATUS_SURFACE.DASHBOARD,
    })).toBe("Enviadas a revisión");
    expect(formatRequestStatus(REQUEST_STATUS.APPROVED, {
      surface: REQUEST_STATUS_SURFACE.DASHBOARD,
    })).toBe("Aprobadas · pendientes de pago");
    expect(formatRequestStatus(REQUEST_STATUS.PAID, {
      surface: REQUEST_STATUS_SURFACE.DASHBOARD,
    })).toBe("Pagadas");
  });

  it("keeps reserved request codes renderable without making them selectable", () => {
    expect(formatRequestStatus(REQUEST_STATUS.IN_VALIDATION, {
      surface: REQUEST_STATUS_SURFACE.DETAIL,
    })).toBe("En validación");
    expect(formatRequestStatus(REQUEST_STATUS.CLOSED, {
      surface: REQUEST_STATUS_SURFACE.DETAIL,
    })).toBe("Cerrada");
    expect(formatRequestStatus(REQUEST_STATUS.VOIDED, {
      surface: REQUEST_STATUS_SURFACE.DETAIL,
    })).toBe("Anulada");

    expect(REQUEST_REVIEW_SELECTOR_STATUSES).toEqual([
      REQUEST_STATUS.DRAFT,
      REQUEST_STATUS.SUBMITTED,
      REQUEST_STATUS.OBSERVED,
      REQUEST_STATUS.APPROVED,
      REQUEST_STATUS.REJECTED,
      REQUEST_STATUS.PAID,
    ]);
    expect(REQUEST_REVIEW_SELECTOR_STATUSES).not.toContain(REQUEST_STATUS.IN_VALIDATION);
    expect(REQUEST_REVIEW_SELECTOR_STATUSES).not.toContain(REQUEST_STATUS.CLOSED);
    expect(REQUEST_REVIEW_SELECTOR_STATUSES).not.toContain(REQUEST_STATUS.VOIDED);
    expect(REQUEST_REVIEW_SELECTOR_STATUSES).not.toContain("IN_REVIEW");
    expect(REQUEST_PAYMENT_SELECTOR_STATUSES).toEqual([
      REQUEST_STATUS.APPROVED,
      REQUEST_STATUS.PAID,
    ]);
    expect(REQUEST_RENDITION_SELECTOR_STATUSES).toEqual([
      RENDITION_STATUS.PENDING,
      RENDITION_STATUS.OVERDUE,
      RENDITION_STATUS.IN_REVIEW,
      RENDITION_STATUS.OBSERVED,
      RENDITION_STATUS.SETTLED,
    ]);
  });

  it("formats rendition lifecycle separately and provides a readable unknown fallback", () => {
    expect(formatRequestStatus(REQUEST_STATUS.DRAFT, {
      surface: REQUEST_STATUS_SURFACE.RENDITION_LIFECYCLE,
    })).toBe("En preparación");
    expect(formatRequestStatus(REQUEST_STATUS.SUBMITTED, {
      surface: REQUEST_STATUS_SURFACE.RENDITION_LIFECYCLE,
    })).toBe("Enviada a revisión");
    expect(formatRequestStatus(REQUEST_STATUS.APPROVED, {
      surface: REQUEST_STATUS_SURFACE.RENDITION_LIFECYCLE,
    })).toBe("Rendición aprobada");
    expect(formatRequestStatus(REQUEST_STATUS.REJECTED, {
      surface: REQUEST_STATUS_SURFACE.RENDITION_LIFECYCLE,
    })).toBe("Rendición rechazada");
    expect(formatRequestStatus("LEGACY_UNKNOWN", {
      surface: REQUEST_STATUS_SURFACE.DETAIL,
    })).toBe("Estado no reconocido (LEGACY_UNKNOWN)");
  });
});
