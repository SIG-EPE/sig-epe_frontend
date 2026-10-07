import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestDocumentsCard } from "../request-documents-card";
import { useRequestDocuments, useRequestReceiptReviews, useRequestRenditionReport } from "@/hooks/use-requests";
import { ROLE_CODE } from "@/lib/constants";
import { clearQueryCache } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";
import type { PaymentRequest, RequestAllocation, RequestDocument, RequestReceiptReview, RequestRenditionReport } from "@/types/requests";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const allocationIds = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const request = {
  id: "settlement", request_type: "ADVANCE_SETTLEMENT", status: "DRAFT",
  requester_id: "actor", fiscal_year: 2026, currency: "PEN", requested_amount: 120,
  allocations: allocationIds.map((id, index) => ({
    id, payment_request_id: "settlement", budget_planning_line_id: `line-${index}`,
    amount: 60, currency: "PEN", budget_month: index + 1, fiscal_year: 2026,
    sort_order: index + 1, documents: [], org_unit_id: null,
    budgetPlanningLine: null, planning_line: null, org_unit: null, payment_execution: null,
  } as RequestAllocation)),
} as PaymentRequest;
const document = {
  id: "document", payment_request_id: request.id, document_category: "RECEIPT",
  scope_type: "REQUEST", request_allocation_id: null, original_filename: "receipt.pdf",
  safe_filename: "receipt.pdf", mime_type: "application/pdf", size_bytes: 50,
  upload_status: "PERMANENT", drive_web_url: "https://drive.google.com/file/d/source/view",
} as RequestDocument;
const review = {
  receipt: {
    id: "receipt", request_id: request.id, document_id: document.id,
    request_allocation_id: allocationIds[0], receipt_type: "INVOICE",
    issuer_document_type: "RUC", corrected_fields: null,
    issuer_document_number: "20123456789", issuer_name: "Supplier", series: "F001",
    number: "1", issue_date: "2026-10-01", amount: 120, currency: "PEN",
    duplicate_status: "UNIQUE", ocr_status: "SUCCESS",
    confirmed_at: "2026-10-01T12:00:00Z", confirmed_by_id: "actor",
  },
  latest_extraction: {
    id: "ocr", status: "SUCCESS", provider: "LOCAL", confidence: 0.92,
    error_message: null, extracted_fields: null,
    created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
  }, duplicate_candidates: [],
} as RequestReceiptReview;
const emptyReport: RequestRenditionReport = {
  id: "report", request_id: request.id, status: "DRAFT", currency: "PEN",
  total_amount: 0, rows: [], allocation_coverage: [], settlement_report_document_id: null,
  drive_sync_status: "PENDING", drive_sync_error: null, submitted_at: null, exported_at: null,
  totals: { total_amount: 0, by_allocation: [], missing_allocations: [] },
};
const root = `/requests/${request.id}`;

function ConnectedCard({ readOnly = false, omitReport = false, currentRequest = request }) {
  const documents = useRequestDocuments(request.id);
  const receipts = useRequestReceiptReviews(request.id);
  const report = useRequestRenditionReport(request.id);
  const busy = [documents, receipts, report].some((resource) => resource.isLoading || resource.isRefreshing);
  return <>
    <output data-testid="resources">{busy ? "loading" : "settled"}</output>
    <output data-testid="report-state">{report.error ? "error" : report.report ? "available" : "missing"}</output>
    <output data-testid="confirmation">{receipts.receipts[0]?.receipt.confirmed_at ?? "cleared"}</output>
    <output data-testid="report-total">{report.report?.totals.total_amount}</output>
    <button onClick={() => void report.refetch({ background: true })}>Refresh authority</button>
    <button onClick={() => void receipts.refetch({ background: true })}>Refresh receipts</button>
    <RequestDocumentsCard request={currentRequest} documentsResource={documents}
      receiptsResource={receipts} reportResource={omitReport ? undefined : report} readOnly={readOnly} />
  </>;
}

function json(data: unknown) {
  return new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });
}

