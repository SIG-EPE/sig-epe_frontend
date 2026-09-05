import { describe, expect, it } from "vitest";

import { FAQ_CATEGORIES, FAQ_ITEMS } from "@/lib/help-content";
import { filterFaqItems, normalizeFaqSearchText } from "@/lib/help-search";
import { GIOF_STAGE_GUIDES } from "@/lib/giof-assignment-help";

const EXPECTED_QUESTIONS = [
  "¿Cómo ingreso desde la plataforma de Enseña Perú?",
  "¿Qué hago si no puedo ingresar automáticamente?",
  "¿Qué solicitudes puedo realizar?",
  "¿Cómo creo y envío una solicitud?",
  "¿Qué significa el estado de mi solicitud?",
  "¿Cuándo puedo cambiar o cancelar una solicitud?",
  "¿Cuándo debo adjuntar un archivo PxQ (presupuesto por cantidad)?",
  "¿Qué documentos necesito según mi solicitud?",
  "¿Qué archivos puedo adjuntar?",
  "¿Dónde reviso las observaciones de mi solicitud?",
  "¿Cómo corrijo y vuelvo a enviar una solicitud observada?",
  "¿Cómo sé si mi solicitud está lista para el pago?",
  "¿Dónde reviso el estado de mi pago?",
  "¿Por qué no puedo solicitar otro anticipo?",
  "¿Qué es una rendición de anticipo y cuándo aparece?",
  "¿Qué documentos necesito para rendir un anticipo?",
  "¿Cuál es el plazo para rendir y cuándo recibiré recordatorios?",
  "¿Qué correos envía SIG-EPE y qué hago si no los recibo?",
  "¿Cómo funciona la asignación de trabajo GIOF?",
] as const;

describe("FAQ catalog", () => {
  it("contains the essential questions in stable order", () => {
    expect(FAQ_ITEMS).toHaveLength(19);
    expect(FAQ_ITEMS.map((item) => item.question)).toEqual(EXPECTED_QUESTIONS);

    const visibleCopy = FAQ_ITEMS.map((item) => `${item.question} ${item.answer}`).join(" ");
    expect(visibleCopy).not.toMatch(/\b(?:SSO|token|handoff|replay)\b/i);
    expect(visibleCopy).not.toMatch(/\b(?:SUBMITTED|ADVANCE_SETTLEMENT|REQUEST|PAYMENT|REXAN|DRAFT|IN_VALIDATION|OBSERVED|PAID)\b/);
    expect(FAQ_ITEMS[0].keywords).toContain("SSO institucional");
    expect(FAQ_ITEMS[1].keywords).toContain("SSO");

    const pxqItem = FAQ_ITEMS.find((item) => item.id === "adjuntar-pxq");
    const rexanItem = FAQ_ITEMS.find((item) => item.id === "rexan-generacion");
    expect(pxqItem?.answer).toMatch(/PxQ significa presupuesto por cantidad/i);
    expect(rexanItem?.answer).toMatch(/SIG-EPE crea la rendición de anticipo/i);
    expect(FAQ_ITEMS.find((item) => item.id === "asignacion-giof")?.href).toBe("/help/giof-assignment");
  });

  it("has complete, unique, DOM-safe and categorized entries", () => {
    const ids = FAQ_ITEMS.map((item) => item.id);
    const categories = Object.values(FAQ_CATEGORIES);

    expect(new Set(ids).size).toBe(FAQ_ITEMS.length);
    for (const item of FAQ_ITEMS) {
      expect(item.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(categories).toContain(item.category);
      expect(item.answer.trim()).not.toBe("");
      expect(item.keywords.length).toBeGreaterThan(0);
      expect(item.keywords.every((keyword) => keyword.trim().length > 0)).toBe(true);
    }
  });

  it("usa en la ayuda los labels visibles contextuales vigentes", () => {
    const faqCopy = FAQ_ITEMS.map((item) => item.answer).join(" ");
    const giofCopy = GIOF_STAGE_GUIDES
      .flatMap((guide) => [guide.assignable, guide.notAssignable])
      .join(" ");

    expect(faqCopy).toContain("Enviada a revisión");
    expect(faqCopy).toContain("Aprobada · pendiente de pago");
    expect(faqCopy).not.toMatch(/En gestión de pago|Rendición en preparación/);
    expect(giofCopy).toContain("Por revisar es asignable");
    expect(giofCopy).toContain("Pendiente de pago");
    expect(giofCopy).toContain("Pago registrado");
    expect(giofCopy).toContain("En preparación");
    expect(giofCopy).not.toMatch(/En gestión de pago|Rendición en preparación/);
  });

});

describe("FAQ search", () => {
  it("normalizes case, accents and whitespace", () => {
    expect(normalizeFaqSearchText("  RENDICIÓN\t  Institucional  ")).toBe(
      "rendicion institucional",
    );
  });

  it("matches question, answer and keywords without case or accent distinctions", () => {
    expect(filterFaqItems(FAQ_ITEMS, "sso institucional").map((item) => item.id)).toContain(
      "sso-institucional",
    );
    expect(filterFaqItems(FAQ_ITEMS, "RENDICION").length).toBeGreaterThan(0);
    expect(filterFaqItems(FAQ_ITEMS, "bandeja de entrada").map((item) => item.id)).toContain(
      "correos-sig-epe",
    );
    for (const query of ["asignación", "GIOF", "Rendición", "casilla", "solo lectura"]) {
      expect(filterFaqItems(FAQ_ITEMS, query).map((item) => item.id)).toContain("asignacion-giof");
    }
  });

  it("returns every item for a blank query and does not mutate the input", () => {
    const originalOrder = FAQ_ITEMS.map((item) => item.id);
    const result = filterFaqItems(FAQ_ITEMS, "   ");

    expect(result).toEqual(FAQ_ITEMS);
    expect(FAQ_ITEMS.map((item) => item.id)).toEqual(originalOrder);
  });

  it("returns no items when no searchable field matches", () => {
    expect(filterFaqItems(FAQ_ITEMS, "termino-imposible-987654")).toEqual([]);
  });
});
