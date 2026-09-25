import { describe, expect, it } from "vitest";

import {
  buildLoginPath,
  buildOnboardingPath,
  resolvePostAuthDestination,
  sanitizeReturnTo,
} from "@/lib/auth/return-to";

describe("returnTo contract", () => {
  it("preserves a canonical protected path and ordered query values", () => {
    expect(sanitizeReturnTo("/requests/abc?tab=history&tab=files&mode=process")).toBe(
      "/requests/abc?tab=history&tab=files&mode=process",
    );
  });

  it("accepts exactly 2048 characters and rejects a longer candidate", () => {
    const prefix = "/requests/abc?value=";
    const boundary = `${prefix}${"a".repeat(2048 - prefix.length)}`;

    expect(sanitizeReturnTo(boundary)).toBe(boundary);
    expect(sanitizeReturnTo(`${boundary}a`)).toBeNull();
  });

  it.each([
    "https://evil.test/requests/1",
    "https://current.test/requests/1",
    "//evil.test/requests/1",
    "/\\evil.test",
    "/requests/1#secret",
    "/requests/%0d%0aevil",
    "/requests/%252F%252Fevil.test",
    "/requests/../login",
    "/login",
    "/onboarding",
    "/api/requests/1",
    "/_next/static/file.js",
    "/unknown",
    "",
  ])("rejects unsafe or ineligible target %s", (candidate) => {
    expect(sanitizeReturnTo(candidate)).toBeNull();
  });

  it.each([
    "/requests/%",
    "/requests/%GG",
    "/requests/abc?x=%",
    "/requests/abc?x=%GG",
  ])("rejects malformed percent-encoding in %s", (candidate) => {
    expect(sanitizeReturnTo(candidate)).toBeNull();
  });

  it.each([
    "/requests/abc%20def?label=Caf%C3%A9&symbol=%2B",
    "/requests/abc?discount=100%25",
  ])("preserves valid percent-encoding in %s", (candidate) => {
    expect(sanitizeReturnTo(candidate)).toBe(candidate);
  });

  it("builds auth paths only from accepted fields", () => {
    expect(buildLoginPath({ returnTo: "/requests/abc?mode=process", reason: "inactividad" })).toBe(
      "/login?returnTo=%2Frequests%2Fabc%3Fmode%3Dprocess&reason=inactividad",
    );
    expect(buildLoginPath({ returnTo: "//evil.test", reason: "arbitrary" })).toBe("/login");
    expect(buildOnboardingPath("/requests/abc?mode=process")).toBe(
      "/onboarding?returnTo=%2Frequests%2Fabc%3Fmode%3Dprocess",
    );
  });

  it("resolves an allowed target and falls back for role denial or invalid input", () => {
    expect(resolvePostAuthDestination("/requests/abc?mode=process", "SOLICITANTE_EPE")).toBe(
      "/requests/abc?mode=process",
    );
    expect(resolvePostAuthDestination("/admin/users", "SOLICITANTE_EPE")).toBe("/requests");
    expect(resolvePostAuthDestination("//evil.test", "ADMIN_SISTEMA")).toBe("/admin/users");
    expect(resolvePostAuthDestination(null, "GIOF_MANAGER")).toBe(
      "/requests?scope=review&work_scope=all",
    );
  });

  it("builds a login path from the current browser URL for involuntary loss", async () => {
    window.history.replaceState(null, "", "/requests/abc?mode=process");
    const { buildLoginPathForCurrentLocation } = await import("@/lib/auth/return-to");

    expect(buildLoginPathForCurrentLocation("inactividad")).toBe(
      "/login?returnTo=%2Frequests%2Fabc%3Fmode%3Dprocess&reason=inactividad",
    );
  });
});