function server(batchSize = 1, uploadFirst = false) {
  let currentReview = structuredClone(review);
  const documents = Array.from({ length: batchSize }, (_, index) => batchSize === 1 ? document : {
    ...document, id: `document-${index}`, original_filename: `receipt-${index}.pdf`, safe_filename: `receipt-${index}.pdf`,
  });
  let reviews = documents.map((doc, index) => batchSize === 1 ? currentReview : {
    ...structuredClone(review), receipt: { ...review.receipt, id: `receipt-${index}`, document_id: doc.id, request_allocation_id: null },
  });
  if (uploadFirst) { documents.length = 0; reviews = []; }
  const failures = new Set<string>();
  let afterPatch: (() => Promise<void>) | undefined;
  let unauthorizedPatch = false;
  let refreshResponse: (() => Promise<Response>) | undefined;
  let currentReport: RequestRenditionReport | null = structuredClone(emptyReport);
  let reportResponse: (() => Promise<Response>) | undefined;
  let patchStatus: number | undefined;
  let receiptResponse: (() => Promise<Response>) | undefined;
  const calls: { path: string; method: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    calls.push({ path, method, init });
    if (path === "/auth/refresh" && method === "POST" && refreshResponse) return refreshResponse();
    if (path === `${root}/rendition-report` && method === "GET") return reportResponse ? reportResponse() : json(currentReport);
    if (path === `${root}/documents` && method === "GET") return json(documents);
    if (uploadFirst && path === `${root}/documents` && method === "POST") {
      const form = init?.body as FormData;
      const file = form.get("file") as File;
      const index = documents.length;
      const saved = { ...document, id: `document-${index}`, original_filename: file.name,
        safe_filename: file.name, size_bytes: file.size, drive_web_url: `https://example.test/documents/${index}` };
      documents.push(saved);
      reviews.push({ ...structuredClone(review), receipt: { ...review.receipt, id: `receipt-${index}`,
        document_id: saved.id, request_allocation_id: null, confirmed_at: null, confirmed_by_id: null,
        issuer_document_number: null, issuer_name: "Fixture supplier" } });
      return json(saved);
    }
    if (path === `${root}/receipts` && method === "GET") return receiptResponse ? receiptResponse() : json(batchSize === 1 ? [currentReview] : reviews);
    if (batchSize > 1 && path.startsWith(`${root}/receipts/`) && method === "PATCH") {
      if (unauthorizedPatch) return new Response("{}", { status: 401 });
      const id = path.split("/").at(-1)!;
      if (failures.has(id)) return new Response(JSON.stringify({ message: `Error de ${id}` }), { status: 500 });
      const body = JSON.parse(String(init?.body)) as { request_allocation_id: string };
      reviews = reviews.map((item) => item.receipt.id === id ? { ...item, receipt: { ...item.receipt, ...body, confirmed_at: null, confirmed_by_id: null } } : item);
      if (afterPatch) await afterPatch();
      return json(reviews.find((item) => item.receipt.id === id));
    }
    if (path === `${root}/receipts/receipt` && method === "PATCH") {
      if (patchStatus) return new Response(JSON.stringify({ message: "La POA no pertenece a esta rendición", statusCode: patchStatus }),
        { status: patchStatus, headers: { "Content-Type": "application/json" } });
      const body = JSON.parse(String(init?.body)) as { request_allocation_id: string };
      currentReview = { ...currentReview, receipt: { ...currentReview.receipt, ...body, confirmed_at: null, confirmed_by_id: null } };
      // La respuesta PATCH no decide la agrupación final: se prueba la lectura posterior por separado.
      return json({ ...currentReview, receipt: { ...currentReview.receipt, request_allocation_id: allocationIds[0], confirmed_at: review.receipt.confirmed_at } });
    }
    throw new Error(`Unexpected fixture route: ${method} ${path}`);
  }));
  return {
    calls,
    setReport: (next: RequestRenditionReport | null) => { currentReport = next; },
    setReportResponse: (next: () => Promise<Response>) => { reportResponse = next; },
    setReceiptResponse: (next: () => Promise<Response>) => { receiptResponse = next; },
    failPatch: (status: number) => { patchStatus = status; },
    getReview: () => currentReview,
    getReviews: () => reviews,
    failures,
    afterPatch: (next: () => Promise<void>) => { afterPatch = next; },
    setReviews: (next: RequestReceiptReview[]) => { reviews = next; },
    unauthorized: (next: () => Promise<Response>) => { unauthorizedPatch = true; refreshResponse = next; },
  };
}

