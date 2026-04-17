"use client";

import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuthHydration } from "@/hooks/use-auth-hydration";

// -------------------------------------------------------
// DashboardShell layout component
// Hydrates auth store on mount so sidebar + pages get user data.
// -------------------------------------------------------

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Rehydrate user from /auth/me if Zustand state was lost (full page reload)
  useAuthHydration();

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
    </SidebarProvider>
  );
}
