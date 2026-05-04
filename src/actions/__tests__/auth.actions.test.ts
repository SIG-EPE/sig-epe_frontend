import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: mockSet,
  })),
}));

import { clearSessionAction } from "@/actions/auth.actions";

describe("clearSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears both access and refresh cookies", async () => {
    await clearSessionAction();

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenNthCalledWith(1, "access_token", "", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    expect(mockSet).toHaveBeenNthCalledWith(2, "refresh_token", "", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});