async function settled() {
  await screen.findByRole("link", { name: "Ver documento receipt.pdf" });
  await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
}

function expectNoMutations(calls: ReturnType<typeof server>["calls"]) {
  expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
}

async function selectSecond() {
  const user = userEvent.setup();
  const selector = await screen.findByRole("combobox", { name: "POA de receipt.pdf" });
  await waitFor(() => expect(selector).toBeEnabled());
  await user.click(selector);
  await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
  return screen.getByRole("button", { name: "Guardar POA de receipt.pdf" });
}

describe("individual POA tagging with real report/receipt hooks, card and PATCH helper", () => {
  beforeEach(() => {
    clearQueryCache();
    useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.SOLICITANTE_EPE } } as AuthUser,
      accessToken: "fixture-token", isLoading: false });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { value: vi.fn(), configurable: true });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); clearQueryCache(); useAuthStore.getState().clearAuth(); });

  it.each(["receipt", "document"])("loaded OCR report row identified by %s blocks tags after reconciliation", async (identity) => {
    const fixture = server();
    fixture.setReport({ ...emptyReport, rows: [{ request_ocr_extraction_id: "ocr", request_receipt_id: identity === "receipt" ? "receipt" : "other-receipt",
      request_document_id: identity === "document" ? "document" : "other-document" } as RequestRenditionReport["rows"][number]] });
    render(<ConnectedCard />);
    await settled();
    expect(screen.getByTestId("report-state")).toHaveTextContent("available");
    expect(screen.getByText("Comprobante incluido en el informe; no se puede cambiar la POA.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "POA de receipt.pdf" })).not.toBeInTheDocument();
    expect(fixture.calls.some((call) => call.path === `${root}/rendition-report`)).toBe(true);
    expectNoMutations(fixture.calls);
  });

  it.each(["missing", "error", "omitted caller resource"])("fails closed for %s after resource reads settle", async (state) => {
    const fixture = server();
    if (state === "missing") fixture.setReport(null);
    if (state === "error") fixture.setReportResponse(async () => new Response("{}", { status: 500 }));
    // Los callers standalone sin reportResource no obtienen permiso implícito para etiquetar.
    render(<ConnectedCard omitReport={state === "omitted caller resource"} />);
    await settled();
    expect(screen.queryByRole("combobox", { name: "POA de receipt.pdf" })).not.toBeInTheDocument();
    expectNoMutations(fixture.calls);
  });

  it("fails closed while a real report GET is pending, then enables after reconciliation", async () => {
    const fixture = server();
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    fixture.setReportResponse(async () => (await pending).clone());
    render(<ConnectedCard />);
    await screen.findByRole("link", { name: "Ver documento receipt.pdf" });
    expect(screen.getByTestId("resources")).toHaveTextContent("loading");
    expect(screen.queryByRole("combobox", { name: "POA de receipt.pdf" })).not.toBeInTheDocument();
    expectNoMutations(fixture.calls);
    await act(async () => { finish(json(emptyReport)); await pending; });
    await settled();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "POA de receipt.pdf" })).toBeEnabled());
  });

  it("sends one own-REXAN UUID PATCH; authoritative GET moves the group and clears confirmation", async () => {
    const fixture = server();
    const view = render(<ConnectedCard />);
    await settled();
    expect(screen.getByTestId("confirmation")).toHaveTextContent(review.receipt.confirmed_at!);
    const save = await selectSecond();
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    fixture.setReceiptResponse(() => pending);
    fireEvent.click(save);
    await waitFor(() => expect(fixture.calls.filter((call) => call.method === "PATCH")).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("loading"));
    expect(screen.getAllByTestId("settlement-receipt-group")[0]).toHaveTextContent("receipt.pdf");
    await act(async () => { finish(json([fixture.getReview()])); await pending; });
    await settled();
    await waitFor(() => expect(screen.getAllByTestId("settlement-receipt-group")[1]).toHaveTextContent("receipt.pdf"));
    expect(screen.getAllByTestId("settlement-receipt-group")[0]).not.toHaveTextContent("receipt.pdf");
    expect(screen.getByTestId("confirmation")).toHaveTextContent("cleared");
    expect(screen.getByRole("button", { name: "Confirmar datos" })).toBeInTheDocument();
    const mutations = fixture.calls.filter((call) => call.method !== "GET");
    expect(mutations).toHaveLength(1);
    expect(mutations[0].path).toBe(`${root}/receipts/receipt`);
    expect(JSON.parse(String(mutations[0].init?.body))).toEqual({ request_allocation_id: allocationIds[1] });
    expect(mutations[0].init?.signal).toBeInstanceOf(AbortSignal);
    expect(fixture.calls.slice(fixture.calls.indexOf(mutations[0]) + 1).map((call) => call.path))
      .toEqual(expect.arrayContaining([`${root}/receipts`, `${root}/documents`, `${root}/rendition-report`]));
    fixture.setReport({ ...emptyReport, rows: [{ request_document_id: document.id, request_receipt_id: null } as RequestRenditionReport["rows"][number]] });
    fireEvent.click(screen.getByRole("button", { name: "Refresh authority" }));
    await screen.findByText("Comprobante incluido en el informe; no se puede cambiar la POA.");
    await settled();
    expect(screen.queryByRole("combobox", { name: "POA de receipt.pdf" })).not.toBeInTheDocument();
    fireEvent.click(save);
    view.rerender(<ConnectedCard readOnly />);
    expect(screen.queryByRole("button", { name: "Guardar POA de receipt.pdf" })).not.toBeInTheDocument();
    expect(fixture.calls.filter((call) => call.method !== "GET")).toHaveLength(1);
  });

  it.each(["readOnly", "role"])("removes settled controls on changed %s; stale save cannot PATCH", async (guard) => {
    const fixture = server();
    // GIOF no propietario pierde edición al cambiar a solicitante, sin cambiar el actor.
    const currentRequest = guard === "role"
      ? { ...request, requester_id: "other-owner", giof_work: { canEdit: true } } as PaymentRequest
      : request;
    if (guard === "role") useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser });
    const view = render(<ConnectedCard currentRequest={currentRequest} />);
    const staleSave = await selectSecond();
    if (guard === "readOnly") view.rerender(<ConnectedCard currentRequest={currentRequest} readOnly />);
    else await act(async () => { useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.SOLICITANTE_EPE } } as AuthUser }); });
    await settled();
    expect(screen.queryByRole("combobox", { name: "POA de receipt.pdf" })).not.toBeInTheDocument();
    fireEvent.click(staleSave);
    expectNoMutations(fixture.calls);
  });

  it.each([403, 409, 500])("PATCH %s retains document/group/confirmation and performs no other mutation", async (status) => {
    const fixture = server();
    fixture.failPatch(status);
    render(<ConnectedCard />);
    fireEvent.click(await selectSecond());
    await screen.findByText(status === 403
      ? "No tienes permiso para realizar esta acción o tu asignación ya no está vigente."
      : "La POA no pertenece a esta rendición");
    await settled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar POA de receipt.pdf" })).toBeEnabled());
    expect(screen.getAllByTestId("settlement-receipt-group")[0]).toHaveTextContent("receipt.pdf");
    expect(screen.getAllByTestId("settlement-receipt-group")[1]).not.toHaveTextContent("receipt.pdf");
    expect(screen.getByRole("link", { name: "Ver documento receipt.pdf" })).toHaveAttribute("href", document.drive_web_url);
    expect(screen.getByTestId("confirmation")).toHaveTextContent(review.receipt.confirmed_at!);
    expect(fixture.calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path]))
      .toEqual([["PATCH", `${root}/receipts/receipt`]]);
  });

  it("batch tags seven saved documents in a 3/4 split with all eight settlement options and zero uploads", async () => {
    const fixture = server(7);
    const eight = { ...request, allocations: Array.from({ length: 8 }, (_, index) => ({ ...request.allocations![0], id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, sort_order: index + 1 })) };
    render(<ConnectedCard currentRequest={eight} />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
    for (const index of [0, 1, 2]) await user.click(await screen.findByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    expect(screen.getAllByRole("option")).toHaveLength(8);
    await user.click(screen.getByRole("option", { name: /Línea 1:/ }));
    await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
    await waitFor(() => expect(within(screen.getAllByTestId("settlement-receipt-group")[0]).getAllByRole("link", { name: /Ver documento/ })).toHaveLength(3));
    const firstPatchIndex = fixture.calls.findIndex((call) => call.method === "PATCH");
    for (const path of [`${root}/receipts`, `${root}/documents`, `${root}/rendition-report`])
      expect(fixture.calls.slice(firstPatchIndex).filter((call) => call.method === "GET" && call.path === path)).toHaveLength(1);
    for (const index of [3, 4, 5, 6]) await user.click(screen.getByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
    await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
    await waitFor(() => expect(within(screen.getAllByTestId("settlement-receipt-group")[1]).getAllByRole("link", { name: /Ver documento/ })).toHaveLength(4));
    const mutations = fixture.calls.filter((call) => call.method !== "GET");
    expect(mutations).toHaveLength(7);
    expect(mutations.map((call) => [call.method, call.path, JSON.parse(String(call.init?.body))])).toEqual(
      Array.from({ length: 7 }, (_, index) => ["PATCH", `${root}/receipts/receipt-${index}`, { request_allocation_id: allocationIds[index < 3 ? 0 : 1] }]),
    );
    expect(mutations.every((call) => call.init?.signal instanceof AbortSignal)).toBe(true);
    // La selección vive fuera de los grupos; cambiar de POA puede combinar secciones.
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar receipt-0.pdf para asignar POA" }));
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar receipt-3.pdf para asignar POA" }));
    expect(screen.getByText("2 comprobantes seleccionados")).toBeInTheDocument();
    expect(fixture.calls.filter((call) => call.method !== "GET")).toHaveLength(7);
  });

  it("batch partial 500 retains failed selection and retries only its stored target without uploads", async () => {
    const fixture = server(3);
    fixture.failures.add("receipt-1");
    render(<ConnectedCard />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
    for (const index of [0, 1, 2]) await user.click(await screen.findByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
    await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
    await screen.findByText("Error de receipt-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar POA fallidos" })).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: "Seleccionar receipt-1.pdf para asignar POA" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Seleccionar receipt-0.pdf para asignar POA" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Ver documento receipt-1.pdf" })).toBeInTheDocument();
    fixture.failures.clear();
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    await user.click(screen.getByRole("option", { name: /Línea 1:/ }));
    await user.click(screen.getByRole("button", { name: "Reintentar POA fallidos" }));
    await waitFor(() => expect(within(screen.getAllByTestId("settlement-receipt-group")[1]).getAllByRole("link", { name: /Ver documento/ })).toHaveLength(3));
    const mutations = fixture.calls.filter((call) => call.method !== "GET");
    expect(mutations.map((call) => call.path)).toEqual([0, 1, 2, 1].map((index) => `${root}/receipts/receipt-${index}`));
    expect(mutations.every((call) => call.method === "PATCH" && JSON.parse(String(call.init?.body)).request_allocation_id === allocationIds[1])).toBe(true);
  });

  it("connected selection uploads seven once before authoritative 3/4 tagging across eight own POAs", async () => {
    const fixture = server(7, true);
    const eight = { ...request, allocations: Array.from({ length: 8 }, (_, index) => ({
      ...request.allocations![0], id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sort_order: index + 1,
    })) };
    const view = render(<ConnectedCard currentRequest={eight} />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
    await user.click(screen.getByRole("combobox", { name: /categoría/i }));
    await user.click(screen.getByRole("option", { name: /^comprobante$/i }));
    const files = Array.from({ length: 7 }, (_, index) => new File([`fixture-${index}`], `receipt-${index}.pdf`, { type: "application/pdf" }));
    const queueKeys = vi.spyOn(crypto, "randomUUID");
    // Una sola selección, sin escoger POA ni sustituir el hook/cola de carga reales.
    await user.upload(screen.getByLabelText("Archivo"), files);
    const keys = queueKeys.mock.results.map((result) => result.value as string);
    expect(keys).toHaveLength(7);
    expect(new Set(keys).size).toBe(7);
    await user.click(screen.getByRole("button", { name: /^Adjuntar$/ }));
    await screen.findByText("7 documentos adjuntados correctamente.", {}, { timeout: 10000 });
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
    const posts = fixture.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(7);
    posts.forEach((call, index) => {
      expect(call.path).toBe(`${root}/documents`);
      expect(call.init?.body).toBeInstanceOf(FormData);
      const form = call.init!.body as FormData;
      expect(Array.from(form.keys()).sort()).toEqual(["document_category", "file"]);
      expect(form.get("document_category")).toBe("RECEIPT");
      expect(form.get("file")).toBe(files[index]);
      expect(new Headers(call.init?.headers).get("Idempotency-Key")).toBe(keys[index]);
    });
    expect(fixture.getReviews().map((item) => item.receipt.request_allocation_id)).toEqual(Array(7).fill(null));
    expect(fixture.calls.filter((call) => call.method === "PATCH")).toHaveLength(0);
    const beforeTagging = fixture.calls.length;
    for (const [indices, allocationIndex] of [[[0, 1, 2], 0], [[3, 4, 5, 6], 1]] as const) {
      for (const index of indices) await user.click(await screen.findByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
      await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
      expect(screen.getAllByRole("option")).toHaveLength(8);
      await user.click(screen.getByRole("option", { name: new RegExp(`Línea ${allocationIndex + 1}:`) }));
      const beforeBatch = fixture.calls.length;
      await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
      await waitFor(() => expect(within(screen.getAllByTestId("settlement-receipt-group")[allocationIndex])
        .getAllByRole("link", { name: /Ver documento/ })).toHaveLength(indices.length));
      await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
      for (const path of [`${root}/receipts`, `${root}/documents`, `${root}/rendition-report`])
        expect(fixture.calls.slice(beforeBatch).filter((call) => call.method === "GET" && call.path === path)).toHaveLength(1);
    }
    const patches = fixture.calls.filter((call) => call.method === "PATCH");
    expect(patches.map((call) => [call.path, JSON.parse(String(call.init?.body))])).toEqual(
      files.map((_, index) => [`${root}/receipts/receipt-${index}`, { request_allocation_id: allocationIds[index < 3 ? 0 : 1] }]),
    );
    expect(patches.every((call) => call.init?.signal instanceof AbortSignal)).toBe(true);
    expect(fixture.calls.slice(beforeTagging).filter((call) => call.method !== "GET")).toEqual(patches);
    expect(fixture.calls.filter((call) => call.method === "POST")).toEqual(posts);
    expect(fixture.getReviews().every((item) => item.receipt.confirmed_at === null)).toBe(true);
    expect(screen.getByTestId("report-total")).toHaveTextContent("0");
    const keysAfterTagging = posts.map((call) => new Headers(call.init?.headers).get("Idempotency-Key"));
    expect(keysAfterTagging).toEqual(keys);
    files.forEach((file, index) => expect(screen.getByRole("link", { name: `Ver documento ${file.name}` }))
      .toHaveAttribute("href", `https://example.test/documents/${index}`));
    // Reabrir sólo con GET conserva el resultado persistido, sin confirmar/incluir filas.
    view.unmount();
    clearQueryCache();
    render(<ConnectedCard currentRequest={eight} />);
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
    for (const [index, count] of [[0, 3], [1, 4]]) expect(within(screen.getAllByTestId("settlement-receipt-group")[index])
      .getAllByRole("link", { name: /Ver documento/ })).toHaveLength(count);
    expect(screen.getByTestId("report-total")).toHaveTextContent("0");
    expect(fixture.calls.filter((call) => call.method !== "GET")).toHaveLength(14);
  }, 30000);

  it.each(["receipt", "document", "OCR"])("batch cannot select %s-locked receipts", async (guard) => {
    const fixture = server(2);
    if (guard === "OCR") fixture.setReviews(fixture.getReviews().map((item) => ({ ...item, receipt: { ...item.receipt, ocr_status: "PROCESSING" } })));
    else fixture.setReport({ ...emptyReport, rows: fixture.getReviews().map((item) => ({
      request_receipt_id: guard === "receipt" ? item.receipt.id : null,
      request_document_id: guard === "document" ? item.receipt.document_id : null,
    } as RequestRenditionReport["rows"][number])) });
    render(<ConnectedCard />);
    await screen.findByRole("link", { name: "Ver documento receipt-0.pdf" });
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
    expect(screen.queryByRole("checkbox", { name: /para asignar POA/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asignar POA a seleccionados" })).toBeDisabled();
    expectNoMutations(fixture.calls);
  });

  it.each(["readOnly", "role", "lease", "OCR", "included"])("batch stops future PATCH after %s changes between files", async (guard) => {
    const fixture = server(3);
    const currentRequest = guard === "role" || guard === "lease"
      ? { ...request, requester_id: "other-owner", giof_work: { canEdit: true } } as PaymentRequest : request;
    if (guard === "role" || guard === "lease") useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    fixture.afterPatch(() => pending);
    const view = render(<ConnectedCard currentRequest={currentRequest} />);
    const user = userEvent.setup();
    for (const index of [0, 1, 2]) await user.click(await screen.findByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
    await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
    await waitFor(() => expect(fixture.calls.filter((call) => call.method === "PATCH")).toHaveLength(1));
    if (guard === "readOnly") view.rerender(<ConnectedCard currentRequest={currentRequest} readOnly />);
    if (guard === "lease") view.rerender(<ConnectedCard currentRequest={{ ...currentRequest, giof_work: { canEdit: false } } as PaymentRequest} />);
    if (guard === "role") await act(async () => { useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.SOLICITANTE_EPE } } as AuthUser }); });
    if (guard === "OCR") {
      fixture.setReviews(fixture.getReviews().map((item) => item.receipt.id === "receipt-1"
        ? { ...item, receipt: { ...item.receipt, ocr_status: "PROCESSING" } } : item));
      fireEvent.click(screen.getByRole("button", { name: "Refresh receipts" }));
      await screen.findByText("Lectura del comprobante en curso; espera antes de asignar la POA.");
    }
    if (guard === "included") {
      fixture.setReport({ ...emptyReport, rows: [{ request_document_id: "document-1" } as RequestRenditionReport["rows"][number]] });
      fireEvent.click(screen.getByRole("button", { name: "Refresh authority" }));
      await screen.findByText("Comprobante incluido en el informe; no se puede cambiar la POA.");
    }
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(screen.getByTestId("resources")).toHaveTextContent("settled"));
    expect(fixture.calls.filter((call) => call.method !== "GET").map((call) => call.path)).toEqual([`${root}/receipts/receipt-0`]);
    expect(screen.getByRole("link", { name: "Ver documento receipt-0.pdf" })).toBeInTheDocument();
    // La aceptación del primer PATCH no se deshace al cancelar; el GET la recupera.
    expect(screen.getAllByTestId("settlement-receipt-group")[1]).toHaveTextContent("receipt-0.pdf");
  });

  it("batch blocks uncertain retry after failed final GET; all-resource refresh preserves successes before failed-only replay", async () => {
    const fixture = server(3);
    fixture.failures.add("receipt-1");
    fixture.afterPatch(async () => { fixture.setReportResponse(async () => new Response("{}", { status: 500 })); });
    render(<ConnectedCard />);
    const user = userEvent.setup();
    for (const index of [0, 1, 2]) await user.click(await screen.findByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
    await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
    await screen.findByText("No se pudo verificar el resultado. Actualiza antes de reintentar.");
    expect(screen.getByRole("button", { name: "Reintentar POA fallidos" })).toBeDisabled();
    expect(fixture.calls.filter((call) => call.method === "PATCH")).toHaveLength(3);
    fixture.setReportResponse(async () => json(emptyReport));
    const beforeRefresh = fixture.calls.length;
    await user.click(screen.getByRole("button", { name: "Actualizar asignaciones POA" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar POA fallidos" })).toBeEnabled());
    expect(fixture.calls.slice(beforeRefresh).map((call) => call.path)).toEqual(expect.arrayContaining([`${root}/receipts`, `${root}/documents`, `${root}/rendition-report`]));
    expect(screen.getByRole("checkbox", { name: "Seleccionar receipt-0.pdf para asignar POA" })).not.toBeChecked();
    fixture.failures.clear();
    fixture.afterPatch(async () => {});
    await user.click(screen.getByRole("button", { name: "Reintentar POA fallidos" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reintentar POA fallidos" })).not.toBeInTheDocument());
    expect(fixture.calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path])).toEqual([0, 1, 2, 1].map((index) => ["PATCH", `${root}/receipts/receipt-${index}`]));
  });

  it("batch accepted PATCH followed by unmount is recovered on reopen before enabling another assignment", async () => {
    const fixture = server(3);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    fixture.afterPatch(() => pending);
    const view = render(<ConnectedCard />);
    const user = userEvent.setup();
    for (const index of [0, 1, 2]) await user.click(await screen.findByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
    await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
    await waitFor(() => expect(fixture.calls.filter((call) => call.method === "PATCH")).toHaveLength(1));
    const patch = fixture.calls.find((call) => call.method === "PATCH")!;
    view.unmount();
    expect(patch.init?.signal?.aborted).toBe(true);
    const closedCount = fixture.calls.length;
    await act(async () => { release(); await pending; });
    expect(fixture.calls).toHaveLength(closedCount);
    let finish!: (response: Response) => void;
    const authority = new Promise<Response>((resolve) => { finish = resolve; });
    fixture.setReceiptResponse(async () => (await authority).clone());
    render(<ConnectedCard />);
    await screen.findByRole("link", { name: "Ver documento receipt-0.pdf" });
    expect(screen.queryByRole("checkbox", { name: /para asignar POA/ })).not.toBeInTheDocument();
    await act(async () => { finish(json(fixture.getReviews())); await authority; });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Seleccionar receipt-0.pdf para asignar POA" })).toBeEnabled());
    expect(screen.getAllByTestId("settlement-receipt-group")[1]).toHaveTextContent("receipt-0.pdf");
    expect(screen.getByTestId("confirmation")).toHaveTextContent("cleared");
    expect(fixture.calls.filter((call) => call.method !== "GET")).toHaveLength(1);
    expect(fixture.calls.slice(closedCount).map((call) => call.path)).toEqual(expect.arrayContaining([`${root}/receipts`, `${root}/documents`, `${root}/rendition-report`]));
  });

  it("batch uses existing 401 refresh transport but close cancels replay and remaining files", async () => {
    const fixture = server(2);
    let finish!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => { finish = resolve; });
    fixture.unauthorized(() => refresh);
    const view = render(<ConnectedCard />);
    const user = userEvent.setup();
    for (const index of [0, 1]) await user.click(await screen.findByRole("checkbox", { name: `Seleccionar receipt-${index}.pdf para asignar POA` }));
    await user.click(screen.getByRole("combobox", { name: "POA para seleccionados" }));
    await user.click(screen.getByRole("option", { name: /Línea 2:/ }));
    await user.click(screen.getByRole("button", { name: "Asignar POA a seleccionados" }));
    await waitFor(() => expect(fixture.calls.some((call) => call.path === "/auth/refresh")).toBe(true));
    view.unmount();
    await act(async () => {
      finish(json({ accessToken: "fixture-token", user: useAuthStore.getState().user }));
      await refresh;
    });
    expect(fixture.calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path]))
      .toEqual([["PATCH", `${root}/receipts/receipt-0`], ["POST", "/auth/refresh"]]);
    expect(fixture.calls.find((call) => call.method === "PATCH")?.init?.signal?.aborted).toBe(true);
  });
});
