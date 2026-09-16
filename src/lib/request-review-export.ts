import { api, type ApiDownloadResult } from "@/lib/api-client";
import { serializeRequestReviewUrl } from "@/lib/queue-filters/review";
import type { RequestReviewFilters } from "@/types/requests";

const REQUEST_REVIEW_EXPORT_PATH = "/requests/review/export.xlsx";
const REQUEST_REVIEW_EXPORT_FALLBACK_FILENAME = "bandeja-revision.xlsx";

export function buildRequestReviewExportPath(filters: RequestReviewFilters): string {
  const params = serializeRequestReviewUrl(filters);
  params.delete("page");
  params.delete("limit");
  const query = params.toString();
  return `${REQUEST_REVIEW_EXPORT_PATH}${query ? `?${query}` : ""}`;
}

export function downloadRequestReviewExport(
  filters: RequestReviewFilters,
  signal: AbortSignal,
): Promise<ApiDownloadResult> {
  return api.download(buildRequestReviewExportPath(filters), { signal });
}

export function saveRequestReviewExport(download: ApiDownloadResult): void {
  const href = URL.createObjectURL(download.blob);
  const link = document.createElement("a");

  try {
    link.href = href;
    link.download = download.filename ?? REQUEST_REVIEW_EXPORT_FALLBACK_FILENAME;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(href);
  }
}
