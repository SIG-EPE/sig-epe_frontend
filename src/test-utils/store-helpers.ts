// src/test-utils/store-helpers.ts
// Helpers for testing Zustand auth store directly (no rendering)
import { vi } from "vitest";
import type { AuthUser } from "@/types/auth";

// -------------------------------------------------------
// Store reset — restores store to default state between tests
// -------------------------------------------------------

export function resetAuthStore(): void {
  const { useAuthStore } = require("@/stores/auth-store");
  useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
}

// -------------------------------------------------------
// Spy on document.cookie writes (for clearAuth verification)
// -------------------------------------------------------

let cookieWrites: string[] = [];

export function mockClearCookie(): ReturnType<typeof vi.fn> {
  cookieWrites = [];
  return vi.spyOn(document, "cookie", "set").mockImplementation((val: string) => {
    cookieWrites.push(val);
  });
}

export function getCookieWrites(): string[] {
  return [...cookieWrites];
}

// -------------------------------------------------------
// Create a preset store state for targeted tests
// -------------------------------------------------------

export function createMockAuthStore(
  initial: Partial<{ user: AuthUser | null; accessToken: string | null; isLoading: boolean }> = {},
): void {
  const { useAuthStore } = require("@/stores/auth-store");
  useAuthStore.setState({
    user: initial.user ?? null,
    accessToken: initial.accessToken ?? null,
    isLoading: initial.isLoading ?? false,
  });
}

// -------------------------------------------------------
// Fixture — fake user for tests
// -------------------------------------------------------

export const fakeUser: AuthUser = {
  id: "1",
  firstName: "Juan",
  lastName: "Pérez",
  email: "juan@test.com",
  documentNumber: "12345678",
  role: { code: "SOLICITANTE_EPE", name: "Solicitante EPE" },
  onboardingCompleted: true,
  authSource: "EPE",
};

export const adminUser: AuthUser = {
  id: "2",
  firstName: "Admin",
  lastName: "Sistema",
  email: "admin@test.com",
  documentNumber: "00000001",
  role: { code: "ADMIN_SISTEMA", name: "Administrador del Sistema" },
  onboardingCompleted: true,
  authSource: "LOCAL",
};
