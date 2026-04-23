"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuthHydration } from "@/hooks/use-auth-hydration";
import { useInactivityTimer } from "@/hooks/use-inactivity-timer";
import { InactivityWarningModal } from "@/components/inactivity-warning-modal";
import { clearSessionAction } from "@/actions/auth.actions";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";
import {
  INACTIVITY_WARNING_MINUTES,
  INACTIVITY_TIMEOUT_MINUTES,
} from "@/lib/constants";

// -------------------------------------------------------
// DashboardShell layout component
// Hydrates auth store on mount so sidebar + pages get user data.
// Mounts inactivity timer — shows warning modal + auto-logout.
// -------------------------------------------------------

/** Seconds between warning and timeout used for countdown seed */
const WARNING_COUNTDOWN_SECONDS =
  (INACTIVITY_TIMEOUT_MINUTES - INACTIVITY_WARNING_MINUTES) * 60;

export function DashboardShell({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
}) {
  // Pre-hydrate Zustand from SSR-provided user — eliminates sidebar skeleton flash.
  // useRef ensures we only write once (not on every re-render).
  // Runs synchronously before first render — no useEffect needed.
  const hydrated = useRef(false);
  if (initialUser && !hydrated.current) {
    useAuthStore.setState({ user: initialUser, accessToken: null, isLoading: false });
    hydrated.current = true;
  } else if (!hydrated.current) {
    hydrated.current = true;
  }

  // Rehydrate user from /auth/me if Zustand state was lost (full page reload)
  useAuthHydration();

  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [showWarning, setShowWarning] = useState(false);

  async function handleLogout() {
    await clearSessionAction();
    clearAuth();
    router.replace("/login?reason=inactivity");
  }

  const { reset } = useInactivityTimer({
    onWarning: () => setShowWarning(true),
    onTimeout: handleLogout,
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1" />
        </header>

        {/* Main content — scrollable */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>

      {/* Inactivity warning modal */}
      <InactivityWarningModal
        open={showWarning}
        remainingSeconds={WARNING_COUNTDOWN_SECONDS}
        onContinue={() => {
          setShowWarning(false);
          reset();
        }}
        onLogout={handleLogout}
      />
    </SidebarProvider>
  );
}
