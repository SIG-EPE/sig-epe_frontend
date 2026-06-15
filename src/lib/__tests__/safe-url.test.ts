import { describe, expect, it } from "vitest";

import { getSafeDocumentUrl } from "@/lib/safe-url";

describe("getSafeDocumentUrl", () => {
  it("allows https external document URLs", () => {
    expect(getSafeDocumentUrl(" https://example.com/document.pdf ")).toBe("https://example.com/document.pdf");
  });

  it("allows internal backend document endpoints", () => {
    expect(getSafeDocumentUrl("/requests/req-1/documents/doc-1/download")).toBe("/requests/req-1/documents/doc-1/download");
  });

  it("rejects unsafe external protocols and protocol-relative URLs", () => {
    expect(getSafeDocumentUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeDocumentUrl("http://example.com/document.pdf")).toBeNull();
    expect(getSafeDocumentUrl("//example.com/document.pdf")).toBeNull();
  });
});
