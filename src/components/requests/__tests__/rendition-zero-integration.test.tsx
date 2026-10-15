import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { StructuredRenditionReportCard } from "@/components/requests/structured-rendition-report-card";
import { useRequestRenditionReportActions } from "@/hooks/use-requests";
import { ROLE_CODE } from "@/lib/constants";
import { bindGiofLeaseCredential, clearGiofLeaseCredentials } from "@/lib/giof-work-lease-session";
import { clearQueryCache } from "@/lib/query-cache";
import { formatRequestCurrency as formatCurrency } from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";
import type { PaymentRequest, RequestAllocation, RequestDocument, RequestPayment, RequestReceiptReview, RequestRenditionReport, RequestRenditionRow } from "@/types/requests";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
const request = {
  id: "settlement", request_type: "ADVANCE_SETTLEMENT", status: "DRAFT", requester_id: "requester", currency: "PEN", fiscal_year: 2026,
  related_request_id: "advance", relatedRequest: { id: "advance", request_type: "ADVANCE", status: "PAID", requested_amount: 200, currency: "PEN" },
  giof_work: { pool: "REXAN", assigneeId: "actor", assignmentVersion: "7", canEdit: true, readOnly: false, canAcquire: false },
  allocations: ids.map((id, index) => ({ id, payment_request_id: "settlement", amount: 100, currency: "PEN", sort_order: index, budget_planning_line_id: `poa-${index}`, planning_line: null, budgetPlanningLine: null }) as RequestAllocation),
} as PaymentRequest;
const rows = ids.slice(1).map((id, index) => ({
  id: `row-${index}`, request_allocation_id: id, request_document_id: `document-${index}`, request_receipt_id: null,
  purchase_date: "2026-10-01", provider_name: "Proveedor", detail: "Gasto real", amount: 100, currency: "PEN", row_type: "MANUAL_EXTRA",
} as RequestRenditionRow));

function report(zeroIds: string[] = [], allZero = false): RequestRenditionReport {
  const currentRows = allZero ? [] : rows;
  const coverage = ids.map((id) => ({ request_allocation_id: id, planned_amount: 100,
    row_total_amount: currentRows.some((row) => row.request_allocation_id === id) ? 100 : 0,
    row_count: currentRows.some((row) => row.request_allocation_id === id) ? 1 : 0,
    has_rows: currentRows.some((row) => row.request_allocation_id === id), return_validation_status: "NOT_REQUIRED",
  }));
  return { id: "report", request_id: request.id, status: "DRAFT", currency: "PEN", total_amount: allZero ? 0 : 200,
    settlement_report_document_id: null, zero_expense_allocation_ids: zeroIds,
    zero_expense_declaration_valid: zeroIds.length > 0 ? true : undefined,
    rows: currentRows, allocation_coverage: coverage,
    totals: { total_amount: allZero ? 0 : 200, by_allocation: coverage, missing_allocations: ids.filter((id) => !zeroIds.includes(id) && !currentRows.some((row) => row.request_allocation_id === id)) },
  } as RequestRenditionReport;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });
}

