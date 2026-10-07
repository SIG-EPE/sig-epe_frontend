import { describe, expect, it } from "vitest";

import { getSafeOtherDocumentDisplayFilename } from "@/lib/other-document-display-name";

describe("OTHER document presentation filename", () => {
  it.each([
    ["C:\\private\\reports\\Factura final.PDF", "Factura final.PDF"],
    ["/private/reports/Factura final.pdf", "Factura final.pdf"],
    ["C:\\private/reports\\Informe año.pdf", "Informe año.pdf"],
    ["Informe año.pdf", "Informe año.pdf"],
    ["dir/Informe\u0000\u001f\u007f año.pdf", "Informe año.pdf"],
    ["", "Documento sin nombre"],
    ["/dir/..", "Documento sin nombre"],
    ["C:\\dir\\CON.pdf", "Documento.pdf"],
    ["/dir/.pdf", "Documento.pdf"],
    ["/dir/\u0000.pdf", "Documento.pdf"],
    ["/dir/CON", "Documento sin nombre"],
    ["/dir/Informe.pdf", "Informe.pdf"],
    ["C:Informe.pdf", "CInforme.pdf"],
    ["/dir/Informe.pdf.pdf", "Informe.pdf.pdf"],
  ])("renders a safe basename for %j", (input, expected) => {
    expect(getSafeOtherDocumentDisplayFilename(input)).toBe(expected);
  });
});
