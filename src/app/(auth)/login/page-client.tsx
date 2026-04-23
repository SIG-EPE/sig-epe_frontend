"use client";

import { useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface LoginPageClientProps {
  reason: string | undefined;
}

function LoginBanner({ reason }: { reason: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="w-full max-w-sm mx-auto mb-4">
      <Alert
        variant="destructive"
        className="cursor-pointer"
        onClick={() => setDismissed(true)}
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Tu sesion fue cerrada por inactividad.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function LoginPageClient({ reason }: LoginPageClientProps) {
  return (
    <>
      {(reason === "inactividad" || reason === "inactivity") && (
        <LoginBanner reason={reason} />
      )}
      <LoginForm />
    </>
  );
}