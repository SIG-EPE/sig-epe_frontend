import { AuthGate } from "@/components/auth/auth-gate";
import { RouteAccessGuard } from "@/components/auth/route-access-guard";
import { SessionManager } from "@/components/auth/session-manager";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionManager>
      <AuthGate>
        <RouteAccessGuard>
          <DashboardShell>{children}</DashboardShell>
        </RouteAccessGuard>
      </AuthGate>
    </SessionManager>
  );
}
