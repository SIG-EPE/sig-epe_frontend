import { Badge } from "@/components/ui/badge";
import type { RequestDocument } from "@/types/requests";

interface RequestDocumentProvenanceBadgeProps {
  document: Pick<RequestDocument, "provenance_label" | "provenance_origin">;
}

export function RequestDocumentProvenanceBadge({
  document,
}: RequestDocumentProvenanceBadgeProps) {
  return (
    <Badge variant="outline">
      {document.provenance_label ?? "Documento existente"}
    </Badge>
  );
}
