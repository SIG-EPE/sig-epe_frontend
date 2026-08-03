import { ApiRequestError } from "@/lib/api-client";
import {
  REQUEST_DOCUMENT_UPLOAD_FILE_STATE,
  type RequestDocumentUploadFileState,
  type RequestDocumentUploadQueueItem,
} from "@/lib/request-document-upload-queue";
import {
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_RECEIPT_OCR_STATUS,
  type RequestDocument,
  type RequestReceiptReview,
} from "@/types/requests";

function parseRetryAfterHeader(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const retryDate = Date.parse(value);
  return Number.isNaN(retryDate) ? 0 : Math.max(retryDate - Date.now(), 0);
}

export function getRequestDocumentUploadRetryDelayMs(error: unknown): number {
  if (!(error instanceof ApiRequestError)) return 0;
  if (typeof error.body.retry_after_ms === "number" && Number.isFinite(error.body.retry_after_ms) && error.body.retry_after_ms >= 0) {
    return Math.round(error.body.retry_after_ms);
  }
  return parseRetryAfterHeader(error.headers?.get("Retry-After") ?? null);
}

export function getReconciledRequestDocumentUploadFileState(
  item: RequestDocumentUploadQueueItem,
  documents: RequestDocument[],
  receipts: RequestReceiptReview[],
): RequestDocumentUploadFileState | null {
  if (!item.persistedDocumentId) return null;
  const document = documents.find((candidate) => candidate.id === item.persistedDocumentId);
  if (!document) return null;
  if (item.documentCategory !== REQUEST_DOCUMENT_CATEGORY.RECEIPT) return REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED;
  const receipt = receipts.find((candidate) => candidate.receipt.document_id === document.id);
  if (!receipt || receipt.receipt.confirmed_at) return REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED;
  if (
    receipt.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.PENDING
    || receipt.receipt.ocr_status === REQUEST_RECEIPT_OCR_STATUS.PROCESSING
  ) {
    return REQUEST_DOCUMENT_UPLOAD_FILE_STATE.PROCESSING;
  }
  return REQUEST_DOCUMENT_UPLOAD_FILE_STATE.NEEDS_REVIEW;
}
