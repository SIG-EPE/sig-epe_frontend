import { api, type ApiDownloadResult } from "@/lib/api-client";
import { safeBusinessExportFilename } from "@/lib/business-export-filename";
import { serializeRenditionsQueueUrl, type RenditionsQueueUrlFilters } from "@/lib/queue-filters/renditions";
import { assertCompleteXlsx } from "@/lib/request-review-export";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";

const EXPORT_PATH = "/requests/renditions/export-business.xlsx";

export function buildRenditionsExportPath(filters: RenditionsQueueUrlFilters): string {
  const params = serializeRenditionsQueueUrl(filters);
  params.delete("page");
  params.delete("limit");
  // El alcance ALL aplicado debe permanecer explícito aunque el codec lo omita.
  if (filters.work_scope === GIOF_WORK_SCOPE.ALL) params.set("work_scope", GIOF_WORK_SCOPE.ALL);
  const query = params.toString();
  return `${EXPORT_PATH}${query ? `?${query}` : ""}`;
}

export async function downloadRenditionsExport(
  filters: RenditionsQueueUrlFilters,
  signal: AbortSignal,
): Promise<ApiDownloadResult> {
  signal.throwIfAborted();
  const download = await api.download(buildRenditionsExportPath(filters), { signal });
  await assertCompleteXlsx(download.blob, signal);
  signal.throwIfAborted();
  return download;
}

export function saveRenditionsExport(download: ApiDownloadResult): void {
  const href = URL.createObjectURL(download.blob);
  const link = document.createElement("a");
  try {
    link.href = href;
    link.download = safeBusinessExportFilename("rendiciones", download.filename);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(href);
  }
}
