import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
import { useBulkMarkPaid, useCompletePaymentDetails } from "@/hooks/use-requests";
vi.mock("@/lib/api-client", () => ({ api: { post: vi.fn(), patchForm: vi.fn() } }));
describe("payment FX transport", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses stable mark-paid transport and does not retry rejected writes", async () => {
    const { result } = renderHook(() => useBulkMarkPaid());
    vi.mocked(api.post).mockRejectedValueOnce({ statusCode: 409 });
    const input = { items: [{ request_id: "r", command_id: "c", expected_original_amount: "1.00", expected_original_currency: "USD" as const, paid_at: "2026-09-10T10:00:00Z", assignment_version: 1, lease_token: "l" }] };
    await act(async () => { await expect(result.current.bulkMarkPaid(input)).rejects.toEqual({ statusCode: 409 }); });
    expect(api.post).toHaveBeenCalledExactlyOnceWith("/requests/bulk/mark-paid", input);
  });
  it("sends exact manual FX and command key alongside immutable proof identity", async () => {
    const { result } = renderHook(() => useCompletePaymentDetails());
    await act(async () => { await result.current.completePaymentDetails("p", { command_id: "c", final_fx_rate: "3.805", final_fx_confirmed: true, proof_document_id: "d" }); });
    const form = vi.mocked(api.patchForm).mock.calls[0][1] as FormData;
    expect(form.get("command_id")).toBe("c");
    expect(form.get("final_fx_rate")).toBe("3.805");
    expect(form.get("final_fx_confirmed")).toBe("true");
    expect(form.get("proof_document_id")).toBe("d");
    expect(form.get("amount_paid")).toBeNull();
  });
});
