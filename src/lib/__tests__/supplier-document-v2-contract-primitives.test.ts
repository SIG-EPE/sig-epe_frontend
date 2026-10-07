import { describe, expect, expectTypeOf, it } from "vitest";

import {
  OTHER_DOCUMENT_TITLE_ERROR,
  REQUEST_DOCUMENT_CATEGORY_OPTIONS,
  getRequestDocumentAccept,
  getRequestDocumentAcceptedFormatsLabel,
  validateOtherDocumentDisplayName,
  validateRequestDocumentFile,
} from "@/lib/requests";
import {
  REQUEST_DOCUMENT_CATEGORY,
  SUPPLIER_DOCUMENT_PROJECTION_REASON,
  type CreateRequestDto,
  type RequestDocumentCategory,
  type SupplierDocumentEvidenceProjection,
  type UpdateRequestDto,
} from "@/types/requests";

describe("supplier document v2 frontend contract primitives", () => {
  it("keeps legacy declarations readable but excludes them from write contracts", () => {
    expectTypeOf<CreateRequestDto>().not.toHaveProperty("declares_rus");
    expectTypeOf<CreateRequestDto>().not.toHaveProperty(
      "declares_casa_de_retiro",
    );
    expectTypeOf<UpdateRequestDto>().not.toHaveProperty("declares_rus");
    expectTypeOf<UpdateRequestDto>().not.toHaveProperty(
      "declares_casa_de_retiro",
    );
  });

  it("supports the new categories in shared types without exposing them in current UI options", () => {
    const mobility: RequestDocumentCategory =
      REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET;
    const sworn: RequestDocumentCategory =
      REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION;
    const visibleOptions = REQUEST_DOCUMENT_CATEGORY_OPTIONS.map(
      ({ value }) => value,
    );

    expect(mobility).toBe("MOBILITY_SHEET");
    expect(sworn).toBe("SWORN_DECLARATION");
    expect(visibleOptions).not.toContain(mobility);
    expect(visibleOptions).not.toContain(sworn);
    expect(visibleOptions).toContain(REQUEST_DOCUMENT_CATEGORY.RECEIPT);
    expect(visibleOptions).toContain(REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF);
  });

  it("pins exact accept policies for Mobility and Sworn Declaration", () => {
    expect(
      getRequestDocumentAcceptedFormatsLabel(
        REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET,
      ),
    ).toBe("PDF, XLSX");
    expect(
      getRequestDocumentAcceptedFormatsLabel(
        REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION,
      ),
    ).toBe("PDF, XLSX, DOCX");
    expect(
      getRequestDocumentAccept(REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET),
    ).not.toContain(".xls,");
    expect(
      getRequestDocumentAccept(REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION),
    ).not.toContain("application/octet-stream");
  });

  it.each([
    [
      REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET,
      "mobility.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      true,
    ],
    [
      REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET,
      "mobility.xls",
      "application/vnd.ms-excel",
      false,
    ],
    [
      REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION,
      "declaration.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      true,
    ],
    [
      REQUEST_DOCUMENT_CATEGORY.SWORN_DECLARATION,
      "declaration.doc",
      "application/msword",
      false,
    ],
  ] as const)(
    "validates %s exact format policy",
    (category, name, type, valid) => {
      const error = validateRequestDocumentFile(
        new File(["x"], name, { type }),
        category,
      );
      expect(error === null).toBe(valid);
    },
  );

  it("defines stable projection reason primitives compatible with the backend shape", () => {
    const projection: SupplierDocumentEvidenceProjection = {
      state: "BLOCKED",
      eligible: false,
      primary_satisfied: false,
      reason_code:
        SUPPLIER_DOCUMENT_PROJECTION_REASON.PRIMARY_DOCUMENT_REQUIRED,
      allowed_categories: [REQUEST_DOCUMENT_CATEGORY.MOBILITY_SHEET],
      documents: [],
    };

    expect(projection.reason_code).toBe("SUPPLIER_PRIMARY_DOCUMENT_REQUIRED");
  });

  it.each([
    ["", OTHER_DOCUMENT_TITLE_ERROR.LENGTH],
    ["   ", OTHER_DOCUMENT_TITLE_ERROR.LENGTH],
    ["ab", OTHER_DOCUMENT_TITLE_ERROR.LENGTH],
    ["a".repeat(121), OTHER_DOCUMENT_TITLE_ERROR.LENGTH],
    ["Título, con puntuación", null],
    ["...", OTHER_DOCUMENT_TITLE_ERROR.FORBIDDEN],
    ["Anexo\nprivado", OTHER_DOCUMENT_TITLE_ERROR.FORBIDDEN],
    ["Anexo\u0000privado", OTHER_DOCUMENT_TITLE_ERROR.FORBIDDEN],
    ['Anexo "privado"', OTHER_DOCUMENT_TITLE_ERROR.FORBIDDEN],
    ["Anexo / privado", OTHER_DOCUMENT_TITLE_ERROR.FORBIDDEN],
    ["Anexo \\ privado", OTHER_DOCUMENT_TITLE_ERROR.FORBIDDEN],
    ["Anexo <privado>", OTHER_DOCUMENT_TITLE_ERROR.FORBIDDEN],
    ["Anexo 'válido' & #1 + 2%", null],
    ["ＡＢＣ", null],
    ["Cafe\u0301 técnico Ñ", null],
  ])("validates OTHER business title %j", (title, expected) => {
    expect(validateOtherDocumentDisplayName(title)).toBe(expected);
  });

  it.each(["Á1x", "a".repeat(120)])(
    "accepts OTHER business title boundary %s",
    (title) => {
      expect(validateOtherDocumentDisplayName(title)).toBeNull();
    },
  );
});
