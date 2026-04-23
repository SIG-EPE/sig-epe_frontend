// src/test-utils/setup.ts
// Global test setup — cookie mock + API factory reset between tests
import "@testing-library/jest-dom";
import { vi } from "vitest";

// -------------------------------------------------------
// Global cookie mock via Object.defineProperty
// Allows per-test isolation without mutating the global prototype
// -------------------------------------------------------

let cookieStore: Record<string, string> = {};

Object.defineProperty(document, "cookie", {
  get() {
    return Object.entries(cookieStore)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  },
  set(cookieStr) {
    const eqIndex = cookieStr.indexOf("=");
    if (eqIndex === -1) {
      // "key; ..." — treat as deletion attempt for key
      const key = cookieStr.trim().split(" ")[0];
      delete cookieStore[key];
      return;
    }
    const key = cookieStr.slice(0, eqIndex);
    const value = cookieStr.slice(eqIndex + 1).split(";")[0];
    // Detect Max-Age=0 or expires=... deletion pattern
    if (cookieStr.includes("Max-Age=0")) {
      delete cookieStore[key];
    } else {
      cookieStore[key] = value;
    }
  },
  configurable: true,
});

export function setCookieValue(value: string) {
  cookieStore = { access_token: value };
}

export function clearCookie() {
  cookieStore = {};
}

export function getCookieValue(): string {
  return cookieStore["access_token"] ?? "";
}

// -------------------------------------------------------
// Reset state between tests
// -------------------------------------------------------

beforeEach(() => {
  cookieStore = {};
  vi.clearAllMocks();
});
