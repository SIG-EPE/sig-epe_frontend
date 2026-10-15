import { REQUEST_DOCUMENT_CATEGORY, type RequestDocumentCategory } from "@/types/requests";

// Copy informativo de Liliana; no define requisitos ni validaciones.
export const REQUEST_DOCUMENT_INFORMATION: Partial<Record<RequestDocumentCategory, string>> = {
  [REQUEST_DOCUMENT_CATEGORY.CONTRACT]: "Adjunta el contrato o convenio que formaliza el servicio, especialmente cuando el importe en soles alcanza o supera ½ UIT del año de la solicitud.",
  [REQUEST_DOCUMENT_CATEGORY.QUOTATION]: "Adjunta la cotización aprobada que sustenta el monto solicitado, especialmente cuando el importe en soles alcanza o supera ½ UIT del año de la solicitud.",
  [REQUEST_DOCUMENT_CATEGORY.INVOICE]: "Adjunta la factura por el bien o servicio. Si aún no ha sido emitida, adjunta el contrato o la cotización (según el caso) y luego envía la factura al correo de solicitudes de pagos.",
  [REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT]: "Adjunta el recibo por honorarios por los servicios prestados por una persona independiente.",
  [REQUEST_DOCUMENT_CATEGORY.SALES_RECEIPT]: "Verifica en SUNAT que el proveedor pertenezca al Nuevo RUS antes de adjuntar la boleta.",
  [REQUEST_DOCUMENT_CATEGORY.CASH_RECEIPT]: "Adjunta el recibo de caja para instituciones religiosas o casas de retiro.",
  [REQUEST_DOCUMENT_CATEGORY.FOURTH_CATEGORY_SUSPENSION]: "Si el recibo por honorarios electrónico supera S/ 1500 y no se aplica retención, adjunta la constancia vigente de suspensión de 4ta categoría, con fecha anterior a la emisión del recibo por honorarios.",
};

export const SUPPLIER_RHE_SUSPENSION_GUIDANCE = "Si el recibo por honorarios supera S/ 1,500 y no incluye retención, adjunta una constancia vigente emitida antes del RH.";

interface SupplierDocumentSuggestion {
  label: string;
  condition: string;
  categories: readonly RequestDocumentCategory[];
}

// Sugerencias de presentación para Pago a proveedor, sin inferir datos del archivo.
export const SUPPLIER_DOCUMENT_SUGGESTIONS: Partial<Record<RequestDocumentCategory, SupplierDocumentSuggestion>> = {
  [REQUEST_DOCUMENT_CATEGORY.PROFESSIONAL_FEE_RECEIPT]: {
    label: "Documento sugerido: Suspensión de cuarta categoría",
    condition: SUPPLIER_RHE_SUSPENSION_GUIDANCE,
    categories: [REQUEST_DOCUMENT_CATEGORY.FOURTH_CATEGORY_SUSPENSION],
  },
  [REQUEST_DOCUMENT_CATEGORY.INVOICE]: {
    label: "Documentos sugeridos: Contrato o cotización (según el caso)",
    condition: "Si la factura aún no está emitida, adjunta el contrato o la cotización (según el caso).",
    categories: [REQUEST_DOCUMENT_CATEGORY.CONTRACT, REQUEST_DOCUMENT_CATEGORY.QUOTATION],
  },
};

interface DocumentInformationUitContext {
  advisoryUit?: string | null;
  currency?: string | null;
  fiscalYear?: number | null;
  uitYear?: number | null;
}

// Solo presentación: no compara el importe solicitado ni convierte monedas.
function formatHalfUit(context: DocumentInformationUitContext | null | undefined): string | null {
  const value = context?.advisoryUit;
  if (context?.currency !== "PEN" || !Number.isInteger(context.fiscalYear) ||
    context.fiscalYear !== context.uitYear || typeof value !== "string" ||
    !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const uit = Number(value);
  if (!Number.isFinite(uit) || uit <= 0) return null;
  return `S/ ${new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(uit / 2)}`;
}

export function getRequestDocumentInformation(
  category: RequestDocumentCategory,
  uitContext?: DocumentInformationUitContext | null,
): string | undefined {
  const information = REQUEST_DOCUMENT_INFORMATION[category];
  if (!information || (category !== REQUEST_DOCUMENT_CATEGORY.CONTRACT &&
    category !== REQUEST_DOCUMENT_CATEGORY.QUOTATION)) return information;
  const halfUit = formatHalfUit(uitContext);
  return halfUit ? `${information.slice(0, -1)} (${halfUit}).` : information;
}
