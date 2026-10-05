import { api, type ApiDownloadResult } from "@/lib/api-client";
import { safeBusinessExportFilename } from "@/lib/business-export-filename";
import { serializeRequestReviewUrl } from "@/lib/queue-filters/review";
import type { RequestReviewFilters } from "@/types/requests";

const REQUEST_REVIEW_EXPORT_PATH = "/requests/review/export-business.xlsx";

export function buildRequestReviewExportPath(filters: RequestReviewFilters): string {
  const params = serializeRequestReviewUrl(filters);
  params.delete("page");
  params.delete("limit");
  const query = params.toString();
  return `${REQUEST_REVIEW_EXPORT_PATH}${query ? `?${query}` : ""}`;
}

export async function downloadRequestReviewExport(
  filters: RequestReviewFilters,
  signal: AbortSignal,
): Promise<ApiDownloadResult> {
  const download = await api.download(buildRequestReviewExportPath(filters), {
    signal,
  });
  await assertCompleteXlsx(download.blob, signal);
  return download;
}

// Validación reutilizada por las descargas de bandejas; api.download ya valida tipo y firma.
export async function assertCompleteXlsx(blob: Blob, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  // Un ZIP truncado puede conservar la firma inicial PK. Exigir también el cierre ZIP.
  const tail = new Uint8Array(await blob.slice(-65_557).arrayBuffer());
  signal.throwIfAborted();
  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const hasHeader =
    header.length === 4 &&
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04;
  let hasEndRecord = false;
  const view = new DataView(tail.buffer);
  for (let index = tail.length - 22; index >= 0; index--) {
    if (
      tail[index] === 0x50 &&
      tail[index + 1] === 0x4b &&
      tail[index + 2] === 0x05 &&
      tail[index + 3] === 0x06 &&
      index + 22 + view.getUint16(index + 20, true) === tail.length &&
      view.getUint16(index + 10, true) > 0
    ) {
      const directorySize = view.getUint32(index + 12, true);
      const directoryOffset = view.getUint32(index + 16, true);
      const absoluteEnd = blob.size - tail.length + index;
      if (directorySize === 0 || directoryOffset + directorySize !== absoluteEnd)
        continue;
      const directory = new Uint8Array(
        await blob.slice(directoryOffset, directoryOffset + 4).arrayBuffer(),
      );
      signal.throwIfAborted();
      hasEndRecord =
        directory[0] === 0x50 &&
        directory[1] === 0x4b &&
        directory[2] === 0x01 &&
        directory[3] === 0x02;
      break;
    }
  }
  if (!hasHeader || !hasEndRecord) throw new Error("Invalid XLSX download");
}

export function saveRequestReviewExport(download: ApiDownloadResult): void {
  const href = URL.createObjectURL(download.blob);
  const link = document.createElement("a");

  try {
    link.href = href;
    link.download = safeBusinessExportFilename("solicitudes-revision", download.filename);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(href);
  }
}
