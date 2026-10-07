import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth/refresh-session", () => ({ refreshSession: refresh }));

function response(mime = "application/pdf", disposition = 'inline; filename="candidate.pdf"') {
  return new Response("document bytes", { headers: { "Content-Type": mime, "Content-Disposition": disposition } });
}

describe("authenticated document Blob GET", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockReset();
    useAuthStore.setState({ accessToken: "old-token" });
  });

  it.each(["application/pdf", "image/jpeg", "image/png"])("returns %s bytes without JSON parsing", async (mime) => {
    const res = response(mime);
    const json = vi.spyOn(res, "json");
    vi.mocked(fetch).mockResolvedValue(res);
    const signal = new AbortController().signal;
    const result = await api.documentBlob("/requests/source/receipts/source-receipt/candidates/candidate/document?snapshot=" + "a".repeat(64), { signal });
    expect(result.blob.type).toBe(mime);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(await result.blob.text()).toBe("document bytes");
    expect(result.filename).toBe("candidate.pdf");
    expect(json).not.toHaveBeenCalled();
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init).toMatchObject({ method: "GET", credentials: "include", signal });
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer old-token");
  });

  it("refreshes once and reads the retry as Blob with the same signal", async () => {
    refresh.mockResolvedValue({ accessToken: "new-token" });
    const res = response();
    const json = vi.spyOn(res, "json");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(res);
    const signal = new AbortController().signal;
    await expect(api.documentBlob("/candidate", { signal })).resolves.toMatchObject({ filename: "candidate.pdf" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[1][1]?.signal).toBe(signal);
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer new-token");
  });

  it("normalizes permitted MIME parameters without changing bytes", async () => {
    vi.mocked(fetch).mockResolvedValue(response("application/pdf; charset=binary"));
    const result = await api.documentBlob("/candidate");
    expect(result.blob.type).toBe("application/pdf");
    expect(await result.blob.text()).toBe("document bytes");
  });

  it.each(["text/html", "application/json", "image/svg+xml", ""])("rejects unsafe/missing MIME %s", async (mime) => {
    vi.mocked(fetch).mockResolvedValue(response(mime));
    await expect(api.documentBlob("/candidate")).rejects.toMatchObject({ body: { code: "INVALID_DOCUMENT_RESPONSE" } });
  });

  it.each(['inline; filename="../../private.pdf"', "inline; filename*=UTF-8''%ZZ", ""])("ignores unsafe/malformed filename header %s", async (header) => {
    vi.mocked(fetch).mockResolvedValue(response("application/pdf", header));
    await expect(api.documentBlob("/candidate")).resolves.toMatchObject({ filename: null });
  });

  it("does not retry after cancellation during refresh", async () => {
    let finish!: (value: { accessToken: string }) => void;
    refresh.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    const controller = new AbortController();
    const pending = api.documentBlob("/candidate", { signal: controller.signal });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    controller.abort();
    finish({ accessToken: "new-token" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not refresh a late 401 after logout", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = api.documentBlob("/candidate");
    useAuthStore.getState().clearAuth();
    finish(new Response(null, { status: 401 }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(refresh).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not retry a second 401", async () => {
    refresh.mockResolvedValue({ accessToken: "new-token" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));
    await expect(api.documentBlob("/candidate")).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("discards bytes if cancellation happens while reading the body", async () => {
    let finish!: (value: Blob) => void;
    const res = response();
    vi.spyOn(res, "blob").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(fetch).mockResolvedValue(res);
    const controller = new AbortController();
    const pending = api.documentBlob("/candidate", { signal: controller.signal });
    await vi.waitFor(() => expect(res.blob).toHaveBeenCalledOnce());
    controller.abort();
    finish(new Blob(["late"], { type: "application/pdf" }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("discards a late success after logout", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = api.documentBlob("/candidate");
    useAuthStore.getState().clearAuth();
    finish(response());
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each([403, 404])("preserves HTTP %s for receipt refresh without retry", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: "Unavailable" }), { status }));
    await expect(api.documentBlob("/candidate")).rejects.toMatchObject({ status });
    expect(refresh).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