function server(initial = report(), reject = false, receipts: RequestReceiptReview[] = []) {
  let current = initial;
  let documents: RequestDocument[] = receipts.length ? [{ id: "pending-doc", request_allocation_id: ids[0], document_category: "RECEIPT" } as RequestDocument] : [];
  let getGate: Promise<void> | null = null;
  let postGate: Promise<void> | null = null;
  let getFailures = 0;
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, init });
    if (path === "/requests/settlement/rendition-report") {
      await getGate;
      if (getFailures > 0) { getFailures -= 1; return new Response(JSON.stringify({ message: "Error de carga", statusCode: 500 }), { status: 500 }); }
      return json(current);
    }
    if (path === "/requests/settlement/documents") return json(documents);
    if (path === "/requests/settlement/receipts") return json(receipts);
    if (path.startsWith("/requests/settlement/rendition-report/rows/from-receipt/")) {
      await postGate;
      const receiptId = path.split("/").at(-1) ?? null;
      const allocationId = (JSON.parse(String(init?.body)) as { request_allocation_id: string }).request_allocation_id;
      const row = { ...rows[0], id: `added-${receiptId}`, request_receipt_id: receiptId, request_allocation_id: allocationId };
      current = { ...current, rows: [...current.rows, row] };
      return json(row);
    }
    if (path === "/requests/settlement/rendition-report/validate") {
      await postGate;
      if (reject) return new Response(JSON.stringify({ message: "Declaración cambió: gasto o comprobante pendiente", statusCode: 409 }), { status: 409 });
      const body = init?.body ? JSON.parse(String(init.body)) as { zero_expense_allocation_ids: string[] } : undefined;
      if (body) current = report(body.zero_expense_allocation_ids, initial.rows.length === 0);
      return json({ report: current, ready: current.totals.missing_allocations.length === 0,
        zero_expense_allocation_ids: current.zero_expense_allocation_ids, totals: current.totals,
        allocation_coverage: current.allocation_coverage, blockers: current.totals.missing_allocations.map((id) => ({ code: "MISSING_ALLOCATION_COVERAGE", request_allocation_id: id, message: "Falta cobertura" })) });
    }
    throw new Error(`Unexpected fixture route ${path}`);
  }));
  return { calls, setReport: (next: RequestRenditionReport) => { current = next; },
    setDocuments: (next: RequestDocument[]) => { documents = next; },
    failGets: (count: number) => { getFailures = count; },
    pauseGet: () => { let release!: () => void; getGate = new Promise<void>((resolve) => { release = resolve; }); return () => { getGate = null; release(); }; },
    pausePost: () => { let release!: () => void; postGate = new Promise<void>((resolve) => { release = resolve; }); return () => { postGate = null; release(); }; },
  };
}

async function checkboxes() {
  const boxes = await screen.findAllByRole("checkbox", { name: "Sin gasto en esta POA" });
  await waitFor(() => expect(boxes[0]).toBeEnabled());
  return boxes;
}

function globalRequest(): PaymentRequest {
  return { ...request, requested_amount: 1845.90, related_request_id: "advance",
    allocations: [...ids, "10000000-0000-4000-8000-000000000004"].map((id, index) => ({
      ...request.allocations![index % ids.length], id, amount: [90, 210, 620, 380][index],
      budget_planning_line_id: `poa-${index}`, sort_order: index,
    })),
    relatedRequest: { id: "advance", request_code: "ANT-1", sequential_number: "1", request_type: "ADVANCE", status: "PAID",
      requested_amount: 1300, currency: "PEN", concept: "Anticipo original", requester_id: "requester", created_at: "2026-10-01" },
  };
}

function formatRequestCurrency(amount: number): string {
  return formatCurrency(amount).replace(/\s/g, " ");
}

function globalReport(amount: number): RequestRenditionReport {
  const allocations = globalRequest().allocations!;
  const expenses = amount === 0 ? [0, 0, 0, 0] : amount === 1300 ? [0, 884, 276, 140] : [1375, 54.90, 276, 140];
  const currentRows = allocations.flatMap((allocation, index) => expenses[index] > 0 ? [{
    ...rows[0], id: `global-row-${index}`, request_id: request.id, request_allocation_id: allocation.id!,
    request_document_id: `global-document-${index}`, amount: expenses[index],
  }] : []);
  const coverage = allocations.map((allocation, index) => ({ request_allocation_id: allocation.id!,
    planned_amount: allocation.amount, row_total_amount: expenses[index], row_count: expenses[index] > 0 ? 1 : 0,
    has_rows: expenses[index] > 0, expected_return_amount: amount === 0 && index === 0 ? 1300 : 0,
    return_validation_status: amount === 0 && index === 0 ? "MISSING_PROOF" : "NOT_REQUIRED",
  }));
  return { ...report(), total_amount: amount, rows: currentRows, zero_expense_declaration_valid: true,
    zero_expense_allocation_ids: allocations.filter((_, index) => expenses[index] === 0).map((allocation) => allocation.id!),
    totals: { total_amount: amount, by_allocation: coverage, missing_allocations: [] }, allocation_coverage: coverage,
  };
}

