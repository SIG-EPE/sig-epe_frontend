import { describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api-client";
import { attachPaymentProof } from "@/hooks/use-requests";

vi.mock("@/lib/api-client", () => ({
  api: {
    postForm: vi.fn(),
  },
}));

describe("attachPaymentProof", () => {
  it("envía una constancia sin ids de asignación porque backend cubre todas las líneas POA", async () => {
    const response = { id: "req-1" };
    vi.mocked(api.postForm).mockResolvedValueOnce(response);
    const proof = new File(["proof"], "constancia.pdf", { type: "application/pdf" });

    await expect(attachPaymentProof("payment-1", {
      proof,
      operation_reference: " OP-123 ",
      paid_at: "2026-06-08T20:00:00.000Z",
      notes: " Línea 1 y 2 ",
    })).resolves.toBe(response);

    expect(api.postForm).toHaveBeenCalledWith("/request-payments/payment-1/proofs", expect.any(FormData));
    const formData = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(formData.get("proof")).toBe(proof);
    expect(formData.get("request_allocation_ids")).toBeNull();
    expect(formData.get("operation_reference")).toBe("OP-123");
    expect(formData.get("notes")).toBe("Línea 1 y 2");
  });
});
