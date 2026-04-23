import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Iniciar sesión | SIG-EPE",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <>
      {reason === "inactivity" && (
        <div className="w-full max-w-sm mx-auto mb-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Tu sesión fue cerrada por inactividad.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <LoginForm />
    </>
  );
}
