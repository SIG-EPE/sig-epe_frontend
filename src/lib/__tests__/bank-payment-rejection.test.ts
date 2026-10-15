import { afterEach, describe, expect, it, vi } from "vitest";
import { rejectBankPayment } from "../requests";
import { bindGiofLeaseCredential, clearGiofLeaseCredentials } from "../giof-work-lease-session";
import { GIOF_WORK_POOL } from "@/types/giof-work";

afterEach(() => { vi.unstubAllGlobals(); clearGiofLeaseCredentials(); });

describe("bank payment HTTP contract", () => {
  it.each([undefined, "90071992547409931234"])("unwraps canonical response, reason-only body and optional exact version %s", async (version) => {
    bindGiofLeaseCredential({ requestId: "r1", pool: GIOF_WORK_POOL.PAYMENT,
      ownerId: "other", token: "ambient-token", assignmentVersion: "1",
      heartbeatAt: "2026-01-01", expiresAt: "2099-01-01", ttlSeconds: 300, heartbeatIntervalSeconds: 60 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { request_id: "r1", payment_id: "p1", status: "BANK_REJECTED" }, meta: { timestamp: "now" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await rejectBankPayment("r1", { reason: "  Cuenta cerrada  " }, version)).toEqual({
      request_id: "r1", payment_id: "p1", status: "BANK_REJECTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/requests\/r1\/reject-bank-payment$/);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ reason: "Cuenta cerrada" });
    const headers = new Headers(options.headers);
    expect(headers.get("x-giof-assignment-version")).toBe(version ?? null);
    expect(headers.has("x-giof-lease-token")).toBe(false);
  });

  it.each(["", "   ", "x".repeat(1001)])("refuses invalid reason before HTTP", async (reason) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(rejectBankPayment("r1", { reason })).rejects.toThrow(/1 a 1000/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["REGISTERED", undefined])("refuses incomplete/noncanonical ACK %s without retry", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { request_id: "r1", payment_id: "p1", status }, meta: {},
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(rejectBankPayment("r1", { reason: "x" })).rejects.toThrow(/verificar/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
