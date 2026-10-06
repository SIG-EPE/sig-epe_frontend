import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { RequestDocumentProvenanceBadge } from "../request-document-provenance-badge";

describe("RequestDocumentProvenanceBadge", () => {
  it.each([
    ["Agregado por GIOF", "HUMAN"],
    ["Agregado por usuario", "HUMAN"],
    ["Generado por el sistema", "GENERATED"],
    ["Agregado por administrador", "HUMAN"],
    ["Documento existente", null],
  ] as const)("displays the backend label %s", (label, origin) => {
    render(
      <RequestDocumentProvenanceBadge
        document={{ provenance_label: label, provenance_origin: origin }}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("supports old responses missing both provenance fields", () => {
    render(<RequestDocumentProvenanceBadge document={{}} />);
    expect(screen.getByText("Documento existente")).toBeInTheDocument();
  });

  it("uses the historical fallback without inspecting role, category or metadata", () => {
    const legacyDocument = {
      uploaded_by_id: "private-actor-id",
      uploaded_by: { role: "GIOF_MANAGER" },
      document_category: "SETTLEMENT_REPORT",
      provenance_origin: "GENERATED" as const,
      metadata_json: {
        provenance_label: "Forged label",
        document_upload_provenance_v1: { actor_role: "GIOF_GESTOR" },
      },
    };
    const { container } = render(
      <RequestDocumentProvenanceBadge document={legacyDocument} />,
    );
    expect(screen.getByText("Documento existente")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Forged label");
    expect(container.innerHTML).not.toContain("private-actor-id");
    expect(container.innerHTML).not.toContain("GIOF");
  });

  it("retains the supplied label across a refetched object with different role and metadata", () => {
    const first = {
      provenance_label: "Agregado por GIOF",
      uploaded_by: { role: "GIOF_GESTOR" },
    };
    const { rerender } = render(
      <RequestDocumentProvenanceBadge document={first} />,
    );
    const refetched = { ...first, uploaded_by: { role: "SOLICITANTE_EPE" } };
    rerender(<RequestDocumentProvenanceBadge document={refetched} />);
    expect(screen.getByText("Agregado por GIOF")).toBeInTheDocument();
    expect(screen.queryByText("Agregado por usuario")).not.toBeInTheDocument();
  });

  it("renders the response label as text, not HTML", () => {
    const label = '<img src="x" onerror="alert(1)">';
    const { container } = render(
      <RequestDocumentProvenanceBadge document={{ provenance_label: label }} />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