describe("ZERO card through real request hooks and fetch wrapper", () => {
  beforeEach(() => {
    clearQueryCache(); clearGiofLeaseCredentials();
    useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser, accessToken: "fixture-token", isLoading: false });
    bindGiofLeaseCredential({ requestId: request.id, pool: "REXAN", ownerId: "actor", assignmentVersion: "7", token: "lease-token", expiresAt: "2099-01-01T00:00:00Z", heartbeatAt: null, ttlSeconds: 300, heartbeatIntervalSeconds: 30 });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); clearQueryCache(); clearGiofLeaseCredentials(); useAuthStore.getState().clearAuth(); });

  it("validates own POA UUID with real rows 2/3, waits for canonical GET and persists on remount; explicit clear sends []", async () => {
    const fixture = server();
    const view = render(<StructuredRenditionReportCard request={request} />);
    const boxes = await checkboxes();
    expect(boxes[1]).toBeDisabled(); expect(boxes[2]).toBeDisabled();
    fireEvent.click(boxes[0]);
    expect(screen.getByText("Sin gasto seleccionado · pendiente de validar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    const releaseGet = fixture.pauseGet();
    fireEvent.click(screen.getByRole("button", { name: "Validar comprobantes y declaraciones sin gasto" }));
    await waitFor(() => expect(fixture.calls.filter((call) => call.path.endsWith("rendition-report"))).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(screen.queryByText("Sin gasto validado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizando informe…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Validar informe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Validar informe" }));
    expect(fixture.calls.filter((call) => call.init?.method === "POST")).toHaveLength(1);
    act(releaseGet);
    await screen.findByText("Sin gasto validado");
    await waitFor(() => expect(screen.getByRole("button", { name: "Generar informe" })).toBeEnabled());
    const post = fixture.calls.find((call) => call.init?.method === "POST")!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ zero_expense_allocation_ids: [ids[0]] });
    const headers = new Headers(post.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer fixture-token");
    expect(headers.get("x-giof-assignment-version")).toBe("7");
    expect(headers.get("x-giof-lease-token")).toBe("lease-token");
    expect(fixture.calls.filter((call) => call.path.endsWith("rendition-report"))).toHaveLength(2);
    view.unmount(); render(<StructuredRenditionReportCard request={request} />);
    const restored = await checkboxes(); expect(restored[0]).toBeChecked();
    fireEvent.click(restored[0]); fireEvent.click(screen.getByRole("button", { name: "Validar informe" }));
    await waitFor(() => expect(fixture.calls.filter((call) => call.init?.method === "POST")).toHaveLength(2));
    expect(JSON.parse(String(fixture.calls.filter((call) => call.init?.method === "POST")[1].init?.body))).toEqual({ zero_expense_allocation_ids: [] });
    await waitFor(() => expect(restored[0]).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(fixture.calls.filter((call) => call.init?.method === "POST").every((call) => call.path.endsWith("/validate"))).toBe(true);
  });

  it("keeps routine validate body undefined and accepts canonical all-ZERO without fake rows/documents/payment", async () => {
    const fixture = server(report(ids, true));
    render(<StructuredRenditionReportCard request={request} />);
    const boxes = await checkboxes(); expect(boxes.every((box) => box.getAttribute("data-state") === "checked")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Validar informe" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Informe validado correctamente"));
    const posts = fixture.calls.filter((call) => call.init?.method === "POST");
    expect(posts).toHaveLength(1); expect(posts[0].init?.body).toBeUndefined();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(screen.getByText(/Devolución requerida:.*200/)).toBeInTheDocument();
    expect(screen.getByText("Aún no hay comprobantes agregados al informe.")).toBeInTheDocument();
  });

  it("retains input on authoritative 409, blocks readiness, and never posts fabricated rows/docs", async () => {
    const fixture = server(report(), true);
    render(<StructuredRenditionReportCard request={request} />);
    const boxes = await checkboxes(); fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "Validar informe" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Declaración cambió: gasto o comprobante pendiente"));
    expect(boxes[0]).toBeChecked(); expect(screen.queryByText("Sin gasto validado")).not.toBeInTheDocument();
    expect(screen.getByText("Sin gasto seleccionado · pendiente de validar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(fixture.calls.filter((call) => call.init?.method === "POST")).toHaveLength(1);
    expect(fixture.calls.some((call) => /rows|payment|documents/.test(call.path) && call.init?.method === "POST")).toBe(false);
  });

  it("disables assigned pending OCR and invalidates cached ZERO on fresh canonical stale GET", async () => {
    const pending = { receipt: { id: "pending", document_id: "pending-doc", request_allocation_id: ids[0], confirmed_at: null, ocr_status: "PROCESSING" }, latest_extraction: null, duplicate_candidates: [] } as unknown as RequestReceiptReview;
    const fixture = server(report([ids[0]]), false, [pending]);
    const view = render(<StructuredRenditionReportCard request={request} />);
    const boxes = await screen.findAllByRole("checkbox", { name: "Sin gasto en esta POA" });
    await screen.findByText("Esta POA tiene comprobantes pendientes de revisar o agregar al informe.");
    expect(boxes[0]).toBeDisabled();
    fixture.setReport({ ...report(), zero_expense_declaration_valid: false, zero_expense_declaration_warning: "Declaración desactualizada" });
    view.rerender(<StructuredRenditionReportCard request={request} refreshSignal={1} />);
    await screen.findByText("Declaración desactualizada");
    expect(boxes[0]).not.toBeChecked(); expect(screen.queryByText("Sin gasto validado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
    const missingProof = report([ids[0]]);
    missingProof.status = "EXPORTED";
    missingProof.settlement_report_document_id = "generated-report";
    missingProof.allocation_coverage[0] = { ...missingProof.allocation_coverage[0], expected_return_amount: 100, return_validation_status: "MISSING_PROOF" };
    fixture.setReport(missingProof);
    const onReadinessChange = vi.fn();
    view.rerender(<StructuredRenditionReportCard request={request} refreshSignal={2} onReadinessChange={onReadinessChange} />);
    await screen.findByText("Informe generado desactualizado");
    await waitFor(() => expect(onReadinessChange).toHaveBeenLastCalledWith(false, expect.any(Array)));
  });

  it("hides controls in readonly/PAID/EXPORTED/legacy/non-GIOF and refuses a revoked actor before fetch", async () => {
    const fixture = server(report());
    const view = render(<StructuredRenditionReportCard request={request} readOnly />);
    await screen.findByText("En preparación");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    view.rerender(<StructuredRenditionReportCard request={{ ...request, status: "PAID" }} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fixture.setReport({ ...report(), status: "EXPORTED" });
    view.rerender(<StructuredRenditionReportCard request={request} refreshSignal={1} />);
    await screen.findByText("Informe generado"); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fixture.setReport({ ...report(), zero_expense_allocation_ids: undefined });
    view.rerender(<StructuredRenditionReportCard request={request} refreshSignal={2} />);
    await screen.findByText("En preparación"); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    act(() => useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.AUDITOR_DIRECCION } } as AuthUser }));
    const hook = renderHook(() => useRequestRenditionReportActions());
    await act(async () => {
      await expect(hook.result.current.validateReport(request.id, { zero_expense_allocation_ids: [ids[0]] }, request)).rejects.toThrow("asignación GIOF");
    });
    expect(hook.result.current.isLoading).toBe(false);
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
    act(() => useAuthStore.setState({ user: { id: "actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser }));
    const releasePost = fixture.pausePost();
    let validation!: Promise<unknown>;
    act(() => { validation = hook.result.current.validateReport(request.id, { zero_expense_allocation_ids: [ids[0]] }, request).catch((error: unknown) => error); });
    await waitFor(() => expect(fixture.calls.filter((call) => call.init?.method === "POST")).toHaveLength(1));
    act(() => useAuthStore.setState({ user: { id: "other-actor", role: { code: ROLE_CODE.GIOF_GESTOR } } as AuthUser }));
    await act(async () => { releasePost(); expect(await validation).toMatchObject({ name: "AbortError" }); });
    expect(hook.result.current.isLoading).toBe(false);
    expect(screen.queryByText("Sin gasto validado")).not.toBeInTheDocument();
  });

  it("shows origin1300/report1845.90 global excess545.90 without target/line/OCR double counting", async () => {
    const current = globalReport(1845.90);
    current.allocation_coverage[0] = { ...current.allocation_coverage[0], expected_return_amount: 739.10 };
    const fixture = server(current, false, [{ receipt: { id: "raw-ocr", amount: 9000, confirmed_at: null }, duplicate_candidates: [] } as unknown as RequestReceiptReview]);
    render(<StructuredRenditionReportCard request={globalRequest()} />);
    await screen.findByText("Resultado global: Exceso");
    const summary = within(screen.getByTestId("rendition-global-summary"));
    expect(summary.getByText(`Anticipo entregado: ${formatRequestCurrency(1300)}`)).toBeInTheDocument();
    expect(summary.getByText(`Gasto sustentado: ${formatRequestCurrency(1845.90)}`)).toBeInTheDocument();
    expect(summary.getByText(`Exceso por pagar: ${formatRequestCurrency(545.90)}`)).toBeInTheDocument();
    expect(summary.queryByText(/739|1285|9,000|Exceso pagado/)).not.toBeInTheDocument();
    expect(summary.getByText(/registros históricos por línea conservan su discrepancia/)).toBeInTheDocument();
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("shows global EXACT with a zero POA and marks explicit clear pending until canonical validation", async () => {
    const fixture = server(globalReport(1300));
    render(<StructuredRenditionReportCard request={globalRequest()} />);
    await screen.findByText("Resultado global: Coincide con el anticipo");
    const summary = within(screen.getByTestId("rendition-global-summary"));
    expect(summary.getByText(`Saldo: ${formatRequestCurrency(0)} · No requiere pago adicional ni devolución.`)).toBeInTheDocument();
    expect(summary.queryByText(/Pago|Devolución requerida/)).not.toBeInTheDocument();
    fireEvent.click((await checkboxes())[0]);
    expect(summary.getByText("Cambios pendientes de validación")).toBeInTheDocument();
    expect(summary.getByText("Resultado global: Pendiente de evaluación")).toBeInTheDocument();
    expect(summary.queryByText("Resultado global: Coincide con el anticipo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it.each([false, true])("blocks actual NOT_REQUIRED global RETURN without proof, including generated parent readiness (allZERO=%s)", async (allZero) => {
    const current = globalReport(0);
    if (!allZero) {
      current.rows = [{ ...rows[0], request_allocation_id: ids[1], amount: 1000 }];
      current.zero_expense_allocation_ids = current.zero_expense_allocation_ids!.filter((id) => id !== ids[1]);
      current.totals.total_amount = 1000;
    }
    current.allocation_coverage = current.allocation_coverage.map((item, index) => ({ ...item,
      has_rows: !allZero && index === 1, row_count: !allZero && index === 1 ? 1 : 0,
      expected_return_amount: index === 0 ? (allZero ? 1300 : 300) : 0, return_validation_status: "NOT_REQUIRED", line_return: null }));
    const fixture = server(current);
    const onReadinessChange = vi.fn();
    const view = render(<StructuredRenditionReportCard request={globalRequest()} onReadinessChange={onReadinessChange} />);
    await screen.findByText(`Devolución requerida: ${formatRequestCurrency(allZero ? 1300 : 300)}`);
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    fixture.setReport({ ...current, status: "EXPORTED", settlement_report_document_id: "generated" });
    view.rerender(<StructuredRenditionReportCard request={globalRequest()} refreshSignal={1} onReadinessChange={onReadinessChange} />);
    await screen.findByText("Informe generado desactualizado");
    expect(onReadinessChange).toHaveBeenLastCalledWith(false, expect.any(Array));
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("shows all-ZERO return1300 as required until real server-validated completed refund proof exists", async () => {
    const current = globalReport(0);
    const fixture = server(current);
    const view = render(<StructuredRenditionReportCard request={globalRequest()} />);
    await screen.findByText(`Devolución requerida: ${formatRequestCurrency(1300)}`);
    expect(screen.getByRole("button", { name: "Registrar devolución" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(within(screen.getByTestId("rendition-global-summary")).queryByText(/registrada|devuelta/i)).not.toBeInTheDocument();
    current.allocation_coverage[0] = { ...current.allocation_coverage[0], return_validation_status: "VALID", line_return: {
      id: "refund", returned_amount: 1300, justification: "Sin gasto", return_proof_document_id: "proof", return_proof_filename: "devolucion.pdf", status: "DRAFT", validated_at: null,
    } };
    fixture.setReport({ ...current });
    fixture.setDocuments([{ id: "proof", payment_request_id: request.id, scope_type: "ALLOCATION", request_allocation_id: ids[0], document_category: "RETURN_PROOF", upload_status: "PERMANENT" } as RequestDocument]);
    view.rerender(<StructuredRenditionReportCard request={globalRequest()} refreshSignal={1} />);
    await screen.findByText(`Devolución registrada: ${formatRequestCurrency(1300)}`);
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeEnabled();
    const onReadinessChange = vi.fn();
    fixture.setReport({ ...current, status: "EXPORTED", settlement_report_document_id: "generated" });
    view.rerender(<StructuredRenditionReportCard request={globalRequest()} refreshSignal={2} onReadinessChange={onReadinessChange} />);
    await screen.findByText("Informe generado alineado");
    expect(onReadinessChange).toHaveBeenLastCalledWith(true, []);
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("labels excess paid only with same-request PAID cash545.90 and server-linked nonpending proof", async () => {
    server(globalReport(1845.90));
    const payment = { id: "payment", payment_request_id: request.id, amount_paid: 545.90, paid_at: "2026-10-01", proof_document_id: "proof", proof_pending: false } as RequestPayment;
    const view = render(<StructuredRenditionReportCard request={{ ...globalRequest(), status: "PAID", payment }} />);
    await screen.findByText(`Exceso pagado: ${formatRequestCurrency(545.90)}`);
    for (const invalidPayment of [{ ...payment, amount_paid: 1845.90 }, { ...payment, payment_request_id: "advance" }, { ...payment, proof_pending: true }, { ...payment, proof_document_id: null }]) {
      view.rerender(<StructuredRenditionReportCard request={{ ...globalRequest(), status: "PAID", payment: invalidPayment }} />);
      expect(screen.getByText(`Exceso por pagar: ${formatRequestCurrency(545.90)}`)).toBeInTheDocument();
      expect(screen.queryByText(/Exceso pagado:/)).not.toBeInTheDocument();
    }
  });

  it("keeps absent origin or invalid canonical total unknown instead of displaying zero", async () => {
    const fixture = server(globalReport(1845.90));
    const view = render(<StructuredRenditionReportCard request={{ ...request, relatedRequest: undefined }} />);
    await screen.findByText(`Gasto sustentado: ${formatRequestCurrency(1845.90)}`);
    expect(screen.getByText("Anticipo: pendiente de lectura")).toBeInTheDocument();
    expect(screen.getByText("Resultado global: Pendiente de evaluación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    fixture.setReport({ ...globalReport(1845.90), totals: { ...globalReport(1845.90).totals, total_amount: null as unknown as number } });
    view.rerender(<StructuredRenditionReportCard request={globalRequest()} refreshSignal={1} />);
    await screen.findByText("Gasto sustentado: Pendiente de evaluación");
    const summary = within(screen.getByTestId("rendition-global-summary"));
    expect(summary.getByText("Resultado global: Pendiente de evaluación")).toBeInTheDocument();
    expect(summary.queryByText(/Saldo:|Devolución requerida:|Exceso por pagar:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("keeps observed historical refund evidence visible without prescribing a line refund for global EXCESS", async () => {
    const current = globalReport(1845.90);
    current.allocation_coverage[1] = { ...current.allocation_coverage[1], expected_return_amount: 739.10, returned_amount: 739.10,
      return_validation_status: "VALID", line_return: { id: "historical-return", returned_amount: 739.10,
        justification: "Registro histórico", return_proof_document_id: "historical-proof", return_proof_filename: "historico.pdf", status: "VALID", validated_at: "2026-10-01" } };
    const fixture = server(current);
    fixture.setDocuments([{ id: "historical-proof", payment_request_id: request.id, request_allocation_id: ids[1],
      document_category: "RETURN_PROOF", upload_status: "PERMANENT", original_filename: "historico.pdf" } as RequestDocument]);
    render(<StructuredRenditionReportCard request={{ ...globalRequest(), status: "OBSERVED" }} />);
    await screen.findByText("Resultado global: Exceso");
    expect(screen.getByText("Constancia: historico.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/Debes devolver|se solicita solo si GIOF|En esta preparación inicial no se solicita/)).not.toBeInTheDocument();
    expect(screen.getByText("Justificación: Registro histórico")).toBeInTheDocument();
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("offers existing proof controls for current global RETURN300 before observation, without fabricating proof", async () => {
    const current = globalReport(0);
    current.rows = [{ ...rows[0], request_allocation_id: ids[1], amount: 1000 }];
    current.zero_expense_allocation_ids = current.zero_expense_allocation_ids!.filter((id) => id !== ids[1]);
    current.allocation_coverage = current.allocation_coverage.map((coverage, index) => ({ ...coverage,
      has_rows: index === 1, row_count: index === 1 ? 1 : 0, row_total_amount: index === 1 ? 1000 : 0,
      expected_return_amount: index === 0 ? 300 : 0 }));
    current.total_amount = 1000;
    current.totals = { total_amount: 1000, missing_allocations: [], by_allocation: current.allocation_coverage };
    const fixture = server(current);
    render(<StructuredRenditionReportCard request={globalRequest()} />);
    await screen.findByText(`Devolución requerida: ${formatRequestCurrency(300)}`);
    expect(within(screen.getByTestId("rendition-global-summary")).getByText(/Adjunta o selecciona la constancia.*ahora/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar informe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Registrar devolución" }));
    expect(screen.getByLabelText(/Adjuntar constancia de devolución para/)).toBeInTheDocument();
    expect(screen.queryByText(/Devolución registrada/)).not.toBeInTheDocument();
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("does not require line proof for global EXACT and leaves dirty global instructions pending", async () => {
    const current = globalReport(1300);
    current.allocation_coverage[0] = { ...current.allocation_coverage[0], expected_return_amount: 90, return_validation_status: "MISSING_PROOF" };
    const fixture = server(current);
    render(<StructuredRenditionReportCard request={{ ...globalRequest(), status: "OBSERVED" }} />);
    await screen.findByText("Resultado global: Coincide con el anticipo");
    expect(screen.queryByText(/Debes devolver|Selecciona o adjunta una constancia|se solicita solo si GIOF/)).not.toBeInTheDocument();
    fireEvent.click((await checkboxes())[0]);
    expect(within(screen.getByTestId("rendition-global-summary")).getByText(/Valida informe para determinar devolución total/)).toBeInTheDocument();
    expect(screen.queryByText(/Devolución requerida:/)).not.toBeInTheDocument();
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("disables both validation actions during bulk inclusion and canonical reconciliation without duplicate POST", async () => {
    const receipt = { receipt: { id: "confirmed", document_id: "pending-doc", request_allocation_id: ids[0],
      confirmed_at: "2026-10-01", issuer_name: "Proveedor", amount: 100, currency: "PEN" }, duplicate_candidates: [] } as unknown as RequestReceiptReview;
    const fixture = server(report(), false, [receipt]);
    render(<StructuredRenditionReportCard request={request} />);
    await screen.findByRole("button", { name: "Agregar seleccionados al informe" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Seleccionar todos/ }));
    const releasePost = fixture.pausePost();
    const releaseGet = fixture.pauseGet();
    fireEvent.click(screen.getByRole("button", { name: "Agregar seleccionados al informe" }));
    await waitFor(() => expect(fixture.calls.filter((call) => call.init?.method === "POST")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Agregando comprobantes…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Validar informe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Validar informe" }));
    act(releasePost);
    await screen.findByRole("button", { name: "Sincronizando informe…" });
    expect(screen.getByRole("button", { name: "Sincronizando informe…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Validar informe" }));
    expect(fixture.calls.filter((call) => call.init?.method === "POST")).toHaveLength(1);
    act(releaseGet);
    await waitFor(() => expect(screen.getByRole("button", { name: "Validar comprobantes y declaraciones sin gasto" })).toBeEnabled());
    expect(fixture.calls.some((call) => call.path.endsWith("/validate"))).toBe(false);
  });

  it("retries failed report loading with exactly one additional GET, no writes, and exposes inflight status", async () => {
    const fixture = server(globalReport(1845.90));
    fixture.failGets(1);
    render(<StructuredRenditionReportCard request={globalRequest()} readOnly />);
    const retry = await screen.findByRole("button", { name: "Reintentar carga del informe" });
    const releaseGet = fixture.pauseGet();
    fireEvent.click(retry);
    await waitFor(() => expect(fixture.calls.filter((call) => call.path.endsWith("rendition-report"))).toHaveLength(2));
    expect(screen.getByText("Cargando informe...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar carga del informe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar comprobantes y declaraciones sin gasto" })).not.toBeInTheDocument();
    act(releaseGet);
    await screen.findByText("Resultado global: Exceso");
    expect(fixture.calls.filter((call) => call.path.endsWith("rendition-report"))).toHaveLength(2);
    expect(fixture.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });
});
