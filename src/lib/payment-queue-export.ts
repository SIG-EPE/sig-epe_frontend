import { api, type ApiDownloadResult } from "@/lib/api-client";
import { safeBusinessExportFilename } from "@/lib/business-export-filename";
import { PAYMENT_QUEUE_STATUS } from "@/lib/requests";
import {
  PAYMENT_QUEUE_TAB,
  serializePaymentQueueUrl,
  type PaymentQueueUrlFilters,
} from "@/lib/queue-filters/payment";
import { GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import {
  PAYMENT_COMPLETENESS,
  type PaymentQueueFilters,
} from "@/types/requests";

const PAYMENT_EXPORT_PATH = "/request-payments/export-business.xlsx";

export function getAppliedPaymentQueueFilters(
  filters: PaymentQueueUrlFilters,
  workScope?: GiofWorkScope,
  assigneeId?: string,
): PaymentQueueFilters {
  const { tab, ...rest } = filters;
  return {
    ...rest,
    status:
      (tab ?? PAYMENT_QUEUE_TAB.APPROVED) === PAYMENT_QUEUE_TAB.APPROVED
        ? PAYMENT_QUEUE_STATUS.PENDING
        : tab === PAYMENT_QUEUE_TAB.REJECTED
          ? PAYMENT_QUEUE_STATUS.REJECTED
          : PAYMENT_QUEUE_STATUS.PAID,
    completeness:
      tab === PAYMENT_QUEUE_TAB.PENDING_DATA
        ? PAYMENT_COMPLETENESS.ANY_MISSING
        : rest.completeness,
    work_scope: workScope,
    assignee_id: assigneeId,
  };
}

export function buildPaymentQueueExportPath(
  filters: PaymentQueueFilters,
): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  const queueParams = serializePaymentQueueUrl(filters);
  for (const [key, value] of queueParams) {
    if (key !== "page" && key !== "limit" && key !== "tab")
      params.set(key, value);
  }
  // ALL is omitted by the URL codec for navigation; the queue's applied scope is explicit.
  if (filters.work_scope === GIOF_WORK_SCOPE.ALL)
    params.set("work_scope", GIOF_WORK_SCOPE.ALL);
  const query = params.toString();
  return `${PAYMENT_EXPORT_PATH}${query ? `?${query}` : ""}`;
}

export async function downloadPaymentQueueExport(
  filters: PaymentQueueFilters,
  signal: AbortSignal,
): Promise<ApiDownloadResult> {
  signal.throwIfAborted();
  const download = await api.download(buildPaymentQueueExportPath(filters), {
    signal,
  });
  signal.throwIfAborted();
  // Además de la firma que comprueba api.download, exigir directorio y cierre ZIP.
  const blob = download.blob;
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
      if (!directorySize || directoryOffset + directorySize !== absoluteEnd)
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
  if (!hasHeader || !hasEndRecord)
    throw new Error("Invalid payment XLSX download");
  return download;
}

export function savePaymentQueueExport(download: ApiDownloadResult): void {
  const href = URL.createObjectURL(download.blob);
  const link = document.createElement("a");
  try {
    link.href = href;
    link.download = safeBusinessExportFilename("pagos", download.filename);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(href);
  }
}
