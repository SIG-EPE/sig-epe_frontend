import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockJwtVerify } = vi.hoisted(() => ({
  mockJwtVerify: vi.fn(),
}));

vi.mock("jose", () => ({
  jwtVerify: mockJwtVerify,
}));

import { middleware } from "@/middleware";

function requestFor(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(`http://localhost:3000${path}`);

  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }

  return request;
}

describe("middleware session hint continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = "test-secret";
  });

  it("allows protected shell when only the non-sensitive session hint exists", async () => {
    const response = await middleware(requestFor("/requests", { session_hint: "present" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("allows the Programado vs Ejecutado route when only the non-sensitive session hint exists", async () => {
    const response = await middleware(requestFor("/budget/org-unit-execution", { session_hint: "present" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("allows onboarding when only the non-sensitive session hint exists", async () => {
    const response = await middleware(requestFor("/onboarding", { session_hint: "present" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("does not admit undeclared app routes with only the session hint", async () => {
    const response = await middleware(requestFor("/unknown-feature", { session_hint: "present" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("allows protected shell when access is expired but session hint exists", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTExpired"));

    const response = await middleware(
      requestFor("/requests", { access_token: "expired-token", session_hint: "present" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockJwtVerify).toHaveBeenCalledTimes(1);
  });

  it("allows onboarding when access verification fails but session hint exists", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTInvalid"));

    const response = await middleware(
      requestFor("/onboarding", { access_token: "invalid-token", session_hint: "present" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockJwtVerify).toHaveBeenCalledTimes(1);
  });

  it("does not admit undeclared app routes with expired access and session hint", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTExpired"));

    const response = await middleware(
      requestFor("/unknown-feature", { access_token: "expired-token", session_hint: "present" }),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(mockJwtVerify).toHaveBeenCalledTimes(1);
  });

  it("redirects protected routes when access and hint are both absent", async () => {
    const response = await middleware(requestFor("/requests"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("protects /help when access and session hint are absent", async () => {
    const response = await middleware(requestFor("/help"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it.each([
    "SOLICITANTE_EPE",
    "GIOF_GESTOR",
    "AUDITOR_DIRECCION",
    "ADMIN_SISTEMA",
  ])("allows %s to open /help directly", async (role) => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", role, scope: "full", iat: 1, exp: 2 },
    });

    const response = await middleware(requestFor("/help", { access_token: "token" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("preserves EPE SSO handoff URLs without redirecting an existing session", async () => {
    const response = await middleware(
      requestFor("/login?token=handoff-token", { access_token: "existing-token" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("keeps valid access token as authoritative for role redirects", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", role: "SOLICITANTE_EPE", scope: "full", iat: 1, exp: 2 },
    });

    const response = await middleware(requestFor("/admin/config", { access_token: "token" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/requests");
  });

  it("redirects GIOF Gestor users away from the Programado vs Ejecutado route", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", role: "GIOF_GESTOR", scope: "full", iat: 1, exp: 2 },
    });

    const response = await middleware(requestFor("/budget/org-unit-execution", { access_token: "token" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/requests");
  });

  it("allows GIOF Manager users to open the Programado vs Ejecutado route", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", role: "GIOF_MANAGER", scope: "full", iat: 1, exp: 2 },
    });

    const response = await middleware(requestFor("/budget/org-unit-execution", { access_token: "token" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects Solicitante users away from the Programado vs Ejecutado route", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", role: "SOLICITANTE_EPE", scope: "full", iat: 1, exp: 2 },
    });

    const response = await middleware(requestFor("/budget/org-unit-execution", { access_token: "token" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/requests");
  });

  it("redirects full-scope users away from onboarding", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", role: "SOLICITANTE_EPE", scope: "full", iat: 1, exp: 2 },
    });

    const response = await middleware(requestFor("/onboarding", { access_token: "token" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/requests");
  });

  it("redirects onboarding-scope users from protected routes to onboarding", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", role: "SOLICITANTE_EPE", scope: "onboarding", iat: 1, exp: 2 },
    });

    const response = await middleware(requestFor("/requests", { access_token: "token" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });
});
