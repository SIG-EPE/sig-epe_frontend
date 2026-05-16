import { AuthGate } from "@/components/auth/auth-gate";
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
        <DashboardShell>{children}</DashboardShell>
      </AuthGate>
    </SessionManager>
  );
}
