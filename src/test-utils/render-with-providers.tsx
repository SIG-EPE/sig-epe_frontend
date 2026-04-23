// src/test-utils/render-with-providers.tsx
// Render helper that wraps UI with mocked providers
import type { RenderOptions } from "@testing-library/react";
import { render } from "@testing-library/react";
import type { AuthUser } from "@/types/auth";

// -------------------------------------------------------
// Re-export everything from @/test-utils for convenience
// -------------------------------------------------------

export { setCookieValue, clearCookie, getCookieValue } from "@/test-utils/setup";
export { createMockAuthStore, resetAuthStore, mockClearCookie, fakeUser, adminUser } from "@/test-utils/store-helpers";

// -------------------------------------------------------
// renderWithProviders
// -------------------------------------------------------

interface RenderWithProvidersOptions {
  storeState?: Partial<{ user: AuthUser | null; accessToken: string | null; isLoading: boolean }>;
  cookieValue?: string;
  routerPath?: string;
}

/**
 * Renders a component with the necessary mocked providers:
 * - auth store pre-loaded with storeState
 * - document.cookie pre-set with cookieValue
 * - next/navigation usePathname/useRouter mocked to routerPath
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {},
): ReturnType<typeof render> {
  const { storeState, cookieValue, routerPath = "/" } = options;

  // Set cookie if provided
  if (cookieValue !== undefined) {
    const { setCookieValue } = require("@/test-utils/setup");
    setCookieValue(cookieValue);
  }

  // Pre-load store if state provided
  if (storeState !== undefined) {
    const { useAuthStore } = require("@/stores/auth-store");
    useAuthStore.setState({
      user: storeState.user ?? null,
      accessToken: storeState.accessToken ?? null,
      isLoading: storeState.isLoading ?? false,
    });
  }

  return render(ui);
}
