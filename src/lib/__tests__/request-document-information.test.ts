import { describe, expect, it } from "vitest";
import { getRequestDocumentInformation, REQUEST_DOCUMENT_INFORMATION } from "@/lib/request-document-information";
import { REQUEST_DOCUMENT_CATEGORY } from "@/types/requests";

const context = { currency: "PEN", fiscalYear: 2026, uitYear: 2026, advisoryUit: "5500.00" };
const threshold = "especialmente cuando el importe en soles alcanza o supera ½ UIT del año de la solicitud";

describe("request document information", () => {
  it("uses the resolved 2026 UIT for both inclusive informational messages", () => {
    for (const category of [REQUEST_DOCUMENT_CATEGORY.CONTRACT, REQUEST_DOCUMENT_CATEGORY.QUOTATION]) {
      expect(getRequestDocumentInformation(category, context)).toContain(`${threshold} (S/ 2,750.00)`);
    }
  });

  it("uses a different year's UIT without a fixed 2750 fallback", () => {
    const message = getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.CONTRACT, {
      ...context, fiscalYear: 2025, uitYear: 2025, advisoryUit: "6000.00",
    });
    expect(message).toContain("S/ 3,000.00");
    expect(message).not.toContain("2,750");
  });

  it("formats positive decimal UIT values", () => {
    expect(getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.QUOTATION, {
      ...context, advisoryUit: "5500.50",
    })).toContain("S/ 2,750.25");
  });

  it("keeps a generic threshold for unavailable or malformed UIT", () => {
    for (const advisoryUit of [undefined, null, "", "0", "-5500", "NaN", "Infinity", "5500oops", "5,500", "5500.001"]) {
      const message = getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.CONTRACT, { ...context, advisoryUit });
      expect(message).toContain(threshold);
      expect(message).not.toContain("S/");
    }
  });

  it("does not reuse a mismatched or unknown fiscal year", () => {
    for (const year of [2025, null, undefined]) {
      expect(getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.CONTRACT, {
        ...context, uitYear: year,
      })).not.toContain("S/");
      expect(getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.QUOTATION, {
        ...context, fiscalYear: year,
      })).not.toContain("S/");
    }
  });

  it("does not convert USD or instruct mandatory threshold uploads", () => {
    const message = getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.CONTRACT, { ...context, currency: "USD" });
    expect(message).toContain(threshold);
    expect(message).not.toContain("S/");
    expect(message).not.toMatch(/obligatorio|tipo de cambio|USD/);
  });

  it("preserves Liliana descriptions with conditional invoice guidance", () => {
    const messages = {
      INVOICE: "Adjunta la factura por el bien o servicio. Si aún no ha sido emitida, adjunta el contrato o la cotización (según el caso) y luego envía la factura al correo de solicitudes de pagos.",
      PROFESSIONAL_FEE_RECEIPT: "Adjunta el recibo por honorarios por los servicios prestados por una persona independiente.",
      SALES_RECEIPT: "Verifica en SUNAT que el proveedor pertenezca al Nuevo RUS antes de adjuntar la boleta.",
      CASH_RECEIPT: "Adjunta el recibo de caja para instituciones religiosas o casas de retiro.",
      FOURTH_CATEGORY_SUSPENSION: "Si el recibo por honorarios electrónico supera S/ 1500 y no se aplica retención, adjunta la constancia vigente de suspensión de 4ta categoría, con fecha anterior a la emisión del recibo por honorarios.",
    } as const;
    for (const category of Object.keys(messages) as (keyof typeof messages)[]) {
      expect(getRequestDocumentInformation(category, context)).toBe(messages[category]);
    }
  });

  it("supports only the existing seven categories and nullable context", () => {
    expect(Object.keys(REQUEST_DOCUMENT_INFORMATION)).toHaveLength(7);
    expect(getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.CONTRACT, null)).toContain(threshold);
    expect(getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.CONTRACT)).not.toContain("S/");
    expect(getRequestDocumentInformation(REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT, context)).toBeUndefined();
  });
});
