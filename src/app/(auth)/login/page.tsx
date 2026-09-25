import type { Metadata } from "next";
import LoginPageClient from "./page-client";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = {
  title: "Iniciar sesion | SIG-EPE",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; token?: string; returnTo?: string }>;
}) {
  const { reason, token, returnTo } = await searchParams;
  return (
    <LoginPageClient
      reason={reason}
      ssoToken={token}
      returnTo={sanitizeReturnTo(returnTo)}
    />
  );
}
