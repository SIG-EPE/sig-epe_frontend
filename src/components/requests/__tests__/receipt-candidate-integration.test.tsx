import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RequestDocumentsCard } from "@/components/requests/request-documents-card";
import { ROLE_CODE } from "@/lib/constants";
import { clearQueryCache } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";
import {
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_RECEIPT_DUPLICATE_STATUS,
  REQUEST_RECEIPT_OCR_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
  type RequestDocument,
  type RequestReceiptReview,
} from "@/types/requests";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const sourceBytes = "%PDF-1.4\n% SOURCE fixture only\n%%EOF\n";
const candidateBytes = "%PDF-1.4\n% CANDIDATE fixture only\n%%EOF\n";
const snapshot = "a".repeat(64);
const sourcePath = "/requests/source-request/receipts/source-receipt/document";
const candidatePath = `/requests/source-request/receipts/source-receipt/candidates/candidate-receipt/document?snapshot=${snapshot}`;
const sourceView = "https://drive.google.com/file/d/source-document/view";
const request = {
  id: "source-request",
  request_type: REQUEST_TYPE.REIMBURSEMENT,
  status: REQUEST_STATUS.DRAFT,
  requester_id: "actor",
  fiscal_year: 2026,
  currency: "PEN",
  requested_amount: 1,
} as PaymentRequest;
const sourceDocument = {
  id: "source-document",
  payment_request_id: request.id,
  document_category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
  safe_filename: "source.pdf",
  original_filename: "source.pdf",
  mime_type: "application/pdf",
  size_bytes: sourceBytes.length,
  upload_status: "PERMANENT",
  drive_web_url: sourceView,
} as RequestDocument;
const review = {
  receipt: {
    id: "source-receipt",
    request_id: request.id,
    document_id: sourceDocument.id,
    receipt_type: "INVOICE",
    issuer_document_number: null,
    issuer_name: null,
    series: null,
    number: null,
    issue_date: null,
    amount: null,
    currency: "PEN",
    duplicate_status: REQUEST_RECEIPT_DUPLICATE_STATUS.POSSIBLE_DUPLICATE,
    ocr_status: REQUEST_RECEIPT_OCR_STATUS.SUCCESS,
  },
  latest_extraction: null,
  candidate_open_snapshot: snapshot,
  duplicate_candidates: [{
    receipt_id: "candidate-receipt",
    request_id: "candidate-request",
    document_id: "candidate-document",
    issuer_document_number: null,
    series: null,
    number: null,
    issue_date: null,
    amount: null,
  }],
} as RequestReceiptReview;

function pdf(bytes: string) {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="candidate.pdf"',
    },
  });
}

function mockServer(receipts = [review], candidateResponse = () => Promise.resolve(pdf(candidateBytes))) {
  const paths: string[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    paths.push(path);
    if (path === candidatePath) return candidateResponse();
    if (path === sourcePath || url.href === sourceView) return pdf(sourceBytes);
    const data = path === `/requests/${request.id}/receipts`
      ? receipts
      : path === `/requests/${request.id}/documents` ? [sourceDocument] : null;
    if (data === null) throw new Error(`Unexpected fixture route: ${path}`);
    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { paths, fetchMock };
}

function renderCard() {
  return render(<RequestDocumentsCard request={request} readOnly />);
}

describe("candidate preview through actual card, hooks and Blob helper", () => {
  beforeEach(() => {
    clearQueryCache();
    useAuthStore.setState({
      user: { id: "actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser,
      accessToken: "fixture-token",
      isLoading: false,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true, value: vi.fn((_blob: Blob) => "blob:candidate-integration"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true, value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearQueryCache();
    useAuthStore.getState().clearAuth();
  });

  it("opens only candidate bytes from the server snapshot; source View stays separate", async () => {
    const { paths, fetchMock } = mockServer();
    renderCard();
    const opener = await screen.findByRole("button", { name: "Ver comprobante candidato" });
    const ordinaryView = screen.getByRole("link", { name: /Ver documento source.pdf/ });
    expect(ordinaryView).toHaveAttribute("href", sourceView);
    fireEvent.click(opener);
    const iframe = await screen.findByTitle("Vista del comprobante candidato");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", "blob:candidate-integration");
    expect(screen.getByRole("dialog")).toContainElement(iframe);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
    expect(await blob.text()).toBe(candidateBytes);
    expect(await blob.text()).not.toContain("SOURCE");
    expect(paths.filter((path) => path.includes("/document?") || path === sourcePath)).toEqual([candidatePath]);
    expect(paths).not.toContain(new URL(sourceView).pathname);
    const init = fetchMock.mock.calls.find(([input]) => String(input).endsWith(candidatePath))?.[1];
    expect(init).toMatchObject({ method: "GET", credentials: "include", cache: "no-store", signal: expect.any(AbortSignal) });
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fixture-token");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar comprobante candidato" }));
    expect(screen.queryByTitle("Vista del comprobante candidato")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:candidate-integration");
    expect(ordinaryView).toHaveAttribute("href", sourceView);
  });

  it("aborts close before a late fetch response without creating an iframe or object URL", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const { paths, fetchMock } = mockServer([review], () => pending);
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Ver comprobante candidato" }));
    await waitFor(() => expect(paths).toContain(candidatePath));
    const signal = fetchMock.mock.calls.find(([input]) => String(input).endsWith(candidatePath))?.[1]?.signal;
    fireEvent.click(screen.getByRole("button", { name: "Cerrar comprobante candidato" }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(pdf(candidateBytes)); await pending; });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Vista del comprobante candidato")).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(paths.filter((path) => path === candidatePath)).toHaveLength(1);
    expect(paths).not.toContain(sourcePath);
  });

  it("renders an ordinary-user server response with no candidates and makes no binary request", async () => {
    useAuthStore.setState({
      user: { id: "actor", role: { code: ROLE_CODE.SOLICITANTE_EPE } } as AuthUser,
    });
    const { candidate_open_snapshot: _snapshot, ...ordinaryReview } = review;
    const { paths } = mockServer([{ ...ordinaryReview, duplicate_candidates: [] }]);
    renderCard();
    await waitFor(() => expect(paths).toContain(`/requests/${request.id}/receipts`));
    expect(await screen.findByRole("link", { name: /Ver documento source.pdf/ })).toHaveAttribute("href", sourceView);
    expect(screen.queryByRole("button", { name: "Ver comprobante candidato" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(paths.some((path) => path.includes("/candidates/") || path === sourcePath)).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
